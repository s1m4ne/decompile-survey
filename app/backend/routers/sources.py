"""
Sources API - Manage project source files.
"""

import asyncio
import json
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/projects/{project_id}/sources", tags=["sources"])

PROJECTS_DIR = Path(__file__).parent.parent.parent.parent / "screening" / "projects"


class SourceFile(BaseModel):
    """Source file information."""
    filename: str
    category: str  # "databases" or "other"
    count: int
    database: str | None = None
    search_query: str | None = None
    search_date: str | None = None


class SourcesMeta(BaseModel):
    """Sources metadata."""
    databases: list[SourceFile]
    other: list[SourceFile]
    totals: dict[str, int]


def get_sources_dir(project_id: str) -> Path:
    """Get the sources directory."""
    return PROJECTS_DIR / project_id / "sources"


def load_sources_meta(project_id: str) -> SourcesMeta:
    """Load sources metadata."""
    sources_dir = get_sources_dir(project_id)
    meta_file = sources_dir / "meta.json"

    if not meta_file.exists():
        return SourcesMeta(
            databases=[],
            other=[],
            totals={"databases": 0, "other": 0, "combined": 0}
        )

    with open(meta_file, encoding="utf-8") as f:
        data = json.load(f)

    return SourcesMeta(**data)


def save_sources_meta(project_id: str, meta: SourcesMeta) -> None:
    """Save sources metadata."""
    sources_dir = get_sources_dir(project_id)
    meta_file = sources_dir / "meta.json"

    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta.model_dump(), f, indent=2, ensure_ascii=False)


def count_bib_entries(file_path: Path) -> int:
    """Count entries in a BibTeX file."""
    import bibtexparser

    with open(file_path, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)

    return len(bib_db.entries)


@router.get("")
def get_sources(project_id: str) -> SourcesMeta:
    """Get sources metadata."""
    return load_sources_meta(project_id)


class PickFileResponse(BaseModel):
    """Response from file picker."""
    paths: list[str] | None
    filenames: list[str] | None
    cancelled: bool
    modified_at: list[str] | None = None
    created_at: list[str | None] | None = None


@router.post("/pick-file")
async def pick_file(project_id: str) -> PickFileResponse:
    """Open macOS Finder to pick a BibTeX file."""
    script = '''
    set theFiles to choose file with prompt "BibTeXファイルを選択してください" of type {"bib"} with multiple selections allowed
    set filePaths to ""
    repeat with aFile in theFiles
        set filePaths to filePaths & (POSIX path of aFile) & "\\n"
    end repeat
    return filePaths
    '''

    try:
        process = await asyncio.create_subprocess_exec(
            "osascript", "-e", script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            return PickFileResponse(paths=None, filenames=None, cancelled=True)

        raw_paths = stdout.decode("utf-8").strip()
        if not raw_paths:
            return PickFileResponse(paths=None, filenames=None, cancelled=True)

        paths = [p for p in raw_paths.split("\n") if p.strip()]
        file_paths: list[Path] = []
        for p in paths:
            path = Path(p)
            if not path.exists():
                raise HTTPException(status_code=404, detail=f"File not found: {p}")
            file_paths.append(path)

        modified_at: list[str] = []
        created_at: list[str | None] = []
        for path in file_paths:
            stat = path.stat()
            modified_at.append(datetime.fromtimestamp(stat.st_mtime).isoformat())
            if hasattr(stat, "st_birthtime"):
                created_at.append(datetime.fromtimestamp(stat.st_birthtime).isoformat())
            else:
                created_at.append(None)

        return PickFileResponse(
            paths=[str(p) for p in file_paths],
            filenames=[p.name for p in file_paths],
            cancelled=False,
            modified_at=modified_at,
            created_at=created_at,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AddFromPathRequest(BaseModel):
    """Request to add a file from a local path."""
    path: str
    category: str = "databases"
    database: str | None = None
    search_query: str | None = None
    search_date: str | None = None


@router.post("/add-from-path")
def add_from_path(project_id: str, request: AddFromPathRequest) -> SourceFile:
    """Add a BibTeX file from a local path (copy to project)."""
    source_path = Path(request.path)

    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {request.path}")

    if not source_path.name.endswith(".bib"):
        raise HTTPException(status_code=400, detail="File must be a .bib file")

    if request.category not in ("databases", "other"):
        raise HTTPException(status_code=400, detail="Category must be 'databases' or 'other'")

    sources_dir = get_sources_dir(project_id)
    target_dir = sources_dir / request.category
    target_dir.mkdir(parents=True, exist_ok=True)

    target_file = target_dir / source_path.name

    # Copy the file
    shutil.copy2(source_path, target_file)

    # Count entries
    entry_count = count_bib_entries(target_file)

    # Update metadata
    meta = load_sources_meta(project_id)
    source_file = SourceFile(
        filename=source_path.name,
        category=request.category,
        count=entry_count,
        database=request.database,
        search_query=request.search_query,
        search_date=request.search_date,
    )

    if request.category == "databases":
        meta.databases = [s for s in meta.databases if s.filename != source_path.name]
        meta.databases.append(source_file)
    else:
        meta.other = [s for s in meta.other if s.filename != source_path.name]
        meta.other.append(source_file)

    # Update totals
    meta.totals["databases"] = sum(s.count for s in meta.databases)
    meta.totals["other"] = sum(s.count for s in meta.other)
    meta.totals["combined"] = meta.totals["databases"] + meta.totals["other"]

    save_sources_meta(project_id, meta)

    return source_file


@router.post("/upload")
async def upload_source(
    project_id: str,
    file: UploadFile = File(...),
    category: str = Form("databases"),
    database: str = Form(None),
    search_query: str = Form(None),
    search_date: str = Form(None),
) -> SourceFile:
    """Upload a BibTeX source file."""
    if not file.filename.endswith(".bib"):
        raise HTTPException(status_code=400, detail="File must be a .bib file")

    if category not in ("databases", "other"):
        raise HTTPException(status_code=400, detail="Category must be 'databases' or 'other'")

    sources_dir = get_sources_dir(project_id)
    target_dir = sources_dir / category
    target_dir.mkdir(parents=True, exist_ok=True)

    target_file = target_dir / file.filename

    # Save the file
    content = await file.read()
    with open(target_file, "wb") as f:
        f.write(content)

    # Count entries
    entry_count = count_bib_entries(target_file)

    # Update metadata
    meta = load_sources_meta(project_id)
    source_file = SourceFile(
        filename=file.filename,
        category=category,
        count=entry_count,
        database=database,
        search_query=search_query,
        search_date=search_date,
    )

    if category == "databases":
        # Remove existing entry with same filename
        meta.databases = [s for s in meta.databases if s.filename != file.filename]
        meta.databases.append(source_file)
    else:
        meta.other = [s for s in meta.other if s.filename != file.filename]
        meta.other.append(source_file)

    # Update totals
    meta.totals["databases"] = sum(s.count for s in meta.databases)
    meta.totals["other"] = sum(s.count for s in meta.other)
    meta.totals["combined"] = meta.totals["databases"] + meta.totals["other"]

    save_sources_meta(project_id, meta)

    return source_file


@router.delete("/{category}/{filename}")
def delete_source(project_id: str, category: str, filename: str) -> dict:
    """Delete a source file."""
    if category not in ("databases", "other"):
        raise HTTPException(status_code=400, detail="Category must be 'databases' or 'other'")

    sources_dir = get_sources_dir(project_id)
    target_file = sources_dir / category / filename

    if not target_file.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    target_file.unlink()

    # Update metadata
    meta = load_sources_meta(project_id)

    if category == "databases":
        meta.databases = [s for s in meta.databases if s.filename != filename]
    else:
        meta.other = [s for s in meta.other if s.filename != filename]

    # Update totals
    meta.totals["databases"] = sum(s.count for s in meta.databases)
    meta.totals["other"] = sum(s.count for s in meta.other)
    meta.totals["combined"] = meta.totals["databases"] + meta.totals["other"]

    save_sources_meta(project_id, meta)

    return {"status": "deleted", "filename": filename}


@router.get("/{category}/{filename}/entries")
def get_source_entries(project_id: str, category: str, filename: str) -> dict:
    """Get entries from a source file."""
    import bibtexparser

    if category not in ("databases", "other"):
        raise HTTPException(status_code=400, detail="Category must be 'databases' or 'other'")

    sources_dir = get_sources_dir(project_id)
    target_file = sources_dir / category / filename

    if not target_file.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    with open(target_file, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)

    return {"entries": bib_db.entries, "count": len(bib_db.entries)}


class SourceFileStat(BaseModel):
    """File stat information."""
    filename: str
    category: str
    modified_at: str
    created_at: str | None = None


@router.get("/{category}/{filename}/stat")
def get_source_stat(project_id: str, category: str, filename: str) -> SourceFileStat:
    """Get file stat metadata (modified/created timestamps)."""
    if category not in ("databases", "other"):
        raise HTTPException(status_code=400, detail="Category must be 'databases' or 'other'")

    sources_dir = get_sources_dir(project_id)
    target_file = sources_dir / category / filename

    if not target_file.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    stat = target_file.stat()
    modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat()
    created_at = None
    if hasattr(stat, "st_birthtime"):
        created_at = datetime.fromtimestamp(stat.st_birthtime).isoformat()

    return SourceFileStat(
        filename=filename,
        category=category,
        modified_at=modified_at,
        created_at=created_at,
    )
