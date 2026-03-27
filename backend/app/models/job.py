from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class JobType(str, Enum):
    character_image = "character_image"
    scene_image = "scene_image"
    tts = "tts"
    video_segment = "video_segment"


class JobStatus(str, Enum):
    pending = "pending"
    running = "running"
    failed = "failed"
    completed = "completed"


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False, index=True
    )
    job_type: Mapped[JobType] = mapped_column(SqlEnum(JobType), nullable=False)
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_key: Mapped[str] = mapped_column(String(50), nullable=False, default="local_mock")
    status: Mapped[JobStatus] = mapped_column(
        SqlEnum(JobStatus), nullable=False, default=JobStatus.pending
    )
    payload_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    result_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
