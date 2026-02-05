"""
Rules API - List, read, and create screening rules.
"""

import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/rules", tags=["rules"])

RULES_DIR = Path(__file__).parent.parent.parent.parent / "screening" / "rules"


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


class RuleCreate(BaseModel):
    """Request to create a new rule."""
    filename: str
    content: str


class NextRuleFilename(BaseModel):
    """Suggested filename for a new rule."""
    suggested_filename: str


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


@router.get("/next-filename")
def get_next_filename() -> NextRuleFilename:
    """Get suggested filename for a new rule based on existing rules."""
    if not RULES_DIR.exists():
        return NextRuleFilename(suggested_filename="rules_v1.md")

    # Find the latest rule file and increment version
    max_version = 0
    base_name = "rules"
    version_pattern = re.compile(r"^(.+?)_v(\d+)")

    for rule_file in RULES_DIR.glob("*.md"):
        stem = rule_file.stem
        match = version_pattern.match(stem)
        if match:
            base_name = match.group(1)
            version = int(match.group(2))
            if version > max_version:
                max_version = version

    next_version = max_version + 1
    return NextRuleFilename(suggested_filename=f"{base_name}_v{next_version}.md")


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


@router.post("")
def create_rule(request: RuleCreate) -> RuleContent:
    """Create a new rule file."""
    RULES_DIR.mkdir(parents=True, exist_ok=True)

    # Validate filename
    if not request.filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="Filename must end with .md")

    # Sanitize filename
    safe_filename = re.sub(r"[^\w\-_.]", "_", request.filename)
    rule_file = RULES_DIR / safe_filename

    if rule_file.exists():
        raise HTTPException(status_code=409, detail=f"Rule already exists: {safe_filename}")

    with open(rule_file, "w", encoding="utf-8") as f:
        f.write(request.content)

    return RuleContent(
        id=rule_file.stem,
        filename=rule_file.name,
        content=request.content,
    )
