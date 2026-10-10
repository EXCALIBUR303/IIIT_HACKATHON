from fastapi import APIRouter

from . import (
    assessments,
    auth,
    content,
    educator,
    learning,
    portfolio,
    progress,
    simulations,
    students,
    tutor,
    wallet,
)

api_router = APIRouter(prefix="/api/v1")
for module in (
    auth,
    students,
    content,
    simulations,
    assessments,
    progress,
    educator,
    learning,
    portfolio,
    tutor,
    wallet,
):
    api_router.include_router(module.router)
