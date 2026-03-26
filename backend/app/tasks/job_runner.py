from __future__ import annotations

from app.core.db import SessionLocal
from app.services.storyboard_generation_service import create_storyboard_generation_service
from app.tasks.celery_app import celery_app


@celery_app.task(name="jobs.run_generation_job")
def run_generation_job(job_id: str) -> dict[str, str]:
    session = SessionLocal()
    try:
        service = create_storyboard_generation_service(session)
        job = service.run_job(job_id)
        return {
            "job_id": job.id,
            "status": job.status.value,
        }
    finally:
        session.close()
