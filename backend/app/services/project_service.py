from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.project import Project, ProjectStatus
from app.models.storyboard import StoryCharacter, StoryDialogue, StoryShot, StoryboardDraft
from app.schemas.project import (
    CreateProjectRequest,
    ProjectDetailResponse,
    ProjectListItemResponse,
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
            style_template=payload.style_template,
            target_duration=payload.target_duration,
            voice_style=payload.voice_style,
        )
        self.session.add(project)
        self.session.commit()
        self.session.refresh(project)

        self.file_store.save_project_snapshot(
            project.id,
            self._serialize_project(project),
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
        return ProjectDetailResponse.model_validate(
            {
                **self._serialize_project(project),
                "storage": self.file_store.build_storage_paths(project.id),
                "storyboard": self.load_storyboard(project.id),
                "assets": self.file_store.list_generated_assets(project.id),
            }
        )

    def _require_project(self, project_id: str) -> Project:
        project = self.get_project(project_id)
        if project is None:
            raise ValueError(f"项目不存在: {project_id}")
        return project

    def _serialize_project(self, project: Project) -> dict[str, object]:
        return {
            "id": project.id,
            "title": project.title,
            "source_text": project.source_text,
            "genre": project.genre,
            "style_template": project.style_template,
            "target_duration": project.target_duration,
            "voice_style": project.voice_style,
            "status": project.status.value,
            "created_at": project.created_at.isoformat()
            if project.created_at
            else None,
            "updated_at": project.updated_at.isoformat()
            if project.updated_at
            else None,
        }

    def _build_project_summary(self, project: Project) -> ProjectListItemResponse:
        storyboard = self.file_store.load_storyboard(project.id)
        assets = self.file_store.list_generated_assets(project.id)
        asset_count = sum(len(asset_group) for asset_group in assets.values())
        return ProjectListItemResponse.model_validate(
            {
                "id": project.id,
                "title": project.title,
                "genre": project.genre,
                "style_template": project.style_template,
                "target_duration": project.target_duration,
                "voice_style": project.voice_style,
                "status": project.status,
                "updated_at": project.updated_at,
                "created_at": project.created_at,
                "storyboard_ready": storyboard is not None,
                "shot_count": len(storyboard.shots) if storyboard else 0,
                "asset_count": asset_count,
            }
        )

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
    file_store = ProjectFileStore(settings.data_root)
    return ProjectService(session=session, file_store=file_store)
