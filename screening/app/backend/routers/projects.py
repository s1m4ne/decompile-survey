"""
Projects API - Project CRUD operations.
"""

import json
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.project import Project, ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])

# Path to projects directory
PROJECTS_DIR = Path(__file__).parent.parent.parent.parent / "projects"


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
    import shutil

    project_dir = get_project_dir(project_id)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    shutil.rmtree(project_dir)
    return {"status": "deleted", "project_id": project_id}
