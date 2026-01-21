# exports/

Zoteroなどの文献管理ツールからエクスポートしたファイルを格納するディレクトリ。

## サブディレクトリ

### pre-dedup/

重複マージ前のバックアップ用BibTeXファイル。

```
all_pre-merge_{YYYYMMDD}_{HHMM}_{N}件.bib
```

マージ作業前の状態を保存しておくことで、問題発生時に復元可能。

## ワークフロー

1. `imports/` のBibTeXをZoteroにインポート
2. 重複マージ作業の前に `pre-dedup/` へエクスポート
3. Zoteroで重複マージを実施
4. 必要に応じてマージ後のファイルもエクスポート
