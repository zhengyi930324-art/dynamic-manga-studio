from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.models.job import JobStatus, JobType


class GenerationJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    job_type: JobType
    target_id: str
    provider_key: str
    status: JobStatus
    payload: Optional[dict[str, Any]] = None
    result: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None
    retry_count: int
    created_at: datetime
    updated_at: datetime


class GenerateDraftResponse(BaseModel):
    project_id: str
    status: str
    job_count: int
    jobs: list[GenerationJobResponse]
