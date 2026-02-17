#!/usr/bin/env python3
"""Search NDSS / USENIX Security via Semantic Scholar Bulk API and emit BibTeX.

Uses the /paper/search/bulk endpoint which returns all results at once
(no 10k limit issue) and applies venue filtering client-side for reliability.

Usage examples:
    # Run both Q1 and Q2 for NDSS and USENIX Security (default)
    python semantic_scholar_fetch.py

    # Specific venues only
    python semantic_scholar_fetch.py --venues NDSS

    # Specific query only
    python semantic_scholar_fetch.py --queries Q1

    # Custom output directory
    python semantic_scholar_fetch.py --output-dir ../../imports/supplementary
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Venue definitions
# ---------------------------------------------------------------------------
VENUES: dict[str, list[str]] = {
    "NDSS": [
        "Network and Distributed System Security Symposium",
        "NDSS",
    ],
    "USENIX_Security": [
        "USENIX Security Symposium",
        "USENIX Security",
    ],
}

# ---------------------------------------------------------------------------
# Query definitions (as agreed in design docs)
# ---------------------------------------------------------------------------
# Q1: Main query – decompil* direct synonyms
Q1_TERMS: list[str] = [
    "decompilation",
    "decompiler",
    "decompiling",
    "decompile",
    "reverse compilation",
    "reverse compiler",
]

# Q2: Complementary query – non-decompil* expressions × binary context
Q2_RECOVERY_TERMS: list[str] = [
    "source code recovery",
    "source recovery",
    "binary-to-source",
    "binary to source",
    "binary lifting",
    "instruction lifting",
    "lifting to IR",
    "lifting to LLVM",
    "assembly-to-C",
    "assembly to C",
    "program reconstruction",
]

Q2_BINARY_TERMS: list[str] = [
    "binary code",
    "machine code",
    "assembly code",
    "executable",
    "disassembly",
    "disassembler",
    "bytecode",
    "binary analysis",
    "stripped binary",
]

# ---------------------------------------------------------------------------
# Semantic Scholar API
# ---------------------------------------------------------------------------
API_BASE = "https://api.semanticscholar.org/graph/v1"
FIELDS = "title,abstract,year,venue,externalIds,authors,publicationTypes,openAccessPdf"
USER_AGENT = "decompile-survey/0.1 (academic research; https://github.com/)"


def api_request(url: str, api_key: str | None = None, timeout: int = 30) -> dict:
    """Make a GET request to the Semantic Scholar API."""
    headers = {"User-Agent": USER_AGENT}
    if api_key:
        headers["x-api-key"] = api_key

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def bulk_search(
    query: str,
    api_key: str | None = None,
    timeout: int = 30,
    sleep: float = 3.0,
    max_pages: int = 5,
) -> list[dict]:
    """Fetch results using the bulk search endpoint with pagination.

    Args:
        max_pages: Stop after this many pages (each ~1000 results). 0 = no limit.
    """
    all_papers: list[dict] = []
    params = {"query": query, "fields": FIELDS}
    url = f"{API_BASE}/paper/search/bulk?" + urllib.parse.urlencode(params)

    page = 0
    while True:
        page += 1
        if max_pages > 0 and page > max_pages:
            sys.stderr.write(f"  Reached max pages limit ({max_pages}). Stopping.\n")
            break

        sys.stderr.write(f"  Bulk search page {page}: {url[:120]}...\n")

        try:
            data = api_request(url, api_key, timeout)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = sleep * 3
                sys.stderr.write(f"  Rate limited. Waiting {wait}s...\n")
                time.sleep(wait)
                continue
            raise

        papers = data.get("data", [])
        all_papers.extend(papers)
        sys.stderr.write(f"  Got {len(papers)} papers (total so far: {len(all_papers)})\n")

        token = data.get("token")
        if not token:
            break

        # Next page
        params_next = {"query": query, "fields": FIELDS, "token": token}
        url = f"{API_BASE}/paper/search/bulk?" + urllib.parse.urlencode(params_next)
        time.sleep(sleep)

    return all_papers


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------
def matches_venue(paper: dict, venue_aliases: list[str]) -> bool:
    """Check if paper venue matches any of the given aliases (case-insensitive)."""
    venue = (paper.get("venue") or "").lower()
    for alias in venue_aliases:
        if alias.lower() in venue:
            return True
    return False


def text_contains_any(text: str, terms: list[str]) -> bool:
    """Check if text contains any of the given terms (case-insensitive)."""
    text_lower = text.lower()
    for term in terms:
        if term.lower() in text_lower:
            return True
    return False


def matches_q1(paper: dict) -> bool:
    """Check if paper matches Q1 (decompil* synonyms) in title or abstract."""
    title = paper.get("title") or ""
    abstract = paper.get("abstract") or ""
    combined = f"{title} {abstract}"
    return text_contains_any(combined, Q1_TERMS)


def matches_q2(paper: dict) -> bool:
    """Check if paper matches Q2 (recovery terms AND binary terms) in title or abstract."""
    title = paper.get("title") or ""
    abstract = paper.get("abstract") or ""
    combined = f"{title} {abstract}"
    has_recovery = text_contains_any(combined, Q2_RECOVERY_TERMS)
    has_binary = text_contains_any(combined, Q2_BINARY_TERMS)
    return has_recovery and has_binary


# ---------------------------------------------------------------------------
# BibTeX generation
# ---------------------------------------------------------------------------
def escape_bibtex(value: str) -> str:
    replacements = {
        "\\": "\\\\",
        "{": "\\{",
        "}": "\\}",
        "%": "\\%",
        "&": "\\&",
        "_": "\\_",
        "#": "\\#",
        "$": "\\$",
        "~": "\\textasciitilde{}",
        "^": "\\textasciicircum{}",
    }
    escaped = value
    for key, replacement in replacements.items():
        escaped = escaped.replace(key, replacement)
    return escaped


def make_cite_key(paper: dict) -> str:
    """Generate a BibTeX citation key from paper metadata."""
    authors = paper.get("authors") or []
    first_author = ""
    if authors:
        name = authors[0].get("name", "")
        # Use last name
        parts = name.split()
        first_author = parts[-1] if parts else "Unknown"
        first_author = re.sub(r"[^a-zA-Z]", "", first_author)

    year = paper.get("year") or ""
    # Add a short title word
    title = paper.get("title") or ""
    title_words = re.findall(r"[A-Za-z]+", title)
    short_title = ""
    skip = {"a", "an", "the", "of", "for", "and", "in", "on", "to", "with", "using", "via", "from"}
    for w in title_words:
        if w.lower() not in skip:
            short_title = w
            break

    return f"{first_author}{year}{short_title}"


def paper_to_bibtex(paper: dict) -> str:
    """Convert a Semantic Scholar paper dict to a BibTeX entry."""
    key = make_cite_key(paper)

    authors = paper.get("authors") or []
    author_str = " and ".join(a.get("name", "") for a in authors)

    ext_ids = paper.get("externalIds") or {}
    doi = ext_ids.get("DOI", "")
    dblp_id = ext_ids.get("DBLP", "")

    fields: list[tuple[str, str]] = [
        ("title", paper.get("title") or ""),
        ("author", author_str),
        ("abstract", paper.get("abstract") or ""),
        ("year", str(paper.get("year") or "")),
        ("venue", paper.get("venue") or ""),
        ("doi", doi),
        ("dblp", dblp_id),
        ("semantic_scholar_id", paper.get("paperId") or ""),
    ]

    # Add URL
    oap = paper.get("openAccessPdf") or {}
    pdf_url = oap.get("url", "")
    if pdf_url:
        fields.append(("url", pdf_url))
    elif doi:
        fields.append(("url", f"https://doi.org/{doi}"))

    entry_type = "inproceedings"
    lines = [f"@{entry_type}{{{key},"]
    for field, value in fields:
        if value:
            lines.append(f"  {field} = {{{escape_bibtex(value)}}},")
    lines.append("}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Search NDSS/USENIX Security via Semantic Scholar API and emit BibTeX."
    )
    parser.add_argument(
        "--venues",
        nargs="+",
        choices=list(VENUES.keys()),
        default=list(VENUES.keys()),
        help="Venues to search (default: all)",
    )
    parser.add_argument(
        "--queries",
        nargs="+",
        choices=["Q1", "Q2"],
        default=["Q1", "Q2"],
        help="Which query sets to run (default: both)",
    )
    parser.add_argument(
        "--api-key",
        help="Semantic Scholar API key (optional, for higher rate limits)",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=3.0,
        help="Delay between API requests in seconds (default: 3.0)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="HTTP timeout in seconds (default: 30)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output directory (default: imports/supplementary/)",
    )
    parser.add_argument(
        "--year-min",
        type=int,
        default=None,
        help="Minimum publication year (default: no limit)",
    )
    parser.add_argument(
        "--year-max",
        type=int,
        default=None,
        help="Maximum publication year (default: no limit)",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=5,
        help="Max pages per bulk search query (~1000 results/page). 0=no limit (default: 5)",
    )
    args = parser.parse_args()

    # Resolve output directory
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent.parent
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = repo_root / "imports" / "supplementary"
    output_dir.mkdir(parents=True, exist_ok=True)

    # -----------------------------------------------------------------------
    # Step 1: Build search queries and fetch from API
    # -----------------------------------------------------------------------
    # We search broadly and filter client-side for venue + query match.
    # This avoids venue name mismatch issues with the API.
    search_queries: list[str] = []
    if "Q1" in args.queries:
        # Broad search that will catch decompil* papers
        search_queries.extend(["decompilation", "decompiler", "reverse compilation"])
    if "Q2" in args.queries:
        # Q2 recovery terms
        search_queries.extend([
            "source code recovery binary",
            "binary lifting",
            "binary-to-source",
            "program reconstruction binary",
        ])

    sys.stderr.write(f"Fetching papers for {len(search_queries)} search terms...\n")
    all_papers: dict[str, dict] = {}  # paperId -> paper (dedup)

    for sq in search_queries:
        sys.stderr.write(f"\nSearching: '{sq}'\n")
        try:
            papers = bulk_search(sq, args.api_key, args.timeout, args.sleep, args.max_pages)
        except Exception as e:
            sys.stderr.write(f"  Error: {e}\n")
            time.sleep(args.sleep)
            continue

        for p in papers:
            pid = p.get("paperId")
            if pid and pid not in all_papers:
                all_papers[pid] = p

        sys.stderr.write(f"  Unique papers so far: {len(all_papers)}\n")
        time.sleep(args.sleep)

    sys.stderr.write(f"\nTotal unique papers fetched: {len(all_papers)}\n")

    # -----------------------------------------------------------------------
    # Step 2: Filter by venue, query match, and year → one .bib per (query, venue)
    # -----------------------------------------------------------------------
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    total_written = 0
    file_summary: list[dict] = []  # for metadata

    for venue_key in args.venues:
        venue_aliases = VENUES[venue_key]

        # Classify each paper by venue and query match
        venue_papers: list[dict] = []
        for paper in all_papers.values():
            if not matches_venue(paper, venue_aliases):
                continue
            year = paper.get("year")
            if args.year_min and year and year < args.year_min:
                continue
            if args.year_max and year and year > args.year_max:
                continue
            venue_papers.append(paper)

        for query_key in args.queries:
            matcher = matches_q1 if query_key == "Q1" else matches_q2
            matched = [p for p in venue_papers if matcher(p)]
            matched.sort(key=lambda p: (p.get("year") or 0, p.get("title") or ""))

            # Write BibTeX file: S2_{Q1}_{NDSS}_{timestamp}.bib
            output_path = output_dir / f"S2_{query_key}_{venue_key}_{timestamp}.bib"
            with open(output_path, "w", encoding="utf-8") as f:
                for paper in matched:
                    f.write(paper_to_bibtex(paper))
                    f.write("\n\n")

            total_written += len(matched)
            file_summary.append({
                "file": output_path.name,
                "query": query_key,
                "venue": venue_key,
                "count": len(matched),
            })

            sys.stderr.write(f"\n=== {query_key} × {venue_key}: {len(matched)} papers → {output_path.name} ===\n")
            for paper in matched:
                year = paper.get("year") or "?"
                title = paper.get("title") or "(no title)"
                has_abstract = "✓" if paper.get("abstract") else "✗"
                sys.stderr.write(f"  [{year}] [abs:{has_abstract}] {title}\n")

    # -----------------------------------------------------------------------
    # Step 3: Write metadata JSON
    # -----------------------------------------------------------------------
    meta = {
        "tool": "semantic_scholar_fetch.py",
        "timestamp": timestamp,
        "venues": args.venues,
        "queries": args.queries,
        "year_range": [args.year_min, args.year_max],
        "total_fetched": len(all_papers),
        "total_matched": total_written,
        "api_key_used": bool(args.api_key),
        "files": file_summary,
    }
    meta_path = output_dir / f"S2_meta_{timestamp}.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    sys.stderr.write(f"\nMetadata written to: {meta_path}\n")

    sys.stderr.write(f"\nDone. Total matched papers: {total_written}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
