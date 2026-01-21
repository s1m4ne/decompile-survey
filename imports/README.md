# imports/

各学術データベースから取得したBibTeXファイルを格納するディレクトリ。

## サブディレクトリ

| ディレクトリ | データベース | 備考 |
|-------------|-------------|------|
| `ACM/` | ACM Digital Library | |
| `IEEE/` | IEEE Xplore | |
| `WoS/` | Web of Science | |
| `arXiv/` | arXiv | API経由で取得 |

## ファイル命名規則

### BibTeXファイル
```
{DB}_{query-short}_{YYYYMMDD}_{HHMM}[_p{N}].bib
```

- `{DB}`: データベース名（ディレクトリ名と一致）
- `{query-short}`: クエリの短縮名（例: decompil, source-recovery）
- `{YYYYMMDD}_{HHMM}`: ダウンロード日時
- `_p{N}`: ページ番号（複数ページの場合のみ）

例: `ACM_decompil_20260115_1511.bib`

### クエリファイル
長いクエリはBibTeXファイルと同名の `.query.txt` に保存。

```
{DB}_{query-short}_{YYYYMMDD}_{HHMM}.query.txt
```

## 関連ファイル

- インポート記録: `../logs/import_log.csv`
- arXiv取得スクリプト: `../scripts/arxiv/`
