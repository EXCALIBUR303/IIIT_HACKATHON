from fastapi import APIRouter

from . import (
    assessments,
    auth,
    banking,
    content,
    educator,
    learning,
    market,
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
    banking,
    students,
    content,
    simulations,
    assessments,
    progress,
    educator,
    learning,
    portfolio,
    market,
    tutor,
    wallet,
):
    api_router.include_router(module.router)
