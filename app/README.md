# Screening App

論文スクリーニングのためのWebアプリケーション。プロジェクト単位でパイプラインを構築し、DOI重複排除、AIスクリーニング、手動レビューなどを行う。

## 起動方法

```bash
cd app
./start.sh
```

ブラウザで http://localhost:5173 を開く。

### 個別起動

```bash
# バックエンドのみ
cd app/backend
uv run uvicorn main:app --reload --port 8000

# フロントエンドのみ
cd app/frontend
npm run dev
```

## アーキテクチャ

### プロジェクト中心設計

各プロジェクトは独立したスクリーニングワークフローを持つ。

```
projects/
└── {project_id}/
    ├── project.json          # プロジェクトメタデータ
    ├── pipeline.json         # パイプライン定義
    ├── sources/              # 入力BibTeXファイル
    │   ├── meta.json
    │   ├── databases/        # 学術DB検索結果
    │   └── other/            # その他
    └── steps/                # ステップ実行結果
        └── {step_id}/
            ├── meta.json     # ステップメタデータ
            ├── changes.jsonl # 各エントリの変更履歴
            └── outputs/      # 出力BibTeXファイル
                ├── passed.bib
                └── duplicates.bib
```

### パイプラインステップ

各ステップは入力を受け取り、複数の出力（passed/removed等）を生成する。

```json
{
  "steps": [
    {
      "id": "dedup_doi",
      "type": "dedup-doi",
      "name": "DOI Deduplication",
      "enabled": true,
      "input_from": "sources",
      "config": {}
    }
  ]
}
```

## 機能

### 1. Projects（プロジェクト管理）

スクリーニングプロジェクトを作成・管理する。

**機能:**
- プロジェクト一覧表示
- 新規プロジェクト作成
- プロジェクト詳細（ソース、パイプライン、ステップ状態）
- ダークモード対応

### 2. Sources（ソース管理）

BibTeXファイルをプロジェクトに追加する。

**機能:**
- macOS Finderでファイル選択
- データベース別カテゴリ分け（databases / other）
- エントリ数の自動カウント

### 3. Pipeline（パイプライン）

スクリーニングステップを定義・実行する。

**ステップタイプ:**
- `dedup-doi`: DOI重複排除（DOIがないエントリは保持）

**計画中:**
- `normalize`: 正規化による重複排除
- `title-similarity`: タイトル類似度
- `ai-screening`: AIスクリーニング
- `venue-filter`: 会議/ジャーナル絞り込み

### 4. Step Detail（ステップ詳細）

各ステップの実行結果を詳細表示する。

**機能:**
- Input/Output切り替えタブ
- 論文一覧テーブル（展開で詳細表示）
- 検索（タイトル、著者、DOI）
- フィルタリング
- ページネーション
- 変更理由・アクションの表示

## ディレクトリ構成

```
app/
├── README.md
├── start.sh                    # 起動スクリプト
├── backend/                    # FastAPI バックエンド
│   ├── main.py
│   ├── pyproject.toml
│   ├── models/                 # Pydanticモデル
│   │   ├── project.py
│   │   ├── pipeline.py
│   │   └── step.py
│   ├── routers/                # APIルーター
│   │   ├── projects.py
│   │   ├── pipeline.py
│   │   ├── steps.py
│   │   ├── sources.py
│   │   └── step_types.py
│   └── step_handlers/          # ステップハンドラー
│       ├── base.py             # 基底クラス
│       └── dedup_doi.py        # DOI重複排除
└── frontend/                   # React フロントエンド
    ├── package.json
    └── src/
        ├── App.tsx
        ├── lib/
        │   ├── api.ts          # API関数
        │   ├── theme.tsx       # テーマ（ダークモード）
        │   └── utils.ts
        ├── components/
        │   ├── Layout.tsx
        │   ├── ui/             # 汎用UIコンポーネント
        │   │   ├── Badge.tsx
        │   │   ├── Button.tsx
        │   │   ├── Card.tsx
        │   │   └── Input.tsx
        │   └── papers/         # 論文表示コンポーネント
        │       ├── PaperTable.tsx
        │       ├── SearchFilter.tsx
        │       ├── Pagination.tsx
        │       └── StepOutputViewer.tsx
        └── pages/
            ├── ProjectsPage.tsx
            ├── ProjectDetailPage.tsx
            ├── StepDetailPage.tsx
            └── StepTypesPage.tsx
```

## データ構造

### project.json

```json
{
  "id": "20260123_154129",
  "name": "Decompilation Survey",
  "description": "SLR for decompilation research",
  "created_at": "2026-01-23T15:41:29",
  "updated_at": "2026-01-23T15:49:25"
}
```

### pipeline.json

```json
{
  "version": "1.0",
  "steps": [
    {
      "id": "dedup_doi",
      "type": "dedup-doi",
      "name": "DOI Deduplication",
      "enabled": true,
      "input_from": "sources",
      "config": {
        "case_sensitive": false,
        "keep_no_doi": true
      }
    }
  ],
  "final_output": { "step": "dedup_doi", "output": "passed" }
}
```

### steps/{step_id}/meta.json

```json
{
  "step_id": "dedup_doi",
  "step_type": "dedup-doi",
  "name": "DOI Deduplication",
  "input": {
    "from": "sources",
    "output": "combined",
    "file": "sources",
    "count": 43
  },
  "outputs": {
    "passed": {
      "file": "steps/dedup_doi/outputs/passed.bib",
      "count": 38,
      "description": "Unique entries"
    },
    "duplicates": {
      "file": "steps/dedup_doi/outputs/duplicates.bib",
      "count": 5,
      "description": "Duplicate entries"
    }
  },
  "stats": {
    "input_count": 43,
    "total_output_count": 43,
    "passed_count": 38,
    "removed_count": 5
  },
  "execution": {
    "status": "completed",
    "started_at": "2026-01-23T15:49:25",
    "completed_at": "2026-01-23T15:49:25",
    "duration_sec": 0.08
  }
}
```

### steps/{step_id}/changes.jsonl

各エントリの処理結果を記録。

```jsonl
{"key": "Chen2023", "action": "keep", "reason": "unique_doi", "details": {"doi": "10.1145/..."}}
{"key": "Wang2024", "action": "remove", "reason": "duplicate_doi", "details": {"doi": "10.1145/...", "original_key": "Chen2023"}}
{"key": "Li2022", "action": "keep", "reason": "no_doi", "details": {"message": "No DOI - kept"}}
```

## API エンドポイント

### Projects

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/projects` | プロジェクト一覧 |
| POST | `/api/projects` | プロジェクト作成 |
| GET | `/api/projects/{id}` | プロジェクト詳細 |
| PUT | `/api/projects/{id}` | プロジェクト更新 |
| DELETE | `/api/projects/{id}` | プロジェクト削除 |

### Sources

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/projects/{id}/sources` | ソース一覧 |
| POST | `/api/projects/{id}/sources/pick-file` | Finderでファイル選択 |
| POST | `/api/projects/{id}/sources/add-from-path` | ファイル追加 |
| DELETE | `/api/projects/{id}/sources/{category}/{filename}` | ファイル削除 |

### Pipeline

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/projects/{id}/pipeline` | パイプライン取得 |
| PUT | `/api/projects/{id}/pipeline` | パイプライン更新 |
| POST | `/api/projects/{id}/pipeline/steps` | ステップ追加 |
| DELETE | `/api/projects/{id}/pipeline/steps/{step_id}` | ステップ削除 |

### Steps

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/projects/{id}/steps` | ステップ一覧 |
| GET | `/api/projects/{id}/steps/{step_id}` | ステップ詳細 |
| POST | `/api/projects/{id}/steps/{step_id}/run` | ステップ実行 |
| POST | `/api/projects/{id}/steps/{step_id}/reset` | ステップリセット |
| GET | `/api/projects/{id}/steps/{step_id}/outputs/{name}` | 出力取得 |
| GET | `/api/projects/{id}/steps/{step_id}/changes` | 変更履歴取得 |

### Step Types

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/step-types` | 利用可能なステップタイプ一覧 |
| GET | `/api/step-types/{type}` | ステップタイプ詳細 |

## ステップハンドラーの実装

新しいステップタイプを追加するには:

```python
# step_handlers/my_step.py
from .base import StepHandler, StepResult, OutputDefinition, Change
from . import register_step_type

@register_step_type
class MyStepHandler(StepHandler):
    step_type = "my-step"
    name = "My Step"
    description = "Description of what this step does"
    icon = "IconName"  # Lucide icon name
    output_definitions = [
        OutputDefinition(name="passed", description="...", required=True),
        OutputDefinition(name="rejected", description="...", required=True),
    ]

    @classmethod
    def get_config_schema(cls) -> dict:
        return {
            "type": "object",
            "properties": {
                "option1": {"type": "boolean", "default": True}
            }
        }

    def run(self, input_entries: list[dict], config: dict) -> StepResult:
        passed, rejected, changes = [], [], []

        for entry in input_entries:
            # Process entry
            if should_pass(entry):
                passed.append(entry)
                changes.append(Change(key=entry["ID"], action="keep", reason="..."))
            else:
                rejected.append(entry)
                changes.append(Change(key=entry["ID"], action="remove", reason="..."))

        return StepResult(
            outputs={"passed": passed, "rejected": rejected},
            changes=changes,
        )
```

## 技術スタック

**バックエンド:**
- Python 3.11+
- FastAPI
- Pydantic v2
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

---

## 旧機能（Legacy）

以下は旧バージョンの機能です。新しいプロジェクトベースの機能に移行予定です。

### Reviews（レビュー）

`runs/` ディレクトリのスクリーニング結果を閲覧・レビューする。

### Imports（インポート閲覧）

`imports/` ディレクトリのBibTeXファイルを閲覧する。

### Run Screening（スクリーニング実行）

アプリ内から `screen.py` を実行する。
