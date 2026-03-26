from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Enum as SqlEnum, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ProjectStatus(str, Enum):
    draft = "draft"
    script_ready = "script_ready"
    generating = "generating"
    preview_ready = "preview_ready"
    exported = "exported"
    failed = "failed"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    genre: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    style_template: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    target_duration: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    voice_style: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        SqlEnum(ProjectStatus), nullable=False, default=ProjectStatus.draft
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
