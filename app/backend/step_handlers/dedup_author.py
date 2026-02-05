"""
Author-similarity deduplication step handler.

Clusters entries by author similarity and keeps a representative entry per cluster.
"""

from __future__ import annotations

import re

from .base import StepHandler, StepResult, OutputDefinition, Change
from . import register_step_type
from .dedup_utils import (
    normalize_title,
    title_similarity,
    pick_representative,
    cluster_by_threshold,
)


def normalize_author_token(token: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "", token.lower())
    return cleaned


def extract_last_names(author_field: str) -> set[str]:
    if not author_field:
        return set()
    parts = re.split(r"\s+and\s+|;", author_field)
    last_names: set[str] = set()
    for part in parts:
        cleaned_part = part.strip()
        if not cleaned_part:
            continue
        if "," in cleaned_part:
            last_part = cleaned_part.split(",", 1)[0].strip()
        else:
            tokens = [t for t in cleaned_part.split() if t]
            if not tokens:
                continue
            last_part = tokens[-1]
        last_name = normalize_author_token(last_part)
        if last_name:
            last_names.add(last_name)
    return last_names


def author_similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    intersection = a.intersection(b)
    union = a.union(b)
    return len(intersection) / len(union) if union else 0.0


@register_step_type
class DedupAuthorHandler(StepHandler):
    """Deduplicate entries by author similarity."""

    step_type = "dedup-author"
    name = "Author Deduplication"
    description = "Cluster entries by author similarity and keep one representative per cluster."
    icon = "Users"
    output_definitions = [
        OutputDefinition(
            name="passed",
            description="Representative entries kept after author clustering",
            required=True,
        ),
        OutputDefinition(
            name="removed",
            description="Entries removed as author duplicates",
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
                    "default": 0.8,
                    "description": "Author similarity threshold for clustering",
                },
            },
        }

    def run(self, input_entries: list[dict], config: dict) -> StepResult:
        threshold = float(config.get("similarity_threshold", 0.8))
        author_sets = [extract_last_names(entry.get("author", "")) for entry in input_entries]
        normalized_titles = [normalize_title(entry.get("title", "")) for entry in input_entries]
        clusters = cluster_by_threshold(author_sets, threshold, author_similarity)

        passed: list[dict] = []
        removed: list[dict] = []
        changes: list[Change] = []
        clusters_payload: list[dict] = []

        for index, member_indices in enumerate(clusters, start=1):
            cluster_entries_list = [input_entries[i] for i in member_indices]
            if len(member_indices) == 1:
                entry = cluster_entries_list[0]
                entry_key = entry.get("ID", "unknown")
                passed.append(entry)
                changes.append(Change(
                    key=entry_key,
                    action="keep",
                    reason="unique_author",
                    details={"cluster_id": None},
                ))
                continue

            representative_index = pick_representative(member_indices, input_entries)
            representative = input_entries[representative_index]
            rep_key = representative.get("ID", "unknown")
            cluster_id = f"cluster-{index}"
            rep_authors = extract_last_names(representative.get("author", ""))
            rep_title = normalized_titles[representative_index]

            passed.append(representative)
            changes.append(Change(
                key=rep_key,
                action="keep",
                reason="duplicate_author_representative",
                details={
                    "cluster_id": cluster_id,
                    "similarity": 1.0,
                },
            ))

            cluster_members_payload = []
            title_similarities: list[float] = []
            member_similarity = [
                (author_similarity(rep_authors, author_sets[idx]), idx)
                for idx in member_indices
            ]
            member_similarity.sort(key=lambda item: item[0])

            for similarity, idx in member_similarity:
                entry = input_entries[idx]
                entry_key = entry.get("ID", "unknown")
                title_similarity_value = title_similarity(rep_title, normalized_titles[idx])
                title_similarities.append(title_similarity_value)
                if idx == representative_index:
                    action = "keep"
                else:
                    # Default: keep all entries (don't auto-remove duplicates)
                    action = "keep"
                    passed.append(entry)
                    changes.append(Change(
                        key=entry_key,
                        action="keep",
                        reason="duplicate_author_member",
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

            title_average = (
                sum(title_similarities) / len(title_similarities)
                if title_similarities
                else 0.0
            )
            clusters_payload.append({
                "id": cluster_id,
                "size": len(member_indices),
                "representative_id": rep_key,
                "representative_title": representative.get("title", ""),
                "average_similarity": sum(m["similarity"] for m in cluster_members_payload) / len(cluster_members_payload),
                "title_average_similarity": title_average,
                "members": cluster_members_payload,
            })

        clusters_payload.sort(
            key=lambda item: (
                -item["size"],
                -item["title_average_similarity"],
                -item["average_similarity"],
                normalize_title(item["representative_title"]),
            )
        )

        return StepResult(
            outputs={
                "passed": passed,
                "removed": removed,
            },
            changes=changes,
            details={
                "similarity_threshold": threshold,
                "clusters": clusters_payload,
                "total_clusters": len([c for c in clusters if len(c) > 1]),
            },
        )
