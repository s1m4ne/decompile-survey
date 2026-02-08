"""
PDF Library API - List and manage globally cached PDFs.
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from pdf_library import (
    load_pdf_index,
    list_pdf_records,
    delete_record,
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
    _, file_path, filename = _resolve_pdf_file(record_id)
    return FileResponse(
        path=file_path,
        filename=filename,
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
