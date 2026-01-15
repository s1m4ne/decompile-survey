# decompile-survey

機械学習を用いたデコンパイル技術に関するサーベイ論文作成のためのリポジトリ。

## 概要

このリポジトリは、4つの学術データベース（ACM Digital Library、IEEE Xplore、Web of Science、arXiv）から収集した文献データを管理する。

## ディレクトリ構成

```
decompile-survey/
├── imports/                    # 各データベースからのインポートファイル
│   ├── ACM/                    # ACM Digital Library
│   │   ├── *.bib               # BibTeXファイル
│   │   └── *.query.txt         # 長いクエリの保存ファイル
│   ├── IEEE/                   # IEEE Xplore
│   │   ├── *.bib
│   │   └── *.query.txt
│   ├── WoS/                    # Web of Science
│   │   ├── *.bib
│   │   └── *.query.txt
│   └── arXiv/                  # arXiv
│       ├── *.bib
│       └── *.query.txt
├── logs/                       # ログファイル
│   └── import_log.csv          # インポート記録
├── scripts/                    # スクリプト
│   └── arxiv/                  # arXiv用スクリプト
│       ├── arxiv_fetch.py      # arXiv APIからのBibTeX取得
│       ├── query.txt           # クエリテンプレート
│       └── README.md
├── .gitignore
└── README.md
```

## ファイル命名規則

### BibTeXファイル
```
{DB}_{query-short}_{YYYYMMDD}_{HHMM}[_p{N}].bib
```

- `{DB}`: データベース名（ACM, IEEE, WoS, arXiv）- `imports/`のディレクトリ名と一致
- `{query-short}`: クエリの短縮名（例: decompil, source-recovery）
- `{YYYYMMDD}_{HHMM}`: ダウンロード日時
- `_p{N}`: ページ番号（複数ページの場合のみ）

例:
- `ACM_decompil_20260115_1511.bib`
- `IEEE_decompil_20260115_1522_p1.bib`
- `IEEE_decompil_20260115_1522_p2.bib`

### クエリファイル
長いクエリ（複数行や複雑な検索式）はBibTeXファイルと同名の`.query.txt`に保存する。
```
{DB}_{query-short}_{YYYYMMDD}_{HHMM}.query.txt
```

クエリファイルの末尾にはURLを記載する:
```
(
  (検索式)
)

URL:
https://...
```

## インポートログ (import_log.csv)

すべてのインポートを記録するCSVファイル。

### カラム
| カラム名 | 説明 |
|---------|------|
| filename | BibTeXファイル名 |
| database | データベース名（imports/のディレクトリ名と一致） |
| query | 検索クエリ（長い場合は `see {filename}.query.txt`） |
| download_datetime | ダウンロード日時 (YYYY-MM-DD HH:MM:SS) |
| record_count | 取得件数 |
| page | ページ番号（複数ページダウンロードの場合） |
| memo | 備考 |
| url | 検索結果URL（長い場合は `see {filename}.query.txt`） |

## 検索クエリ

### Query 1: decompil*
デコンパイルに関する基本的な検索。

- **期間**: 2018-2026
- **検索対象**: タイトル or アブストラクト
- **キーワード**: decompil*

### Query 2: source-recovery (ML/DL)
機械学習を用いたソースコード復元に関する検索。

```
(
  (source recovery OR source code recovery OR code recovery OR
   source reconstruction OR binary-to-source OR binary to source OR
   assembly-to-C OR binary-to-C OR lifting)
  AND
  (binary OR assembly OR executable OR machine code OR
   disassembl* OR bytecode)
  AND
  (machine learning OR deep learning OR neural network* OR
   transformer* OR language model* OR LLM OR GPT)
)
```

## ワークフロー

### 1. 文献検索・ダウンロード

1. 各データベースで検索を実行
2. BibTeX形式でエクスポート
3. `imports/{DB}/` に保存
4. `logs/import_log.csv` に記録を追加
5. 長いクエリは `.query.txt` ファイルに保存

### 2. arXiv からの取得

arXivはBibTeXエクスポート機能がないため、以下の方法を使用:

#### 方法A: Webスクレイピング (arxivcollector)
```bash
cd ../arxivcollector
source venv/bin/activate
python arxivcollector.py --url "https://arxiv.org/search/..." --title output
```
参照: https://github.com/s1m4ne/arxivcollector

#### 方法B: arXiv API (scripts/arxiv/arxiv_fetch.py)
```bash
cd scripts/arxiv
python arxiv_fetch.py
```

### 3. 文献管理ツールへのインポート

BibTeXファイルをZoteroなどの文献管理ツールにインポートする。

## 関連リポジトリ

- [arxivcollector](https://github.com/s1m4ne/arxivcollector) - arXivからBibTeXを取得するツール（フォーク版）

## 注意事項

- データベース名は `imports/` のディレクトリ名と必ず一致させる
- 件数はダウンロード時の検索結果画面から手動で確認した値を使用する
- BibTeXのパース時に `}` などの特殊文字がエスケープされていない場合、インポートエラーが発生することがある
