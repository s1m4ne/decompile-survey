"""
Screening API - スクリーニング実行
"""

import asyncio
import subprocess
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

router = APIRouter()

# ローカルLLMサーバー設定
LOCAL_LLM_BASE_URL = "http://192.168.50.100:8000"


@router.get("/check-local-server")
async def check_local_server():
    """ローカルLLMサーバーの接続確認"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{LOCAL_LLM_BASE_URL}/v1/models")

            if response.status_code == 200:
                data = response.json()
                models = []
                if "data" in data:
                    for model in data["data"]:
                        models.append({
                            "id": model.get("id", "unknown"),
                            "owned_by": model.get("owned_by", "unknown"),
                        })

                return {
                    "connected": True,
                    "url": LOCAL_LLM_BASE_URL,
                    "models": models,
                    "error": None,
                }
            else:
                return {
                    "connected": False,
                    "url": LOCAL_LLM_BASE_URL,
                    "models": [],
                    "error": f"HTTP {response.status_code}",
                }
    except httpx.TimeoutException:
        return {
            "connected": False,
            "url": LOCAL_LLM_BASE_URL,
            "models": [],
            "error": "接続タイムアウト（VPN接続を確認してください）",
        }
    except httpx.ConnectError:
        return {
            "connected": False,
            "url": LOCAL_LLM_BASE_URL,
            "models": [],
            "error": "接続できません（VPN接続を確認してください）",
        }
    except Exception as e:
        return {
            "connected": False,
            "url": LOCAL_LLM_BASE_URL,
            "models": [],
            "error": str(e),
        }


@router.post("/pick-file")
async def pick_file():
    """macOSのFinderでBibTeXファイルを選択"""
    # AppleScriptでファイル選択ダイアログを開く
    # System Eventsを使うことで、現在のデスクトップでダイアログを開く
    script = '''
    set theFile to choose file with prompt "BibTeXファイルを選択してください" of type {"bib"}
    return POSIX path of theFile
    '''

    try:
        process = await asyncio.create_subprocess_exec(
            "osascript", "-e", script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            # ユーザーがキャンセルした場合
            return {"path": None, "cancelled": True}

        file_path = stdout.decode("utf-8").strip()
        if not file_path:
            return {"path": None, "cancelled": True}

        # ファイルが存在するか確認
        if not Path(file_path).exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        return {"path": file_path, "cancelled": False}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# パス設定
REPO_ROOT = Path(__file__).parent.parent.parent.parent.parent
SCREENING_DIR = REPO_ROOT / "screening"
SCRIPTS_DIR = SCREENING_DIR / "scripts"
RULES_DIR = SCREENING_DIR / "rules"
IMPORTS_DIR = REPO_ROOT / "imports"


class ScreeningRequest(BaseModel):
    input_file: str  # imports/からの相対パス
    rules_file: str  # rules/からのファイル名
    model: str = "gpt-4o-mini"
    concurrency: int = 10
    provider: str = "openai"  # "openai" or "local"


class CreateRuleRequest(BaseModel):
    filename: str
    content: str


@router.get("/rules")
def list_rules():
    """利用可能なルールファイル一覧"""
    if not RULES_DIR.exists():
        return []

    rules = []
    for f in sorted(RULES_DIR.glob("*.md")):
        rules.append({
            "filename": f.name,
        })

    return rules


@router.get("/rules/{filename}")
def get_rule(filename: str):
    """ルールファイルの内容を取得"""
    rules_path = RULES_DIR / filename
    if not rules_path.exists():
        raise HTTPException(status_code=404, detail=f"Rules file not found: {filename}")

    with open(rules_path, encoding="utf-8") as f:
        return {"filename": filename, "content": f.read()}


@router.post("/rules")
def create_rule(request: CreateRuleRequest):
    """新しいルールファイルを作成"""
    # ファイル名の検証
    if not request.filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="Filename must end with .md")

    if "/" in request.filename or "\\" in request.filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    rules_path = RULES_DIR / request.filename
    if rules_path.exists():
        raise HTTPException(status_code=409, detail=f"Rule file already exists: {request.filename}")

    # ディレクトリが存在しない場合は作成
    RULES_DIR.mkdir(parents=True, exist_ok=True)

    # ファイルを作成
    with open(rules_path, "w", encoding="utf-8") as f:
        f.write(request.content)

    return {"filename": request.filename, "content": request.content}


@router.get("/inputs")
def list_inputs():
    """利用可能な入力BibTeXファイル一覧"""
    if not IMPORTS_DIR.exists():
        return []

    inputs = []
    for db_dir in sorted(IMPORTS_DIR.iterdir()):
        if db_dir.is_dir() and not db_dir.name.startswith("."):
            for bib_file in sorted(db_dir.glob("*.bib")):
                inputs.append({
                    "path": str(bib_file.relative_to(REPO_ROOT)),
                    "database": db_dir.name,
                    "filename": bib_file.name,
                })

    return inputs


@router.post("/run")
async def run_screening(request: ScreeningRequest):
    """スクリーニングを実行"""
    # 絶対パスか相対パスかを判定
    if request.input_file.startswith("/"):
        input_path = Path(request.input_file)
    else:
        input_path = REPO_ROOT / request.input_file
    rules_path = RULES_DIR / request.rules_file

    if not input_path.exists():
        raise HTTPException(status_code=404, detail=f"Input file not found: {request.input_file}")

    if not rules_path.exists():
        raise HTTPException(status_code=404, detail=f"Rules file not found: {request.rules_file}")

    # screen.pyを実行
    cmd = [
        sys.executable,
        str(SCRIPTS_DIR / "screen.py"),
        "--input", str(input_path),
        "--rules", str(rules_path),
        "--model", request.model,
        "--concurrency", str(request.concurrency),
        "--provider", request.provider,
    ]

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(REPO_ROOT),
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Screening failed: {stderr.decode('utf-8')}"
            )

        # 出力からrun_idを抽出
        output = stdout.decode("utf-8")
        run_id = None
        for line in output.split("\n"):
            if "Output directory:" in line:
                run_id = line.split("/")[-1].strip()
                break

        return {
            "status": "completed",
            "run_id": run_id,
            "output": output,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
