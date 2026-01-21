# screening/

LLMを使った論文スクリーニングを管理するディレクトリ。

## ディレクトリ構成

```
screening/
├── README.md
├── history.csv          # 実行履歴
├── scripts/
│   └── screen.py        # スクリーニングスクリプト
└── runs/
    └── {YYYY-MM-DD_HHMM}/
        ├── rules.md         # スクリーニング基準
        ├── input.bib        # 入力BibTeX
        ├── decisions.jsonl  # 判定結果（JSON）
        ├── decisions.csv    # 判定結果（CSV）
        ├── included.bib     # 採択論文
        ├── excluded.bib     # 除外論文
        └── uncertain.bib    # 要確認論文
```

## セットアップ

リポジトリルートの`.env`にAPIキーを設定

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

## 使い方

```bash
uv run python screening/scripts/screen.py --input papers.bib --rules rules.md
```

オプション:
- `--input`, `-i`: 入力BibTeXファイル（必須）
- `--rules`, `-r`: スクリーニング基準ファイル（必須）
- `--model`, `-m`: 使用するモデル（デフォルト: gpt-4o-mini）
- `--output-dir`, `-o`: 出力ディレクトリ（省略時は自動生成）
- `--concurrency`, `-c`: 並列実行数（デフォルト: 10）

## runs/ の各ファイル

| ファイル | 説明 |
|---------|------|
| `rules.md` | この実行で使用したスクリーニング基準 |
| `input.bib` | スクリーニング対象のBibTeX |
| `decisions.jsonl` | 各論文の判定結果（スクリプト処理用） |
| `decisions.csv` | 各論文の判定結果（Excel/手動確認用） |
| `included.bib` | 採択した論文のBibTeX |
| `excluded.bib` | 除外した論文のBibTeX |
| `uncertain.bib` | 要確認の論文のBibTeX |

## history.csv

全実行の履歴を記録。

| カラム | 説明 |
|--------|------|
| run_id | 実行ID（ディレクトリ名） |
| date | 実行日 |
| model | 使用したLLMモデル |
| total | 入力論文数 |
| included | 採択数 |
| excluded | 除外数 |
| uncertain | 要確認数 |
| notes | 備考 |

## ルールファイル

`rules/` ディレクトリにスクリーニング基準を保存。

### decompile_v1.md

機械学習を用いたデコンパイル研究のスクリーニング基準（初版）。

**採択条件:**
- 機械学習/深層学習を使用
- 入力がbinary/assembly/decompiler output
- 出力がソースコード（高級言語）またはデコンパイル擬似コードの修復

**除外条件:**
- matching/retrieval、identification、SCA、summarization
- vulnerability detection、patch detection、verification
- IR-only（中間表現止まり）

### decompile_v2.md

v1の改訂版。より詳細な判定ガイドラインを追加。

**主な変更点:**
- 「デコンパイルが手段として使われるだけ」のケースを明確に除外
- 判定ガイドを追加（評価指標がF1/AUC中心なら除外など）
- 境界例の取り扱いルールを追加
- 論文タイプ（ベンチマーク、サーベイ等）の除外条件を追加

## 実行履歴

### 2026-01-21_2339
テスト実行。`imports/arXiv/arXiv_decompil_20260115_2350.bib`（arXivのdecompil*検索結果、55件）を使用。小規模なデータセットでスクリプトの動作確認を行った。

### 2026-01-22_0032
テスト実行。`imports/IEEE/IEEE_source-recovery_20260116_0000.bib`（IEEE source-recovery検索結果、24件）を使用。`rules/decompile_v1.md`を適用し、全て除外された。source-recoveryクエリの結果はデコンパイル研究には該当しないものが多いことを確認。

### 2026-01-22_0125
テスト実行。`imports/arXiv/arXiv_decompil_20260115_1917.bib`（arXivのdecompil*検索結果）を使用。includedが多く含まれるデータで正しく分類できるかを確認。結果：除外判定は全て正しかったが、included判定のうち12件は本来除外すべきものだった。この結果を受けてルールをv2に改訂。

### 2026-01-22_0146
`rules/decompile_v2.md`を適用して再実行。同じ入力（`imports/arXiv/arXiv_decompil_20260115_1917.bib`）で検証。誤判定の件数は減少したが、まだ完璧ではない。継続的なルール改善が必要。
