"""
PDF Library API - List and manage globally cached PDFs.
"""

import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from pdf_library import (
    SCREENING_DIR,
    load_pdf_index,
    list_pdf_records,
    delete_record,
    normalize_doi,
)


router = APIRouter(prefix="/pdf-library", tags=["pdf-library"])


class PdfRecord(BaseModel):
    id: str
    key: str
    doi: str | None = None
    title: str = ""
    status: str
    pdf_path: str | None = None
    managed_file: bool = False
    source: str | None = None
    source_url: str | None = None
    provider: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    project_ids: list[str] = Field(default_factory=list)
    step_ids: list[str] = Field(default_factory=list)
    entry_keys: list[str] = Field(default_factory=list)
    missing_reason: str | None = None
    failure_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None
    last_checked_at: str | None = None
    project_ref_count: int = 0


class PdfStats(BaseModel):
    total: int
    found: int
    missing: int
    managed_files: int
    external_refs: int


class DeletePdfRecordResponse(BaseModel):
    record_id: str
    removed_file: bool
    removed_path: str | None = None


def to_pdf_record(record: dict) -> PdfRecord:
    return PdfRecord(
        id=str(record.get("id") or ""),
        key=str(record.get("key") or ""),
        doi=record.get("doi"),
        title=str(record.get("title") or ""),
        status=str(record.get("status") or "missing"),
        pdf_path=record.get("pdf_path"),
        managed_file=bool(record.get("managed_file")),
        source=record.get("source"),
        source_url=record.get("source_url"),
        provider=record.get("provider"),
        content_type=record.get("content_type"),
        size_bytes=record.get("size_bytes"),
        project_ids=[str(x) for x in (record.get("project_ids") or [])],
        step_ids=[str(x) for x in (record.get("step_ids") or [])],
        entry_keys=[str(x) for x in (record.get("entry_keys") or [])],
        missing_reason=record.get("missing_reason"),
        failure_count=int(record.get("failure_count") or 0),
        created_at=record.get("created_at"),
        updated_at=record.get("updated_at"),
        last_checked_at=record.get("last_checked_at"),
        project_ref_count=len(set(str(x) for x in (record.get("project_ids") or []))),
    )


@router.get("")
def get_pdf_library(
    q: str = Query(default="", description="Search query (DOI/title/path/source URL)"),
    status: str = Query(default="all", description="all | found | missing"),
) -> list[PdfRecord]:
    index = load_pdf_index()
    records = list_pdf_records(index)

    query = q.strip().lower()
    allowed_status = {"all", "found", "missing"}
    if status not in allowed_status:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    filtered: list[PdfRecord] = []
    for record in records:
        rec_status = str(record.get("status") or "missing")
        if status != "all" and rec_status != status:
            continue

        if query:
            haystack = " ".join(
                str(record.get(field) or "")
                for field in ("doi", "title", "pdf_path", "source_url", "key", "source")
            ).lower()
            if query not in haystack:
                continue

        filtered.append(to_pdf_record(record))

    return filtered


@router.get("/stats")
def get_pdf_library_stats() -> PdfStats:
    index = load_pdf_index()
    records = list_pdf_records(index)
    total = len(records)
    found = sum(1 for r in records if r.get("status") == "found")
    missing = sum(1 for r in records if r.get("status") == "missing")
    managed_files = sum(1 for r in records if r.get("managed_file"))
    external_refs = sum(1 for r in records if not r.get("managed_file") and r.get("pdf_path"))
    return PdfStats(
        total=total,
        found=found,
        missing=missing,
        managed_files=managed_files,
        external_refs=external_refs,
    )


@router.get("/{record_id}/download")
def download_pdf(record_id: str):
    record, file_path, _ = _resolve_pdf_file(record_id)
    return FileResponse(
        path=file_path,
        filename=_build_download_filename(record, file_path),
        media_type="application/pdf",
    )


@router.get("/{record_id}/view")
def view_pdf(record_id: str):
    _, file_path, filename = _resolve_pdf_file(record_id)
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def _resolve_pdf_file(record_id: str) -> tuple[dict, Path, str]:
    index = load_pdf_index()
    records = list_pdf_records(index)
    record = next((r for r in records if str(r.get("id")) == record_id), None)
    if record is None:
        raise HTTPException(status_code=404, detail=f"PDF record not found: {record_id}")

    if record.get("status") != "found":
        raise HTTPException(status_code=400, detail="PDF is not available for this record")

    path = record.get("pdf_path")
    if not path:
        raise HTTPException(status_code=404, detail="PDF path is missing")

    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF file does not exist on disk")

    filename = file_path.name
    doi = record.get("doi")
    if doi:
        safe_doi = doi.replace("/", "_")
        filename = f"{safe_doi}.pdf"
    return record, file_path, filename


def _sanitize_component(text: str, *, fallback: str, max_len: int = 80) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    collapsed = re.sub(r"[^A-Za-z0-9]+", "_", ascii_text)
    collapsed = re.sub(r"_+", "_", collapsed).strip("_").lower()
    if not collapsed:
        collapsed = fallback
    return collapsed[:max_len].rstrip("_") or fallback


def _normalize_entry_year(raw: object) -> str | None:
    text = str(raw or "").strip()
    if not text:
        return None
    match = re.search(r"(19|20)\d{2}", text)
    if not match:
        return None
    return match.group(0)


def _infer_database_from_entry(entry: dict, doi: str | None) -> str | None:
    if doi:
        if doi.startswith("10.1145/"):
            return "acm"
        if doi.startswith("10.1109/"):
            return "ieee"
        if doi.startswith("10.48550/arxiv."):
            return "arxiv"

    source_url = str(entry.get("url") or entry.get("URL") or "").strip()
    host = urlparse(source_url).netloc.lower() if source_url else ""
    if "dl.acm.org" in host:
        return "acm"
    if "ieeexplore.ieee.org" in host:
        return "ieee"
    if "arxiv.org" in host:
        return "arxiv"

    text = " ".join(
        str(entry.get(field) or "")
        for field in ("publisher", "journal", "booktitle", "series")
    ).lower()
    if "arxiv" in text:
        return "arxiv"
    if "ieee" in text:
        return "ieee"
    if "acm" in text or "association for computing machinery" in text:
        return "acm"
    return None


def _lookup_year_database_from_inputs(record: dict) -> tuple[str | None, str | None]:
    project_ids = [str(x) for x in (record.get("project_ids") or []) if str(x).strip()]
    step_ids = [str(x) for x in (record.get("step_ids") or []) if str(x).strip()]
    if not step_ids:
        step_ids = ["pdf_fetch"]

    doi_target = normalize_doi(record.get("doi"))
    entry_keys = {str(x).strip() for x in (record.get("entry_keys") or []) if str(x).strip()}
    if not project_ids:
        return None, None

    for project_id in project_ids:
        for step_id in step_ids:
            input_file = SCREENING_DIR / "projects" / project_id / "steps" / step_id / "input.json"
            if not input_file.exists():
                continue
            try:
                with open(input_file, encoding="utf-8") as f:
                    entries = json.load(f)
            except Exception:
                continue
            if not isinstance(entries, list):
                continue

            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                entry_doi = normalize_doi(entry.get("doi") or entry.get("DOI"))
                entry_id = str(entry.get("ID") or "").strip()
                doi_match = bool(doi_target and entry_doi == doi_target)
                id_match = bool(entry_id and entry_id in entry_keys)
                if not doi_match and not id_match:
                    continue

                year = _normalize_entry_year(entry.get("year"))
                database = _infer_database_from_entry(entry, entry_doi)
                return year, database

    return None, None


def _extract_year(record: dict) -> str:
    raw_year = str(record.get("year") or "").strip()
    match = re.search(r"(19|20)\d{2}", raw_year)
    if match:
        return match.group(0)

    doi = str(record.get("doi") or "").lower()
    # Example: 10.48550/arXiv.2509.14646 -> 2025
    arxiv_match = re.search(r"arxiv\.(\d{2})\d{2}\.\d+", doi)
    if arxiv_match:
        return f"20{arxiv_match.group(1)}"

    return "unknown"


def _extract_database(record: dict) -> str:
    explicit = _sanitize_component(str(record.get("database") or ""), fallback="")
    if explicit:
        return explicit

    doi = str(record.get("doi") or "").lower()
    if doi.startswith("10.1145/"):
        return "acm"
    if doi.startswith("10.1109/"):
        return "ieee"
    if doi.startswith("10.48550/arxiv."):
        return "arxiv"

    source_url = str(record.get("source_url") or "").strip()
    host = urlparse(source_url).netloc.lower() if source_url else ""
    if "dl.acm.org" in host:
        return "acm"
    if "ieeexplore.ieee.org" in host:
        return "ieee"
    if "arxiv.org" in host:
        return "arxiv"

    signal = " ".join(
        str(record.get(field) or "").lower()
        for field in ("provider", "source", "title")
    )
    if "acm" in signal:
        return "acm"
    if "ieee" in signal:
        return "ieee"
    if "arxiv" in signal:
        return "arxiv"
    return "unknown"


def _extract_short_title(record: dict, file_path: Path) -> str:
    title = str(record.get("title") or "").replace("{", " ").replace("}", " ").strip()
    normalized = unicodedata.normalize("NFKD", title)
    ascii_title = normalized.encode("ascii", "ignore").decode("ascii")
    words = re.findall(r"[A-Za-z0-9]+", ascii_title)
    if words:
        short = "_".join(words[:8]).lower()
        return _sanitize_component(short, fallback="untitled", max_len=80)

    doi = str(record.get("doi") or "").strip()
    if doi:
        return _sanitize_component(doi, fallback="untitled", max_len=80)

    return _sanitize_component(file_path.stem, fallback="untitled", max_len=80)


def _build_download_filename(record: dict, file_path: Path) -> str:
    year = _extract_year(record)
    database = _extract_database(record)
    if year == "unknown" or database == "unknown":
        input_year, input_database = _lookup_year_database_from_inputs(record)
        if year == "unknown" and input_year:
            year = input_year
        if database == "unknown" and input_database:
            database = input_database
    short_title = _extract_short_title(record, file_path)
    return f"{year}_{database}_{short_title}.pdf"


@router.delete("/{record_id}")
def remove_pdf_record(
    record_id: str,
    delete_file: bool = Query(default=True, description="Delete managed file from disk"),
) -> DeletePdfRecordResponse:
    try:
        result = delete_record(record_id=record_id, delete_file=delete_file)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"PDF record not found: {record_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return DeletePdfRecordResponse(**result)
