# PDF to Markdown (LlamaParse)

LlamaParseを使用してPDFをMarkdownに変換するスクリプト。

## セットアップ

1. リポジトリルートの`.env`にAPIキーを設定

```
LLAMA_CLOUD_API_KEY=llx-xxxxxxxxxxxxxxxx
```

APIキーは https://cloud.llamaindex.ai/ から取得できます。

## 使い方

```bash
# 基本（出力は入力ファイルと同じ場所に .md として保存）
uv run python scripts/pdf2md_llamaparse/parse_pdf.py paper.pdf

# 出力ファイル指定
uv run python scripts/pdf2md_llamaparse/parse_pdf.py paper.pdf output.md
```

## 料金

- 10,000クレジット/月（無料枠）
- Balancedモード: $3 / 1,000ページ
