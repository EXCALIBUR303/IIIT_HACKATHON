"""Vercel serverless entry point: exposes the FastAPI app unchanged."""

from app.main import app  # noqa: F401
