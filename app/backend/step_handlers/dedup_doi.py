"""
DOI-based deduplication step handler.

Removes duplicate entries based on their DOI field.
Entries without DOI are passed through.
"""

from .base import StepHandler, StepResult, OutputDefinition, Change, ProgressCallback
from . import register_step_type


@register_step_type
class DedupDoiHandler(StepHandler):
    """Deduplicate entries by DOI."""

    step_type = "dedup-doi"
    name = "DOI Deduplication"
    description = "Remove duplicate entries based on DOI. Entries without DOI are kept."
    icon = "Fingerprint"
    output_definitions = [
        OutputDefinition(
            name="passed",
            description="Unique entries (first occurrence of each DOI + entries without DOI)",
            required=True,
        ),
        OutputDefinition(
            name="removed",
            description="Duplicate entries (later occurrences of same DOI)",
            required=True,
        ),
    ]

    @classmethod
    def get_config_schema(cls) -> dict:
        return {
            "type": "object",
            "properties": {
                "case_sensitive": {
                    "type": "boolean",
                    "default": False,
                    "description": "Whether DOI comparison should be case-sensitive",
                },
                "keep_no_doi": {
                    "type": "boolean",
                    "default": True,
                    "description": "Keep entries without DOI in passed output",
                },
            },
        }

    def run(
        self,
        input_entries: list[dict],
        config: dict,
        progress_callback: ProgressCallback | None = None,
    ) -> StepResult:
        """
        Deduplicate entries by DOI.

        Args:
            input_entries: List of BibTeX entries
            config: Step configuration

        Returns:
            StepResult with passed and removed outputs
        """
        case_sensitive = config.get("case_sensitive", False)
        keep_no_doi = config.get("keep_no_doi", True)

        passed = []
        removed = []
        changes = []

        # Track seen DOIs
        seen_dois: dict[str, dict] = {}

        total = len(input_entries)
        if progress_callback:
            progress_callback(0, total, "Deduplicating DOI")

        for idx, entry in enumerate(input_entries, start=1):
            entry_key = entry.get("ID", "unknown")
            doi = entry.get("doi", "").strip()

            # Normalize DOI if case-insensitive
            normalized_doi = doi if case_sensitive else doi.lower()

            if not doi:
                # No DOI - keep or skip based on config
                if keep_no_doi:
                    passed.append(entry)
                    changes.append(Change(
                        key=entry_key,
                        action="keep",
                        reason="no_doi",
                        details={"message": "No DOI - kept in passed"},
                    ))
                else:
                    removed.append(entry)
                    changes.append(Change(
                        key=entry_key,
                        action="remove",
                        reason="no_doi_removed",
                        details={"message": "No DOI - moved to removed"},
                    ))
            elif normalized_doi in seen_dois:
                # Duplicate DOI
                original = seen_dois[normalized_doi]
                removed.append(entry)
                changes.append(Change(
                    key=entry_key,
                    action="remove",
                    reason="duplicate_doi",
                    details={
                        "doi": doi,
                        "original_key": original.get("ID", "unknown"),
                        "message": f"Duplicate DOI: {doi}",
                    },
                ))
            else:
                # First occurrence of this DOI
                seen_dois[normalized_doi] = entry
                passed.append(entry)
                changes.append(Change(
                    key=entry_key,
                    action="keep",
                    reason="unique_doi",
                    details={"doi": doi},
                ))

            if progress_callback:
                progress_callback(idx, total, "Deduplicating DOI")

        return StepResult(
            outputs={
                "passed": passed,
                "removed": removed,
            },
            changes=changes,
            details={
                "total_input": len(input_entries),
                "unique_count": len(passed),
                "duplicate_count": len(removed),
                "unique_dois": len(seen_dois),
                "entries_without_doi": sum(
                    1 for c in changes if c.reason in ("no_doi", "no_doi_removed")
                ),
            },
        )
