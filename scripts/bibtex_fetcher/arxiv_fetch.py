#!/usr/bin/env python3
"""Fetch arXiv API results and emit BibTeX entries."""

from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ATOM_NS = "http://www.w3.org/2005/Atom"
ARXIV_NS = "http://arxiv.org/schemas/atom"
OPENSEARCH_NS = "http://a9.com/-/spec/opensearch/1.1/"
NS = {
    "atom": ATOM_NS,
    "arxiv": ARXIV_NS,
    "opensearch": OPENSEARCH_NS,
}


def build_url(query: str, start: int, max_results: int) -> str:
    params = {
        "search_query": query,
        "start": str(start),
        "max_results": str(max_results),
    }
    return "http://export.arxiv.org/api/query?" + urllib.parse.urlencode(params)


def fetch_xml(url: str, timeout: int) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "decompile-survey/0.1 (+https://arxiv.org/help/api/)"
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


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


def parse_entry(entry: ET.Element) -> dict[str, str]:
    id_text = entry.findtext("atom:id", default="", namespaces=NS)
    arxiv_id = id_text.rsplit("/", 1)[-1]
    id_no_version = re.sub(r"v\d+$", "", arxiv_id)

    title = normalize_whitespace(
        entry.findtext("atom:title", default="", namespaces=NS)
    )
    summary = normalize_whitespace(
        entry.findtext("atom:summary", default="", namespaces=NS)
    )
    published = entry.findtext("atom:published", default="", namespaces=NS)
    updated = entry.findtext("atom:updated", default="", namespaces=NS)
    year = published[:4] if len(published) >= 4 else ""
    month = published[5:7] if len(published) >= 7 else ""

    authors = []
    affiliations = []
    for author in entry.findall("atom:author", namespaces=NS):
        name = author.findtext("atom:name", default="", namespaces=NS).strip()
        if name:
            authors.append(name)
        affiliation = author.findtext(
            "arxiv:affiliation", default="", namespaces=NS
        ).strip()
        if affiliation:
            affiliations.append(f"{name}: {affiliation}" if name else affiliation)

    primary_category = entry.find("arxiv:primary_category", namespaces=NS)
    primary_class = ""
    if primary_category is not None:
        primary_class = primary_category.attrib.get("term", "")

    doi = entry.findtext("arxiv:doi", default="", namespaces=NS)
    journal_ref = entry.findtext(
        "arxiv:journal_ref", default="", namespaces=NS
    )
    comment = entry.findtext("arxiv:comment", default="", namespaces=NS)

    categories = []
    for category in entry.findall("atom:category", namespaces=NS):
        term = category.attrib.get("term", "")
        if term:
            categories.append(term)

    url = ""
    pdf_url = ""
    for link in entry.findall("atom:link", namespaces=NS):
        rel = link.attrib.get("rel", "")
        href = link.attrib.get("href", "")
        link_type = link.attrib.get("type", "")
        if rel == "alternate" and not url:
            url = href
        if rel == "related" and link_type == "application/pdf" and not pdf_url:
            pdf_url = href

    data = {
        "id": id_no_version,
        "title": title,
        "summary": summary,
        "author": " and ".join(authors),
        "affiliations": "; ".join(affiliations),
        "year": year,
        "month": month,
        "primaryClass": primary_class,
        "categories": " ".join(categories),
        "doi": doi,
        "journal_ref": journal_ref,
        "comment": comment,
        "updated": updated,
        "published": published,
        "url": url,
        "pdf": pdf_url,
    }
    return data


def entry_to_bibtex(data: dict[str, str]) -> str:
    arxiv_id = data.get("id", "")
    key = f"arXiv:{arxiv_id}" if arxiv_id else "arXiv:unknown"

    fields: list[tuple[str, str]] = [
        ("title", data.get("title", "")),
        ("author", data.get("author", "")),
        ("abstract", data.get("summary", "")),
        ("journal", f"arXiv preprint arXiv:{arxiv_id}" if arxiv_id else ""),
        ("year", data.get("year", "")),
        ("month", data.get("month", "")),
        ("eprint", arxiv_id),
        ("archivePrefix", "arXiv" if arxiv_id else ""),
        ("primaryClass", data.get("primaryClass", "")),
        ("categories", data.get("categories", "")),
        ("comment", data.get("comment", "")),
        ("updated", data.get("updated", "")),
        ("published", data.get("published", "")),
        ("url", data.get("url", "")),
        ("pdf", data.get("pdf", "")),
        ("author_affiliations", data.get("affiliations", "")),
        ("doi", data.get("doi", "")),
    ]

    note = ""
    if data.get("journal_ref"):
        note = f"Journal reference: {data['journal_ref']}"
        fields.append(("note", note))

    lines = [f"@article{{{key},"]
    for field, value in fields:
        if value:
            lines.append(f"  {field} = {{{escape_bibtex(value)}}},")
    lines.append("}")
    return "\n".join(lines)


def parse_total_results(root: ET.Element) -> int | None:
    text = root.findtext("opensearch:totalResults", default="", namespaces=NS)
    try:
        return int(text)
    except ValueError:
        return None


def load_query(args: argparse.Namespace) -> str:
    if args.query:
        return args.query
    if args.query_file:
        with open(args.query_file, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    raise ValueError("Query is required")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch arXiv API results and emit BibTeX entries."
    )
    parser.add_argument("--query", help="arXiv API search_query string")
    parser.add_argument("--query-file", help="Path to file containing query")
    parser.add_argument("--start", type=int, default=0, help="Start index")
    parser.add_argument(
        "--page-size", type=int, default=100, help="Results per request"
    )
    parser.add_argument(
        "--max-pages", type=int, default=1, help="Number of pages to fetch"
    )
    parser.add_argument("--sleep", type=float, default=2.0, help="Delay between requests")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    parser.add_argument("--output", help="Output BibTeX path (default: auto)")
    parser.add_argument(
        "--output-dir",
        default="imports/arXiv",
        help="Output directory when auto-naming (default: imports/arXiv)",
    )
    parser.add_argument(
        "--output-prefix",
        default="arXiv_decompil",
        help="Filename prefix when auto-naming (default: arXiv_decompil)",
    )
    args = parser.parse_args()

    query = load_query(args)

    output = sys.stdout
    output_path = None
    if args.output:
        output_path = Path(args.output)
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        output_dir = Path(args.output_dir)
        output_path = output_dir / f"{args.output_prefix}_{timestamp}.bib"

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output = open(output_path, "w", encoding="utf-8")

    try:
        total_written = 0
        for page in range(args.max_pages):
            start = args.start + page * args.page_size
            url = build_url(query, start, args.page_size)
            xml_bytes = fetch_xml(url, args.timeout)
            root = ET.fromstring(xml_bytes)
            entries = root.findall("atom:entry", namespaces=NS)
            if not entries:
                break

            for entry in entries:
                data = parse_entry(entry)
                output.write(entry_to_bibtex(data))
                output.write("\n\n")
                total_written += 1

            total_results = parse_total_results(root)
            if total_results is not None:
                if start + len(entries) >= total_results:
                    break

            if page < args.max_pages - 1:
                time.sleep(args.sleep)

        if total_written == 0:
            sys.stderr.write("No entries found.\n")
    finally:
        if output is not sys.stdout:
            output.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
