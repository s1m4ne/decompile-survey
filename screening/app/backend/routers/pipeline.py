"""
Pipeline API - Pipeline definition and management.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

from models.pipeline import Pipeline, PipelineStep

router = APIRouter(prefix="/projects/{project_id}/pipeline", tags=["pipeline"])

PROJECTS_DIR = Path(__file__).parent.parent.parent.parent / "projects"


def get_pipeline_file(project_id: str) -> Path:
    """Get the pipeline.json file path."""
    return PROJECTS_DIR / project_id / "pipeline.json"


def load_pipeline(project_id: str) -> Pipeline:
    """Load pipeline from disk."""
    pipeline_file = get_pipeline_file(project_id)

    if not pipeline_file.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    with open(pipeline_file, encoding="utf-8") as f:
        data = json.load(f)

    return Pipeline(**data)


def save_pipeline(project_id: str, pipeline: Pipeline) -> None:
    """Save pipeline to disk."""
    pipeline_file = get_pipeline_file(project_id)
    with open(pipeline_file, "w", encoding="utf-8") as f:
        json.dump(pipeline.model_dump(mode="json"), f, indent=2, ensure_ascii=False)


@router.get("")
def get_pipeline(project_id: str) -> Pipeline:
    """Get the pipeline definition."""
    return load_pipeline(project_id)


@router.put("")
def update_pipeline(project_id: str, pipeline: Pipeline) -> Pipeline:
    """Update the pipeline definition."""
    # Verify project exists
    if not (PROJECTS_DIR / project_id / "project.json").exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    save_pipeline(project_id, pipeline)
    return pipeline


@router.post("/steps")
def add_step(project_id: str, step: PipelineStep) -> Pipeline:
    """Add a step to the pipeline."""
    pipeline = load_pipeline(project_id)

    # Check for duplicate ID
    if any(s.id == step.id for s in pipeline.steps):
        raise HTTPException(status_code=400, detail=f"Step ID already exists: {step.id}")

    pipeline.steps.append(step)
    save_pipeline(project_id, pipeline)

    # Create step directory
    step_dir = PROJECTS_DIR / project_id / "steps" / step.id
    step_dir.mkdir(parents=True, exist_ok=True)
    (step_dir / "outputs").mkdir(exist_ok=True)

    return pipeline


@router.put("/steps/{step_id}")
def update_step(project_id: str, step_id: str, step: PipelineStep) -> Pipeline:
    """Update a step in the pipeline."""
    pipeline = load_pipeline(project_id)

    for i, s in enumerate(pipeline.steps):
        if s.id == step_id:
            pipeline.steps[i] = step
            save_pipeline(project_id, pipeline)
            return pipeline

    raise HTTPException(status_code=404, detail=f"Step not found: {step_id}")


@router.delete("/steps/{step_id}")
def remove_step(project_id: str, step_id: str) -> Pipeline:
    """Remove a step from the pipeline."""
    import shutil

    pipeline = load_pipeline(project_id)
    pipeline.steps = [s for s in pipeline.steps if s.id != step_id]
    save_pipeline(project_id, pipeline)

    # Remove step directory
    step_dir = PROJECTS_DIR / project_id / "steps" / step_id
    if step_dir.exists():
        shutil.rmtree(step_dir)

    return pipeline


@router.post("/steps/{step_id}/move")
def move_step(project_id: str, step_id: str, new_index: int) -> Pipeline:
    """Move a step to a new position."""
    pipeline = load_pipeline(project_id)

    # Find and remove the step
    step = None
    for i, s in enumerate(pipeline.steps):
        if s.id == step_id:
            step = pipeline.steps.pop(i)
            break

    if step is None:
        raise HTTPException(status_code=404, detail=f"Step not found: {step_id}")

    # Insert at new position
    new_index = max(0, min(new_index, len(pipeline.steps)))
    pipeline.steps.insert(new_index, step)

    save_pipeline(project_id, pipeline)
    return pipeline
