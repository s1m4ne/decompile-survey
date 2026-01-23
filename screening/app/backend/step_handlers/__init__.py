"""
Step handlers registry.

Each step type registers itself here. The registry is used by the API
to list available step types and execute steps.
"""

from .base import StepHandler, StepResult, OutputDefinition, StepTypeInfo

# Registry of step handlers
STEP_HANDLERS: dict[str, type[StepHandler]] = {}

# Registry of step type info (for API)
STEP_TYPES: dict[str, StepTypeInfo] = {}


def register_step_type(handler_class: type[StepHandler]) -> type[StepHandler]:
    """Decorator to register a step handler."""
    step_type = handler_class.step_type
    STEP_HANDLERS[step_type] = handler_class
    STEP_TYPES[step_type] = StepTypeInfo(
        id=step_type,
        name=handler_class.name,
        description=handler_class.description,
        icon=handler_class.icon,
        outputs=handler_class.output_definitions,
        config_schema=handler_class.get_config_schema(),
    )
    return handler_class


def get_handler(step_type: str) -> type[StepHandler] | None:
    """Get a step handler by type."""
    return STEP_HANDLERS.get(step_type)


def list_step_types() -> list[StepTypeInfo]:
    """List all registered step types."""
    return list(STEP_TYPES.values())


# Import handlers to trigger registration
# (Add imports here as handlers are implemented)
from . import dedup_doi
from . import ai_screening
# from . import normalize
