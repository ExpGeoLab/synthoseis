"""Main FastAPI application for Synthoseis server."""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .api.routes import router as api_router
from .api.features import router as features_router


app = FastAPI(
    title="Synthoseis API",
    description="API for managing synthetic seismic data generation",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes FIRST (before catch-all)
app.include_router(api_router)
app.include_router(features_router)


# Serve the React frontend in production
@app.get("/")
def serve_frontend():
    """Serve the React frontend."""
    index_path = Path(__file__).parent.parent / "ui" / "dist" / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    # During development, show a message
    return {
        "message": "Synthoseis API is running",
        "docs": "/docs",
        "frontend": "Run 'npm run dev' in the ui folder to start the frontend",
    }


# Serve static files from React build - EXCLUDE API paths
@app.get("/{path:path}")
def serve_static(path: str):
    """Serve static files from React build."""
    # Never serve static files for API routes
    if (
        path.startswith("api/")
        or path.startswith("docs")
        or path.startswith("openapi.json")
    ):
        return {"error": "Not found"}

    static_path = Path(__file__).parent.parent / "ui" / "dist" / path
    if static_path.exists():
        return FileResponse(static_path)

    # Fallback to index.html for SPA routing
    index_path = Path(__file__).parent.parent / "ui" / "dist" / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return {"error": "File not found"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
