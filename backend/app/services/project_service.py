from __future__ import annotations

from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT, get_settings
from app.models.project import Project, ProjectStatus
from app.models.storyboard import StoryCharacter, StoryDialogue, StoryShot, StoryboardDraft
from app.schemas.project import (
    CreateProjectRequest,
    ProjectDetailResponse,
    ProjectListItemResponse,
    VideoGenerationPlanResponse,
)
from app.storage.file_store import ProjectFileStore


class ProjectService:
    DEFAULT_VOICE_PRESETS = [
        ("Chinese (Mandarin)_Reliable_Executive", "沉稳高管"),
        ("Chinese (Mandarin)_News_Anchor", "新闻女声"),
    ]

    def __init__(self, session: Session, file_store: ProjectFileStore):
        self.session = session
        self.file_store = file_store

    def create_project(self, payload: CreateProjectRequest) -> Project:
        project = Project(
            title=payload.title,
            source_text=payload.source_text,
            genre=payload.genre,
            style_template=payload.video_style or payload.style_template,
            target_duration=payload.target_duration,
            voice_style=payload.voice_style,
        )
        self.session.add(project)
        self.session.commit()
        self.session.refresh(project)

        self.file_store.save_project_snapshot(
            project.id,
            self._serialize_project(
                project,
                snapshot_overrides={
                    "video_style": payload.video_style or payload.style_template,
                    "aspect_ratio": payload.aspect_ratio,
                    "bgm_style": payload.bgm_style,
                },
            ),
        )
        return project

    def get_project(self, project_id: str) -> Optional[Project]:
        return self.session.get(Project, project_id)

    def list_projects(self, limit: int = 12) -> list[ProjectListItemResponse]:
        statement = (
            select(Project)
            .order_by(Project.updated_at.desc(), Project.created_at.desc())
            .limit(limit)
        )
        projects = list(self.session.scalars(statement))
        return [self._build_project_summary(project) for project in projects]

    def update_project_metadata(self, project_id: str, **changes: object) -> Project:
        project = self._require_project(project_id)
        for field_name, value in changes.items():
            if hasattr(project, field_name):
                if field_name == "status" and isinstance(value, str):
                    value = ProjectStatus(value)
                setattr(project, field_name, value)
        self.session.add(project)
        self.session.commit()
        self.session.refresh(project)
        self.file_store.save_project_snapshot(
            project.id,
            self._serialize_project(project),
        )
        return project

    def save_storyboard(
        self, project_id: str, storyboard: StoryboardDraft
    ) -> StoryboardDraft:
        self._require_project(project_id)
        self.file_store.save_storyboard(project_id, storyboard)
        return storyboard

    def load_storyboard(self, project_id: str) -> Optional[StoryboardDraft]:
        self._require_project(project_id)
        storyboard = self.file_store.load_storyboard(project_id)
        if storyboard is None:
            return None
        return self._normalize_storyboard(storyboard)

    def build_project_detail(self, project_id: str) -> ProjectDetailResponse:
        project = self._require_project(project_id)
        raw_video_plan = self.file_store.load_video_plan(project.id)
        video_plan = (
            VideoGenerationPlanResponse.model_validate(raw_video_plan)
            if raw_video_plan is not None
            else None
        )
        return ProjectDetailResponse.model_validate(
            {
                **self._serialize_project(project),
                "storage": self.file_store.build_storage_paths(project.id),
                "video_plan": video_plan,
                "storyboard": self.load_storyboard(project.id),
                "assets": self.file_store.list_generated_assets(project.id),
            }
        )

    def _require_project(self, project_id: str) -> Project:
        project = self.get_project(project_id)
        if project is None:
            raise ValueError(f"项目不存在: {project_id}")
        return project

    def _serialize_project(
        self,
        project: Project,
        snapshot_overrides: Optional[dict[str, Optional[str]]] = None,
    ) -> dict[str, object]:
        snapshot = self.file_store.load_project_snapshot(project.id) or {}
        if snapshot_overrides:
            snapshot.update(
                {
                    field_name: value
                    for field_name, value in snapshot_overrides.items()
                    if value is not None
                }
            )
        payload = {
            "id": project.id,
            "title": project.title,
            "source_text": project.source_text,
            "genre": project.genre,
            "style_template": project.style_template,
            "video_style": self._snapshot_value(snapshot, "video_style", project.style_template),
            "target_duration": project.target_duration,
            "voice_style": project.voice_style,
            "aspect_ratio": self._snapshot_value(snapshot, "aspect_ratio"),
            "bgm_style": self._snapshot_value(snapshot, "bgm_style"),
            "status": project.status.value,
            "created_at": project.created_at.isoformat()
            if project.created_at
            else None,
            "updated_at": project.updated_at.isoformat()
            if project.updated_at
            else None,
        }
        return payload

    def _build_project_summary(self, project: Project) -> ProjectListItemResponse:
        snapshot = self.file_store.load_project_snapshot(project.id) or {}
        storyboard = self.file_store.load_storyboard(project.id)
        assets = self.file_store.list_generated_assets(project.id)
        asset_count = sum(len(asset_group) for asset_group in assets.values())
        return ProjectListItemResponse.model_validate(
            {
                "id": project.id,
                "title": project.title,
                "genre": project.genre,
                "style_template": project.style_template,
                "video_style": snapshot.get("video_style") or project.style_template,
                "target_duration": project.target_duration,
                "voice_style": project.voice_style,
                "aspect_ratio": snapshot.get("aspect_ratio"),
                "bgm_style": snapshot.get("bgm_style"),
                "status": project.status,
                "updated_at": project.updated_at,
                "created_at": project.created_at,
                "storyboard_ready": storyboard is not None,
                "shot_count": len(storyboard.shots) if storyboard else 0,
                "asset_count": asset_count,
            }
        )

    def _snapshot_value(
        self,
        snapshot: dict[str, object],
        field_name: str,
        fallback: Optional[str] = None,
    ) -> Optional[str]:
        value = snapshot.get(field_name)
        return value if isinstance(value, str) and value.strip() else fallback

    def _normalize_storyboard(self, storyboard: StoryboardDraft) -> StoryboardDraft:
        normalized_characters = [
            self._normalize_character(character, index)
            for index, character in enumerate(storyboard.characters, start=1)
        ]
        character_map = {character.id: character for character in normalized_characters}

        normalized_shots: list[StoryShot] = []
        for shot in storyboard.shots:
            normalized_dialogues: list[StoryDialogue] = []
            character_ids = list(shot.character_ids)
            for dialogue in shot.dialogues:
                speaker_id = dialogue.speaker_id or self._match_character_id(
                    dialogue.speaker,
                    normalized_characters,
                )
                if speaker_id and speaker_id not in character_ids:
                    character_ids.append(speaker_id)
                normalized_dialogues.append(
                    dialogue.model_copy(update={"speaker_id": speaker_id})
                )

            normalized_shots.append(
                shot.model_copy(
                    update={
                        "dialogues": normalized_dialogues,
                        "character_ids": character_ids,
                    }
                )
            )

        return storyboard.model_copy(
            update={
                "characters": normalized_characters,
                "shots": normalized_shots,
            }
        )

    def _normalize_character(self, character: StoryCharacter, index: int) -> StoryCharacter:
        preset_voice_id, preset_voice_label = self.DEFAULT_VOICE_PRESETS[
            (index - 1) % len(self.DEFAULT_VOICE_PRESETS)
        ]
        return character.model_copy(
            update={
                "voice_id": character.voice_id or preset_voice_id,
                "voice_label": character.voice_label or preset_voice_label,
            }
        )

    def _match_character_id(
        self,
        speaker: str,
        characters: list[StoryCharacter],
    ) -> Optional[str]:
        normalized_speaker = speaker.strip()
        if not normalized_speaker:
            return None
        for character in characters:
            if normalized_speaker == character.name:
                return character.id
        for character in characters:
            if normalized_speaker in character.name or character.name in normalized_speaker:
                return character.id
        return None


def create_project_service(session: Session) -> ProjectService:
    settings = get_settings()
    data_root = Path(settings.data_root)
    if not data_root.is_absolute():
        data_root = PROJECT_ROOT / data_root
    file_store = ProjectFileStore(data_root)
    return ProjectService(session=session, file_store=file_store)
