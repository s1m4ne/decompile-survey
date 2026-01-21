# LlamaParse PDF to Markdown

PDFをMarkdownに変換するスクリプト。

## セットアップ

1. 依存関係をインストール
```bash
pip install -r requirements.txt
```

2. APIキーを設定
   - https://cloud.llamaindex.ai/ でアカウント作成
   - APIキーを取得
   - `.env` ファイルにAPIキーを貼り付け

```bash
# .env
LLAMA_CLOUD_API_KEY=llx-xxxxxxxxxxxxxxxx
```

## 使い方

```bash
# 基本
python parse_pdf.py paper.pdf

# 出力ファイル指定
python parse_pdf.py paper.pdf output.md
```

## 無料枠

- 10,000クレジット/月
- Cost-effectiveモード: 約3,300ページ/月
