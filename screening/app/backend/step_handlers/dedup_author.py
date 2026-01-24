"""
Author-similarity deduplication step handler.

Clusters entries by author similarity and keeps a representative entry per cluster.
"""

from __future__ import annotations

import re

from .base import StepHandler, StepResult, OutputDefinition, Change
from . import register_step_type


def normalize_author_token(token: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "", token.lower())
    return cleaned


def extract_last_names(author_field: str) -> set[str]:
    if not author_field:
        return set()
    parts = re.split(r"\s+and\s+|;", author_field)
    last_names: set[str] = set()
    for part in parts:
        tokens = [t for t in part.strip().split() if t]
        if not tokens:
            continue
        last_name = normalize_author_token(tokens[-1])
        if last_name:
            last_names.add(last_name)
    return last_names


def author_similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    intersection = a.intersection(b)
    union = a.union(b)
    return len(intersection) / len(union) if union else 0.0


def completeness_score(entry: dict) -> int:
  fields = ["title", "author", "year", "abstract", "doi", "journal", "booktitle"]
  return sum(1 for field in fields if entry.get(field))

def parse_year(entry: dict) -> int:
    raw_year = entry.get("year", "")
    try:
        return int(str(raw_year).strip())
    except ValueError:
        return 0


def cluster_entries(entries: list[dict], threshold: float) -> list[list[int]]:
    parent = list(range(len(entries)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra = find(a)
        rb = find(b)
        if ra != rb:
            parent[rb] = ra

    author_sets = [extract_last_names(entry.get("author", "")) for entry in entries]

    for i in range(len(entries)):
        for j in range(i + 1, len(entries)):
            similarity = author_similarity(author_sets[i], author_sets[j])
            if similarity >= threshold:
                union(i, j)

    clusters: dict[int, list[int]] = {}
    for idx in range(len(entries)):
        root = find(idx)
        clusters.setdefault(root, []).append(idx)

    return list(clusters.values())


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
        clusters = cluster_entries(input_entries, threshold)

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

            representative_index = sorted(
                member_indices,
                key=lambda idx: (-parse_year(input_entries[idx]), -completeness_score(input_entries[idx]), idx),
            )[0]
            representative = input_entries[representative_index]
            rep_key = representative.get("ID", "unknown")
            cluster_id = f"cluster-{index}"
            rep_authors = extract_last_names(representative.get("author", ""))

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
            for idx in member_indices:
                entry = input_entries[idx]
                entry_key = entry.get("ID", "unknown")
                similarity = author_similarity(rep_authors, extract_last_names(entry.get("author", "")))
                if idx == representative_index:
                    action = "keep"
                else:
                    action = "remove"
                    removed.append(entry)
                    changes.append(Change(
                        key=entry_key,
                        action="remove",
                        reason="duplicate_author",
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
