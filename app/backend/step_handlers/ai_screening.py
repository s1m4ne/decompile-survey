"""
AI-based screening step handler.

Uses LLM to screen papers based on rules.
"""

import asyncio
import json
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

from openai import AsyncOpenAI

from .base import StepHandler, StepResult, OutputDefinition, Change
from . import register_step_type

# Local LLM server settings
LOCAL_LLM_BASE_URL = os.getenv("LOCAL_LLM_BASE_URL", "http://192.168.50.100:8000/v1")

# Default concurrency
OPENAI_CONCURRENCY = 10
LOCAL_CONCURRENCY = 100
OPENAI_DEFAULT_MODEL = "gpt-5-nano-2025-08-07"
LOCAL_DEFAULT_MODEL = "openai/gpt-oss-120b"

# Rules directory
RULES_DIR = Path(__file__).parent.parent.parent.parent / "screening" / "rules"


def get_available_rules() -> list[dict]:
    """Get list of available rule files."""
    rules = []
    if RULES_DIR.exists():
        for rule_file in sorted(RULES_DIR.glob("*.md")):
            rules.append({
                "id": rule_file.stem,
                "filename": rule_file.name,
                "path": str(rule_file),
            })
    return rules


def load_rules(rules_id: str) -> str:
    """Load rules content from file."""
    rules_file = RULES_DIR / f"{rules_id}.md"
    if not rules_file.exists():
        raise ValueError(f"Rules file not found: {rules_id}")
    with open(rules_file, encoding="utf-8") as f:
        return f.read()


async def screen_paper(
    client: AsyncOpenAI,
    model: str,
    rules: str,
    entry: dict,
    semaphore: asyncio.Semaphore,
) -> dict:
    """Screen a single paper using LLM."""
    entry_key = entry.get("ID", "unknown")
    title = entry.get("title", "").replace("{", "").replace("}", "")
    abstract = entry.get("abstract", "")
    author = entry.get("author", "")
    year = entry.get("year", "")

    # No abstract -> uncertain
    if not abstract:
        return {
            "key": entry_key,
            "decision": "uncertain",
            "confidence": 0.0,
            "reason": "No abstract available",
            "tokens_used": 0,
            "latency_ms": 0,
        }

    prompt = f"""あなたは学術論文のスクリーニングを行うアシスタントです。
以下のスクリーニング基準に基づいて、論文を判定してください。

## スクリーニング基準
{rules}

## 論文情報
タイトル: {title}
著者: {author}
年: {year}
アブストラクト: {abstract}

## 出力形式
以下のJSON形式で出力してください。他の文字は含めないでください。
{{
    "decision": "include" または "exclude" または "uncertain",
    "confidence": 0.0〜1.0の数値,
    "reason": "判定理由（日本語で簡潔に）"
}}
"""

    start_time = time.time()

    async with semaphore:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )

            latency_ms = int((time.time() - start_time) * 1000)
            tokens_used = response.usage.total_tokens if response.usage else 0

            # Validate response structure
            if not response.choices:
                raise ValueError("Empty choices in response")
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Empty content in response")

            # Parse JSON response
            try:
                result = json.loads(content)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON response: {e}")

            return {
                "key": entry_key,
                "decision": result.get("decision", "uncertain"),
                "confidence": result.get("confidence", 0.5),
                "reason": result.get("reason", ""),
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
            }

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            return {
                "key": entry_key,
                "decision": "uncertain",
                "confidence": 0.0,
                "reason": f"API error: {str(e)}",
                "tokens_used": 0,
                "latency_ms": latency_ms,
            }


async def screen_papers_async(
    entries: list[dict],
    rules: str,
    model: str,
    provider: str,
    concurrency: int,
    local_base_url: str | None = None,
    progress_callback=None,
) -> list[dict]:
    """Screen multiple papers in parallel."""
    # Setup client
    if provider == "local":
        base_url = local_base_url or LOCAL_LLM_BASE_URL
        client = AsyncOpenAI(
            base_url=base_url,
            api_key="dummy",
        )
    else:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        client = AsyncOpenAI(api_key=api_key)

    semaphore = asyncio.Semaphore(concurrency)
    results = []
    completed = 0

    async def process_entry(entry: dict) -> dict:
        nonlocal completed
        result = await screen_paper(client, model, rules, entry, semaphore)
        completed += 1
        if progress_callback:
            progress_callback(completed, len(entries))
        return result

    tasks = [process_entry(entry) for entry in entries]
    results = await asyncio.gather(*tasks)

    return results


@register_step_type
class AIScreeningHandler(StepHandler):
    """Screen papers using AI/LLM."""

    step_type = "ai-screening"
    name = "AI Screening"
    description = "Screen papers using LLM based on custom rules"
    icon = "Brain"
    output_definitions = [
        OutputDefinition(
            name="passed",
            description="Papers judged as 'include' by AI",
            required=True,
        ),
        OutputDefinition(
            name="excluded",
            description="Papers judged as 'exclude' by AI",
            required=True,
        ),
        OutputDefinition(
            name="uncertain",
            description="Papers judged as 'uncertain' or failed to process",
            required=True,
        ),
    ]

    @classmethod
    def get_config_schema(cls) -> dict:
        # Get available rules for enum
        rules = get_available_rules()
        rule_ids = [r["id"] for r in rules] if rules else ["decompile_v4"]

        provider_defaults = {
            "local": {
                "model": LOCAL_DEFAULT_MODEL,
                "concurrency": LOCAL_CONCURRENCY,
            },
            "openai": {
                "model": OPENAI_DEFAULT_MODEL,
                "concurrency": OPENAI_CONCURRENCY,
            },
        }
        provider_models = {
            "local": [LOCAL_DEFAULT_MODEL],
            "openai": [OPENAI_DEFAULT_MODEL],
        }

        return {
            "type": "object",
            "properties": {
                "rules": {
                    "type": "string",
                    "enum": rule_ids,
                    "default": rule_ids[-1] if rule_ids else "decompile_v4",
                    "description": "Screening rules file",
                },
                "model": {
                    "type": "string",
                    "enum": [LOCAL_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL],
                    "default": LOCAL_DEFAULT_MODEL,
                    "description": "LLM model to use",
                },
                "provider": {
                    "type": "string",
                    "enum": ["local", "openai"],
                    "default": "local",
                    "description": "API provider (openai or local LLM server)",
                },
                "concurrency": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 1000,
                    "default": LOCAL_CONCURRENCY,
                    "description": "Number of parallel API requests",
                },
                "output_mode": {
                    "type": "string",
                    "enum": ["ai", "human"],
                    "default": "ai",
                    "description": "Output mode for downstream steps",
                },
                "local_base_url": {
                    "type": "string",
                    "default": LOCAL_LLM_BASE_URL,
                    "description": "Base URL for local LLM server (used when provider=local)",
                },
            },
            "x-provider-defaults": provider_defaults,
            "x-provider-models": provider_models,
            "required": ["rules"],
        }

    def run(self, input_entries: list[dict], config: dict) -> StepResult:
        """Run AI screening on input entries."""
        rules_id = config.get("rules", "decompile_v4")
        provider = config.get("provider", "local")
        local_base_url = config.get("local_base_url")

        if provider == "openai":
            model = config.get("model") or OPENAI_DEFAULT_MODEL
            if model.startswith("openai/"):
                model = model.split("/", 1)[1]
        else:
            model = config.get("model") or LOCAL_DEFAULT_MODEL
            if "/" not in model:
                model = f"openai/{model}"

        # Set concurrency based on provider
        if provider == "local":
            concurrency = config.get("concurrency", LOCAL_CONCURRENCY)
        else:
            concurrency = config.get("concurrency", OPENAI_CONCURRENCY)

        # Load rules
        rules = load_rules(rules_id)

        # Run async screening
        # Handle case where event loop may already be running (e.g., in FastAPI)
        coro = screen_papers_async(
            entries=input_entries,
            rules=rules,
            model=model,
            provider=provider,
            concurrency=concurrency,
            local_base_url=local_base_url if provider == "local" else None,
        )
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # Already in async context - create new loop in thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                results = future.result()
        else:
            results = asyncio.run(coro)

        # Categorize results
        passed = []
        excluded = []
        uncertain = []
        changes = []

        # Create lookup for entries
        entry_map = {e.get("ID", ""): e for e in input_entries}

        total_tokens = 0
        total_latency = 0
        skipped_keys = []

        for result in results:
            key = result["key"]
            entry = entry_map.get(key)
            if not entry:
                skipped_keys.append(key)
                continue

            decision = result["decision"]
            total_tokens += result.get("tokens_used", 0)
            total_latency += result.get("latency_ms", 0)

            if decision == "include":
                passed.append(entry)
                action = "keep"
            elif decision == "exclude":
                excluded.append(entry)
                action = "remove"
            else:
                uncertain.append(entry)
                action = "keep"  # uncertain goes to uncertain output but action is "keep"

            changes.append(
                Change(
                    key=key,
                    action=action,
                    reason=f"ai_{decision}",
                    details={
                        "decision": decision,
                        "confidence": result.get("confidence", 0),
                        "reasoning": result.get("reason", ""),
                        "model": model,
                        "tokens_used": result.get("tokens_used", 0),
                        "latency_ms": result.get("latency_ms", 0),
                    },
                )
            )

        # Log warning if any results were skipped due to ID mismatch
        if skipped_keys:
            logger.warning(
                f"Skipped {len(skipped_keys)} results due to ID mismatch: {skipped_keys[:5]}"
                + (f" (and {len(skipped_keys) - 5} more)" if len(skipped_keys) > 5 else "")
            )

        return StepResult(
            outputs={
                "passed": passed,
                "excluded": excluded,
                "uncertain": uncertain,
            },
            changes=changes,
            details={
                "total_input": len(input_entries),
                "passed_count": len(passed),
                "excluded_count": len(excluded),
                "uncertain_count": len(uncertain),
                "skipped_count": len(skipped_keys),
                "model": model,
                "provider": provider,
                "concurrency": concurrency,
                "total_tokens": total_tokens,
                "total_latency_ms": total_latency,
                "rules_id": rules_id,
            },
        )
