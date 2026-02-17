# imports/

各学術データベースから取得した検索結果を格納するディレクトリ。

## サブディレクトリ

| ディレクトリ | 内容 | 備考 |
|-------------|------|------|
| `arXiv/` | arXiv API から取得したBibTeX | `arxiv_fetch.py` で自動取得（abstract含む） |
| `Springer/` | Springer Link からエクスポートしたCSV + 変換後BibTeX | Keywords検索（広め）→ `springer_csv_to_bibtex.py` で変換 |
| `supplementary/` | 補助DB（NDSS / USENIX Security）の検索結果 | Semantic Scholar API + 手動追加 |

## 主要4DB（ACM / IEEE / WoS / arXiv）について

ACM / IEEE / WoS の検索結果は screening アプリ側で直接インポートされている（`screening/imports/` 配下）。
arXiv は `scripts/bibtex_fetcher/arxiv_fetch.py` で API 経由取得し `arXiv/` に保存。

## arXiv のワークフロー

arXiv API で title/abstract を検索し、BibTeX を自動生成。全エントリに abstract が含まれる。

- スクリプト: `scripts/bibtex_fetcher/arxiv_fetch.py`
- クエリファイル: `scripts/bibtex_fetcher/query_q1.txt`, `query_q2.txt`

### 取得結果（2025-02-18）

| ファイル | クエリ | 件数 |
|---------|--------|------|
| `arXiv_Q1_20260218_0256.bib` | Q1: decompilation/decompiler/decompile/decompiling/decompilers/"reverse compilation"/"reverse compiler" | 125 |
| `arXiv_Q2_20260218_0256.bib` | Q2: (source recovery系 × binary文脈系) | 11 |

- 全エントリに abstract あり（arXiv API が返す summary フィールド）
- 期間制限なし（全年代対象）

## Springer のワークフロー

1. Springer Link Advanced Search で **Keywords** フィールドにクエリを入力して検索
2. 結果を **CSV** でエクスポート → `Springer/` に保存
3. `scripts/bibtex_fetcher/springer_csv_to_bibtex.py` で BibTeX に変換（Crossref + Springerスクレイプで abstract 取得）
4. 変換後の BibTeX を screening アプリにインポート

## supplementary のワークフロー

NDSS / USENIX Security は主要4DBに完全にインデックスされていないため個別検索が必要。

- `S2_Q{1|2}_{venue}_{timestamp}.bib`: Semantic Scholar Bulk API で取得（`scripts/bibtex_fetcher/semantic_scholar_fetch.py`）
- `NDSS2026_manual.bib`: NDSS 2026 accepted papers から手動追加（S2未収録分）

## ファイル命名規則

### BibTeX ファイル
```
{source}_{query-short}_{YYYYMMDD}_{HHMM}[_p{N}].bib
```

### Springer CSV
Springer Link からのエクスポートファイル名をそのまま保存（`SearchResults.csv` 等）。
クエリ内容は同梱の README またはメタデータで記録。

## 関連ファイル

- インポート記録: `../logs/import_log.csv`
- arXiv取得スクリプト: `../scripts/bibtex_fetcher/arxiv_fetch.py`
- Springer変換スクリプト: `../scripts/bibtex_fetcher/springer_csv_to_bibtex.py`
- S2検索スクリプト: `../scripts/bibtex_fetcher/semantic_scholar_fetch.py`
