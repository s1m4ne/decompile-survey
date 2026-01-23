"""
Step Types API - List available step types.
"""

from fastapi import APIRouter, HTTPException

from step_handlers import list_step_types, STEP_TYPES
from step_handlers.base import StepTypeInfo

router = APIRouter(prefix="/step-types", tags=["step-types"])


@router.get("")
def get_step_types() -> list[StepTypeInfo]:
    """List all available step types."""
    return list_step_types()


@router.get("/{step_type}")
def get_step_type(step_type: str) -> StepTypeInfo:
    """Get information about a specific step type."""
    if step_type not in STEP_TYPES:
        raise HTTPException(status_code=404, detail=f"Step type not found: {step_type}")

    return STEP_TYPES[step_type]
