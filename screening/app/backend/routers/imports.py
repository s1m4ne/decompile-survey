"""
Imports API - imports/ ディレクトリのBibTeX管理
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException
import bibtexparser

router = APIRouter()

# パス設定
REPO_ROOT = Path(__file__).parent.parent.parent.parent.parent
IMPORTS_DIR = REPO_ROOT / "imports"


def parse_bibtex_file(bib_path: Path) -> list[dict]:
    """BibTeXファイルをパースして論文リストを返す"""
    with open(bib_path, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)

    papers = []
    for entry in bib_db.entries:
        # URLを抽出（howpublishedから）
        url = entry.get("url", "")
        if not url:
            howpublished = entry.get("howpublished", "")
            if "\\url{" in howpublished:
                url = howpublished.replace("\\url{", "").rstrip("}")

        papers.append({
            "citation_key": entry.get("ID", ""),
            "title": entry.get("title", "").replace("{", "").replace("}", ""),
            "abstract": entry.get("abstract", ""),
            "year": entry.get("year", ""),
            "author": entry.get("author", ""),
            "doi": entry.get("doi", ""),
            "url": url,
            "entry_type": entry.get("ENTRYTYPE", ""),
        })
    return papers


@router.get("")
def list_imports():
    """imports/ 内のデータベースとBibTeXファイル一覧を取得"""
    if not IMPORTS_DIR.exists():
        return []

    databases = []
    for db_dir in sorted(IMPORTS_DIR.iterdir()):
        if db_dir.is_dir() and not db_dir.name.startswith("."):
            bib_files = []
            for bib_file in sorted(db_dir.glob("*.bib")):
                # ファイルの論文数を取得
                try:
                    papers = parse_bibtex_file(bib_file)
                    count = len(papers)
                except Exception:
                    count = 0

                bib_files.append({
                    "filename": bib_file.name,
                    "path": str(bib_file.relative_to(REPO_ROOT)),
                    "count": count,
                })

            databases.append({
                "name": db_dir.name,
                "files": bib_files,
                "total_files": len(bib_files),
            })

    return databases


@router.get("/{database}/{filename}")
def get_bibtex_file(database: str, filename: str):
    """特定のBibTeXファイルの内容を取得"""
    bib_path = IMPORTS_DIR / database / filename

    if not bib_path.exists():
        raise HTTPException(status_code=404, detail="BibTeX file not found")

    papers = parse_bibtex_file(bib_path)

    return {
        "database": database,
        "filename": filename,
        "papers": papers,
        "count": len(papers),
    }
