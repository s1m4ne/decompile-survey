# scripts/

文献収集・処理用のスクリプトを格納するディレクトリ。

## サブディレクトリ

### bibtex_fetcher/

arXiv APIからBibTeXを取得するスクリプト。

```bash
python3 arxiv_fetch.py \
  --query '(ti:"decompil*" OR abs:"decompil*")' \
  --page-size 100 --max-pages 2
```

詳細: [bibtex_fetcher/README.md](bibtex_fetcher/README.md)

### pdf2md_llamaparse/

LlamaParseを使用してPDFをMarkdownに変換するスクリプト。

```bash
python3 parse_pdf.py paper.pdf
```

詳細: [pdf2md_llamaparse/README.md](pdf2md_llamaparse/README.md)

### pdf2md_mistral/

Mistral OCR 3を使用してPDFをMarkdownに変換するスクリプト。画像も抽出・保存される。

```bash
python3 parse_pdf.py paper.pdf
```

詳細: [pdf2md_mistral/README.md](pdf2md_mistral/README.md)
