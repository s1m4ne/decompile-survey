"""
Title-similarity deduplication step handler.

Clusters entries by title similarity and keeps a representative entry per cluster.
"""

from __future__ import annotations

from .base import StepHandler, StepResult, OutputDefinition, Change, ProgressCallback
from . import register_step_type
from .dedup_utils import (
    normalize_title,
    title_similarity,
    pick_representative,
    cluster_by_threshold,
    parse_database_priority,
)


@register_step_type
class DedupTitleHandler(StepHandler):
    """Deduplicate entries by title similarity."""

    step_type = "dedup-title"
    name = "Title Deduplication"
    description = "Cluster entries by title similarity and keep one representative per cluster."
    icon = "Type"
    output_definitions = [
        OutputDefinition(
            name="passed",
            description="Representative entries kept after title clustering",
            required=True,
        ),
        OutputDefinition(
            name="removed",
            description="Entries removed as title duplicates",
            required=True,
        ),
    ]

    @classmethod
    def get_config_schema(cls) -> dict:
        return {
            "type": "object",
            "properties": {
                "similarity_threshold": {
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 1.0,
                    "default": 0.9,
                    "description": "Title similarity threshold for clustering",
                },
                "database_priority": {
                    "type": "string",
                    "default": "",
                    "description": "Preferred database order for representative selection (e.g., ACM, IEEE, WoS)",
                },
            },
        }

    def run(
        self,
        input_entries: list[dict],
        config: dict,
        progress_callback: ProgressCallback | None = None,
    ) -> StepResult:
        threshold = float(config.get("similarity_threshold", 0.9))
        database_priority = parse_database_priority(config.get("database_priority"))
        total_entries = len(input_entries)
        if progress_callback:
            progress_callback(0, total_entries, "Building title clusters")
        normalized_titles = [normalize_title(entry.get("title", "")) for entry in input_entries]
        clusters = cluster_by_threshold(normalized_titles, threshold, title_similarity)

        passed: list[dict] = []
        removed: list[dict] = []
        changes: list[Change] = []
        clusters_payload: list[dict] = []

        processed_entries = 0
        for index, member_indices in enumerate(clusters, start=1):
            cluster_entries_list = [input_entries[i] for i in member_indices]
            if len(member_indices) == 1:
                entry = cluster_entries_list[0]
                entry_key = entry.get("ID", "unknown")
                passed.append(entry)
                changes.append(Change(
                    key=entry_key,
                    action="keep",
                    reason="unique_title",
                    details={"cluster_id": None},
                ))
                processed_entries += 1
                if progress_callback:
                    progress_callback(processed_entries, total_entries, "Deduplicating titles")
                continue

            representative_index = pick_representative(
                member_indices,
                input_entries,
                database_priority=database_priority,
                prefer_doi=True,
            )
            representative = input_entries[representative_index]
            rep_key = representative.get("ID", "unknown")
            cluster_id = f"cluster-{index}"
            rep_norm = normalized_titles[representative_index]

            passed.append(representative)
            changes.append(Change(
                key=rep_key,
                action="keep",
                reason="duplicate_title_representative",
                details={
                    "cluster_id": cluster_id,
                    "similarity": 1.0,
                },
            ))

            cluster_members_payload = []
            member_similarity = [
                (title_similarity(rep_norm, normalized_titles[idx]), idx)
                for idx in member_indices
            ]
            member_similarity.sort(key=lambda item: item[0])

            for similarity, idx in member_similarity:
                entry = input_entries[idx]
                entry_key = entry.get("ID", "unknown")
                if idx == representative_index:
                    action = "keep"
                else:
                    action = "remove"
                    removed.append(entry)
                    changes.append(Change(
                        key=entry_key,
                        action="remove",
                        reason="duplicate_title",
                        details={
                            "cluster_id": cluster_id,
                            "representative_id": rep_key,
                            "similarity": similarity,
                        },
                    ))

                cluster_members_payload.append({
                    "id": entry_key,
                    "title": entry.get("title", ""),
                    "authors": entry.get("author", ""),
                    "year": entry.get("year", ""),
                    "abstract": entry.get("abstract", ""),
                    "similarity": similarity,
                    "action": action,
                })

            clusters_payload.append({
                "id": cluster_id,
                "size": len(member_indices),
                "representative_id": rep_key,
                "representative_title": representative.get("title", ""),
                "average_similarity": sum(m["similarity"] for m in cluster_members_payload) / len(cluster_members_payload),
                "members": cluster_members_payload,
            })
            processed_entries += len(member_indices)
            if progress_callback:
                progress_callback(processed_entries, total_entries, "Deduplicating titles")

        clusters_payload.sort(key=lambda item: (item["average_similarity"], normalize_title(item["representative_title"])))

        return StepResult(
            outputs={
                "passed": passed,
                "removed": removed,
            },
            changes=changes,
            details={
                "similarity_threshold": threshold,
                "database_priority": list(database_priority.keys()),
                "clusters": clusters_payload,
                "total_clusters": len([c for c in clusters if len(c) > 1]),
            },
        )
