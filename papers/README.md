# papers/

論文PDFとMarkdown、BibTeXを管理するディレクトリ。

## ディレクトリ構成

```
papers/
├── survey/              # 参考にするサーベイ論文
│   └── {論文名}_{会議}{年}/
│       ├── *.pdf        # ダウンロードしたまま（リネーム不要）
│       ├── paper.md     # LlamaParseで変換
│       └── paper.bib    # BibTeX
└── decompile/           # サーベイ対象のデコンパイル論文
    └── {論文名}_{会議}{年}/
        ├── *.pdf
        ├── paper.md
        └── paper.bib
```

## フォルダ命名規則

```
{論文名}_{会議}{年}
```

### 例
- `Coda_NeurIPS2019/`
- `DeGPT_NDSS2024/`
- `LLM4Decompile_EMNLP2024/`
- `SomePreprint_arXiv2024/`

### ルール
- スペース → なし or アンダースコア
- 長いタイトル → 短縮形でOK
- arXiv論文は `_arXiv{年}`

## ファイル命名規則

| ファイル | 命名 | 備考 |
|---------|------|------|
| PDF | そのまま | ダウンロード時のファイル名でOK |
| Markdown | `paper.md` | LlamaParseで変換 |
| BibTeX | `paper.bib` | Zoteroからエクスポート等 |

## 使い方

### 新しい論文を追加
1. `papers/{survey or decompile}/` にフォルダ作成
2. PDFを配置
3. `scripts/llamaparse/parse_pdf.py` でMarkdown変換
4. BibTeXを追加

### AI/Claude Codeでの参照
- 1フォルダ = 1論文で完結
- 「Coda論文について教えて」→ `papers/decompile/Coda_NeurIPS2019/` を読む

### AI/Claude Code向けルール
- **BibTeX**: 自動生成しない（精度が保証できないため、ユーザーが用意する）
- **notes.md**: 指示がない限り生成しない
