"""
Shared helpers for deduplication step handlers.
"""

from __future__ import annotations

import difflib
import re
from typing import Callable, Iterable, TypeVar

T = TypeVar("T")


def normalize_title(title: str) -> str:
    if not title:
        return ""
    cleaned = title.replace("{", "").replace("}", "").lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    return " ".join(cleaned.split())


def title_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def completeness_score(entry: dict) -> int:
    fields = ["title", "author", "year", "abstract", "doi", "journal", "booktitle"]
    return sum(1 for field in fields if entry.get(field))


def parse_year(entry: dict) -> int:
    raw_year = entry.get("year", "")
    try:
        return int(str(raw_year).strip())
    except ValueError:
        return 0


def pick_representative(member_indices: Iterable[int], entries: list[dict]) -> int:
    return sorted(
        member_indices,
        key=lambda idx: (-parse_year(entries[idx]), -completeness_score(entries[idx]), idx),
    )[0]


def cluster_by_threshold(
    values: list[T],
    threshold: float,
    similarity_fn: Callable[[T, T], float],
) -> list[list[int]]:
    parent = list(range(len(values)))

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

    for i in range(len(values)):
        for j in range(i + 1, len(values)):
            similarity = similarity_fn(values[i], values[j])
            if similarity >= threshold:
                union(i, j)

    clusters: dict[int, list[int]] = {}
    for idx in range(len(values)):
        root = find(idx)
        clusters.setdefault(root, []).append(idx)

    return list(clusters.values())
