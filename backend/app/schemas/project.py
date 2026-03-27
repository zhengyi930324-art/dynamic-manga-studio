from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.project import ProjectStatus
from app.models.storyboard import StoryboardDraft


class CreateProjectRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    source_text: str = Field(min_length=1)
    genre: Optional[str] = Field(default=None, max_length=100)
    style_template: Optional[str] = Field(default=None, max_length=100)
    video_style: Optional[str] = Field(default=None, max_length=100)
    target_duration: int = Field(default=60, ge=15, le=300)
    voice_style: Optional[str] = Field(default=None, max_length=100)
    aspect_ratio: Optional[str] = Field(default=None, max_length=16)
    bgm_style: Optional[str] = Field(default=None, max_length=100)


class ProjectStoragePaths(BaseModel):
    project_dir: str
    project_file: str
    storyboard_file: str
    video_plan_file: str
    assets_dir: str
    exports_dir: str


class VideoSegmentVariantResponse(BaseModel):
    variant_id: str
    label: str
    status: Literal["pending", "submitted", "running", "completed", "failed"] = "pending"
    video_asset_path: Optional[str] = None
    remote_video_url: Optional[str] = None
    thumbnail_asset_path: Optional[str] = None
    provider_task_id: Optional[str] = None
    provider_file_id: Optional[str] = None
    raw_status: Optional[str] = None
    error_message: Optional[str] = None
    duration_seconds: Optional[float] = None


class VideoSegmentResponse(BaseModel):
    segment_id: str
    title: str
    summary: str
    prompt: str
    selected_variant_id: Optional[str] = None
    variants: list[VideoSegmentVariantResponse] = Field(default_factory=list)


class VideoGenerationPlanResponse(BaseModel):
    segment_count: int
    global_style_bible: dict[str, str] = Field(default_factory=dict)
    segments: list[VideoSegmentResponse] = Field(default_factory=list)


class ProjectAssetPayload(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    prompt: Optional[str] = None
    remote_url: Optional[str] = None
    remote_video_url: Optional[str] = None
    script: Optional[str] = None
    voice_style: Optional[str] = None
    voice_id: Optional[str] = None
    audio_format: Optional[str] = None
    target_id: Optional[str] = None
    asset_path: Optional[str] = None
    video_local_path: Optional[str] = None
    image_local_path: Optional[str] = None
    audio_local_path: Optional[str] = None
    manual_override: bool = False
    content: Optional[str] = None
    label: Optional[str] = None
    segments: list[dict[str, object]] = Field(default_factory=list)
    target_kind: Optional[str] = None


class TimelineAudioTrackResponse(BaseModel):
    track_type: Literal["tts", "bgm"]
    segment_type: Literal["narration", "dialogue", "gap"]
    target_id: str
    shot_id: str
    source_path: Optional[str] = None
    label: str
    speaker: Optional[str] = None
    voice_id: Optional[str] = None
    start_offset_seconds: float = 0
    duration_seconds: float = 0


class ReplaceProjectAssetRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    label: Optional[str] = Field(default=None, max_length=100)


class SelectSegmentVariantRequest(BaseModel):
    variant_id: str = Field(min_length=1)


class TimelineShotResponse(BaseModel):
    order: int
    shot_id: str
    title: str
    duration_seconds: int
    subtitle: str
    narration: Optional[str] = None
    video_asset_path: Optional[str] = None
    scene_asset_path: Optional[str] = None
    character_asset_paths: list[str] = Field(default_factory=list)
    audio_segments: list[TimelineAudioTrackResponse] = Field(default_factory=list)


class PreviewTimelineResponse(BaseModel):
    project_id: str
    status: Literal["ready"]
    preview_file: str
    total_duration: int
    shot_count: int
    render_mode: Literal["placeholder", "mixed", "real_assets", "video_segments"]
    scene_asset_count: int = 0
    audio_asset_count: int = 0
    updated_at: datetime
    shots: list[TimelineShotResponse] = Field(default_factory=list)
    audio_tracks: list[TimelineAudioTrackResponse] = Field(default_factory=list)


class ExportStatusResponse(BaseModel):
    project_id: str
    status: Literal["idle", "running", "completed", "failed"]
    preview_file: Optional[str] = None
    export_file: Optional[str] = None
    total_duration: Optional[int] = None
    shot_count: int = 0
    render_mode: Literal["placeholder", "mixed", "real_assets", "video_segments"] = "placeholder"
    scene_asset_count: int = 0
    audio_asset_count: int = 0
    error_message: Optional[str] = None
    updated_at: datetime


class UpdateScriptDraftRequest(BaseModel):
    storyboard: StoryboardDraft


class ProjectDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    source_text: str
    genre: Optional[str]
    style_template: Optional[str]
    video_style: Optional[str] = None
    target_duration: int
    voice_style: Optional[str]
    aspect_ratio: Optional[str] = None
    bgm_style: Optional[str] = None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    storage: ProjectStoragePaths
    video_plan: Optional[VideoGenerationPlanResponse] = None
    storyboard: Optional[StoryboardDraft] = None
    assets: dict[str, dict[str, ProjectAssetPayload]] = Field(default_factory=dict)


class ProjectListItemResponse(BaseModel):
    id: str
    title: str
    genre: Optional[str] = None
    style_template: Optional[str] = None
    video_style: Optional[str] = None
    target_duration: int
    voice_style: Optional[str] = None
    aspect_ratio: Optional[str] = None
    bgm_style: Optional[str] = None
    status: ProjectStatus
    updated_at: datetime
    created_at: datetime
    storyboard_ready: bool = False
    shot_count: int = 0
    asset_count: int = 0
