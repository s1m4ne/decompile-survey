# arXiv fetch utility

This directory contains a small script to query the arXiv API and emit BibTeX,
including abstracts and other metadata returned by the API.

Usage example (auto-named file):

```
python3 scripts/arxiv/arxiv_fetch.py \
  --query '(ti:"source recovery" OR abs:"source recovery") AND (cat:cs.CR)' \
  --page-size 5 --max-pages 1
```

Usage example (explicit output path):

```
python3 scripts/arxiv/arxiv_fetch.py \
  --query '(ti:"source recovery" OR abs:"source recovery") AND (cat:cs.CR)' \
  --output imports/arXiv/arXiv_decompil_20260115_1200.bib
```

Notes:
- Use the arXiv API `search_query` syntax.
- For large result sets, increase `--max-pages` and keep a small `--sleep`.
