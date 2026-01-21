# logs/

インポート記録と作業ログを格納するディレクトリ。

## ファイル

### import_log.csv

すべてのBibTeXインポートを記録するCSVファイル。

| カラム名 | 説明 |
|---------|------|
| filename | BibTeXファイル名 |
| database | データベース名 |
| query | 検索クエリ（長い場合は `see {filename}.query.txt`） |
| download_datetime | ダウンロード日時 (YYYY-MM-DD HH:MM:SS) |
| record_count | 取得件数 |
| page | ページ番号 |
| memo | 備考 |
| url | 検索結果URL |

### daily/

日ごとの作業ログ（日報）を格納。

```
daily/
└── YYYY-MM-DD.md
```

内容:
- 実施した検索・作業の詳細
- 検索結果の統計
- 所感・検討事項
- TODO管理
