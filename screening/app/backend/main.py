"""
Screening Pipeline App Backend - FastAPI
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    projects_router,
    pipeline_router,
    steps_router,
    step_types_router,
    sources_router,
    rules_router,
    llm_router,
)

app = FastAPI(
    title="Screening Pipeline App",
    version="2.0.0",
    description="Paper screening pipeline for systematic reviews",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(projects_router, prefix="/api")
app.include_router(pipeline_router, prefix="/api")
app.include_router(steps_router, prefix="/api")
app.include_router(step_types_router, prefix="/api")
app.include_router(sources_router, prefix="/api")
app.include_router(rules_router, prefix="/api")
app.include_router(llm_router, prefix="/api")


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "2.0.0"}
