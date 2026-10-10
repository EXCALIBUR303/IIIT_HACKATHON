from fastapi import APIRouter

from . import assessments, auth, content, educator, progress, simulations, students, tutor

api_router = APIRouter(prefix="/api/v1")
for module in (auth, students, content, simulations, assessments, progress, educator, tutor):
    api_router.include_router(module.router)
