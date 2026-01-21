# PDF to Markdown (LlamaParse)

LlamaParseを使用してPDFをMarkdownに変換するスクリプト。

## セットアップ

1. 依存関係をインストール

```bash
pip install -r requirements.txt
```

2. APIキーを設定
   - https://cloud.llamaindex.ai/ でアカウント作成
   - APIキーを取得
   - `.env` ファイルにAPIキーを貼り付け

```
LLAMA_CLOUD_API_KEY=llx-xxxxxxxxxxxxxxxx
```

## 使い方

```bash
# 基本（出力は入力ファイルと同じ場所に .md として保存）
python3 parse_pdf.py paper.pdf

# 出力ファイル指定
python3 parse_pdf.py paper.pdf output.md
```

## 無料枠

- 10,000クレジット/月
- Cost-effectiveモード: 約3,300ページ/月
