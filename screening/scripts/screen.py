#!/usr/bin/env python3
"""
論文スクリーニングスクリプト

Usage:
    uv run python screening/scripts/screen.py --input papers.bib --rules rules.md
"""

import argparse
import csv
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import bibtexparser
from dotenv import load_dotenv
from openai import OpenAI

# Load .env from repo root
script_dir = Path(__file__).parent
repo_root = script_dir.parent.parent
load_dotenv(repo_root / ".env")


def parse_bibtex(bib_path: str) -> list[dict]:
    """BibTeXファイルをパースして論文リストを返す"""
    with open(bib_path, encoding="utf-8") as f:
        bib_db = bibtexparser.load(f)

    papers = []
    for entry in bib_db.entries:
        papers.append({
            "citation_key": entry.get("ID", ""),
            "title": entry.get("title", "").replace("{", "").replace("}", ""),
            "abstract": entry.get("abstract", ""),
            "year": entry.get("year", ""),
            "author": entry.get("author", ""),
            "raw_entry": entry
        })
    return papers


def screen_paper(client: OpenAI, model: str, rules: str, paper: dict) -> dict:
    """1論文をスクリーニングして判定結果を返す"""

    prompt = f"""あなたは学術論文のスクリーニングを行うアシスタントです。
以下のスクリーニング基準に基づいて、論文を判定してください。

## スクリーニング基準
{rules}

## 論文情報
タイトル: {paper['title']}
著者: {paper['author']}
年: {paper['year']}
アブストラクト: {paper['abstract']}

## 出力形式
以下のJSON形式で出力してください。他の文字は含めないでください。
{{
    "decision": "include" または "exclude" または "uncertain",
    "confidence": 0.0〜1.0の数値,
    "reason": "判定理由（日本語で簡潔に）"
}}
"""

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"}
    )

    result = json.loads(response.choices[0].message.content)
    result["citation_key"] = paper["citation_key"]

    return result


def write_bibtex(papers: list[dict], output_path: str):
    """論文リストをBibTeXファイルに書き出す"""
    db = bibtexparser.bibdatabase.BibDatabase()
    db.entries = [p["raw_entry"] for p in papers]

    with open(output_path, "w", encoding="utf-8") as f:
        bibtexparser.dump(db, f)


def main():
    parser = argparse.ArgumentParser(description="論文スクリーニングスクリプト")
    parser.add_argument("--input", "-i", required=True, help="入力BibTeXファイル")
    parser.add_argument("--rules", "-r", required=True, help="スクリーニング基準ファイル")
    parser.add_argument("--model", "-m", default="gpt-4o-mini", help="使用するモデル")
    parser.add_argument("--output-dir", "-o", help="出力ディレクトリ（省略時は自動生成）")
    args = parser.parse_args()

    # APIキーの確認
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set in .env file", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # ルールを読み込む
    with open(args.rules, encoding="utf-8") as f:
        rules = f.read()

    # 論文を読み込む
    papers = parse_bibtex(args.input)
    print(f"Loaded {len(papers)} papers from {args.input}")

    # 出力ディレクトリを作成
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
        output_dir = script_dir.parent / "runs" / timestamp

    output_dir.mkdir(parents=True, exist_ok=True)

    # 入力ファイルとルールをコピー
    input_path = Path(args.input).resolve()
    rules_path = Path(args.rules).resolve()
    shutil.copy(input_path, output_dir / "input.bib")
    shutil.copy(rules_path, output_dir / "rules.md")

    print(f"Output directory: {output_dir}")

    # スクリーニング実行
    decisions = []
    included = []
    excluded = []
    uncertain = []

    for i, paper in enumerate(papers):
        print(f"[{i+1}/{len(papers)}] {paper['title'][:50]}...")

        if not paper["abstract"]:
            # アブストラクトがない場合はuncertain
            result = {
                "citation_key": paper["citation_key"],
                "decision": "uncertain",
                "confidence": 0.0,
                "reason": "アブストラクトなし"
            }
        else:
            result = screen_paper(client, args.model, rules, paper)

        decisions.append(result)

        if result["decision"] == "include":
            included.append(paper)
        elif result["decision"] == "exclude":
            excluded.append(paper)
        else:
            uncertain.append(paper)

        print(f"  -> {result['decision']} ({result['confidence']:.2f}): {result['reason'][:50]}")

    # 結果を保存
    # decisions.jsonl
    with open(output_dir / "decisions.jsonl", "w", encoding="utf-8") as f:
        for d in decisions:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    # decisions.csv
    with open(output_dir / "decisions.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["citation_key", "decision", "confidence", "reason"])
        writer.writeheader()
        writer.writerows(decisions)

    # BibTeXファイル
    if included:
        write_bibtex(included, str(output_dir / "included.bib"))
    if excluded:
        write_bibtex(excluded, str(output_dir / "excluded.bib"))
    if uncertain:
        write_bibtex(uncertain, str(output_dir / "uncertain.bib"))

    # history.csvに追記
    history_path = script_dir.parent / "history.csv"
    with open(history_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            output_dir.name,
            datetime.now().strftime("%Y-%m-%d"),
            args.model,
            len(papers),
            len(included),
            len(excluded),
            len(uncertain),
            ""
        ])

    # サマリー表示
    print("\n" + "=" * 50)
    print(f"Done! Results saved to {output_dir}")
    print(f"  Total:     {len(papers)}")
    print(f"  Included:  {len(included)}")
    print(f"  Excluded:  {len(excluded)}")
    print(f"  Uncertain: {len(uncertain)}")


if __name__ == "__main__":
    main()
