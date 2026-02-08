"""
PDF fetch step handler.

This step resolves and caches PDF files in a shared library outside project
directories, primarily using DOI-based lookup.
"""

from __future__ import annotations

import os
import re
import time
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urljoin, urlparse

import httpx

from pdf_library import (
    SCREENING_DIR,
    canonical_key_for_entry,
    managed_pdf_path_for_key,
    mark_record_found,
    mark_record_missing,
    load_pdf_index,
    normalize_doi,
    normalize_url,
    save_pdf_index,
    guess_title,
)
from .base import StepHandler, StepResult, OutputDefinition, Change, ProgressCallback
from . import register_step_type


ARXIV_ABS_RE = re.compile(r"^https?://arxiv\.org/abs/([^/?#]+)", re.IGNORECASE)
ARXIV_ID_RE = re.compile(r"(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)", re.IGNORECASE)
IEEE_DOC_ID_RE = re.compile(r"/document/(\d+)", re.IGNORECASE)
IEEE_ARNUMBER_RE = re.compile(r"[?&]arnumber=(\d+)", re.IGNORECASE)
META_CITATION_PDF_RE_1 = re.compile(
    r'<meta[^>]+name=["\']citation_pdf_url["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
META_CITATION_PDF_RE_2 = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']citation_pdf_url["\']',
    re.IGNORECASE,
)
HTML_HREF_RE = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
IEEE_HTML_ARNUMBER_RE = re.compile(r'["\']arnumber["\']\s*:\s*["\']?(\d+)', re.IGNORECASE)
BROWSER_PROFILE_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def is_acm_doi(doi: str | None) -> bool:
    return bool(doi and doi.startswith("10.1145/"))


MISSING_REASON_LABELS: dict[str, str] = {
    "pdf_not_resolved": "No downloadable PDF found from known sources.",
    "browser_assist_unresolved": "Browser assist timed out before a PDF became downloadable.",
    "browser_assist_unavailable": "Browser assist could not start (Playwright or browser runtime unavailable).",
    "browser_assist_error": "Browser assist failed while trying to fetch the PDF.",
    "not_found": "PDF was not resolved.",
}

MISSING_REASON_HINTS: dict[str, str] = {
    "pdf_not_resolved": "Try re-run with browser assist enabled and complete publisher login first.",
    "browser_assist_unresolved": "Keep the opened browser window on the publisher page until challenge/login is completed.",
    "browser_assist_unavailable": "Install Playwright and run 'playwright install chromium' in the backend runtime environment.",
    "browser_assist_error": "Retry once; if repeated, inspect backend logs for the specific browser/network error.",
    "not_found": "Try re-run with browser assist enabled.",
}


def missing_reason_label(reason: str | None) -> str | None:
    if not reason:
        return None
    return MISSING_REASON_LABELS.get(reason, reason)


def missing_reason_hint(reason: str | None) -> str | None:
    if not reason:
        return None
    return MISSING_REASON_HINTS.get(reason)


def summarize_entry_label(entry_key: str, doi: str | None, title: str | None) -> str:
    if doi:
        return doi
    if title:
        compact = " ".join(str(title).split())
        if compact:
            return compact[:80] + ("..." if len(compact) > 80 else "")
    return entry_key


def browser_profiles_dir() -> Path:
    return SCREENING_DIR / "browser_profiles"


def sanitize_profile_name(raw: str | None) -> str:
    value = str(raw or "default").strip()
    if not value:
        value = "default"
    value = BROWSER_PROFILE_RE.sub("_", value).strip("._-")
    return value or "default"


def is_pdf_like_url(url: str) -> bool:
    return bool(re.search(r"\.pdf($|[?#])", url, flags=re.IGNORECASE))


def arxiv_pdf_url(url_or_id: str) -> str | None:
    text = url_or_id.strip()
    if not text:
        return None

    parsed = urlparse(text)
    if parsed.scheme in ("http", "https"):
        if "arxiv.org" not in parsed.netloc.lower():
            return None

    abs_match = ARXIV_ABS_RE.match(text)
    if abs_match:
        return f"https://arxiv.org/pdf/{abs_match.group(1)}.pdf"

    if text.lower().startswith("arxiv:"):
        id_match = ARXIV_ID_RE.search(text)
    elif re.fullmatch(r"\d{4}\.\d{4,5}(?:v\d+)?", text, re.IGNORECASE):
        id_match = ARXIV_ID_RE.search(text)
    else:
        id_match = None

    if id_match:
        return f"https://arxiv.org/pdf/{id_match.group(1)}.pdf"
    return None


def add_url_candidate(candidates: list[tuple[str, str]], seen: set[str], url: str | None, provider: str) -> None:
    normalized = normalize_url(url)
    if not normalized:
        return
    if normalized in seen:
        return
    seen.add(normalized)
    candidates.append((normalized, provider))


def add_direct_publisher_candidates(
    candidates: list[tuple[str, str]],
    seen: set[str],
    doi: str | None,
) -> None:
    if not doi:
        return

    quoted_doi = quote(doi, safe="")
    if is_acm_doi(doi):
        add_url_candidate(candidates, seen, f"https://dl.acm.org/doi/pdf/{quoted_doi}", "acm_direct_pdf")
        add_url_candidate(candidates, seen, f"https://dl.acm.org/doi/pdf/{quoted_doi}?download=true", "acm_direct_pdf")
        add_url_candidate(candidates, seen, f"https://dl.acm.org/doi/epdf/{quoted_doi}", "acm_direct_epdf")
        add_url_candidate(candidates, seen, f"https://dl.acm.org/doi/epdf/{quoted_doi}?download=true", "acm_direct_epdf")


def extract_ieee_arnumber(*texts: str) -> str | None:
    for text in texts:
        if not text:
            continue
        for pattern in (IEEE_DOC_ID_RE, IEEE_ARNUMBER_RE, IEEE_HTML_ARNUMBER_RE):
            match = pattern.search(text)
            if match:
                return match.group(1)
    return None


def extract_html_pdf_urls(html_text: str, base_url: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    for pattern in (META_CITATION_PDF_RE_1, META_CITATION_PDF_RE_2):
        for match in pattern.finditer(html_text):
            value = unescape(match.group(1).strip())
            if not value:
                continue
            resolved = urljoin(base_url, value)
            if resolved in seen:
                continue
            seen.add(resolved)
            urls.append(resolved)

    for match in HTML_HREF_RE.finditer(html_text):
        href = unescape(match.group(1).strip())
        if not href:
            continue
        lower = href.lower()
        if ".pdf" not in lower and "/doi/pdf/" not in lower and "stamp/stamp.jsp" not in lower:
            continue
        resolved = urljoin(base_url, href)
        if resolved in seen:
            continue
        seen.add(resolved)
        urls.append(resolved)

    return urls


def discover_landing_candidates(
    client: httpx.Client,
    seed_url: str,
    provider: str,
    doi: str | None,
    user_agent: str,
    timeout_sec: float,
) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.1",
    }

    try:
        resp = client.get(seed_url, headers=headers, timeout=timeout_sec, follow_redirects=True)
    except Exception:
        return candidates

    final_url = str(resp.url)
    add_url_candidate(candidates, seen, final_url, f"{provider}_landing")

    parsed = urlparse(final_url)
    host = parsed.netloc.lower()
    arnumber = extract_ieee_arnumber(final_url, parsed.query)
    if not arnumber:
        try:
            arnumber = extract_ieee_arnumber(resp.text)
        except Exception:
            arnumber = None

    if "ieeexplore.ieee.org" in host and arnumber:
        add_url_candidate(
            candidates,
            seen,
            f"https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber={arnumber}",
            "ieee_stamp",
        )
        add_url_candidate(
            candidates,
            seen,
            f"https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber={arnumber}",
            "ieee_stamp_pdf",
        )

    if "dl.acm.org" in host and is_acm_doi(doi):
        add_direct_publisher_candidates(candidates, seen, doi)

    content_type = (resp.headers.get("content-type") or "").lower()
    if "html" in content_type:
        try:
            html_text = resp.text
            for extracted_url in extract_html_pdf_urls(html_text, final_url):
                add_url_candidate(candidates, seen, extracted_url, f"{provider}_html")
        except Exception:
            pass

    return candidates


def publisher_hint_urls(url: str | None) -> bool:
    if not url:
        return False
    lower = url.lower()
    return (
        ".pdf" in lower
        or "/doi/pdf/" in lower
        or "/doi/epdf/" in lower
        or "stamp/stamp.jsp" in lower
        or "stamppdf/getpdf.jsp" in lower
        or "download=true" in lower
    )


def is_pdf_likely_for_doi(body: bytes, final_url: str, doi: str | None) -> bool:
    """Heuristic guard to avoid saving clearly unrelated PDFs."""
    if not doi:
        return True
    normalized = normalize_doi(doi)
    if not normalized:
        return True

    short = normalized.split("/", 1)[1] if "/" in normalized else normalized
    normalized_url = unquote(final_url or "").lower()
    if normalized in normalized_url:
        return True
    if short and len(short) >= 6 and short in normalized_url:
        return True

    # Scan an initial chunk to avoid decoding very large buffers.
    sample = body[: min(len(body), 2_000_000)].decode("latin-1", errors="ignore").lower()
    if normalized in sample:
        return True
    if short and len(short) >= 6 and short in sample:
        return True
    return False


def is_cached_pdf_likely_for_doi(pdf_path: Path, source_url: str | None, doi: str | None) -> bool:
    if not doi:
        return True
    try:
        with open(pdf_path, "rb") as f:
            sample = f.read(2_000_000)
    except Exception:
        return True
    return is_pdf_likely_for_doi(sample, source_url or "", doi)


class BrowserAssistSession:
    """
    Browser session for user-assisted authentication/challenge bypass.

    A persistent profile is reused across runs so users don't need to log in
    every time.
    """

    def __init__(self, profile_name: str, headed: bool, user_agent: str, timeout_sec: float):
        try:
            from playwright.sync_api import sync_playwright
        except Exception as e:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "playwright is not installed. Install it and run 'playwright install chromium'."
            ) from e

        self._sync_playwright = sync_playwright
        self._playwright = self._sync_playwright().start()
        profile_dir = browser_profiles_dir() / sanitize_profile_name(profile_name)
        profile_dir.mkdir(parents=True, exist_ok=True)
        self.context = self._playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=not headed,
            accept_downloads=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        self.page.set_default_timeout(timeout_sec * 1000)
        self.user_agent = user_agent
        self.last_candidate_count = 0
        self.last_tried_count = 0
        self.last_page_url: str | None = None

    def close(self) -> None:
        try:
            self.context.close()
        except Exception:
            pass
        try:
            self._playwright.stop()
        except Exception:
            pass

    def _page_candidates(
        self,
        page,
        doi: str | None,
        seed_url: str,
    ) -> list[tuple[str, str]]:
        candidates: list[tuple[str, str]] = []
        seen: set[str] = set()

        add_url_candidate(candidates, seen, page.url, "browser_page")
        add_url_candidate(candidates, seen, seed_url, "browser_seed")
        add_direct_publisher_candidates(candidates, seen, doi)

        try:
            html_text = page.content()
        except Exception:
            html_text = ""

        if html_text:
            for extracted_url in extract_html_pdf_urls(html_text, page.url):
                add_url_candidate(candidates, seen, extracted_url, "browser_html")

            arnumber = extract_ieee_arnumber(page.url, html_text)
            if arnumber:
                add_url_candidate(
                    candidates,
                    seen,
                    f"https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber={arnumber}",
                    "browser_ieee_stamp",
                )
                add_url_candidate(
                    candidates,
                    seen,
                    f"https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber={arnumber}",
                    "browser_ieee_stamp_pdf",
                )

        try:
            hrefs = page.eval_on_selector_all("a[href]", "els => els.map((el) => el.href)")
            if isinstance(hrefs, list):
                for href in hrefs:
                    if not isinstance(href, str):
                        continue
                    if not publisher_hint_urls(href):
                        continue
                    add_url_candidate(candidates, seen, href, "browser_link")
        except Exception:
            pass

        return candidates

    def _fetch_pdf_with_browser_request(
        self,
        url: str,
        max_pdf_mb: int,
        timeout_sec: float,
    ) -> tuple[bytes, str, str] | None:
        max_bytes = max_pdf_mb * 1024 * 1024
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            resp = self.context.request.get(
                url,
                headers=headers,
                timeout=int(timeout_sec * 1000),
                fail_on_status_code=False,
            )
        except Exception:
            return None

        if resp.status != 200:
            return None

        body = resp.body()
        if not body:
            return None
        if len(body) > max_bytes:
            return None

        content_type = (resp.headers.get("content-type") or "").lower()
        if "pdf" not in content_type and not body.startswith(b"%PDF-"):
            return None

        return body, resp.url, content_type

    def resolve_pdf(
        self,
        doi: str | None,
        entry_url: str | None,
        initial_candidates: list[tuple[str, str]],
        wait_sec: float,
        timeout_sec: float,
        max_pdf_mb: int,
    ) -> tuple[bytes, str, str, str] | None:
        seed_url = (
            (entry_url.strip() if isinstance(entry_url, str) else "")
            or (f"https://doi.org/{quote(doi, safe='')}" if doi else "")
            or (initial_candidates[0][0] if initial_candidates else "")
        )
        if not seed_url:
            return None

        self.last_candidate_count = 0
        self.last_tried_count = 0
        self.last_page_url = None

        print("[pdf-fetch] Browser assist opened. Complete login/challenge in the browser window.")
        try:
            self.page.bring_to_front()
        except Exception:
            pass
        try:
            self.page.goto(seed_url, wait_until="domcontentloaded", timeout=int(timeout_sec * 1000))
        except Exception:
            pass

        queue: list[tuple[str, str]] = []
        seen: set[str] = set()
        tried: set[str] = set()

        for url, provider in initial_candidates:
            add_url_candidate(queue, seen, url, provider)

        deadline = time.time() + max(wait_sec, 5.0)
        while time.time() < deadline:
            for discovered_url, discovered_provider in self._page_candidates(self.page, doi, seed_url):
                add_url_candidate(queue, seen, discovered_url, discovered_provider)
            self.last_candidate_count = len(queue)

            for candidate_url, provider in queue:
                if candidate_url in tried:
                    continue
                tried.add(candidate_url)
                self.last_tried_count = len(tried)
                fetched = self._fetch_pdf_with_browser_request(
                    url=candidate_url,
                    max_pdf_mb=max_pdf_mb,
                    timeout_sec=timeout_sec,
                )
                if fetched is not None:
                    body, final_url, content_type = fetched
                    if not is_pdf_likely_for_doi(body=body, final_url=final_url, doi=doi):
                        continue
                    self.last_page_url = self.page.url
                    return body, final_url, content_type, provider

            remaining = deadline - time.time()
            if remaining <= 0:
                break
            try:
                self.page.wait_for_timeout(min(2000, int(remaining * 1000)))
            except Exception:
                break

        print("[pdf-fetch] Browser assist timed out without resolvable PDF.")
        self.last_page_url = self.page.url
        return None


def extract_file_field_candidates(raw: str) -> list[str]:
    """
    Parse local PDF candidates from BibTeX-like `file` fields.

    Handles patterns such as:
    - /path/to/file.pdf
    - /path/to/file.pdf:PDF
    - file:///path/to/file.pdf
    - path1.pdf;path2.pdf
    """
    value = raw.strip()
    if not value:
        return []

    candidates: list[str] = []
    parts = [p.strip() for p in value.split(";") if p.strip()]
    for part in parts:
        part = part.strip("{}\"'")
        if ".pdf" not in part.lower():
            continue
        end_idx = part.lower().find(".pdf") + 4
        candidate = part[:end_idx].strip()
        if candidate:
            candidates.append(candidate)
    return candidates


def resolve_local_pdf_candidates(entry: dict[str, Any], project_id: str | None) -> list[Path]:
    raw_candidates: list[str] = []

    for field in ("file", "pdf", "fulltext", "local_pdf"):
        raw_value = entry.get(field)
        if not raw_value:
            continue
        raw_candidates.extend(extract_file_field_candidates(str(raw_value)))

    url_value = str(entry.get("url") or "").strip()
    if url_value.startswith("file://"):
        raw_candidates.append(url_value)
    elif url_value.lower().endswith(".pdf"):
        raw_candidates.append(url_value)

    resolved: list[Path] = []
    seen: set[str] = set()

    source_import = str(entry.get("_source_import") or "").strip()
    source_category = str(entry.get("_source_category") or "").strip()

    base_dirs: list[Path] = []
    if source_import:
        base_dirs.append(SCREENING_DIR / "imports" / source_import)
    if project_id and source_category:
        base_dirs.append(SCREENING_DIR / "projects" / project_id / "sources" / source_category)
    if project_id:
        base_dirs.append(SCREENING_DIR / "projects" / project_id)
    base_dirs.append(Path.cwd())

    for raw in raw_candidates:
        candidate = raw.strip()
        if candidate.lower().startswith("file://"):
            candidate = candidate[7:]

        path = Path(candidate)
        checks: list[Path] = []
        if path.is_absolute():
            checks.append(path)
        else:
            for base in base_dirs:
                checks.append((base / path).resolve())

        for check in checks:
            key = str(check)
            if key in seen:
                continue
            seen.add(key)
            if check.exists() and check.is_file() and check.suffix.lower() == ".pdf":
                resolved.append(check)
    return resolved


def collect_candidate_urls(
    client: httpx.Client,
    entry: dict[str, Any],
    doi: str | None,
    unpaywall_email: str | None,
) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()

    entry_url = str(entry.get("url") or "").strip()
    if entry_url:
        arxiv_url = arxiv_pdf_url(entry_url)
        if arxiv_url:
            add_url_candidate(candidates, seen, arxiv_url, "entry_arxiv")
        if is_pdf_like_url(entry_url):
            add_url_candidate(candidates, seen, entry_url, "entry_url_pdf")
        add_url_candidate(candidates, seen, entry_url, "entry_url")

    eprint = str(entry.get("eprint") or "").strip()
    if eprint:
        arxiv_url = arxiv_pdf_url(eprint)
        if arxiv_url:
            add_url_candidate(candidates, seen, arxiv_url, "entry_eprint")

    if not doi:
        return candidates

    doi_url = f"https://doi.org/{quote(doi, safe='')}"
    add_url_candidate(candidates, seen, doi_url, "doi_resolver")
    add_direct_publisher_candidates(candidates, seen, doi)

    try:
        # OpenAlex
        resp = client.get(
            f"https://api.openalex.org/works/https://doi.org/{quote(doi, safe='')}",
            timeout=10.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            oa = data.get("open_access", {}) if isinstance(data, dict) else {}
            add_url_candidate(candidates, seen, oa.get("oa_url"), "openalex")
            primary = data.get("primary_location", {}) if isinstance(data, dict) else {}
            add_url_candidate(candidates, seen, primary.get("pdf_url"), "openalex")
            best = data.get("best_oa_location", {}) if isinstance(data, dict) else {}
            add_url_candidate(candidates, seen, best.get("pdf_url"), "openalex")
            locations = data.get("locations", []) if isinstance(data, dict) else []
            if isinstance(locations, list):
                for loc in locations:
                    if not isinstance(loc, dict):
                        continue
                    add_url_candidate(candidates, seen, loc.get("pdf_url"), "openalex")
    except Exception:
        pass

    try:
        # Semantic Scholar (no API key path)
        resp = client.get(
            f"https://api.semanticscholar.org/graph/v1/paper/DOI:{quote(doi, safe='')}",
            params={"fields": "openAccessPdf,url"},
            timeout=10.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict):
                open_access_pdf = data.get("openAccessPdf") or {}
                if isinstance(open_access_pdf, dict):
                    add_url_candidate(candidates, seen, open_access_pdf.get("url"), "semantic_scholar")
                add_url_candidate(candidates, seen, data.get("url"), "semantic_scholar")
    except Exception:
        pass

    if unpaywall_email:
        try:
            resp = client.get(
                f"https://api.unpaywall.org/v2/{quote(doi, safe='')}",
                params={"email": unpaywall_email},
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    best = data.get("best_oa_location") or {}
                    if isinstance(best, dict):
                        add_url_candidate(candidates, seen, best.get("url_for_pdf"), "unpaywall")
                    locations = data.get("oa_locations", [])
                    if isinstance(locations, list):
                        for loc in locations:
                            if isinstance(loc, dict):
                                add_url_candidate(candidates, seen, loc.get("url_for_pdf"), "unpaywall")
        except Exception:
            pass

    return candidates


def fetch_pdf_bytes(
    client: httpx.Client,
    url: str,
    user_agent: str,
    max_pdf_mb: int,
    timeout_sec: float,
) -> tuple[bytes, str, str] | None:
    max_bytes = max_pdf_mb * 1024 * 1024
    headers = {
        "User-Agent": user_agent,
        "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        with client.stream("GET", url, headers=headers, timeout=timeout_sec, follow_redirects=True) as resp:
            if resp.status_code != 200:
                return None

            content_length = resp.headers.get("content-length")
            if content_length and content_length.isdigit() and int(content_length) > max_bytes:
                return None

            chunks: list[bytes] = []
            size = 0
            for chunk in resp.iter_bytes():
                if not chunk:
                    continue
                size += len(chunk)
                if size > max_bytes:
                    return None
                chunks.append(chunk)
    except Exception:
        return None

    body = b"".join(chunks)
    if not body:
        return None
    content_type = (resp.headers.get("content-type") or "").lower()
    if "pdf" not in content_type and not body.startswith(b"%PDF-"):
        return None
    return body, str(resp.url), content_type


@register_step_type
class PdfFetchHandler(StepHandler):
    step_type = "pdf-fetch"
    name = "PDF Fetch"
    description = "Resolve and cache PDFs using DOI-first lookup with local/cached reuse."
    icon = "FileDown"
    output_definitions = [
        OutputDefinition(
            name="passed",
            description="Entries passed to downstream step (all or PDF-only based on mode)",
            required=True,
        ),
        OutputDefinition(
            name="pdf_found",
            description="Entries with resolved PDF files",
            required=True,
        ),
        OutputDefinition(
            name="pdf_missing",
            description="Entries without resolvable PDF",
            required=True,
        ),
    ]

    @classmethod
    def get_config_schema(cls) -> dict:
        return {
            "type": "object",
            "properties": {
                "pass_mode": {
                    "type": "string",
                    "enum": ["all", "pdf_only"],
                    "default": "all",
                    "description": "all: pass all entries, pdf_only: pass only entries with resolved PDF",
                },
                "reuse_cache": {
                    "type": "boolean",
                    "default": True,
                    "description": "Reuse existing PDF library records before resolving/download",
                },
                "download_enabled": {
                    "type": "boolean",
                    "default": True,
                    "description": "Allow downloading PDF from online sources",
                },
                "timeout_sec": {
                    "type": "number",
                    "minimum": 3,
                    "maximum": 120,
                    "default": 20,
                    "description": "HTTP timeout in seconds",
                },
                "max_pdf_mb": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 200,
                    "default": 50,
                    "description": "Maximum accepted PDF size",
                },
                "unpaywall_email": {
                    "type": "string",
                    "default": "",
                    "description": "Email for Unpaywall API (optional, can also use UNPAYWALL_EMAIL env)",
                },
                "browser_assist_enabled": {
                    "type": "boolean",
                    "default": True,
                    "description": "Open a real browser for manual login/challenge handling, then continue auto PDF fetch",
                },
                "browser_assist_headed": {
                    "type": "boolean",
                    "default": True,
                    "description": "Show browser window for manual interaction (disable for headless-only environments)",
                },
                "browser_assist_wait_sec": {
                    "type": "number",
                    "minimum": 10,
                    "maximum": 900,
                    "default": 180,
                    "description": "How long to keep browser assist active per unresolved entry",
                },
                "browser_assist_profile": {
                    "type": "string",
                    "default": "default",
                    "description": "Persistent browser profile name under screening/browser_profiles",
                },
            },
            "required": [],
        }

    def run(
        self,
        input_entries: list[dict],
        config: dict,
        progress_callback: ProgressCallback | None = None,
    ) -> StepResult:
        pass_mode = str(config.get("pass_mode", "all")).strip()
        if pass_mode not in ("all", "pdf_only"):
            pass_mode = "all"
        reuse_cache = bool(config.get("reuse_cache", True))
        download_enabled = bool(config.get("download_enabled", True))
        timeout_sec = float(config.get("timeout_sec", 20))
        max_pdf_mb = int(config.get("max_pdf_mb", 50))
        browser_assist_enabled = bool(config.get("browser_assist_enabled", True))
        browser_assist_headed = bool(config.get("browser_assist_headed", True))
        browser_assist_wait_sec = float(config.get("browser_assist_wait_sec", 180))
        browser_assist_profile = sanitize_profile_name(config.get("browser_assist_profile"))
        user_agent = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        )
        unpaywall_email = (
            str(config.get("unpaywall_email", "")).strip()
            or os.getenv("UNPAYWALL_EMAIL", "").strip()
        )

        project_id = str(config.get("_project_id", "")).strip() or None
        step_id = str(config.get("_step_id", "")).strip() or None

        index = load_pdf_index()

        pdf_found: list[dict] = []
        pdf_missing: list[dict] = []
        changes_all: list[Change] = []
        changes_pdf_only: list[Change] = []

        cache_hits = 0
        local_hits = 0
        downloaded_count = 0
        browser_assist_attempted = 0
        browser_assist_resolved = 0
        browser_assist_errors = 0
        browser_assist_available = False
        browser_assist_error: str | None = None
        browser_session: BrowserAssistSession | None = None

        total_entries = len(input_entries)
        if progress_callback:
            progress_callback(0, total_entries, "Resolving PDFs")

        try:
            with httpx.Client(timeout=timeout_sec, follow_redirects=True) as client:
                for index_no, entry in enumerate(input_entries):
                    entry_key = str(entry.get("ID") or f"row_{index_no}")
                    title = guess_title(entry)
                    doi = normalize_doi(entry.get("doi") or entry.get("DOI"))
                    entry_label = summarize_entry_label(entry_key=entry_key, doi=doi, title=title)
                    canonical_key = canonical_key_for_entry(entry)
                    if doi:
                        canonical_key = f"doi:{doi}"

                    status = "missing"
                    resolved_path: str | None = None
                    resolved_source: str | None = None
                    resolved_provider: str | None = None
                    resolved_url: str | None = None
                    resolved_record_id: str | None = None
                    missing_reason = "not_found"
                    entry_browser_assist_used = False
                    entry_browser_assist_result: str | None = None
                    attempted_providers: set[str] = set()
                    browser_assist_candidate_count = 0
                    browser_assist_tried_count = 0
                    browser_assist_page_url: str | None = None

                    if progress_callback:
                        progress_callback(
                            index_no,
                            total_entries,
                            f"[{index_no + 1}/{total_entries}] {entry_label}: checking cache and local files",
                        )

                    cached_record = None
                    if canonical_key and reuse_cache:
                        cached_record = (index.get("records") or {}).get(canonical_key)

                    if (
                        isinstance(cached_record, dict)
                        and cached_record.get("status") == "found"
                        and cached_record.get("pdf_path")
                    ):
                        cached_path = Path(str(cached_record["pdf_path"]))
                        if cached_path.exists():
                            cached_source_url = cached_record.get("source_url")
                            if is_cached_pdf_likely_for_doi(
                                pdf_path=cached_path,
                                source_url=cached_source_url,
                                doi=doi,
                            ):
                                status = "found"
                                resolved_path = str(cached_path)
                                resolved_source = "cache"
                                resolved_provider = cached_record.get("provider")
                                resolved_url = cached_source_url
                                resolved_record_id = str(cached_record.get("id") or "") or None
                                cache_hits += 1
                                found_record = mark_record_found(
                                    index,
                                    key=canonical_key,
                                    title=title,
                                    pdf_path=cached_path,
                                    managed_file=bool(cached_record.get("managed_file")),
                                    source="cache",
                                    source_url=resolved_url,
                                    provider=resolved_provider,
                                    content_type=cached_record.get("content_type"),
                                    project_id=project_id,
                                    step_id=step_id,
                                    entry_key=entry_key,
                                )
                                resolved_record_id = str(found_record.get("id") or "") or resolved_record_id

                    if status != "found":
                        local_paths = resolve_local_pdf_candidates(entry, project_id=project_id)
                        if local_paths:
                            local_path = local_paths[0]
                            status = "found"
                            resolved_path = str(local_path.resolve())
                            resolved_source = "local_file"
                            resolved_provider = "local"
                            local_hits += 1
                            if canonical_key:
                                found_record = mark_record_found(
                                    index,
                                    key=canonical_key,
                                    title=title,
                                    pdf_path=local_path,
                                    managed_file=False,
                                    source="local_file",
                                    source_url=None,
                                    provider="local",
                                    content_type="application/pdf",
                                    project_id=project_id,
                                    step_id=step_id,
                                    entry_key=entry_key,
                                )
                                resolved_record_id = str(found_record.get("id") or "") or resolved_record_id

                    candidates_for_entry: list[tuple[str, str]] = []
                    if status != "found" and download_enabled:
                        candidates_for_entry = collect_candidate_urls(
                            client=client,
                            entry=entry,
                            doi=doi,
                            unpaywall_email=unpaywall_email,
                        )
                        if progress_callback:
                            progress_callback(
                                index_no,
                                total_entries,
                                f"[{index_no + 1}/{total_entries}] {entry_label}: trying web sources ({len(candidates_for_entry)} candidates)",
                            )
                        candidate_seen = {url for url, _ in candidates_for_entry}
                        expanded_from: set[str] = set()
                        candidate_idx = 0

                        while candidate_idx < len(candidates_for_entry):
                            candidate_url, provider = candidates_for_entry[candidate_idx]
                            attempted_providers.add(provider)
                            candidate_idx += 1

                            fetched = fetch_pdf_bytes(
                                client=client,
                                url=candidate_url,
                                user_agent=user_agent,
                                max_pdf_mb=max_pdf_mb,
                                timeout_sec=timeout_sec,
                            )
                            if fetched is None:
                                if candidate_url in expanded_from:
                                    continue
                                expanded_from.add(candidate_url)
                                discovered = discover_landing_candidates(
                                    client=client,
                                    seed_url=candidate_url,
                                    provider=provider,
                                    doi=doi,
                                    user_agent=user_agent,
                                    timeout_sec=timeout_sec,
                                )
                                for discovered_url, discovered_provider in discovered:
                                    add_url_candidate(
                                        candidates_for_entry,
                                        candidate_seen,
                                        discovered_url,
                                        discovered_provider,
                                    )
                                continue

                            body, final_url, content_type = fetched

                            if not canonical_key:
                                normalized_final = normalize_url(final_url)
                                if normalized_final:
                                    canonical_key = f"url:{normalized_final}"
                                else:
                                    canonical_key = f"entry:{entry_key}"

                            target_path = managed_pdf_path_for_key(canonical_key)
                            target_path.parent.mkdir(parents=True, exist_ok=True)
                            with open(target_path, "wb") as f:
                                f.write(body)

                            found_record = mark_record_found(
                                index,
                                key=canonical_key,
                                title=title,
                                pdf_path=target_path,
                                managed_file=True,
                                source="download",
                                source_url=final_url,
                                provider=provider,
                                content_type=content_type,
                                project_id=project_id,
                                step_id=step_id,
                                entry_key=entry_key,
                            )
                            status = "found"
                            resolved_path = str(target_path.resolve())
                            resolved_source = "download"
                            resolved_provider = provider
                            resolved_url = final_url
                            resolved_record_id = str(found_record.get("id") or "") or resolved_record_id
                            downloaded_count += 1
                            break

                    entry_url = str(entry.get("url") or "").strip()
                    if (
                        status != "found"
                        and download_enabled
                        and browser_assist_enabled
                        and (doi or entry_url)
                    ):
                        browser_assist_attempted += 1
                        entry_browser_assist_used = True
                        if progress_callback:
                            progress_callback(
                                index_no,
                                total_entries,
                                (
                                    f"[{index_no + 1}/{total_entries}] Browser assist: "
                                    f"complete login/challenge in opened browser window for {entry_label}"
                                ),
                            )
                        if browser_session is None:
                            try:
                                browser_session = BrowserAssistSession(
                                    profile_name=browser_assist_profile,
                                    headed=browser_assist_headed,
                                    user_agent=user_agent,
                                    timeout_sec=timeout_sec,
                                )
                                browser_assist_available = True
                            except Exception as e:
                                browser_assist_errors += 1
                                browser_assist_error = str(e)
                                browser_assist_enabled = False
                                missing_reason = "browser_assist_unavailable"
                                entry_browser_assist_result = "unavailable"
                                print(f"[pdf-fetch] Browser assist unavailable: {e}")

                        if browser_session is not None and status != "found":
                            # Keep full assist window for every unresolved entry.
                            # A 10s cap after the first entry is too short for real
                            # login/challenge flows (ACM/IEEE institutional access).
                            wait_window = max(browser_assist_wait_sec, 10.0)
                            try:
                                assisted = browser_session.resolve_pdf(
                                    doi=doi,
                                    entry_url=entry_url,
                                    initial_candidates=candidates_for_entry,
                                    wait_sec=wait_window,
                                    timeout_sec=timeout_sec,
                                    max_pdf_mb=max_pdf_mb,
                                )
                            except Exception as e:
                                browser_assist_errors += 1
                                browser_assist_error = str(e)
                                missing_reason = "browser_assist_error"
                                entry_browser_assist_result = "error"
                                assisted = None
                                print(f"[pdf-fetch] Browser assist failed: {e}")
                            finally:
                                browser_assist_candidate_count = browser_session.last_candidate_count
                                browser_assist_tried_count = browser_session.last_tried_count
                                browser_assist_page_url = browser_session.last_page_url

                            if assisted is not None:
                                body, final_url, content_type, provider = assisted
                                if not canonical_key:
                                    normalized_final = normalize_url(final_url)
                                    if normalized_final:
                                        canonical_key = f"url:{normalized_final}"
                                    else:
                                        canonical_key = f"entry:{entry_key}"

                                target_path = managed_pdf_path_for_key(canonical_key)
                                target_path.parent.mkdir(parents=True, exist_ok=True)
                                with open(target_path, "wb") as f:
                                    f.write(body)

                                found_record = mark_record_found(
                                    index,
                                    key=canonical_key,
                                    title=title,
                                    pdf_path=target_path,
                                    managed_file=True,
                                    source="browser_assist",
                                    source_url=final_url,
                                    provider=provider,
                                    content_type=content_type,
                                    project_id=project_id,
                                    step_id=step_id,
                                    entry_key=entry_key,
                                )
                                status = "found"
                                resolved_path = str(target_path.resolve())
                                resolved_source = "browser_assist"
                                resolved_provider = provider
                                resolved_url = final_url
                                resolved_record_id = str(found_record.get("id") or "") or resolved_record_id
                                downloaded_count += 1
                                browser_assist_resolved += 1
                                entry_browser_assist_result = "resolved"
                            else:
                                if missing_reason == "not_found":
                                    missing_reason = "browser_assist_unresolved"
                                if entry_browser_assist_result is None:
                                    entry_browser_assist_result = "unresolved"

                    if status != "found":
                        if missing_reason == "not_found":
                            missing_reason = "pdf_not_resolved"
                        if canonical_key:
                            mark_record_missing(
                                index,
                                key=canonical_key,
                                title=title,
                                reason=missing_reason,
                                project_id=project_id,
                                step_id=step_id,
                                entry_key=entry_key,
                            )

                    details = {
                        "pdf_status": status,
                        "pdf_path": resolved_path,
                        "source": resolved_source,
                        "provider": resolved_provider,
                        "source_url": resolved_url,
                        "pdf_record_id": resolved_record_id,
                        "doi": doi,
                        "cache_key": canonical_key,
                        "browser_assist_used": entry_browser_assist_used,
                        "browser_assist_result": entry_browser_assist_result,
                        "missing_reason": None if status == "found" else missing_reason,
                        "missing_reason_label": (
                            None if status == "found" else missing_reason_label(missing_reason)
                        ),
                        "missing_reason_hint": (
                            None if status == "found" else missing_reason_hint(missing_reason)
                        ),
                        "attempted_providers": sorted(attempted_providers),
                        "candidate_count": len(candidates_for_entry),
                        "browser_assist_candidates": (
                            browser_assist_candidate_count if entry_browser_assist_used else None
                        ),
                        "browser_assist_tried": (
                            browser_assist_tried_count if entry_browser_assist_used else None
                        ),
                        "browser_assist_page_url": (
                            browser_assist_page_url if entry_browser_assist_used else None
                        ),
                    }

                    if status == "found":
                        pdf_found.append(entry)
                        changes_all.append(
                            Change(
                                key=entry_key,
                                action="keep",
                                reason="pdf_available",
                                details=details,
                            )
                        )
                        changes_pdf_only.append(
                            Change(
                                key=entry_key,
                                action="keep",
                                reason="pdf_available",
                                details=details,
                            )
                        )
                    else:
                        pdf_missing.append(entry)
                        changes_all.append(
                            Change(
                                key=entry_key,
                                action="keep",
                                reason="pdf_missing_passed",
                                details=details,
                            )
                        )
                        changes_pdf_only.append(
                            Change(
                                key=entry_key,
                                action="remove",
                                reason="pdf_missing",
                                details=details,
                            )
                        )

                    if progress_callback:
                        if status == "found":
                            source_label = resolved_source or "resolved"
                            message = (
                                f"[{index_no + 1}/{total_entries}] {entry_label}: "
                                f"resolved ({source_label})"
                            )
                        else:
                            reason_label = missing_reason_label(missing_reason) or missing_reason
                            message = (
                                f"[{index_no + 1}/{total_entries}] {entry_label}: "
                                f"missing ({reason_label})"
                            )
                        progress_callback(index_no + 1, total_entries, message)
        finally:
            if browser_session is not None:
                browser_session.close()

        save_pdf_index(index)

        passed = input_entries if pass_mode == "all" else pdf_found
        chosen_changes = changes_all if pass_mode == "all" else changes_pdf_only
        removed_count = len(input_entries) - len(passed)

        if progress_callback:
            progress_callback(total_entries, total_entries, "PDF fetch completed")

        return StepResult(
            outputs={
                "passed": passed,
                "pdf_found": pdf_found,
                "pdf_missing": pdf_missing,
            },
            changes=chosen_changes,
            details={
                "pass_mode": pass_mode,
                "mode_outputs": {
                    "all": input_entries,
                    "pdf_only": pdf_found,
                },
                "mode_changes": {
                    "all": changes_all,
                    "pdf_only": changes_pdf_only,
                },
                "stats": {
                    "input_count": len(input_entries),
                    "passed_count": len(passed),
                    "removed_count": removed_count,
                },
                "cache_hits": cache_hits,
                "local_hits": local_hits,
                "downloaded_count": downloaded_count,
                "browser_assist": {
                    "enabled": bool(config.get("browser_assist_enabled", False)),
                    "available": browser_assist_available,
                    "attempted_entries": browser_assist_attempted,
                    "resolved_entries": browser_assist_resolved,
                    "errors": browser_assist_errors,
                    "last_error": browser_assist_error,
                },
            },
        )
