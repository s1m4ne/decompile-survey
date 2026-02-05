"""
Projects API - Project CRUD operations.
"""

import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.project import Project, ProjectCreate, ProjectUpdate, ProjectDuplicate

router = APIRouter(prefix="/projects", tags=["projects"])

# Path to projects directory
PROJECTS_DIR = Path(__file__).parent.parent.parent.parent / "screening" / "projects"


def generate_project_id() -> str:
    """Generate a unique project ID based on timestamp."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def get_project_dir(project_id: str) -> Path:
    """Get the directory for a project."""
    return PROJECTS_DIR / project_id


def load_project(project_id: str) -> Project:
    """Load a project from disk."""
    project_dir = get_project_dir(project_id)
    project_file = project_dir / "project.json"

    if not project_file.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    with open(project_file, encoding="utf-8") as f:
        data = json.load(f)

    return Project(**data)


def save_project(project: Project) -> None:
    """Save a project to disk."""
    project_dir = get_project_dir(project.id)
    project_dir.mkdir(parents=True, exist_ok=True)

    project_file = project_dir / "project.json"
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(project.model_dump(mode="json"), f, indent=2, ensure_ascii=False)


def project_has_steps(project_id: str) -> bool:
    """Check if a project has any steps."""
    steps_dir = get_project_dir(project_id) / "steps"
    if not steps_dir.exists():
        return False
    # Check if there are any step directories
    for item in steps_dir.iterdir():
        if item.is_dir() and (item / "meta.json").exists():
            return True
    return False


@router.get("")
def list_projects() -> list[Project]:
    """List all projects."""
    if not PROJECTS_DIR.exists():
        return []

    projects = []
    for project_dir in sorted(PROJECTS_DIR.iterdir(), reverse=True):
        if project_dir.is_dir() and (project_dir / "project.json").exists():
            try:
                project = load_project(project_dir.name)
                projects.append(project)
            except Exception:
                continue

    return projects


@router.post("")
def create_project(request: ProjectCreate) -> Project:
    """Create a new project."""
    project_id = generate_project_id()
    now = datetime.now()

    project = Project(
        id=project_id,
        name=request.name,
        description=request.description,
        created_at=now,
        updated_at=now,
        pipeline_summary={},
    )

    # Create project directory structure
    project_dir = get_project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "sources" / "databases").mkdir(parents=True, exist_ok=True)
    (project_dir / "sources" / "other").mkdir(parents=True, exist_ok=True)
    (project_dir / "steps").mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(parents=True, exist_ok=True)

    # Create default pipeline.json
    pipeline_file = project_dir / "pipeline.json"
    with open(pipeline_file, "w", encoding="utf-8") as f:
        json.dump({"version": "1.0", "steps": [], "final_output": None}, f, indent=2)

    # Create sources meta.json
    sources_meta = project_dir / "sources" / "meta.json"
    with open(sources_meta, "w", encoding="utf-8") as f:
        json.dump({"databases": [], "other": [], "totals": {"databases": 0, "other": 0, "combined": 0}}, f, indent=2)

    save_project(project)
    return project


@router.get("/{project_id}")
def get_project(project_id: str) -> Project:
    """Get a project by ID."""
    return load_project(project_id)


@router.put("/{project_id}")
def update_project(project_id: str, request: ProjectUpdate) -> Project:
    """Update a project."""
    project = load_project(project_id)

    if request.name is not None:
        project.name = request.name
    if request.description is not None:
        project.description = request.description

    project.updated_at = datetime.now()
    save_project(project)

    return project


@router.delete("/{project_id}")
def delete_project(project_id: str) -> dict:
    """Delete a project."""
    project_dir = get_project_dir(project_id)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    shutil.rmtree(project_dir)
    return {"status": "deleted", "project_id": project_id}


def generate_copy_name(original_name: str) -> str:
    """Generate a copy name with incrementing number suffix."""
    # Check existing project names
    existing_names: set[str] = set()
    if PROJECTS_DIR.exists():
        for project_dir in PROJECTS_DIR.iterdir():
            if project_dir.is_dir() and (project_dir / "project.json").exists():
                try:
                    with open(project_dir / "project.json", encoding="utf-8") as f:
                        data = json.load(f)
                    existing_names.add(data.get("name", ""))
                except Exception:
                    continue

    # Try incrementing numbers until we find an unused name
    # First check if the name already has a (N) suffix
    match = re.match(r"^(.+?)\s*\((\d+)\)$", original_name)
    if match:
        base_name = match.group(1).strip()
        start_num = int(match.group(2)) + 1
    else:
        base_name = original_name
        start_num = 1

    for i in range(start_num, 1000):
        candidate = f"{base_name} ({i})"
        if candidate not in existing_names:
            return candidate

    # Fallback (shouldn't happen)
    return f"{base_name} (copy)"


@router.post("/{project_id}/duplicate")
def duplicate_project(project_id: str, request: ProjectDuplicate) -> Project:
    """Duplicate a project with optional step filtering."""
    from models.pipeline import Pipeline

    source_dir = get_project_dir(project_id)
    if not source_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    # Load source project and pipeline
    source_project = load_project(project_id)
    pipeline_file = source_dir / "pipeline.json"
    with open(pipeline_file, encoding="utf-8") as f:
        pipeline_data = json.load(f)
    source_pipeline = Pipeline(**pipeline_data)

    # Determine which steps to include
    if request.include_steps_until:
        # Find the index of the target step
        step_ids = [s.id for s in source_pipeline.steps]
        if request.include_steps_until not in step_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Step not found: {request.include_steps_until}"
            )
        cutoff_index = step_ids.index(request.include_steps_until) + 1
        included_step_ids = set(step_ids[:cutoff_index])
    else:
        # Include all steps
        included_step_ids = {s.id for s in source_pipeline.steps}

    # Generate new project ID and name
    new_id = generate_project_id()
    new_name = request.name if request.name else generate_copy_name(source_project.name)
    now = datetime.now()

    # Create new project directory
    new_dir = get_project_dir(new_id)
    new_dir.mkdir(parents=True, exist_ok=True)

    # Copy sources directory (always copy all sources)
    source_sources_dir = source_dir / "sources"
    if source_sources_dir.exists():
        shutil.copytree(source_sources_dir, new_dir / "sources")

    # Copy exports directory
    source_exports_dir = source_dir / "exports"
    if source_exports_dir.exists():
        shutil.copytree(source_exports_dir, new_dir / "exports")

    # Create steps directory and copy only included steps
    new_steps_dir = new_dir / "steps"
    new_steps_dir.mkdir(parents=True, exist_ok=True)
    source_steps_dir = source_dir / "steps"
    if source_steps_dir.exists():
        for step_dir in source_steps_dir.iterdir():
            if step_dir.is_dir() and step_dir.name in included_step_ids:
                shutil.copytree(step_dir, new_steps_dir / step_dir.name)

    # Create filtered pipeline.json
    filtered_steps = [s for s in source_pipeline.steps if s.id in included_step_ids]
    new_pipeline = Pipeline(
        version=source_pipeline.version,
        steps=filtered_steps,
        final_output=source_pipeline.final_output if (
            source_pipeline.final_output and
            source_pipeline.final_output.step in included_step_ids
        ) else None,
    )
    with open(new_dir / "pipeline.json", "w", encoding="utf-8") as f:
        json.dump(new_pipeline.model_dump(mode="json"), f, indent=2, ensure_ascii=False)

    # Create new project
    new_project = Project(
        id=new_id,
        name=new_name,
        description=source_project.description,
        created_at=now,
        updated_at=now,
        pipeline_summary={},  # Will be recalculated
        source_ids=source_project.source_ids.copy(),
    )
    save_project(new_project)

    return new_project


# ---------------------------------------------------------------------------
# Import sources linkage
# ---------------------------------------------------------------------------

IMPORTS_DIR = PROJECTS_DIR.parent / "imports"


class AddImportSourceRequest(BaseModel):
    import_id: str


@router.get("/{project_id}/import-sources")
def get_import_sources(project_id: str) -> list[dict]:
    """Get resolved import sources for a project."""
    from models.import_collection import ImportCollection

    project = load_project(project_id)
    results: list[dict] = []

    for import_id in project.source_ids:
        import_dir = IMPORTS_DIR / import_id
        meta_file = import_dir / "meta.json"
        if not meta_file.exists():
            continue
        with open(meta_file, encoding="utf-8") as f:
            data = json.load(f)
        meta = ImportCollection(**data)
        results.append({
            "id": meta.id,
            "name": meta.name,
            "description": meta.description,
            "file_count": len(meta.files),
            "total_entry_count": sum(f.count for f in meta.files),
            "databases": list({f.database for f in meta.files}),
            "created_at": meta.created_at.isoformat(),
            "updated_at": meta.updated_at.isoformat(),
        })

    return results


@router.post("/{project_id}/import-sources")
def add_import_source(project_id: str, request: AddImportSourceRequest) -> dict:
    """Add an import reference to a project."""
    import_dir = IMPORTS_DIR / request.import_id
    if not import_dir.exists():
        raise HTTPException(status_code=404, detail=f"Import not found: {request.import_id}")

    project = load_project(project_id)
    if request.import_id not in project.source_ids:
        project.source_ids.append(request.import_id)
        project.updated_at = datetime.now()
        save_project(project)

    return {"source_ids": project.source_ids}


@router.delete("/{project_id}/import-sources/{import_id}")
def remove_import_source(project_id: str, import_id: str) -> dict:
    """Remove an import reference from a project. Fails if project has steps."""
    project = load_project(project_id)

    # Check if project has any steps - if so, block removal
    if project_has_steps(project_id):
        raise HTTPException(
            status_code=409,
            detail="Cannot remove import: project has steps. Delete steps first or delete the project.",
        )

    if import_id in project.source_ids:
        project.source_ids.remove(import_id)
        project.updated_at = datetime.now()
        save_project(project)

    return {"status": "removed", "source_ids": project.source_ids}
