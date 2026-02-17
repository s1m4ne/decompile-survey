#!/usr/bin/env python3
"""Convert Springer Link CSV exports into BibTeX entries."""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path


def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    unescaped = html.unescape(value).replace("\xa0", " ")
    return normalize_whitespace(unescaped.strip())


def strip_jats(value: str) -> str:
    if not value:
        return ""
    text = re.sub(r"</?jats:[^>]+>", " ", value)
    text = re.sub(r"<[^>]+>", " ", text)
    return clean_text(text)


def strip_tags(value: str) -> str:
    if not value:
        return ""
    text = re.sub(r"(?is)<(script|style)\b[^>]*>.*?</\1>", " ", value)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p\s*>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return clean_text(text)


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


def read_rows(path: Path) -> list[dict[str, str]]:
    with open(path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows: list[dict[str, str]] = []
        for row in reader:
            cleaned = {key: clean_text(value) for key, value in row.items()}
            rows.append(cleaned)
        return rows


def doi_to_url(doi: str) -> str:
    return f"https://api.crossref.org/works/{urllib.parse.quote(doi, safe='')}"


def build_user_agent(mailto: str | None) -> str:
    if mailto:
        return f"decompile-survey/0.1 (mailto:{mailto})"
    return "decompile-survey/0.1"


def is_springer_url(url: str) -> bool:
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    host = parsed.netloc.lower()
    return parsed.scheme in {"http", "https"} and host.endswith("link.springer.com")


def fetch_crossref_record(
    doi: str,
    timeout: int,
    user_agent: str,
    max_retries: int,
    retry_backoff: float,
) -> dict | None:
    url = doi_to_url(doi)
    headers = {
        "User-Agent": user_agent,
        "Accept": "application/json",
    }
    for attempt in range(max_retries + 1):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                return payload.get("message")
        except urllib.error.HTTPError as exc:
            if exc.code in {429, 500, 502, 503, 504} and attempt < max_retries:
                time.sleep(retry_backoff * (2 ** attempt))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt < max_retries:
                time.sleep(retry_backoff * (2 ** attempt))
                continue
            return None
    return None


def fetch_html_page(
    url: str,
    timeout: int,
    user_agent: str,
    max_retries: int,
    retry_backoff: float,
) -> str | None:
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml",
    }
    for attempt in range(max_retries + 1):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code in {429, 500, 502, 503, 504} and attempt < max_retries:
                time.sleep(retry_backoff * (2 ** attempt))
                continue
            return None
        except (urllib.error.URLError, TimeoutError):
            if attempt < max_retries:
                time.sleep(retry_backoff * (2 ** attempt))
                continue
            return None
    return None


def extract_springer_abstract(html_text: str) -> str:
    if not html_text:
        return ""

    section_patterns = [
        r'(?is)<section\b[^>]*\bdata-title=["\']Abstract["\'][^>]*>(.*?)</section>',
        r'(?is)<section\b[^>]*\baria-labelledby=["\']Abs\d+["\'][^>]*>(.*?)</section>',
    ]
    for section_pattern in section_patterns:
        section_match = re.search(section_pattern, html_text)
        if not section_match:
            continue
        section_html = section_match.group(1)

        content_match = re.search(
            r'(?is)<div\b[^>]*(?:id=["\'][^"\']*?-content["\']|class=["\'][^"\']*c-article-section__content[^"\']*)[^>]*>(.*?)</div>',
            section_html,
        )
        target_html = content_match.group(1) if content_match else section_html
        candidate = strip_tags(target_html)
        if len(candidate) >= 40:
            return candidate

    meta_match = re.search(
        r'(?is)<meta\b[^>]*\bname=["\']dc\.description["\'][^>]*\bcontent=["\'](.*?)["\']',
        html_text,
    )
    if meta_match:
        candidate = clean_text(meta_match.group(1))
        if candidate:
            return candidate

    return ""


def fetch_springer_abstract(
    url: str,
    timeout: int,
    user_agent: str,
    max_retries: int,
    retry_backoff: float,
) -> str:
    html_text = fetch_html_page(
        url=url,
        timeout=timeout,
        user_agent=user_agent,
        max_retries=max_retries,
        retry_backoff=retry_backoff,
    )
    if not html_text:
        return ""
    return extract_springer_abstract(html_text)


def extract_year(message: dict) -> str:
    for key in ("published-print", "published-online", "issued", "created"):
        date_parts = message.get(key, {}).get("date-parts")
        if date_parts and date_parts[0]:
            return str(date_parts[0][0])
    return ""


def extract_title(message: dict) -> str:
    title = message.get("title", [])
    if isinstance(title, list) and title:
        return clean_text(title[0])
    if isinstance(title, str):
        return clean_text(title)
    return ""


def extract_container_title(message: dict) -> str:
    container = message.get("container-title", [])
    if isinstance(container, list) and container:
        return clean_text(container[0])
    if isinstance(container, str):
        return clean_text(container)
    return ""


def extract_authors(message: dict) -> str:
    authors: list[str] = []
    for author in message.get("author", []):
        given = clean_text(author.get("given", ""))
        family = clean_text(author.get("family", ""))
        name = clean_text(author.get("name", ""))
        if family and given:
            authors.append(f"{family}, {given}")
        elif family:
            authors.append(family)
        elif given:
            authors.append(given)
        elif name:
            authors.append(name)
    return " and ".join(authors)


def extract_crossref_abstract(message: dict | None) -> str:
    if not message:
        return ""
    return strip_jats(clean_text(message.get("abstract", "")))


def entry_type_from_csv(content_type: str) -> str:
    lowered = content_type.lower()
    if "conference" in lowered:
        return "inproceedings"
    if "chapter" in lowered:
        return "incollection"
    if "article" in lowered:
        return "article"
    if "book" in lowered:
        return "book"
    return "misc"


def entry_type_from_crossref(message_type: str, fallback: str) -> str:
    mapping = {
        "journal-article": "article",
        "proceedings-article": "inproceedings",
        "book-chapter": "incollection",
        "book": "book",
        "posted-content": "misc",
    }
    return mapping.get(message_type, fallback)


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()
    return slug or "entry"


def make_citation_key(doi: str, title: str, used: set[str]) -> str:
    if doi:
        base = f"springer_{slugify(doi)}"
    else:
        base = f"springer_{slugify(title)[:40]}"
    key = base
    suffix = 2
    while key in used:
        key = f"{base}_{suffix}"
        suffix += 1
    used.add(key)
    return key


def render_entry(entry_type: str, key: str, fields: dict[str, str]) -> str:
    preferred_order = [
        "title",
        "author",
        "booktitle",
        "journal",
        "series",
        "year",
        "volume",
        "number",
        "pages",
        "publisher",
        "doi",
        "url",
        "abstract",
        "content_type",
    ]
    lines = [f"@{entry_type}{{{key},"]
    for field in preferred_order:
        value = fields.get(field, "")
        if value:
            lines.append(f"  {field} = {{{escape_bibtex(value)}}},")
    lines.append("}")
    return "\n".join(lines)


def merge_metadata(
    row: dict[str, str],
    crossref_message: dict | None,
    scraped_abstract: str = "",
) -> tuple[str, dict[str, str]]:
    csv_type = row.get("Content Type", "")
    entry_type = entry_type_from_csv(csv_type)

    title = row.get("Item Title", "")
    author = row.get("Authors", "")
    year = row.get("Publication Year", "")
    doi = row.get("Item DOI", "")
    url = row.get("URL", "")
    publication_title = row.get("Publication Title", "")
    series = row.get("Book Series Title", "")
    volume = row.get("Journal Volume", "")
    number = row.get("Journal Issue", "")
    pages = ""
    publisher = ""
    abstract = ""

    if crossref_message:
        entry_type = entry_type_from_crossref(
            clean_text(crossref_message.get("type", "")),
            entry_type,
        )
        title = extract_title(crossref_message) or title
        author = extract_authors(crossref_message) or author
        year = extract_year(crossref_message) or year
        doi = clean_text(crossref_message.get("DOI", "")) or doi
        url = clean_text(crossref_message.get("URL", "")) or url
        publication_title = (
            extract_container_title(crossref_message) or publication_title
        )
        volume = clean_text(crossref_message.get("volume", "")) or volume
        number = clean_text(crossref_message.get("issue", "")) or number
        pages = clean_text(crossref_message.get("page", "")) or pages
        publisher = clean_text(crossref_message.get("publisher", "")) or publisher
        abstract = extract_crossref_abstract(crossref_message) or abstract

    if not abstract and scraped_abstract:
        abstract = scraped_abstract

    fields: dict[str, str] = {
        "title": title,
        "author": author,
        "year": year,
        "volume": volume,
        "number": number,
        "pages": pages,
        "publisher": publisher,
        "doi": doi,
        "url": url,
        "abstract": abstract,
        "content_type": csv_type,
    }

    if entry_type in {"inproceedings", "incollection"}:
        fields["booktitle"] = publication_title
        fields["series"] = series
    else:
        fields["journal"] = publication_title
        fields["series"] = series

    return entry_type, fields


def fetch_crossref_metadata(
    rows: list[dict[str, str]],
    timeout: int,
    user_agent: str,
    workers: int,
    max_retries: int,
    retry_backoff: float,
) -> dict[str, dict]:
    dois = sorted({row.get("Item DOI", "") for row in rows if row.get("Item DOI", "")})
    if not dois:
        return {}

    results: dict[str, dict] = {}
    if workers <= 1:
        for doi in dois:
            message = fetch_crossref_record(
                doi=doi,
                timeout=timeout,
                user_agent=user_agent,
                max_retries=max_retries,
                retry_backoff=retry_backoff,
            )
            if message:
                results[doi] = message
        return results

    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_doi = {
            pool.submit(
                fetch_crossref_record,
                doi,
                timeout,
                user_agent,
                max_retries,
                retry_backoff,
            ): doi
            for doi in dois
        }
        for future in as_completed(future_to_doi):
            doi = future_to_doi[future]
            try:
                message = future.result()
            except Exception:
                message = None
            if message:
                results[doi] = message
    return results


def fetch_springer_abstracts(
    urls: list[str],
    timeout: int,
    user_agent: str,
    workers: int,
    max_retries: int,
    retry_backoff: float,
) -> dict[str, str]:
    unique_urls = sorted({url for url in urls if is_springer_url(url)})
    if not unique_urls:
        return {}

    results: dict[str, str] = {}
    if workers <= 1:
        for url in unique_urls:
            abstract = fetch_springer_abstract(
                url=url,
                timeout=timeout,
                user_agent=user_agent,
                max_retries=max_retries,
                retry_backoff=retry_backoff,
            )
            if abstract:
                results[url] = abstract
        return results

    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_url = {
            pool.submit(
                fetch_springer_abstract,
                url,
                timeout,
                user_agent,
                max_retries,
                retry_backoff,
            ): url
            for url in unique_urls
        }
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                abstract = future.result()
            except Exception:
                abstract = ""
            if abstract:
                results[url] = abstract
    return results


def default_output_path(input_path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    return input_path.with_name(f"{input_path.stem}_{timestamp}.bib")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert Springer Link CSV exports into BibTeX entries."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to Springer CSV (e.g., SearchResults.csv)",
    )
    parser.add_argument(
        "--output",
        help="Output BibTeX path (default: input basename + timestamp)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=6,
        help="Parallel request workers (default: 6)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=20,
        help="HTTP timeout seconds (default: 20)",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=2,
        help="Retries for transient HTTP errors (default: 2)",
    )
    parser.add_argument(
        "--retry-backoff",
        type=float,
        default=1.0,
        help="Base retry backoff in seconds (default: 1.0)",
    )
    parser.add_argument(
        "--mailto",
        help="Contact email for User-Agent (recommended)",
    )
    parser.add_argument(
        "--no-crossref",
        action="store_true",
        help="Disable Crossref enrichment and build entries from CSV only",
    )
    parser.add_argument(
        "--no-springer-scrape",
        action="store_true",
        help="Disable Springer page scraping fallback for missing abstracts",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Process only first N rows (for dry-run/testing)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        sys.stderr.write(f"Input CSV not found: {input_path}\n")
        return 1

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else default_output_path(input_path)
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rows = read_rows(input_path)
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]
    if not rows:
        sys.stderr.write("No data rows found in CSV.\n")
        return 1

    user_agent = build_user_agent(args.mailto)

    crossref_map: dict[str, dict] = {}
    if not args.no_crossref:
        crossref_map = fetch_crossref_metadata(
            rows=rows,
            timeout=args.timeout,
            user_agent=user_agent,
            workers=max(1, args.workers),
            max_retries=max(0, args.max_retries),
            retry_backoff=max(0.1, args.retry_backoff),
        )

    scrape_candidates: list[str] = []
    if not args.no_springer_scrape:
        for row in rows:
            doi = row.get("Item DOI", "")
            message = crossref_map.get(doi)
            if extract_crossref_abstract(message):
                continue
            url = row.get("URL", "")
            if is_springer_url(url):
                scrape_candidates.append(url)

    springer_abstract_map: dict[str, str] = {}
    if scrape_candidates:
        springer_abstract_map = fetch_springer_abstracts(
            urls=scrape_candidates,
            timeout=args.timeout,
            user_agent=user_agent,
            workers=max(1, args.workers),
            max_retries=max(0, args.max_retries),
            retry_backoff=max(0.1, args.retry_backoff),
        )

    entries: list[str] = []
    used_keys: set[str] = set()
    abstract_count = 0
    crossref_abstract_count = 0
    springer_fallback_abstract_count = 0
    doi_count = 0
    crossref_hit = 0

    for row in rows:
        doi = row.get("Item DOI", "")
        if doi:
            doi_count += 1
        message = crossref_map.get(doi)
        if message:
            crossref_hit += 1

        crossref_abstract = extract_crossref_abstract(message)
        scraped_abstract = springer_abstract_map.get(row.get("URL", ""), "")
        entry_type, fields = merge_metadata(
            row=row,
            crossref_message=message,
            scraped_abstract=scraped_abstract,
        )
        key = make_citation_key(fields.get("doi", doi), fields.get("title", ""), used_keys)
        if crossref_abstract:
            crossref_abstract_count += 1
        elif scraped_abstract:
            springer_fallback_abstract_count += 1
        if fields.get("abstract", ""):
            abstract_count += 1
        entries.append(render_entry(entry_type, key, fields))

    with open(output_path, "w", encoding="utf-8") as handle:
        handle.write("\n\n".join(entries))
        handle.write("\n")

    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Rows processed: {len(rows)}")
    print(f"Rows with DOI: {doi_count}")
    print(f"Crossref enriched: {crossref_hit}")
    if not args.no_springer_scrape:
        print(f"Springer scrape candidates: {len(set(scrape_candidates))}")
        print(f"Springer scraped abstracts: {len(springer_abstract_map)}")
    print(f"Crossref abstracts: {crossref_abstract_count}")
    print(f"Springer fallback abstracts: {springer_fallback_abstract_count}")
    print(f"Entries with abstract: {abstract_count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
