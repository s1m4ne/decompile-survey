# bibtex_extractor

BibTeXファイルからtitleとabstractのみを抽出するスクリプト。

## 使い方

```bash
# 基本（出力先はスクリプトと同じ場所）
python3 extract_title_abstract.py <入力BibTeXファイル>

# 出力先を指定
python3 extract_title_abstract.py <入力BibTeXファイル> -o <出力ファイル>
```

## 出力形式

```
Key: citation_key
Title: 論文タイトル
Abstract: 論文のアブストラクト
--------------------------------------------------------------------------------

Key: next_citation_key
...
```

## 例

```bash
python3 extract_title_abstract.py ../../imports/ACM/ACM_decompil_20260115_1511.bib
```
