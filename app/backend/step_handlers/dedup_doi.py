"""
DOI-based deduplication step handler.

Removes duplicate entries based on their DOI field.
Entries without DOI are passed through.
"""

from .base import StepHandler, StepResult, OutputDefinition, Change, ProgressCallback
from . import register_step_type
from .dedup_utils import (
    parse_database_priority,
    pick_representative,
    infer_database_name,
)


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
            description="Unique entries (best representative of each DOI + entries without DOI)",
            required=True,
        ),
        OutputDefinition(
            name="removed",
            description="Duplicate entries (non-representative entries with same DOI)",
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
                "database_priority": {
                    "type": "string",
                    "default": "",
                    "description": "Preferred database order for duplicate DOI conflicts (e.g., ACM, IEEE, WoS)",
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
        database_priority = parse_database_priority(config.get("database_priority"))

        passed = []
        removed = []
        changes = []

        # Group DOI entries first so we can select representatives using year -> DB priority -> completeness.
        doi_groups: dict[str, list[int]] = {}
        group_order: list[str] = []
        raw_doi_map: dict[str, str] = {}
        for idx, entry in enumerate(input_entries):
            doi = str(entry.get("doi", "")).strip()
            if not doi:
                continue
            normalized_doi = doi if case_sensitive else doi.lower()
            if normalized_doi not in doi_groups:
                doi_groups[normalized_doi] = []
                group_order.append(normalized_doi)
                raw_doi_map[normalized_doi] = doi
            doi_groups[normalized_doi].append(idx)

        representative_index_by_doi: dict[str, int] = {}
        representative_key_by_doi: dict[str, str] = {}
        for normalized_doi in group_order:
            member_indices = doi_groups[normalized_doi]
            representative_index = pick_representative(
                member_indices,
                input_entries,
                database_priority=database_priority,
                prefer_doi=True,
            )
            representative_entry = input_entries[representative_index]
            representative_index_by_doi[normalized_doi] = representative_index
            representative_key_by_doi[normalized_doi] = representative_entry.get("ID", "unknown")

        total = len(input_entries)
        if progress_callback:
            progress_callback(0, total, "Deduplicating DOI")

        for idx, entry in enumerate(input_entries, start=1):
            entry_key = entry.get("ID", "unknown")
            doi = str(entry.get("doi", "")).strip()

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
            else:
                representative_index = representative_index_by_doi.get(normalized_doi, idx - 1)
                representative_key = representative_key_by_doi.get(normalized_doi, entry_key)
                source_database = infer_database_name(entry)
                if idx - 1 == representative_index:
                    passed.append(entry)
                    changes.append(Change(
                        key=entry_key,
                        action="keep",
                        reason="unique_doi",
                        details={
                            "doi": doi,
                            "source_database": source_database or None,
                            "is_representative": len(doi_groups.get(normalized_doi, [])) > 1,
                        },
                    ))
                else:
                    removed.append(entry)
                    representative_entry = input_entries[representative_index]
                    changes.append(Change(
                        key=entry_key,
                        action="remove",
                        reason="duplicate_doi",
                        details={
                            "doi": raw_doi_map.get(normalized_doi, doi),
                            "original_key": representative_key,
                            "original_source_database": infer_database_name(representative_entry) or None,
                            "source_database": source_database or None,
                            "message": f"Duplicate DOI: {doi}",
                        },
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
                "unique_dois": len(doi_groups),
                "database_priority": list(database_priority.keys()),
                "entries_without_doi": sum(
                    1 for c in changes if c.reason in ("no_doi", "no_doi_removed")
                ),
            },
        )
