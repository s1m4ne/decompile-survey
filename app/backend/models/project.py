from datetime import datetime
from pydantic import BaseModel, Field


class ProjectSummary(BaseModel):
    """Pipeline summary with counts for each step."""
    pass  # Dynamic structure based on steps


class ProjectCreate(BaseModel):
    """Request model for creating a project."""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")


class ProjectUpdate(BaseModel):
    """Request model for updating a project."""
    name: str | None = None
    description: str | None = None


class ProjectDuplicate(BaseModel):
    """Request model for duplicating a project."""
    name: str | None = None  # If not provided, auto-generate with (N) suffix
    include_steps_until: str | None = None  # Step ID to copy up to (None = all steps)


class Project(BaseModel):
    """Project model."""
    id: str
    name: str
    description: str = ""
    created_at: datetime
    updated_at: datetime
    pipeline_summary: dict[str, dict] = Field(default_factory=dict)
    source_ids: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True
