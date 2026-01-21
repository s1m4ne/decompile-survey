"""
Runs API - runs/ ディレクトリの管理
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
import bibtexparser

router = APIRouter()

# パス設定
SCREENING_DIR = Path(__file__).parent.parent.parent.parent
RUNS_DIR = SCREENING_DIR / "runs"


def parse_bibtex_file(bib_path: Path) -> dict[str, dict]:
    """BibTeXファイルをパースしてcitation_keyをキーとした辞書を返す"""
    if not bib_path.exists():
        return {}

    with open(bib_path, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)

    papers = {}
    for entry in bib_db.entries:
        key = entry.get("ID", "")
        papers[key] = {
            "citation_key": key,
            "title": entry.get("title", "").replace("{", "").replace("}", ""),
            "abstract": entry.get("abstract", ""),
            "year": entry.get("year", ""),
            "author": entry.get("author", ""),
            "doi": entry.get("doi", ""),
            "url": entry.get("url", entry.get("howpublished", "")),
        }
    return papers


def load_decisions(run_dir: Path) -> dict[str, dict]:
    """decisions.jsonlを読み込んでcitation_keyをキーとした辞書を返す"""
    decisions_path = run_dir / "decisions.jsonl"
    if not decisions_path.exists():
        return {}

    decisions = {}
    with open(decisions_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                d = json.loads(line)
                decisions[d["citation_key"]] = d
    return decisions


@router.get("")
def list_runs():
    """runs/ 内のディレクトリ一覧を取得"""
    if not RUNS_DIR.exists():
        return []

    runs = []
    for d in sorted(RUNS_DIR.iterdir(), reverse=True):
        if d.is_dir() and not d.name.startswith("."):
            # 統計情報を取得
            decisions = load_decisions(d)
            stats = {
                "total": len(decisions),
                "included": sum(1 for d in decisions.values() if d.get("decision") == "include"),
                "excluded": sum(1 for d in decisions.values() if d.get("decision") == "exclude"),
                "uncertain": sum(1 for d in decisions.values() if d.get("decision") == "uncertain"),
            }

            # ルール名を取得
            rules_path = d / "rules.md"
            rules_name = ""
            if rules_path.exists():
                with open(rules_path, encoding="utf-8") as f:
                    first_line = f.readline().strip()
                    if first_line.startswith("#"):
                        rules_name = first_line.lstrip("#").strip()

            runs.append({
                "id": d.name,
                "rules_name": rules_name,
                "stats": stats,
            })

    return runs


@router.get("/{run_id}")
def get_run(run_id: str):
    """特定のrunの詳細を取得"""
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    # BibTeXを読み込み
    papers = parse_bibtex_file(run_dir / "input.bib")

    # decisionsを読み込み
    decisions = load_decisions(run_dir)

    # ルールを読み込み
    rules_path = run_dir / "rules.md"
    rules_content = ""
    if rules_path.exists():
        with open(rules_path, encoding="utf-8") as f:
            rules_content = f.read()

    # 結合
    result_papers = []
    for key, paper in papers.items():
        decision = decisions.get(key, {})
        result_papers.append({
            **paper,
            "ai_decision": decision.get("decision", ""),
            "ai_confidence": decision.get("confidence", 0),
            "ai_reason": decision.get("reason", ""),
        })

    # 統計
    stats = {
        "total": len(result_papers),
        "included": sum(1 for p in result_papers if p["ai_decision"] == "include"),
        "excluded": sum(1 for p in result_papers if p["ai_decision"] == "exclude"),
        "uncertain": sum(1 for p in result_papers if p["ai_decision"] == "uncertain"),
    }

    return {
        "id": run_id,
        "papers": result_papers,
        "rules": rules_content,
        "stats": stats,
    }


@router.get("/{run_id}/rules")
def get_run_rules(run_id: str):
    """特定のrunのルールを取得"""
    run_dir = RUNS_DIR / run_id
    rules_path = run_dir / "rules.md"

    if not rules_path.exists():
        raise HTTPException(status_code=404, detail="Rules not found")

    with open(rules_path, encoding="utf-8") as f:
        return {"content": f.read()}
