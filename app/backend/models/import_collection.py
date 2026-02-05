from datetime import datetime
from pydantic import BaseModel, Field


class ImportFile(BaseModel):
    """A single BibTeX file within an import."""
    filename: str
    database: str
    search_query: str
    search_date: str
    url: str | None = None
    tags: list[str] = Field(default_factory=list)
    count: int = 0


class ImportCreate(BaseModel):
    """Request model for creating an import."""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")


class ImportUpdate(BaseModel):
    """Request model for updating an import."""
    name: str | None = None
    description: str | None = None


class ImportFileUpdate(BaseModel):
    """Request model for updating a file's metadata within an import."""
    database: str | None = None
    search_query: str | None = None
    search_date: str | None = None
    url: str | None = None
    tags: str | None = None


class ImportCollection(BaseModel):
    """An import collection - a set of BibTeX search results."""
    id: str
    name: str
    description: str = ""
    files: list[ImportFile] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ImportSummary(BaseModel):
    """Import summary for list views."""
    id: str
    name: str
    description: str = ""
    file_count: int = 0
    total_entry_count: int = 0
    databases: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    is_locked: bool = False
    referencing_project_count: int = 0


class ImportDetail(ImportCollection):
    """Import detail with lock status."""
    is_locked: bool = False
    referencing_projects: list[dict] = Field(default_factory=list)
