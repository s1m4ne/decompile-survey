#!/usr/bin/env python3
"""
BibTeXファイルからtitleとabstractのみを抽出するスクリプト
"""

import argparse
import re
from pathlib import Path


def parse_bibtex_entries(content: str) -> list[dict]:
    """BibTeXエントリをパースしてリストで返す"""
    entries = []

    # エントリの開始パターン: @type{key,
    entry_pattern = re.compile(r'@(\w+)\s*\{([^,]+),', re.IGNORECASE)

    # 各エントリを見つける
    positions = [(m.start(), m.group(1), m.group(2)) for m in entry_pattern.finditer(content)]

    for i, (start, entry_type, key) in enumerate(positions):
        # エントリの終了位置を見つける（次のエントリの開始または文字列の終わり）
        end = positions[i + 1][0] if i + 1 < len(positions) else len(content)
        entry_text = content[start:end]

        entry = {
            'type': entry_type,
            'key': key.strip(),
            'title': None,
            'abstract': None
        }

        # titleを抽出（booktitleを除外するため単語境界を使用）
        title_match = re.search(r'(?<![a-z])title\s*=\s*\{(.+?)\}(?=\s*,?\s*(?:\w+\s*=|\}))', entry_text, re.IGNORECASE | re.DOTALL)
        if title_match:
            entry['title'] = clean_text(title_match.group(1))

        # abstractを抽出
        abstract_match = re.search(r'abstract\s*=\s*\{(.+?)\}(?=\s*,?\s*(?:\w+\s*=|\}))', entry_text, re.IGNORECASE | re.DOTALL)
        if abstract_match:
            entry['abstract'] = clean_text(abstract_match.group(1))

        entries.append(entry)

    return entries


def clean_text(text: str) -> str:
    """テキストをクリーニング"""
    # 改行とタブを空白に
    text = re.sub(r'[\n\t]+', ' ', text)
    # 連続した空白を1つに
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def format_output(entries: list[dict]) -> str:
    """エントリをMarkdown形式でフォーマット（LLM向け）"""
    lines = []
    for i, entry in enumerate(entries, 1):
        title = entry['title'] or '(no title)'
        abstract = entry['abstract'] or '(no abstract)'
        lines.append(f"## {i}. {title}")
        lines.append("")
        lines.append(abstract)
        lines.append("")
        lines.append("---")
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='BibTeXファイルからtitleとabstractを抽出'
    )
    parser.add_argument('input', help='入力BibTeXファイルのパス')
    parser.add_argument(
        '-o', '--output',
        help='出力ファイルのパス（指定しない場合はスクリプトと同じ場所に出力）'
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: ファイルが見つかりません: {input_path}")
        return 1

    # 出力先の決定
    if args.output:
        output_path = Path(args.output)
    else:
        script_dir = Path(__file__).parent
        output_path = script_dir / f"{input_path.stem}_title_abstract.txt"

    # BibTeXファイルを読み込み
    content = input_path.read_text(encoding='utf-8')

    # パースして抽出
    entries = parse_bibtex_entries(content)

    # 出力
    output_text = format_output(entries)
    output_path.write_text(output_text, encoding='utf-8')

    print(f"抽出完了: {len(entries)}件のエントリ")
    print(f"出力先: {output_path}")

    return 0


if __name__ == '__main__':
    exit(main())
