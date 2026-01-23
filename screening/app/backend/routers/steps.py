"""
Steps API - Step execution and status.
"""

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
import bibtexparser
from bibtexparser.bwriter import BibTexWriter
from bibtexparser.bibdatabase import BibDatabase

from models.step import StepMeta, StepStatus, StepExecution, StepInput, StepOutput, StepStats

router = APIRouter(prefix="/projects/{project_id}/steps", tags=["steps"])

PROJECTS_DIR = Path(__file__).parent.parent.parent.parent / "projects"


def get_step_dir(project_id: str, step_id: str) -> Path:
    """Get the step directory."""
    return PROJECTS_DIR / project_id / "steps" / step_id


def load_step_meta(project_id: str, step_id: str) -> StepMeta | None:
    """Load step metadata from disk."""
    step_dir = get_step_dir(project_id, step_id)
    meta_file = step_dir / "meta.json"

    if not meta_file.exists():
        return None

    with open(meta_file, encoding="utf-8") as f:
        data = json.load(f)

    return StepMeta(**data)


def save_step_meta(project_id: str, step_id: str, meta: StepMeta) -> None:
    """Save step metadata to disk."""
    step_dir = get_step_dir(project_id, step_id)
    step_dir.mkdir(parents=True, exist_ok=True)

    meta_file = step_dir / "meta.json"
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta.model_dump(mode="json", by_alias=True), f, indent=2, ensure_ascii=False)


@router.get("")
def list_steps(project_id: str) -> list[StepMeta]:
    """List all steps with their status."""
    from .pipeline import load_pipeline

    pipeline = load_pipeline(project_id)
    steps = []

    for step in pipeline.steps:
        meta = load_step_meta(project_id, step.id)
        if meta is None:
            # Create default meta for steps that haven't run
            meta = StepMeta(
                step_id=step.id,
                step_type=step.type,
                name=step.name,
                execution=StepExecution(status=StepStatus.PENDING),
            )
        steps.append(meta)

    return steps


def is_latest_step(pipeline, step_id: str) -> bool:
    """Check if a step is the latest (last) step in the pipeline."""
    if not pipeline.steps:
        return False
    return pipeline.steps[-1].id == step_id


@router.get("/{step_id}")
def get_step(project_id: str, step_id: str) -> dict:
    """Get step metadata with is_latest flag."""
    from .pipeline import load_pipeline

    pipeline = load_pipeline(project_id)
    step_def = None
    for s in pipeline.steps:
        if s.id == step_id:
            step_def = s
            break

    if step_def is None:
        raise HTTPException(status_code=404, detail=f"Step not found: {step_id}")

    meta = load_step_meta(project_id, step_id)
    if meta is None:
        meta = StepMeta(
            step_id=step_id,
            step_type=step_def.type,
            name=step_def.name,
            execution=StepExecution(status=StepStatus.PENDING),
        )

    # Return meta with is_latest flag
    result = meta.model_dump(mode="json", by_alias=True)
    result["is_latest"] = is_latest_step(pipeline, step_id)
    return result


def load_input_entries(project_id: str, input_from: str | dict) -> tuple[list[dict], StepInput]:
    """
    Load input entries from sources or a previous step.

    Returns:
        Tuple of (entries list, StepInput metadata)
    """
    if input_from == "sources":
        # Load from all source files
        sources_dir = PROJECTS_DIR / project_id / "sources"
        entries = []

        for category in ["databases", "other"]:
            category_dir = sources_dir / category
            if not category_dir.exists():
                continue

            for bib_file in category_dir.glob("*.bib"):
                with open(bib_file, encoding="utf-8") as f:
                    bib_db = bibtexparser.load(f)
                    # Add source info to entries
                    for entry in bib_db.entries:
                        entry["_source_file"] = bib_file.name
                        entry["_source_category"] = category
                    entries.extend(bib_db.entries)

        return entries, StepInput(
            from_source="sources",
            output="combined",
            file="sources",
            count=len(entries),
        )
    elif isinstance(input_from, dict):
        # Load from specific step output
        step_id = input_from.get("step")
        output_name = input_from.get("output", "passed")

        output_file = (
            PROJECTS_DIR / project_id / "steps" / step_id / "outputs" / f"{output_name}.bib"
        )

        if not output_file.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Input not available: step '{step_id}' output '{output_name}' not found",
            )

        with open(output_file, encoding="utf-8") as f:
            bib_db = bibtexparser.load(f)

        return bib_db.entries, StepInput(
            from_source=step_id,
            output=output_name,
            file=str(output_file.relative_to(PROJECTS_DIR / project_id)),
            count=len(bib_db.entries),
        )
    else:
        # input_from is a step ID string (shorthand for step's passed output)
        output_file = (
            PROJECTS_DIR / project_id / "steps" / input_from / "outputs" / "passed.bib"
        )

        if not output_file.exists():
            # Maybe it's "sources"
            if input_from == "sources":
                return load_input_entries(project_id, "sources")
            raise HTTPException(
                status_code=400,
                detail=f"Input not available: step '{input_from}' output 'passed' not found",
            )

        with open(output_file, encoding="utf-8") as f:
            bib_db = bibtexparser.load(f)

        return bib_db.entries, StepInput(
            from_source=input_from,
            output="passed",
            file=str(output_file.relative_to(PROJECTS_DIR / project_id)),
            count=len(bib_db.entries),
        )


def save_output_entries(project_id: str, step_id: str, output_name: str, entries: list[dict]) -> Path:
    """Save entries to a BibTeX file."""
    output_dir = PROJECTS_DIR / project_id / "steps" / step_id / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / f"{output_name}.bib"

    # Create BibTeX database
    db = BibDatabase()
    # Clean entries (remove internal fields)
    clean_entries = []
    for entry in entries:
        clean_entry = {k: v for k, v in entry.items() if not k.startswith("_")}
        clean_entries.append(clean_entry)
    db.entries = clean_entries

    # Write to file
    writer = BibTexWriter()
    writer.indent = "  "
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(writer.write(db))

    return output_file


def save_changes(project_id: str, step_id: str, changes: list) -> None:
    """Save changes to JSONL file."""
    step_dir = PROJECTS_DIR / project_id / "steps" / step_id
    step_dir.mkdir(parents=True, exist_ok=True)

    changes_file = step_dir / "changes.jsonl"
    with open(changes_file, "w", encoding="utf-8") as f:
        for change in changes:
            f.write(json.dumps(asdict(change), ensure_ascii=False) + "\n")


@router.post("/{step_id}/run")
def run_step(project_id: str, step_id: str) -> StepMeta:
    """Run a step."""
    from step_handlers import get_handler
    from .pipeline import load_pipeline

    pipeline = load_pipeline(project_id)
    step_def = None
    for s in pipeline.steps:
        if s.id == step_id:
            step_def = s
            break

    if step_def is None:
        raise HTTPException(status_code=404, detail=f"Step not found: {step_id}")

    handler_class = get_handler(step_def.type)
    if handler_class is None:
        raise HTTPException(status_code=400, detail=f"Unknown step type: {step_def.type}")

    # Mark as running
    started_at = datetime.now()

    try:
        # Load input entries
        input_entries, input_meta = load_input_entries(project_id, step_def.input_from)

        # Create handler and run
        handler = handler_class()
        result = handler.run(input_entries, step_def.config)

        # Save outputs
        outputs = {}
        for output_name, entries in result.outputs.items():
            output_file = save_output_entries(project_id, step_id, output_name, entries)
            outputs[output_name] = StepOutput(
                file=str(output_file.relative_to(PROJECTS_DIR / project_id)),
                count=len(entries),
                description=next(
                    (od.description for od in handler_class.output_definitions if od.name == output_name),
                    "",
                ),
            )

        # Save changes
        save_changes(project_id, step_id, result.changes)

        completed_at = datetime.now()
        duration = (completed_at - started_at).total_seconds()

        # Calculate stats
        passed_entries = result.outputs.get("passed", [])
        passed_count = len(passed_entries) if isinstance(passed_entries, list) else 0
        total_output = sum(len(entries) for entries in result.outputs.values())

        meta = StepMeta(
            step_id=step_id,
            step_type=step_def.type,
            name=step_def.name,
            input=input_meta,
            outputs=outputs,
            stats=StepStats(
                input_count=input_meta.count,
                total_output_count=total_output,
                passed_count=passed_count,
                removed_count=input_meta.count - passed_count,
            ),
            execution=StepExecution(
                status=StepStatus.COMPLETED,
                started_at=started_at,
                completed_at=completed_at,
                duration_sec=duration,
            ),
        )
        save_step_meta(project_id, step_id, meta)

        return meta

    except HTTPException:
        raise
    except Exception as e:
        # Mark as failed
        completed_at = datetime.now()
        duration = (completed_at - started_at).total_seconds()

        meta = StepMeta(
            step_id=step_id,
            step_type=step_def.type,
            name=step_def.name,
            execution=StepExecution(
                status=StepStatus.FAILED,
                started_at=started_at,
                completed_at=completed_at,
                duration_sec=duration,
                error=str(e),
            ),
        )
        save_step_meta(project_id, step_id, meta)

        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{step_id}/reset")
def reset_step(project_id: str, step_id: str) -> dict:
    """Reset a step (clear outputs and status). Only allowed for the latest step."""
    import shutil
    from .pipeline import load_pipeline

    pipeline = load_pipeline(project_id)
    step_def = None
    for s in pipeline.steps:
        if s.id == step_id:
            step_def = s
            break

    if step_def is None:
        raise HTTPException(status_code=404, detail=f"Step not found: {step_id}")

    # Check if this is the latest step
    if not is_latest_step(pipeline, step_id):
        raise HTTPException(
            status_code=400,
            detail="Only the latest step can be reset. Intermediate steps cannot be reset because subsequent steps depend on them."
        )

    step_dir = get_step_dir(project_id, step_id)

    # Remove outputs
    outputs_dir = step_dir / "outputs"
    if outputs_dir.exists():
        shutil.rmtree(outputs_dir)
        outputs_dir.mkdir()

    # Remove changes.jsonl
    changes_file = step_dir / "changes.jsonl"
    if changes_file.exists():
        changes_file.unlink()

    # Remove meta.json to fully reset
    meta_file = step_dir / "meta.json"
    if meta_file.exists():
        meta_file.unlink()

    # Return fresh pending meta (without saving - will be generated on demand)
    meta = StepMeta(
        step_id=step_id,
        step_type=step_def.type,
        name=step_def.name,
        execution=StepExecution(status=StepStatus.PENDING),
    )

    result = meta.model_dump(mode="json", by_alias=True)
    result["is_latest"] = True
    return result


@router.delete("/{step_id}")
def delete_step(project_id: str, step_id: str) -> dict:
    """Delete a step completely. Only allowed for the latest step."""
    import shutil
    from .pipeline import load_pipeline, save_pipeline

    pipeline = load_pipeline(project_id)
    step_def = None
    step_index = -1
    for i, s in enumerate(pipeline.steps):
        if s.id == step_id:
            step_def = s
            step_index = i
            break

    if step_def is None:
        raise HTTPException(status_code=404, detail=f"Step not found: {step_id}")

    # Check if this is the latest step
    if not is_latest_step(pipeline, step_id):
        raise HTTPException(
            status_code=400,
            detail="Only the latest step can be deleted. Intermediate steps cannot be deleted because subsequent steps depend on them."
        )

    # Remove step directory
    step_dir = get_step_dir(project_id, step_id)
    if step_dir.exists():
        shutil.rmtree(step_dir)

    # Remove from pipeline
    pipeline.steps.pop(step_index)
    save_pipeline(project_id, pipeline)

    return {"success": True, "deleted_step_id": step_id}


@router.get("/{step_id}/outputs/{output_name}")
def get_step_output(project_id: str, step_id: str, output_name: str) -> dict:
    """Get a step output (BibTeX entries as JSON)."""
    import bibtexparser

    step_dir = get_step_dir(project_id, step_id)
    output_file = step_dir / "outputs" / f"{output_name}.bib"

    if not output_file.exists():
        raise HTTPException(status_code=404, detail=f"Output not found: {output_name}")

    with open(output_file, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)

    return {"entries": bib_db.entries, "count": len(bib_db.entries)}


@router.get("/{step_id}/changes")
def get_step_changes(project_id: str, step_id: str) -> list[dict]:
    """Get step changes (from changes.jsonl)."""
    step_dir = get_step_dir(project_id, step_id)
    changes_file = step_dir / "changes.jsonl"

    if not changes_file.exists():
        return []

    changes = []
    with open(changes_file, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                changes.append(json.loads(line))

    return changes
