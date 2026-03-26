from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db_session
from app.schemas.job import GenerateDraftResponse, GenerationJobResponse
from app.services.storyboard_generation_service import create_storyboard_generation_service


router = APIRouter(prefix="/api/projects", tags=["jobs"])


@router.post("/{project_id}/generate-draft", response_model=GenerateDraftResponse)
def generate_storyboard_assets(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> GenerateDraftResponse:
    service = create_storyboard_generation_service(session)
    try:
        return service.create_generation_jobs(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{project_id}/jobs", response_model=list[GenerationJobResponse])
def list_project_jobs(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> list[GenerationJobResponse]:
    service = create_storyboard_generation_service(session)
    return [service.serialize_job(job) for job in service.list_jobs(project_id)]


@router.post("/{project_id}/jobs/{job_id}/retry", response_model=GenerationJobResponse)
def retry_project_job(
    project_id: str,
    job_id: str,
    session: Session = Depends(get_db_session),
) -> GenerationJobResponse:
    service = create_storyboard_generation_service(session)
    try:
        job = service.retry_job(project_id, job_id)
        return service.serialize_job(job)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
