# Screening App

論文スクリーニングのためのWebアプリケーション。AIによる自動スクリーニング結果のレビュー、手動修正、BibTeX閲覧などを行う。

## 起動方法

```bash
cd screening/app
./start.sh
```

ブラウザで http://localhost:5173 を開く。

### 個別起動

```bash
# バックエンドのみ
cd screening/app/backend
uv run uvicorn main:app --reload --port 8000

# フロントエンドのみ
cd screening/app/frontend
npm run dev
```

## 機能

### 1. Reviews（レビュー）

`runs/` ディレクトリのスクリーニング結果を閲覧・レビューする。

**機能:**
- AI判定結果の確認（include / exclude / uncertain）
- AI判定理由の表示
- 手動で分類を変更（AIの結果は保持したまま）
- チェック済みフラグの設定
- 論文ごとにメモを追加
- 複数選択して一括操作
- フィルタリング（判定結果、チェック状態）
- キーワード検索（タイトル、著者、アブストラクト）
- 進捗バー表示
- スクリーニングルールの表示

**データの保存先:**
- AI判定結果: `runs/{run_id}/decisions.jsonl`（読み取りのみ）
- 手動レビュー: `reviews/{run_id}/review.json`（読み書き）

### 2. Imports（インポート閲覧）

`imports/` ディレクトリのBibTeXファイルを閲覧する。

**機能:**
- データベース別にBibTeXファイルを一覧表示
- 論文一覧の表示
- 論文詳細（タイトル、著者、年、アブストラクト）
- 外部リンク（DOI、arXiv等）
- キーワード検索

### 3. Run Screening（スクリーニング実行）

アプリ内から `screen.py` を実行する。

**設定項目:**
- 入力ファイル: `imports/` 内のBibTeXファイル
- ルールファイル: `rules/` 内のMarkdownファイル
- モデル: gpt-4o-mini（デフォルト）、gpt-4o など
- 並列数: 同時API呼び出し数（デフォルト: 10）

## ディレクトリ構成

```
screening/app/
├── README.md
├── start.sh              # 起動スクリプト
├── backend/              # FastAPI バックエンド
│   ├── main.py           # エントリーポイント
│   ├── pyproject.toml    # Python依存関係
│   └── routers/
│       ├── runs.py       # runs/ API
│       ├── imports.py    # imports/ API
│       ├── reviews.py    # レビュー API
│       └── screening.py  # スクリーニング実行 API
└── frontend/             # React フロントエンド
    ├── package.json
    └── src/
        ├── components/   # UIコンポーネント
        ├── pages/        # ページ
        └── lib/          # API・ユーティリティ
```

## データ構造

### reviews/{run_id}/review.json

手動レビューデータの保存形式。

```json
{
  "meta": {
    "run_id": "2026-01-22_0146",
    "source_rules": "デコンパイル研究 v2",
    "created_at": "2026-01-22T10:00:00",
    "updated_at": "2026-01-22T12:30:00",
    "stats": {
      "total": 100,
      "checked": 45,
      "modified": 5
    }
  },
  "papers": {
    "Chen2023Decompiling": {
      "ai_decision": "include",
      "ai_confidence": 0.85,
      "ai_reason": "LLMを使用してbinaryからCコードを生成...",
      "manual_decision": null,
      "checked": true,
      "note": ""
    },
    "Wang2024Binary": {
      "ai_decision": "include",
      "ai_confidence": 0.78,
      "ai_reason": "Transformerでassemblyからソースコード復元...",
      "manual_decision": "exclude",
      "checked": true,
      "note": "よく読むとvulnerability detection目的"
    }
  }
}
```

**フィールド説明:**

| フィールド | 説明 | 編集 |
|-----------|------|------|
| `ai_decision` | AIの判定結果 | 不可 |
| `ai_confidence` | AIの確信度 (0-1) | 不可 |
| `ai_reason` | AIの判定理由 | 不可 |
| `manual_decision` | 手動修正後の判定（nullならAI採用） | 可 |
| `checked` | 確認済みフラグ | 可 |
| `note` | メモ | 可 |

**最終判定の決定:**
```
final_decision = manual_decision ?? ai_decision
```

## API エンドポイント

### Runs

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/runs` | run一覧を取得 |
| GET | `/api/runs/{run_id}` | run詳細（論文一覧含む）を取得 |
| GET | `/api/runs/{run_id}/rules` | ルールファイルを取得 |

### Imports

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/imports` | データベース・ファイル一覧を取得 |
| GET | `/api/imports/{database}/{filename}` | BibTeXファイルの内容を取得 |

### Reviews

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/reviews/{run_id}` | レビューを取得（なければ初期化） |
| PUT | `/api/reviews/{run_id}/papers/{citation_key}` | 論文のレビューを更新 |
| POST | `/api/reviews/{run_id}/bulk-update` | 複数論文を一括更新 |
| GET | `/api/reviews/{run_id}/export` | レビュー結果をエクスポート |

### Screening

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/screening/rules` | 利用可能なルール一覧 |
| GET | `/api/screening/inputs` | 利用可能な入力ファイル一覧 |
| POST | `/api/screening/run` | スクリーニングを実行 |

## 技術スタック

**バックエンド:**
- Python 3.11+
- FastAPI
- bibtexparser
- uvicorn

**フロントエンド:**
- React 18
- TypeScript
- Vite
- TailwindCSS
- React Router
- TanStack Query (React Query)
- Lucide Icons

## 開発

### バックエンド

```bash
cd backend
uv sync                    # 依存関係インストール
uv run uvicorn main:app --reload
```

### フロントエンド

```bash
cd frontend
npm install               # 依存関係インストール
npm run dev               # 開発サーバー起動
npm run build             # ビルド
```
