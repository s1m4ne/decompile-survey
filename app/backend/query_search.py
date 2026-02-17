"""
Query normalization and local boolean search for title/abstract text.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass


class QuerySyntaxError(ValueError):
    """Raised when the boolean query cannot be parsed."""


def _clean_spaces(value: str) -> str:
    return " ".join(value.split())


def _cleanup_boolean_artifacts(value: str) -> str:
    """
    Remove dangling operators that can appear after stripping DB-only filters.
    """
    normalized = value
    previous = None
    while previous != normalized:
        previous = normalized
        normalized = re.sub(r"(?i)\b(?:AND|OR)\s*\)", ")", normalized)
        normalized = re.sub(r"(?i)\(\s*(?:AND|OR)\b", "(", normalized)
        normalized = re.sub(r"(?i)\b(?:AND|OR|NOT)\s*$", "", normalized)
        normalized = re.sub(r"(?i)^\s*(?:AND|OR)\b", "", normalized)
        normalized = re.sub(r"\(\s*\)", " ", normalized)
        normalized = _clean_spaces(normalized).strip()
    return normalized


def clean_bib_text(value: str | None) -> str:
    """Normalize BibTeX field text for matching."""
    if not value:
        return ""
    no_braces = value.replace("{", " ").replace("}", " ")
    return _clean_spaces(html.unescape(no_braces).strip())


def normalize_query(raw_query: str) -> str:
    """
    Convert heterogeneous DB query syntax (ACM/IEEE/WoS/arXiv style)
    into a local boolean expression over title/abstract fields.
    """
    q = html.unescape(raw_query or "")
    q = q.replace("\r", " ").replace("\n", " ")
    q = q.replace('\\"', '"')
    q = q.replace("\\'", "'")

    # If query/filter wrapper exists, keep only query part.
    wrapped = re.search(r'(?is)"query"\s*:\s*\{(.*?)\}\s*(?:"filter"|$)', q)
    if wrapped:
        q = wrapped.group(1)

    # Remove obvious date/filter fragments.
    q = re.sub(r'(?is)"filter"\s*:\s*\{.*$', " ", q)
    q = re.sub(r"(?is)\bsubmittedDate\s*:\s*\[[^\]]+\]", " ", q)
    q = re.sub(r"(?is)\bE-?Publication\s+Date\s*:\s*\([^)]*\)", " ", q)
    q = re.sub(r"(?is)\bACM\s+Content\s*:\s*[^,}\]]+", " ", q)
    q = re.sub(r"(?is)\branges\s*=\s*[^)\s]+", " ", q)

    # Field aliases.
    alias_patterns = [
        (r'(?i)"document\s+title"\s*:', "title:"),
        (r'(?i)"abstract"\s*:', "abstract:"),
        (r"(?i)\bdocument\s+title\s*:", "title:"),
        (r"(?i)\btitle\s*=", "title="),
        (r"(?i)\babstract\s*=", "abstract="),
        (r"(?i)\bti\s*=\s*\(", "title:("),
        (r"(?i)\bab\s*=\s*\(", "abstract:("),
        (r"(?i)\babs\s*=\s*\(", "abstract:("),
        (r"(?i)\btitle\s*:\s*", "title:"),
        (r"(?i)\babstract\s*:\s*", "abstract:"),
        (r"(?i)\bti\s*:\s*", "title:"),
        (r"(?i)\babs\s*:\s*", "abstract:"),
        (r"(?i)\ballfield\s*:\s*", "any:"),
        (r"(?i)\bkeywords?\s*:\s*", "any:"),
    ]
    for pattern, repl in alias_patterns:
        q = re.sub(pattern, repl, q)

    # title=(term) / abstract=(term) -> field:(term)
    q = re.sub(r"(?i)\btitle\s*=\s*\(", "title:(", q)
    q = re.sub(r"(?i)\babstract\s*=\s*\(", "abstract:(", q)

    # Remove query key marker if still present.
    q = re.sub(r'(?is)\bquery\s*:\s*', " ", q)

    # Normalize brackets and separators to parser-friendly text.
    q = q.replace("[", " ").replace("]", " ")
    q = q.replace("{", " ").replace("}", " ")
    q = q.replace(";", " ")
    q = q.replace(",", " ")
    q = q.replace("#", " ")

    q = _clean_spaces(q).strip()
    q = _cleanup_boolean_artifacts(q)
    return q


TOKEN_PATTERN = re.compile(
    r'"(?:\\.|[^"])*"|\(|\)|\bAND\b|\bOR\b|\bNOT\b|[^\s()]+',
    re.IGNORECASE,
)

FIELD_ALIASES = {
    "title": "title",
    "abstract": "abstract",
    "any": "any",
}


@dataclass
class TermNode:
    field: str | None
    value: str


@dataclass
class AndNode:
    left: "QueryNode"
    right: "QueryNode"


@dataclass
class OrNode:
    left: "QueryNode"
    right: "QueryNode"


@dataclass
class NotNode:
    node: "QueryNode"


@dataclass
class ScopedNode:
    field: str
    node: "QueryNode"


QueryNode = TermNode | AndNode | OrNode | NotNode | ScopedNode


def tokenize(query: str) -> list[str]:
    return [token for token in TOKEN_PATTERN.findall(query) if token.strip()]


def _normalize_field(field: str | None) -> str | None:
    if field is None:
        return None
    normalized = field.strip().strip('"').lower().replace(" ", "_")
    if normalized in FIELD_ALIASES:
        return FIELD_ALIASES[normalized]
    return None


def _is_field_token(token: str) -> bool:
    return token.endswith(":") and _normalize_field(token[:-1]) is not None


def _strip_quotes(value: str) -> str:
    token = value.strip()
    if len(token) >= 2 and token[0] == '"' and token[-1] == '"':
        token = token[1:-1]
    return token.replace('\\"', '"').strip()


class QueryParser:
    def __init__(self, tokens: list[str]):
        self.tokens = tokens
        self.pos = 0

    def _peek(self) -> str | None:
        if self.pos >= len(self.tokens):
            return None
        return self.tokens[self.pos]

    def _consume(self) -> str:
        token = self._peek()
        if token is None:
            raise QuerySyntaxError("Unexpected end of query.")
        self.pos += 1
        return token

    def _peek_upper(self) -> str | None:
        token = self._peek()
        return token.upper() if token is not None else None

    def parse(self) -> QueryNode:
        if not self.tokens:
            raise QuerySyntaxError("Empty query.")
        node = self._parse_or()
        if self._peek() is not None:
            raise QuerySyntaxError(f"Unexpected token: {self._peek()}")
        return node

    def _parse_or(self) -> QueryNode:
        node = self._parse_and()
        while self._peek_upper() == "OR":
            self._consume()
            rhs = self._parse_and()
            node = OrNode(node, rhs)
        return node

    def _parse_and(self) -> QueryNode:
        node = self._parse_not()
        while True:
            tok = self._peek_upper()
            if tok == "AND":
                self._consume()
                rhs = self._parse_not()
                node = AndNode(node, rhs)
                continue
            # Implicit AND for adjacent terms/groups.
            if tok is not None and tok not in {"OR", ")"}:
                rhs = self._parse_not()
                node = AndNode(node, rhs)
                continue
            break
        return node

    def _parse_not(self) -> QueryNode:
        if self._peek_upper() == "NOT":
            self._consume()
            return NotNode(self._parse_not())
        return self._parse_primary()

    def _parse_primary(self) -> QueryNode:
        token = self._peek()
        if token is None:
            raise QuerySyntaxError("Unexpected end while parsing term.")

        if token == "(":
            self._consume()
            node = self._parse_or()
            if self._consume() != ")":
                raise QuerySyntaxError("Missing closing parenthesis.")
            return node

        # field:( ... )
        if _is_field_token(token):
            field = _normalize_field(token[:-1])
            self._consume()
            if self._peek() == "(":
                self._consume()
                scoped = self._parse_or()
                if self._consume() != ")":
                    raise QuerySyntaxError("Missing closing parenthesis for field scope.")
                if field is None:
                    raise QuerySyntaxError(f"Unsupported field token: {token}")
                return ScopedNode(field=field, node=scoped)
            value_token = self._consume()
            return TermNode(field=field, value=_strip_quotes(value_token))

        token = self._consume()
        if ":" in token and not token.startswith("http"):
            raw_field, raw_value = token.split(":", 1)
            field = _normalize_field(raw_field)
            if field is not None:
                if raw_value == "":
                    raw_value = self._consume()
                return TermNode(field=field, value=_strip_quotes(raw_value))

        return TermNode(field=None, value=_strip_quotes(token))


def parse_query(query: str) -> QueryNode:
    tokens = tokenize(query)
    parser = QueryParser(tokens)
    return parser.parse()


def _match_term(term: str, text: str) -> bool:
    if not term:
        return False
    text_l = text.lower()
    needle = term.lower()

    if "*" in needle:
        pattern = re.escape(needle).replace(r"\*", ".*")
        return re.search(pattern, text_l, flags=re.IGNORECASE) is not None
    return needle in text_l


def _field_text(field: str | None, title: str, abstract: str) -> str:
    if field == "title":
        return title
    if field == "abstract":
        return abstract
    return f"{title}\n{abstract}"


def evaluate(node: QueryNode, title: str, abstract: str, default_field: str | None = None) -> bool:
    if isinstance(node, TermNode):
        field = node.field if node.field is not None else default_field
        text = _field_text(field, title, abstract)
        return _match_term(node.value, text)

    if isinstance(node, AndNode):
        return evaluate(node.left, title, abstract, default_field) and evaluate(
            node.right, title, abstract, default_field
        )

    if isinstance(node, OrNode):
        return evaluate(node.left, title, abstract, default_field) or evaluate(
            node.right, title, abstract, default_field
        )

    if isinstance(node, NotNode):
        return not evaluate(node.node, title, abstract, default_field)

    if isinstance(node, ScopedNode):
        return evaluate(node.node, title, abstract, default_field=node.field)

    return False
