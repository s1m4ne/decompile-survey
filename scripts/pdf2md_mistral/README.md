# PDF to Markdown (Mistral OCR)

Mistral OCR 3を使用してPDFをMarkdownに変換するスクリプト。画像も抽出・保存される。

## セットアップ

1. 依存関係をインストール

```bash
pip install mistralai python-dotenv
```

2. `.env`ファイルにAPIキーを設定

```
MISTRAL_API_KEY=your_api_key_here
```

APIキーは https://console.mistral.ai/ から取得できます。

## 使い方

```bash
# 基本（出力は入力ファイルと同じ場所に .md として保存）
python3 parse_pdf.py paper.pdf

# 出力先を指定
python3 parse_pdf.py paper.pdf output/paper.md
```

## 出力

- Markdownファイル（`.md`）
- 画像ファイル（`img-*.jpeg`）- PDFから抽出された画像は同じディレクトリに保存

```
output/
├── paper.md
├── img-0.jpeg
├── img-1.jpeg
└── ...
```

## 制限事項

- ファイルサイズ: 最大50MB
- ページ数: 最大1,000ページ
- 料金: $1 / 1,000ページ
