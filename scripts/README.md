# scripts/

文献収集・処理用のスクリプトを格納するディレクトリ。

## サブディレクトリ

### arxiv/

arXiv APIからBibTeXを取得するスクリプト。

```bash
python arxiv_fetch.py \
  --query '(ti:"decompil*" OR abs:"decompil*")' \
  --page-size 100 --max-pages 2
```

詳細: [arxiv/README.md](arxiv/README.md)

### llamaparse/

LlamaParseを使用してPDFをMarkdownに変換するスクリプト。

```bash
python parse_pdf.py paper.pdf
```

詳細: [llamaparse/README.md](llamaparse/README.md)
