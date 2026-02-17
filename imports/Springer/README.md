# imports/Springer/

Springer Link Advanced Search からエクスポートした CSV ファイル。
Keywords 検索（title/abstract 指定なし）で広めに取得し、アプリ内ツールで絞り込む。

## 検索クエリ

### Q1: メインクエリ
```
decompilation OR decompiler OR decompiling OR "reverse compilation" OR "reverse compiler"
```

Springer は 1000 件が上限のため、年代で分割して検索。

### Q2: 補完クエリ
```
("source code recovery" OR "source recovery" OR "binary-to-source" OR "binary to source"
 OR "binary lifting" OR "instruction lifting" OR "lifting to IR" OR "lifting to LLVM"
 OR "assembly-to-C" OR "assembly to C" OR "program reconstruction")
AND
("binary code" OR "machine code" OR "assembly code" OR executable
 OR disassembly OR disassembler OR bytecode OR "binary analysis" OR "stripped binary")
```

## 共通フィルタ

- Language: English
- Discipline: Computer Science, Engineering
- Sort: Relevance

## ファイル一覧

| ファイル | クエリ | 期間 | 件数 | 検索日 | 検索URL |
|---------|--------|------|------|--------|---------|
| `Springer_Q1_to2019.csv` | Q1 | 〜2019 | 813 | 2026-02-18 | [link](https://link.springer.com/search?query=decompilation+OR+decompiler+OR+decompiling+OR+%22reverse+compilation%22+OR+%22reverse+compiler%22&advancedSearch=true&date=custom&dateFrom=&dateTo=2019&language=En&facet-discipline=%22Computer+Science%22&facet-discipline=%22Engineering%22&sortBy=relevance) |
| `Springer_Q1_2020on.csv` | Q1 | 2020〜2026 | 531 | 2026-02-18 | [link](https://link.springer.com/search?query=decompilation+OR+decompiler+OR+decompiling+OR+%22reverse+compilation%22+OR+%22reverse+compiler%22&advancedSearch=true&date=custom&dateFrom=2020&dateTo=2026&language=En&facet-discipline=%22Computer+Science%22&facet-discipline=%22Engineering%22&sortBy=relevance) |
| `Springer_Q2.csv` | Q2 | 全期間 | 73 | 2026-02-18 | [link](https://link.springer.com/search?query=%28%22source+code+recovery%22+OR+%22source+recovery%22+OR+%22binary-to-source%22+OR+%22binary+to+source%22+OR+%22binary+lifting%22+OR+%22instruction+lifting%22+OR+%22lifting+to+IR%22+OR+%22lifting+to+LLVM%22+OR+%22assembly-to-C%22+OR+%22assembly+to+C%22+OR+%22program+reconstruction%22%29+AND+%28%22binary+code%22+OR+%22machine+code%22+OR+%22assembly+code%22+OR+executable+OR+disassembly+OR+disassembler+OR+bytecode+OR+%22binary+analysis%22+OR+%22stripped+binary%22%29&advancedSearch=true&dateFrom=&dateTo=&language=En&facet-discipline=%22Computer+Science%22&facet-discipline=%22Engineering%22&sortBy=relevance) |

## BibTeX 変換結果

CSV → `springer_csv_to_bibtex.py` → BibTeX（Crossref API + Springer ページスクレイプで abstract 取得）。

| ファイル | 元CSV | エントリ数 | abstract あり | 備考 |
|---------|-------|----------|-------------|------|
| `Springer_Q1.bib` | Q1_to2019 + Q1_2020on | 1,313 | 1,313 (100%) | abstract なし 33件を排除済み |
| `Springer_Q2.bib` | Q2 | 74 | 74 (100%) | |
| `Springer_Q1_no_abstract.bib` | — | 33 | 0 | 排除分（辞書エントリ・Editorial・書籍等。Crossref/Springer 両方に abstract なし） |

### 集計

| 段階 | Q1 | Q2 | 合計 |
|------|----|----|------|
| CSV 取得件数 | 1,344 (813 + 531) | 73 | 1,417 |
| BibTeX 変換 | 1,346* | 74 | 1,420 |
| abstract なし排除 | -33 | 0 | -33 |
| **最終 BibTeX** | **1,313** | **74** | **1,387** |

\* CSV ヘッダ含みや空行差分で微差あり

## 変換手順

```bash
# Q1（2つのCSVを結合して変換）
cat imports/Springer/Springer_Q1_to2019.csv <(echo) <(tail -n +2 imports/Springer/Springer_Q1_2020on.csv) > /tmp/combined.csv
python3 scripts/bibtex_fetcher/springer_csv_to_bibtex.py --input /tmp/combined.csv --output imports/Springer/Springer_Q1.bib

# Q2
python3 scripts/bibtex_fetcher/springer_csv_to_bibtex.py --input imports/Springer/Springer_Q2.csv --output imports/Springer/Springer_Q2.bib
```

Crossref API + Springer ページスクレイプで abstract を自動取得する。
