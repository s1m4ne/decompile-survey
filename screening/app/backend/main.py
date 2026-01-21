"""
Screening App Backend - FastAPI
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import runs, imports, reviews, screening

app = FastAPI(title="Screening App", version="1.0.0")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(imports.router, prefix="/api/imports", tags=["imports"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["reviews"])
app.include_router(screening.router, prefix="/api/screening", tags=["screening"])


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
