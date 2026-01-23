"""
LLM API - Local LLM connectivity checks.
"""

from fastapi import APIRouter
from pydantic import BaseModel
import httpx

router = APIRouter(prefix="/llm", tags=["llm"])


class LocalLLMCheckRequest(BaseModel):
    """Request body for local LLM connectivity check."""
    base_url: str


def build_models_url(base_url: str) -> str:
    """Build a models endpoint URL from a base URL."""
    cleaned = base_url.rstrip("/")
    if cleaned.endswith("/v1"):
        return f"{cleaned}/models"
    return f"{cleaned}/v1/models"


@router.post("/check-local")
async def check_local_server(request: LocalLLMCheckRequest):
    """Check connectivity to a local LLM server (OpenAI-compatible)."""
    models_url = build_models_url(request.base_url)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(models_url)

        if response.status_code != 200:
            return {
                "connected": False,
                "url": request.base_url,
                "models": [],
                "error": f"HTTP {response.status_code}",
            }

        data = response.json()
        models = []
        if isinstance(data, dict) and "data" in data:
            for model in data["data"]:
                models.append(
                    {
                        "id": model.get("id", "unknown"),
                        "owned_by": model.get("owned_by", "unknown"),
                    }
                )

        return {
            "connected": True,
            "url": request.base_url,
            "models": models,
            "error": None,
        }
    except httpx.TimeoutException:
        return {
            "connected": False,
            "url": request.base_url,
            "models": [],
            "error": "接続タイムアウト（VPN接続を確認してください）",
        }
    except httpx.ConnectError:
        return {
            "connected": False,
            "url": request.base_url,
            "models": [],
            "error": "接続できません（VPN接続を確認してください）",
        }
    except Exception as e:
        return {
            "connected": False,
            "url": request.base_url,
            "models": [],
            "error": str(e),
        }
