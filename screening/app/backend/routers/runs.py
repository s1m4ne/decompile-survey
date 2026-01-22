"""
Runs API - runs/ ディレクトリの管理
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
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


def load_meta(run_dir: Path) -> dict | None:
    """meta.jsonを読み込む"""
    meta_path = run_dir / "meta.json"
    if not meta_path.exists():
        return None

    with open(meta_path, encoding="utf-8") as f:
        return json.load(f)


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

            # ルールファイル名を取得（.mdファイルを探す、input.bibは除外）
            rules_file = ""
            for md_file in d.glob("*.md"):
                rules_file = md_file.name
                break

            # メタデータを読み込み
            meta = load_meta(d)

            runs.append({
                "id": d.name,
                "rules_file": rules_file,
                "stats": stats,
                "input_file": meta.get("input_file") if meta else None,
                "model": meta.get("model") if meta else None,
                "created_at": meta.get("created_at") if meta else None,
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

    # ルールを読み込み（.mdファイルを探す）
    rules_content = ""
    for md_file in run_dir.glob("*.md"):
        with open(md_file, encoding="utf-8") as f:
            rules_content = f.read()
        break

    # メタデータを読み込み
    meta = load_meta(run_dir)

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
        "meta": meta,
    }


@router.get("/{run_id}/rules")
def get_run_rules(run_id: str):
    """特定のrunのルールを取得"""
    run_dir = RUNS_DIR / run_id

    # .mdファイルを探す
    for md_file in run_dir.glob("*.md"):
        with open(md_file, encoding="utf-8") as f:
            return {"content": f.read()}

    raise HTTPException(status_code=404, detail="Rules not found")


@router.get("/{run_id}/export/{decision}")
def export_bibtex(run_id: str, decision: str):
    """AI判定結果のBibTeXファイルをエクスポート

    decision: "included", "excluded", "uncertain", "all"
    """
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    # ファイル名のマッピング
    file_map = {
        "included": "included.bib",
        "excluded": "excluded.bib",
        "uncertain": "uncertain.bib",
        "all": "input.bib",
    }

    if decision not in file_map:
        raise HTTPException(status_code=400, detail=f"Invalid decision: {decision}")

    bib_path = run_dir / file_map[decision]
    if not bib_path.exists():
        # ファイルが存在しない場合（例: uncertainが0件の場合）
        return PlainTextResponse(
            content="",
            media_type="application/x-bibtex",
            headers={
                "Content-Disposition": f'attachment; filename="{run_id}_{decision}.bib"'
            }
        )

    with open(bib_path, encoding="utf-8") as f:
        content = f.read()

    return PlainTextResponse(
        content=content,
        media_type="application/x-bibtex",
        headers={
            "Content-Disposition": f'attachment; filename="{run_id}_{decision}.bib"'
        }
    )
