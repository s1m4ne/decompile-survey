"""
Reviews API - レビュー結果の管理
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# パス設定
SCREENING_DIR = Path(__file__).parent.parent.parent.parent
REVIEWS_DIR = SCREENING_DIR / "reviews"
RUNS_DIR = SCREENING_DIR / "runs"


class PaperReview(BaseModel):
    manual_decision: Optional[str] = None  # include, exclude, uncertain, or None
    checked: bool = False
    note: str = ""


class UpdatePaperReviewRequest(BaseModel):
    manual_decision: Optional[str] = None
    checked: Optional[bool] = None
    note: Optional[str] = None


class BulkUpdateRequest(BaseModel):
    citation_keys: list[str]
    manual_decision: Optional[str] = None
    checked: Optional[bool] = None


def load_review(run_id: str) -> dict:
    """レビューファイルを読み込む"""
    review_path = REVIEWS_DIR / run_id / "review.json"
    if not review_path.exists():
        return None

    with open(review_path, encoding="utf-8") as f:
        return json.load(f)


def save_review(run_id: str, review_data: dict):
    """レビューファイルを保存"""
    review_dir = REVIEWS_DIR / run_id
    review_dir.mkdir(parents=True, exist_ok=True)

    review_data["meta"]["updated_at"] = datetime.now().isoformat()

    with open(review_dir / "review.json", "w", encoding="utf-8") as f:
        json.dump(review_data, f, ensure_ascii=False, indent=2)


def init_review_from_run(run_id: str) -> dict:
    """runの結果からレビューを初期化"""
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    # decisions.jsonlを読み込み
    decisions_path = run_dir / "decisions.jsonl"
    if not decisions_path.exists():
        raise HTTPException(status_code=404, detail="Decisions not found")

    papers = {}
    with open(decisions_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                d = json.loads(line)
                papers[d["citation_key"]] = {
                    "ai_decision": d.get("decision", ""),
                    "ai_confidence": d.get("confidence", 0),
                    "ai_reason": d.get("reason", ""),
                    "manual_decision": None,
                    "checked": False,
                    "note": "",
                }

    # ルール名を取得
    rules_path = run_dir / "rules.md"
    rules_name = ""
    if rules_path.exists():
        with open(rules_path, encoding="utf-8") as f:
            first_line = f.readline().strip()
            if first_line.startswith("#"):
                rules_name = first_line.lstrip("#").strip()

    # input.bibのファイル名を取得（実際はコピーなのでrun内から取得）
    input_name = "input.bib"

    now = datetime.now().isoformat()
    review_data = {
        "meta": {
            "run_id": run_id,
            "source_rules": rules_name,
            "source_input": input_name,
            "created_at": now,
            "updated_at": now,
            "stats": {
                "total": len(papers),
                "checked": 0,
                "modified": 0,
            }
        },
        "papers": papers,
    }

    return review_data


def update_stats(review_data: dict):
    """統計情報を更新"""
    papers = review_data["papers"]
    review_data["meta"]["stats"] = {
        "total": len(papers),
        "checked": sum(1 for p in papers.values() if p.get("checked")),
        "modified": sum(1 for p in papers.values() if p.get("manual_decision") is not None),
    }


@router.get("/{run_id}")
def get_review(run_id: str):
    """レビューを取得（なければrunから初期化）"""
    review = load_review(run_id)

    if review is None:
        # 初期化して保存
        review = init_review_from_run(run_id)
        save_review(run_id, review)

    return review


@router.put("/{run_id}/papers/{citation_key}")
def update_paper_review(run_id: str, citation_key: str, request: UpdatePaperReviewRequest):
    """論文のレビューを更新"""
    review = load_review(run_id)

    if review is None:
        review = init_review_from_run(run_id)

    if citation_key not in review["papers"]:
        raise HTTPException(status_code=404, detail="Paper not found")

    paper = review["papers"][citation_key]

    if request.manual_decision is not None:
        paper["manual_decision"] = request.manual_decision if request.manual_decision else None
    if request.checked is not None:
        paper["checked"] = request.checked
    if request.note is not None:
        paper["note"] = request.note

    update_stats(review)
    save_review(run_id, review)

    return paper


@router.post("/{run_id}/bulk-update")
def bulk_update_papers(run_id: str, request: BulkUpdateRequest):
    """複数の論文を一括更新"""
    review = load_review(run_id)

    if review is None:
        review = init_review_from_run(run_id)

    updated = []
    for key in request.citation_keys:
        if key in review["papers"]:
            paper = review["papers"][key]
            if request.manual_decision is not None:
                paper["manual_decision"] = request.manual_decision if request.manual_decision else None
            if request.checked is not None:
                paper["checked"] = request.checked
            updated.append(key)

    update_stats(review)
    save_review(run_id, review)

    return {"updated": updated, "count": len(updated)}


@router.get("/{run_id}/export")
def export_review(run_id: str, format: str = "csv"):
    """レビュー結果をエクスポート"""
    review = load_review(run_id)

    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")

    # 最終判定を計算
    results = []
    for key, paper in review["papers"].items():
        final_decision = paper.get("manual_decision") or paper.get("ai_decision")
        results.append({
            "citation_key": key,
            "ai_decision": paper.get("ai_decision"),
            "manual_decision": paper.get("manual_decision"),
            "final_decision": final_decision,
            "checked": paper.get("checked"),
            "note": paper.get("note", ""),
        })

    return {
        "run_id": run_id,
        "results": results,
        "stats": review["meta"]["stats"],
    }
