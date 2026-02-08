"""
Base class for step handlers.

Each step type should inherit from StepHandler and implement the run() method.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class OutputDefinition:
    """Definition of a step output."""
    name: str
    description: str
    required: bool = True


@dataclass
class Change:
    """A change made by a step."""
    key: str
    action: str  # "keep", "remove", "modify"
    reason: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class StepResult:
    """Result of running a step."""
    outputs: dict[str, list[dict]]  # output_name -> list of bibtex entries
    changes: list[Change]
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class StepTypeInfo:
    """Information about a step type (for API)."""
    id: str
    name: str
    description: str
    icon: str
    outputs: list[OutputDefinition]
    config_schema: dict[str, Any]


ProgressCallback = Callable[[int, int, str | None], None]


class StepHandler(ABC):
    """Base class for step handlers."""

    # Must be overridden by subclasses
    step_type: str = ""
    name: str = ""
    description: str = ""
    icon: str = "Circle"
    output_definitions: list[OutputDefinition] = []

    @classmethod
    def get_config_schema(cls) -> dict[str, Any]:
        """
        Return JSON Schema for the step configuration.
        Override in subclasses to define config options.
        """
        return {"type": "object", "properties": {}}

    @abstractmethod
    def run(
        self,
        input_entries: list[dict],
        config: dict,
        progress_callback: ProgressCallback | None = None,
    ) -> StepResult:
        """
        Run the step on input entries.

        Args:
            input_entries: List of BibTeX entries (as dicts)
            config: Step configuration

        Returns:
            StepResult with outputs and changes
        """
        pass

    def validate_config(self, config: dict) -> list[str]:
        """
        Validate the configuration.
        Returns a list of error messages (empty if valid).
        """
        return []
