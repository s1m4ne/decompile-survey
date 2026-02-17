# BibTeX Fetcher

arXiv APIからBibTeXを取得するスクリプト、およびSpringer CSVをBibTeXに変換するスクリプト。

## 使い方

```bash
# 自動ファイル名で出力
uv run python scripts/bibtex_fetcher/arxiv_fetch.py \
  --query '(ti:"source recovery" OR abs:"source recovery") AND (cat:cs.CR)' \
  --page-size 5 --max-pages 1

# 出力先を指定
uv run python scripts/bibtex_fetcher/arxiv_fetch.py \
  --query '(ti:"source recovery" OR abs:"source recovery") AND (cat:cs.CR)' \
  --output imports/arXiv/arXiv_decompil_20260115_1200.bib
```

```bash
# Springer CSVをBibTeXに変換（Crossref + Springerページのabstract補完）
python3 scripts/bibtex_fetcher/springer_csv_to_bibtex.py \
  --input /Users/matsulab/Downloads/SearchResults.csv \
  --output /Users/matsulab/Downloads/SearchResults.bib
```

## オプション

| オプション | 説明 |
|-----------|------|
| `--query` | arXiv API検索クエリ |
| `--output` | 出力ファイルパス（省略時は自動生成） |
| `--page-size` | 1ページあたりの取得件数 |
| `--max-pages` | 最大ページ数 |
| `--sleep` | リクエスト間の待機時間（秒） |

## 注意事項

- arXiv APIの`search_query`構文を使用
- 大量の結果を取得する場合は`--max-pages`を増やし、`--sleep`を適切に設定
- `springer_csv_to_bibtex.py` は、Crossrefにabstractが無い場合に `link.springer.com` ページをスクレイピングしてabstractを補完する
- `--no-springer-scrape` を付けるとスクレイピング補完を無効化できる
