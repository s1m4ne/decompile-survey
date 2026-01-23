"""
Rules API - List and read screening rules.
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/rules", tags=["rules"])

RULES_DIR = Path(__file__).parent.parent.parent.parent / "rules"


class RuleInfo(BaseModel):
    """Rule file information."""
    id: str
    filename: str
    path: str


class RuleContent(BaseModel):
    """Rule content."""
    id: str
    filename: str
    content: str


@router.get("")
def list_rules() -> list[RuleInfo]:
    """List available rule files."""
    rules = []
    if RULES_DIR.exists():
        for rule_file in sorted(RULES_DIR.glob("*.md")):
            rules.append(RuleInfo(
                id=rule_file.stem,
                filename=rule_file.name,
                path=str(rule_file),
            ))
    return rules


@router.get("/{rule_id}")
def get_rule(rule_id: str) -> RuleContent:
    """Get rule content by ID."""
    rule_file = RULES_DIR / f"{rule_id}.md"

    if not rule_file.exists():
        raise HTTPException(status_code=404, detail=f"Rule not found: {rule_id}")

    with open(rule_file, encoding="utf-8") as f:
        content = f.read()

    return RuleContent(
        id=rule_id,
        filename=rule_file.name,
        content=content,
    )
