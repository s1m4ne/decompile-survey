"""
Imports API - Manage import collections (母集団).
"""

import asyncio
import json
import shutil
from datetime import datetime
from pathlib import Path

import bibtexparser
from bibtexparser.bibdatabase import BibDatabase
from bibtexparser.bwriter import BibTexWriter
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from models.import_collection import (
    ImportCollection,
    ImportCreate,
    ImportDetail,
    ImportFile,
    ImportFileUpdate,
    ImportSummary,
    ImportUpdate,
)
from query_search import (
    QuerySyntaxError,
    clean_bib_text,
    evaluate as evaluate_query_node,
    normalize_query,
    parse_query,
)

router = APIRouter(prefix="/imports", tags=["imports"])

SCREENING_DIR = Path(__file__).parent.parent.parent.parent / "screening"
IMPORTS_DIR = SCREENING_DIR / "imports"
PROJECTS_DIR = SCREENING_DIR / "projects"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def generate_import_id() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def get_import_dir(import_id: str) -> Path:
    return IMPORTS_DIR / import_id


def count_bib_entries(file_path: Path) -> int:
    with open(file_path, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)
    return len(bib_db.entries)

def parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    items = [t.strip() for t in raw.split(",")]
    seen: set[str] = set()
    tags: list[str] = []
    for item in items:
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        tags.append(item)
    return tags


def entries_to_bibtex(entries: list[dict]) -> str:
    """Serialize BibTeX entries preserving fields."""
    if not entries:
        return ""

    sanitized_entries = [{k: v for k, v in entry.items() if not k.startswith("_")} for entry in entries]

    db = BibDatabase()
    db.entries = sanitized_entries
    writer = BibTexWriter()
    writer.indent = "  "
    writer.order_entries_by = None
    return writer.write(db)


def load_import_meta(import_id: str) -> ImportCollection:
    meta_file = get_import_dir(import_id) / "meta.json"
    if not meta_file.exists():
        raise HTTPException(status_code=404, detail=f"Import not found: {import_id}")
    with open(meta_file, encoding="utf-8") as f:
        data = json.load(f)
    return ImportCollection(**data)


def save_import_meta(import_id: str, meta: ImportCollection) -> None:
    meta_file = get_import_dir(import_id) / "meta.json"
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta.model_dump(mode="json"), f, indent=2, ensure_ascii=False)


def get_referencing_projects(import_id: str) -> list[dict]:
    """Scan all projects and return those referencing this import."""
    refs: list[dict] = []
    if not PROJECTS_DIR.exists():
        return refs
    for project_dir in PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        project_file = project_dir / "project.json"
        if not project_file.exists():
            continue
        with open(project_file, encoding="utf-8") as f:
            data = json.load(f)
        if import_id in data.get("source_ids", []):
            refs.append({"id": data["id"], "name": data.get("name", "")})
    return refs


def check_not_locked(import_id: str) -> None:
    refs = get_referencing_projects(import_id)
    if refs:
        names = ", ".join(r["name"] for r in refs)
        raise HTTPException(
            status_code=409,
            detail=f"Import is locked (referenced by: {names})",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_imports() -> list[ImportSummary]:
    """List all imports."""
    if not IMPORTS_DIR.exists():
        return []

    imports: list[ImportSummary] = []
    for import_dir in sorted(IMPORTS_DIR.iterdir(), reverse=True):
        if not import_dir.is_dir() or import_dir.name.startswith("."):
            continue
        meta_file = import_dir / "meta.json"
        if not meta_file.exists():
            continue
        with open(meta_file, encoding="utf-8") as f:
            data = json.load(f)
        meta = ImportCollection(**data)
        refs = get_referencing_projects(meta.id)
        imports.append(ImportSummary(
            id=meta.id,
            name=meta.name,
            description=meta.description,
            file_count=len(meta.files),
            total_entry_count=sum(f.count for f in meta.files),
            databases=list({f.database for f in meta.files}),
            created_at=meta.created_at,
            updated_at=meta.updated_at,
            is_locked=len(refs) > 0,
            referencing_project_count=len(refs),
        ))

    return imports


@router.post("")
def create_import(request: ImportCreate) -> ImportCollection:
    """Create a new import."""
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)

    import_id = generate_import_id()
    import_dir = get_import_dir(import_id)
    import_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    meta = ImportCollection(
        id=import_id,
        name=request.name,
        description=request.description,
        files=[],
        created_at=now,
        updated_at=now,
    )
    save_import_meta(import_id, meta)
    return meta


@router.get("/{import_id}")
def get_import(import_id: str) -> ImportDetail:
    """Get import detail."""
    meta = load_import_meta(import_id)
    refs = get_referencing_projects(import_id)
    return ImportDetail(
        **meta.model_dump(),
        is_locked=len(refs) > 0,
        referencing_projects=refs,
    )


@router.put("/{import_id}")
def update_import(import_id: str, request: ImportUpdate) -> ImportCollection:
    """Update import metadata. Fails if locked."""
    check_not_locked(import_id)
    meta = load_import_meta(import_id)

    if request.name is not None:
        meta.name = request.name
    if request.description is not None:
        meta.description = request.description
    meta.updated_at = datetime.now()

    save_import_meta(import_id, meta)
    return meta


@router.delete("/{import_id}")
def delete_import(import_id: str) -> dict:
    """Delete an import. Fails if referenced by any project."""
    check_not_locked(import_id)
    import_dir = get_import_dir(import_id)
    if not import_dir.exists():
        raise HTTPException(status_code=404, detail=f"Import not found: {import_id}")
    shutil.rmtree(import_dir)
    return {"status": "deleted", "id": import_id}


@router.post("/{import_id}/duplicate")
def duplicate_import(import_id: str) -> ImportCollection:
    """Duplicate an import (deep copy)."""
    source_dir = get_import_dir(import_id)
    if not source_dir.exists():
        raise HTTPException(status_code=404, detail=f"Import not found: {import_id}")

    new_id = generate_import_id()
    new_dir = get_import_dir(new_id)
    shutil.copytree(source_dir, new_dir)

    # Update meta with new ID and timestamps
    meta = load_import_meta(new_id)
    meta.id = new_id
    now = datetime.now()
    meta.created_at = now
    meta.updated_at = now
    meta.name = f"{meta.name} (copy)"
    save_import_meta(new_id, meta)

    return meta


# ---------------------------------------------------------------------------
# File management
# ---------------------------------------------------------------------------

class PickFileResponse(BaseModel):
    paths: list[str] | None
    filenames: list[str] | None
    cancelled: bool
    modified_at: list[str] | None = None
    created_at: list[str | None] | None = None
    entry_counts: list[int] | None = None


class QueryPreset(BaseModel):
    filename: str
    database: str
    search_query: str
    search_date: str
    url: str | None = None
    tags: list[str] = []
    count: int = 0


class ImportQuerySearchRequest(BaseModel):
    query: str
    selected_files: list[str] | None = None
    max_results: int | None = None
    exclude_without_abstract: bool = True
    normalize_external_syntax: bool = True


class ImportQuerySearchStats(BaseModel):
    selected_file_count: int
    total_entries: int
    entries_with_abstract: int
    excluded_without_abstract: int
    matched_entries: int
    returned_entries: int


class ImportQuerySearchResponse(BaseModel):
    query: str
    normalized_query: str
    stats: ImportQuerySearchStats
    entries: list[dict]
    bibtex: str


def run_import_query_search(
    import_id: str,
    request: ImportQuerySearchRequest,
) -> tuple[str, ImportQuerySearchStats, list[dict], str]:
    meta = load_import_meta(import_id)
    available_files = {f.filename: f for f in meta.files}
    selected_files = request.selected_files or list(available_files.keys())

    if not selected_files:
        raise HTTPException(status_code=400, detail="No files selected.")

    missing_files = [name for name in selected_files if name not in available_files]
    if missing_files:
        raise HTTPException(
            status_code=404,
            detail=f"Selected files not found in import: {', '.join(missing_files)}",
        )

    raw_query = request.query.strip()
    if not raw_query:
        raise HTTPException(status_code=400, detail="Query is required.")

    normalized_query = normalize_query(raw_query) if request.normalize_external_syntax else raw_query
    if not normalized_query:
        raise HTTPException(status_code=400, detail="Normalized query is empty.")

    try:
        query_ast = parse_query(normalized_query)
    except QuerySyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"Query parse error: {exc}") from exc

    import_dir = get_import_dir(import_id)
    matched_entries: list[dict] = []
    stats = ImportQuerySearchStats(
        selected_file_count=len(selected_files),
        total_entries=0,
        entries_with_abstract=0,
        excluded_without_abstract=0,
        matched_entries=0,
        returned_entries=0,
    )
    matched_total = 0

    max_results = request.max_results if request.max_results and request.max_results > 0 else None

    for filename in selected_files:
        source_file = available_files[filename]
        file_path = import_dir / filename
        if not file_path.exists():
            continue

        with open(file_path, encoding="utf-8") as handle:
            bib_db = bibtexparser.load(handle)

        for entry in bib_db.entries:
            stats.total_entries += 1

            title = clean_bib_text(str(entry.get("title", "")))
            abstract = clean_bib_text(str(entry.get("abstract", "")))

            if abstract:
                stats.entries_with_abstract += 1
            elif request.exclude_without_abstract:
                stats.excluded_without_abstract += 1
                continue

            if evaluate_query_node(query_ast, title=title, abstract=abstract):
                matched_total += 1
                if max_results is None or len(matched_entries) < max_results:
                    enriched = dict(entry)
                    enriched["_source_file"] = filename
                    enriched["_database"] = source_file.database
                    matched_entries.append(enriched)

    stats.matched_entries = matched_total
    stats.returned_entries = len(matched_entries)
    bibtex = entries_to_bibtex(matched_entries)
    return normalized_query, stats, matched_entries, bibtex


@router.get("/{import_id}/query-presets")
def get_query_presets(import_id: str) -> dict:
    """List query presets from import metadata files."""
    meta = load_import_meta(import_id)
    presets: list[QueryPreset] = []
    for file in meta.files:
        if file.search_query and file.search_query.strip():
            presets.append(
                QueryPreset(
                    filename=file.filename,
                    database=file.database,
                    search_query=file.search_query,
                    search_date=file.search_date,
                    url=file.url,
                    tags=file.tags,
                    count=file.count,
                )
            )
    return {"presets": presets}


@router.post("/{import_id}/query-search")
def query_search(import_id: str, request: ImportQuerySearchRequest) -> ImportQuerySearchResponse:
    """Run local boolean search over title/abstract for selected BibTeX files."""
    normalized_query, stats, entries, bibtex = run_import_query_search(import_id, request)
    return ImportQuerySearchResponse(
        query=request.query,
        normalized_query=normalized_query,
        stats=stats,
        entries=entries,
        bibtex=bibtex,
    )


@router.post("/{import_id}/files/pick")
async def pick_file(import_id: str) -> PickFileResponse:
    """Open macOS Finder to pick BibTeX files."""
    # Verify import exists
    load_import_meta(import_id)

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
        file_paths = [Path(p) for p in paths]

        modified_at: list[str] = []
        created_at: list[str | None] = []
        for path in file_paths:
            stat = path.stat()
            modified_at.append(datetime.fromtimestamp(stat.st_mtime).isoformat())
            if hasattr(stat, "st_birthtime"):
                created_at.append(datetime.fromtimestamp(stat.st_birthtime).isoformat())
            else:
                created_at.append(None)
        entry_counts: list[int] = []
        for fp in file_paths:
            try:
                entry_counts.append(count_bib_entries(fp))
            except Exception:
                entry_counts.append(0)

        return PickFileResponse(
            paths=paths,
            filenames=[Path(p).name for p in paths],
            cancelled=False,
            modified_at=modified_at,
            created_at=created_at,
            entry_counts=entry_counts,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AddFromPathRequest(BaseModel):
    path: str
    database: str
    search_query: str
    search_date: str
    url: str | None = None
    tags: str | None = None


@router.post("/{import_id}/files/add-from-path")
def add_from_path(import_id: str, request: AddFromPathRequest) -> ImportFile:
    """Add a BibTeX file from a local path."""
    check_not_locked(import_id)

    source_path = Path(request.path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {request.path}")
    if not source_path.name.endswith(".bib"):
        raise HTTPException(status_code=400, detail="File must be a .bib file")

    import_dir = get_import_dir(import_id)
    target_file = import_dir / source_path.name
    shutil.copy2(source_path, target_file)

    entry_count = count_bib_entries(target_file)

    meta = load_import_meta(import_id)
    import_file = ImportFile(
        filename=source_path.name,
        database=request.database,
        search_query=request.search_query,
        search_date=request.search_date,
        url=request.url,
        tags=parse_tags(request.tags),
        count=entry_count,
    )

    # Replace existing entry with same filename
    meta.files = [f for f in meta.files if f.filename != source_path.name]
    meta.files.append(import_file)
    meta.updated_at = datetime.now()
    save_import_meta(import_id, meta)

    return import_file


@router.post("/{import_id}/files/upload")
async def upload_file(
    import_id: str,
    file: UploadFile = File(...),
    database: str = Form(...),
    search_query: str = Form(...),
    search_date: str = Form(...),
    url: str | None = Form(None),
    tags: str | None = Form(None),
) -> ImportFile:
    """Upload a BibTeX file."""
    check_not_locked(import_id)

    if not file.filename or not file.filename.endswith(".bib"):
        raise HTTPException(status_code=400, detail="File must be a .bib file")

    import_dir = get_import_dir(import_id)
    target_file = import_dir / file.filename

    content = await file.read()
    with open(target_file, "wb") as f:
        f.write(content)

    entry_count = count_bib_entries(target_file)

    meta = load_import_meta(import_id)
    import_file = ImportFile(
        filename=file.filename,
        database=database,
        search_query=search_query,
        search_date=search_date,
        url=url,
        tags=parse_tags(tags),
        count=entry_count,
    )

    meta.files = [f for f in meta.files if f.filename != file.filename]
    meta.files.append(import_file)
    meta.updated_at = datetime.now()
    save_import_meta(import_id, meta)

    return import_file


@router.delete("/{import_id}/files/{filename}")
def delete_file(import_id: str, filename: str) -> dict:
    """Delete a file from an import."""
    check_not_locked(import_id)

    import_dir = get_import_dir(import_id)
    target_file = import_dir / filename

    if not target_file.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    target_file.unlink()

    meta = load_import_meta(import_id)
    meta.files = [f for f in meta.files if f.filename != filename]
    meta.updated_at = datetime.now()
    save_import_meta(import_id, meta)

    return {"status": "deleted", "filename": filename}


@router.put("/{import_id}/files/{filename}")
def update_file(import_id: str, filename: str, request: ImportFileUpdate) -> ImportFile:
    """Update metadata for a file in an import. Fails if locked."""
    check_not_locked(import_id)

    meta = load_import_meta(import_id)

    target: ImportFile | None = None
    for f in meta.files:
        if f.filename == filename:
            target = f
            break

    if target is None:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    if request.database is not None:
        target.database = request.database
    if request.search_query is not None:
        target.search_query = request.search_query
    if request.search_date is not None:
        target.search_date = request.search_date
    if request.url is not None:
        target.url = request.url.strip() if request.url.strip() else None
    if request.tags is not None:
        target.tags = parse_tags(request.tags)

    meta.updated_at = datetime.now()
    save_import_meta(import_id, meta)

    return target


@router.get("/{import_id}/files/{filename}/entries")
def get_file_entries(import_id: str, filename: str) -> dict:
    """Get entries from a BibTeX file for preview."""
    import_dir = get_import_dir(import_id)
    target_file = import_dir / filename

    if not target_file.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    with open(target_file, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)

    return {"entries": bib_db.entries, "count": len(bib_db.entries)}
