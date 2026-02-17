"""
Shared helpers for deduplication step handlers.
"""

from __future__ import annotations

import difflib
import re
from typing import Callable, Iterable, TypeVar
from urllib.parse import urlparse

T = TypeVar("T")


def normalize_title(title: str) -> str:
    if not title:
        return ""
    cleaned = title.replace("{", "").replace("}", "").lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    return " ".join(cleaned.split())


def title_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def completeness_score(entry: dict) -> int:
    fields = ["title", "author", "year", "abstract", "doi", "journal", "booktitle"]
    return sum(1 for field in fields if entry.get(field))


def parse_year(entry: dict) -> int:
    raw_year = entry.get("year", "")
    try:
        return int(str(raw_year).strip())
    except ValueError:
        return 0


def normalize_database_name(raw: str | None) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        return ""

    compact = re.sub(r"[^a-z0-9]+", "", value)
    if not compact:
        return ""

    if "webofscience" in compact or compact == "wos":
        return "wos"
    if "ieee" in compact or "xplore" in compact:
        return "ieee"
    if "acm" in compact:
        return "acm"
    if "arxiv" in compact:
        return "arxiv"
    if "springer" in compact:
        return "springer"
    if "scopus" in compact:
        return "scopus"
    if "pubmed" in compact or "medline" in compact:
        return "pubmed"
    if "sciencedirect" in compact or "elsevier" in compact:
        return "sciencedirect"

    return compact


def infer_database_name(entry: dict) -> str:
    # Prefer explicit source metadata when available.
    for key in ("_source_database", "_database", "database"):
        normalized = normalize_database_name(entry.get(key))
        if normalized:
            return normalized

    doi = str(entry.get("doi", "")).strip().lower()
    if doi.startswith("10.1145/"):
        return "acm"
    if doi.startswith("10.1109/"):
        return "ieee"
    if doi.startswith("10.48550/arxiv."):
        return "arxiv"

    source_url = str(entry.get("url") or entry.get("URL") or "").strip().lower()
    if source_url:
        host = urlparse(source_url).netloc.lower()
        if "dl.acm.org" in host:
            return "acm"
        if "ieeexplore.ieee.org" in host:
            return "ieee"
        if "arxiv.org" in host:
            return "arxiv"
        if "link.springer.com" in host:
            return "springer"
        if "webofscience.com" in host:
            return "wos"

    text = " ".join(
        str(entry.get(field) or "")
        for field in ("publisher", "journal", "booktitle", "series")
    )
    return normalize_database_name(text)


def parse_database_priority(raw: str | list[str] | None) -> dict[str, int]:
    if raw is None:
        return {}

    if isinstance(raw, list):
        tokens = [str(item).strip() for item in raw]
    else:
        # Accept formats such as "ACM, IEEE, WoS" and "ACM > IEEE > WoS".
        tokens = [part.strip() for part in re.split(r"[,\n>]+", str(raw))]

    order: dict[str, int] = {}
    for token in tokens:
        normalized = normalize_database_name(token)
        if normalized and normalized not in order:
            order[normalized] = len(order)
    return order


def database_priority_rank(entry: dict, database_priority: dict[str, int] | None = None) -> int:
    if not database_priority:
        return 10_000
    source_db = infer_database_name(entry)
    return database_priority.get(source_db, len(database_priority) + 10_000)


def has_doi(entry: dict) -> int:
    return 1 if str(entry.get("doi", "")).strip() else 0


def pick_representative(
    member_indices: Iterable[int],
    entries: list[dict],
    database_priority: dict[str, int] | None = None,
    prefer_doi: bool = True,
) -> int:
    return sorted(
        member_indices,
        key=lambda idx: (
            -parse_year(entries[idx]),
            database_priority_rank(entries[idx], database_priority),
            -has_doi(entries[idx]) if prefer_doi else 0,
            -completeness_score(entries[idx]),
            idx,
        ),
    )[0]


def cluster_by_threshold(
    values: list[T],
    threshold: float,
    similarity_fn: Callable[[T, T], float],
) -> list[list[int]]:
    parent = list(range(len(values)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra = find(a)
        rb = find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(values)):
        for j in range(i + 1, len(values)):
            similarity = similarity_fn(values[i], values[j])
            if similarity >= threshold:
                union(i, j)

    clusters: dict[int, list[int]] = {}
    for idx in range(len(values)):
        root = find(idx)
        clusters.setdefault(root, []).append(idx)

    return list(clusters.values())
