from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class StepStatus(str, Enum):
    """Step execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StepInput(BaseModel):
    """Step input definition."""
    from_source: str = Field(..., alias="from", serialization_alias="from")
    output: str = "passed"
    file: str
    count: int

    class Config:
        populate_by_name = True


class StepOutput(BaseModel):
    """Step output definition."""
    file: str
    count: int
    description: str = ""


class StepProgress(BaseModel):
    """Step execution progress."""
    completed: int = 0
    total: int = 0
    percent: float = 0.0
    message: str | None = None
    updated_at: datetime | None = None


class StepExecution(BaseModel):
    """Step execution information."""
    status: StepStatus = StepStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_sec: float | None = None
    error: str | None = None
    progress: StepProgress | None = None


class StepStats(BaseModel):
    """Step statistics."""
    input_count: int = 0
    total_output_count: int = 0
    passed_count: int = 0
    removed_count: int = 0


class StepMeta(BaseModel):
    """Step metadata (meta.json)."""
    step_id: str
    step_type: str
    name: str
    input: StepInput | None = None
    outputs: dict[str, StepOutput] = Field(default_factory=dict)
    stats: StepStats = Field(default_factory=StepStats)
    execution: StepExecution = Field(default_factory=StepExecution)
