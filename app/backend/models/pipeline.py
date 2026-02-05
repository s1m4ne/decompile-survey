from pydantic import BaseModel, Field


class StepConfig(BaseModel):
    """Configuration for a step (step-type specific)."""
    pass  # Dynamic structure


class PipelineStep(BaseModel):
    """A step in the pipeline."""
    id: str
    type: str
    name: str
    enabled: bool = True
    input_from: str | dict = "sources"  # step_id or {"step": step_id, "output": output_name}
    config: dict = Field(default_factory=dict)


class PipelineFinalOutput(BaseModel):
    """Final output definition."""
    step: str
    output: str = "passed"


class Pipeline(BaseModel):
    """Pipeline definition."""
    version: str = "1.0"
    steps: list[PipelineStep] = Field(default_factory=list)
    final_output: PipelineFinalOutput | None = None
