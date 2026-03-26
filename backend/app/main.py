from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.jobs import router as jobs_router
from app.api.routes.projects import router as projects_router
from app.core.config import get_settings
from app.core.db import Base, engine
from app.tasks.celery_app import celery_app


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

allowed_origins = {
    settings.frontend_base_url.rstrip("/"),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(jobs_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "database": settings.database_url,
        "redis": settings.redis_url,
        "celery_queue": celery_app.conf.task_default_queue,
    }
