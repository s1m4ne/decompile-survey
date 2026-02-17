"""
Utilities for a shared PDF library (outside project directories).

The library stores per-paper metadata keyed by canonical DOI/URL and can
optionally manage downloaded PDF files in a dedicated directory.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


SCREENING_DIR = Path(__file__).resolve().parent.parent.parent / "screening"
DEFAULT_PDF_LIBRARY_DIR = SCREENING_DIR / "pdf_library"
PDF_LIBRARY_ENV = "PDF_LIBRARY_DIR"


def utcnow_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def get_pdf_library_dir() -> Path:
    env_path = os.getenv(PDF_LIBRARY_ENV, "").strip()
    if env_path:
        return Path(env_path).expanduser().resolve()
    return DEFAULT_PDF_LIBRARY_DIR


def get_pdf_files_dir() -> Path:
    return get_pdf_library_dir() / "files"


def get_pdf_index_file() -> Path:
    return get_pdf_library_dir() / "index.json"


def ensure_pdf_library_dirs() -> None:
    get_pdf_library_dir().mkdir(parents=True, exist_ok=True)
    get_pdf_files_dir().mkdir(parents=True, exist_ok=True)


def _empty_index() -> dict[str, Any]:
    return {
        "version": "1.0",
        "records": {},
    }


def load_pdf_index() -> dict[str, Any]:
    ensure_pdf_library_dirs()
    index_file = get_pdf_index_file()
    if not index_file.exists():
        return _empty_index()

    try:
        with open(index_file, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return _empty_index()

    if not isinstance(data, dict):
        return _empty_index()
    records = data.get("records")
    if not isinstance(records, dict):
        data["records"] = {}
    if "version" not in data:
        data["version"] = "1.0"
    return data


def save_pdf_index(index: dict[str, Any]) -> None:
    ensure_pdf_library_dirs()
    index_file = get_pdf_index_file()
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)


def list_pdf_records(index: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if index is None:
        index = load_pdf_index()
    records = index.get("records", {})
    if not isinstance(records, dict):
        return []
    result = [record for record in records.values() if isinstance(record, dict)]
    result.sort(key=lambda r: r.get("updated_at", ""), reverse=True)
    return result


def get_record_by_id(index: dict[str, Any], record_id: str) -> tuple[str, dict[str, Any]] | None:
    records = index.get("records", {})
    if not isinstance(records, dict):
        return None
    for key, record in records.items():
        if isinstance(record, dict) and record.get("id") == record_id:
            return key, record
    return None


def normalize_doi(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None

    value = value.strip("{}")
    value = unquote(value)
    value = value.replace("\\", "")
    value = value.strip()

    value = re.sub(r"(?i)^https?://(dx\.)?doi\.org/", "", value)
    value = re.sub(r"(?i)^doi:\s*", "", value)
    value = value.split("?", 1)[0].split("#", 1)[0].strip().strip("/")
    value = value.lower()

    if not value:
        return None
    if not re.match(r"^10\.\d{4,9}/\S+$", value):
        return None
    return value


def normalize_url(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip().strip("{}")
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https"):
        return None
    host = parsed.netloc.lower()
    path = parsed.path or ""
    if not host:
        return None
    # Keep query because some providers include tokenized resolver URLs.
    normalized = f"{parsed.scheme.lower()}://{host}{path}"
    if parsed.query:
        normalized += f"?{parsed.query}"
    return normalized


def canonical_key_for_entry(entry: dict[str, Any]) -> str | None:
    doi = normalize_doi(entry.get("doi") or entry.get("DOI"))
    if doi:
        return f"doi:{doi}"

    url = normalize_url(entry.get("url") or entry.get("URL"))
    if url:
        return f"url:{url}"
    return None


def key_to_record_id(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def managed_pdf_path_for_key(key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return get_pdf_files_dir() / f"{digest}.pdf"


def file_size(path: Path) -> int | None:
    try:
        return path.stat().st_size
    except Exception:
        return None


def _ensure_record(index: dict[str, Any], key: str, title: str | None = None) -> dict[str, Any]:
    records = index.setdefault("records", {})
    if not isinstance(records, dict):
        index["records"] = {}
        records = index["records"]

    existing = records.get(key)
    if isinstance(existing, dict):
        record = existing
    else:
        now = utcnow_iso()
        record = {
            "id": key_to_record_id(key),
            "key": key,
            "doi": key[4:] if key.startswith("doi:") else None,
            "year": None,
            "database": None,
            "title": title or "",
            "status": "missing",
            "pdf_path": None,
            "managed_file": False,
            "source": None,
            "source_url": None,
            "provider": None,
            "content_type": None,
            "size_bytes": None,
            "project_ids": [],
            "step_ids": [],
            "entry_keys": [],
            "missing_reason": "not_checked",
            "failure_count": 0,
            "created_at": now,
            "updated_at": now,
            "last_checked_at": now,
        }
        records[key] = record

    if title and not record.get("title"):
        record["title"] = title
    return record


def add_record_references(
    record: dict[str, Any],
    *,
    project_id: str | None,
    step_id: str | None,
    entry_key: str | None,
) -> None:
    for field, value in (
        ("project_ids", project_id),
        ("step_ids", step_id),
        ("entry_keys", entry_key),
    ):
        if not value:
            continue
        items = record.get(field)
        if not isinstance(items, list):
            items = []
            record[field] = items
        if value not in items:
            items.append(value)


def mark_record_found(
    index: dict[str, Any],
    *,
    key: str,
    title: str | None = None,
    year: str | None = None,
    database: str | None = None,
    pdf_path: Path,
    managed_file: bool,
    source: str,
    source_url: str | None,
    provider: str | None,
    content_type: str | None,
    project_id: str | None,
    step_id: str | None,
    entry_key: str | None,
) -> dict[str, Any]:
    record = _ensure_record(index, key, title=title)
    now = utcnow_iso()
    record["status"] = "found"
    record["title"] = title or record.get("title", "")
    if year:
        record["year"] = year
    if database:
        record["database"] = database
    record["pdf_path"] = str(pdf_path.resolve())
    record["managed_file"] = bool(managed_file)
    record["source"] = source
    record["source_url"] = source_url
    record["provider"] = provider
    record["content_type"] = content_type
    record["size_bytes"] = file_size(pdf_path)
    record["missing_reason"] = None
    record["last_checked_at"] = now
    record["updated_at"] = now
    add_record_references(
        record,
        project_id=project_id,
        step_id=step_id,
        entry_key=entry_key,
    )
    return record


def mark_record_missing(
    index: dict[str, Any],
    *,
    key: str,
    title: str | None = None,
    year: str | None = None,
    database: str | None = None,
    reason: str,
    project_id: str | None,
    step_id: str | None,
    entry_key: str | None,
) -> dict[str, Any]:
    record = _ensure_record(index, key, title=title)
    now = utcnow_iso()
    record["status"] = "missing"
    record["title"] = title or record.get("title", "")
    if year:
        record["year"] = year
    if database:
        record["database"] = database
    record["missing_reason"] = reason
    record["failure_count"] = int(record.get("failure_count", 0) or 0) + 1
    record["last_checked_at"] = now
    record["updated_at"] = now
    add_record_references(
        record,
        project_id=project_id,
        step_id=step_id,
        entry_key=entry_key,
    )
    return record


def guess_title(entry: dict[str, Any]) -> str:
    raw_title = str(entry.get("title") or "").strip()
    return raw_title.replace("{", "").replace("}", "")


def delete_record(
    *,
    record_id: str,
    delete_file: bool = True,
) -> dict[str, Any]:
    index = load_pdf_index()
    hit = get_record_by_id(index, record_id)
    if hit is None:
        raise KeyError(record_id)

    key, record = hit
    path_text = record.get("pdf_path")
    removed_file = False
    removed_path: str | None = None

    if delete_file and path_text and record.get("managed_file"):
        file_path = Path(path_text)
        if file_path.exists():
            file_path.unlink()
            removed_file = True
            removed_path = str(file_path)

    records = index.get("records", {})
    if isinstance(records, dict) and key in records:
        del records[key]
    save_pdf_index(index)

    return {
        "record_id": record_id,
        "removed_file": removed_file,
        "removed_path": removed_path,
    }
