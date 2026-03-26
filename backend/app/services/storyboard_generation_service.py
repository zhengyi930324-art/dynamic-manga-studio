from __future__ import annotations

import base64
import json
import mimetypes
import re
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.job import GenerationJob, JobStatus, JobType
from app.models.project import ProjectStatus
from app.models.storyboard import StoryCharacter, StoryShot, StoryboardDraft
from app.schemas.job import GenerateDraftResponse, GenerationJobResponse
from app.services.project_service import ProjectService
from app.services.provider_registry import ProviderRegistry
from app.storage.file_store import ProjectFileStore


class StoryboardGenerationService:
    def __init__(
        self,
        session: Session,
        file_store: ProjectFileStore,
        project_service: ProjectService,
        provider_registry: ProviderRegistry,
    ) -> None:
        self.session = session
        self.file_store = file_store
        self.project_service = project_service
        self.provider_registry = provider_registry

    def create_generation_jobs(self, project_id: str) -> GenerateDraftResponse:
        project = self.project_service._require_project(project_id)
        storyboard = self._require_storyboard(project_id)
        provider_key = get_settings().default_provider

        existing_jobs = self.list_jobs(project_id)
        if existing_jobs:
            self.delete_jobs(project_id)

        jobs: list[GenerationJob] = []
        for character in storyboard.characters:
            jobs.append(
                self._build_job(
                    project_id=project_id,
                    provider_key=provider_key,
                    job_type=JobType.character_image,
                    target_id=character.id,
                    payload={
                        "target_id": character.id,
                        "name": character.name,
                        "appearance": character.appearance or "",
                    },
                )
            )

        for scene in storyboard.scenes:
            jobs.append(
                self._build_job(
                    project_id=project_id,
                    provider_key=provider_key,
                    job_type=JobType.scene_image,
                    target_id=scene.id,
                    payload={
                        "target_id": scene.id,
                        "name": scene.name,
                        "description": scene.description,
                    },
                )
            )

        for shot in storyboard.shots:
            jobs.append(
                self._build_job(
                    project_id=project_id,
                    provider_key=provider_key,
                    job_type=JobType.tts,
                    target_id=shot.id,
                    payload={
                        "target_id": shot.id,
                        "segments": self._build_tts_segments(storyboard, shot),
                    },
                )
            )

        self.session.add_all(jobs)
        self.project_service.update_project_metadata(project_id, status=ProjectStatus.generating)
        self.session.commit()

        dispatched_jobs = [self.dispatch_job(job.id) for job in jobs]
        return GenerateDraftResponse(
            project_id=project_id,
            status=ProjectStatus.generating.value,
            job_count=len(dispatched_jobs),
            jobs=[self.serialize_job(job) for job in dispatched_jobs],
        )

    def list_jobs(self, project_id: str) -> list[GenerationJob]:
        statement = (
            select(GenerationJob)
            .where(GenerationJob.project_id == project_id)
            .order_by(GenerationJob.created_at.asc())
        )
        return list(self.session.scalars(statement))

    def get_job(self, job_id: str) -> Optional[GenerationJob]:
        return self.session.get(GenerationJob, job_id)

    def retry_job(self, project_id: str, job_id: str) -> GenerationJob:
        job = self._require_job(project_id, job_id)
        if job.status != JobStatus.failed:
            raise ValueError("只有失败任务才允许重试")

        job.status = JobStatus.pending
        job.error_message = None
        job.result_json = None
        self.session.add(job)
        self.session.commit()
        return self.dispatch_job(job.id)

    def regenerate_asset(self, project_id: str, asset_type: str, target_id: str) -> None:
        project = self.project_service._require_project(project_id)
        storyboard = self._require_storyboard(project_id)
        provider_key = get_settings().default_provider
        provider = self.provider_registry.get_provider(provider_key)

        payload = self._build_asset_payload(storyboard, asset_type, target_id)
        result = self._generate_asset(
            provider=provider,
            project=project,
            job_type=JobType(asset_type),
            payload=payload,
        )
        result = self._finalize_result_payload(project_id, JobType(asset_type), target_id, result)
        asset_path = self.file_store.save_generated_asset(
            project_id=project_id,
            asset_type=asset_type,
            target_id=target_id,
            payload=result,
        )
        result["asset_path"] = str(asset_path)
        self.file_store.save_generated_asset(project_id, asset_type, target_id, result)
        self.project_service.update_project_metadata(project_id, status=ProjectStatus.preview_ready)

    def replace_asset(
        self,
        project_id: str,
        asset_type: str,
        target_id: str,
        content: str,
        label: Optional[str] = None,
    ) -> None:
        self.project_service._require_project(project_id)
        if asset_type not in {JobType.character_image.value, JobType.scene_image.value}:
            raise ValueError("当前只支持角色图和场景图的手动替换")

        payload = {
            "asset_type": asset_type,
            "target_id": target_id,
            "provider": "manual",
            "manual_override": True,
            "content": content,
            "label": label or "手动替换",
        }
        asset_path = self.file_store.save_generated_asset(
            project_id=project_id,
            asset_type=asset_type,
            target_id=target_id,
            payload=payload,
        )
        payload["asset_path"] = str(asset_path)
        self.file_store.save_generated_asset(project_id, asset_type, target_id, payload)
        self.project_service.update_project_metadata(project_id, status=ProjectStatus.preview_ready)

    def dispatch_job(self, job_id: str) -> GenerationJob:
        from app.tasks.job_runner import run_generation_job

        job = self._require_job(None, job_id)
        task = run_generation_job.delay(job.id)
        job.celery_task_id = task.id
        self.session.add(job)
        self.session.commit()
        self.session.refresh(job)
        return job

    def run_job(self, job_id: str) -> GenerationJob:
        job = self._require_job(None, job_id)
        project = self.project_service._require_project(job.project_id)

        try:
            job.status = JobStatus.running
            job.retry_count += 1
            self.session.add(job)
            self.session.commit()

            payload = self._deserialize_json(job.payload_json)
            provider = self.provider_registry.get_provider(job.provider_key)
            result = self._generate_asset(provider, project, job.job_type, payload)
            result = self._finalize_result_payload(job.project_id, job.job_type, job.target_id, result)
            asset_path = self.file_store.save_generated_asset(
                project_id=job.project_id,
                asset_type=job.job_type.value,
                target_id=job.target_id,
                payload=result,
            )

            result["asset_path"] = str(asset_path)
            job.result_json = json.dumps(result, ensure_ascii=False)
            job.status = JobStatus.completed
            job.error_message = None
            self.session.add(job)
            self.session.commit()

            self._sync_project_status(job.project_id)
            self.session.refresh(job)
            return job
        except Exception as exc:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            self.session.add(job)
            self.session.commit()
            self.project_service.update_project_metadata(job.project_id, status=ProjectStatus.failed)
            raise

    def delete_jobs(self, project_id: str) -> None:
        jobs = self.list_jobs(project_id)
        for job in jobs:
            self.session.delete(job)
        self.session.commit()

    def serialize_job(self, job: GenerationJob) -> GenerationJobResponse:
        return GenerationJobResponse.model_validate(
            {
                "id": job.id,
                "project_id": job.project_id,
                "job_type": job.job_type,
                "target_id": job.target_id,
                "provider_key": job.provider_key,
                "status": job.status,
                "payload": self._deserialize_json(job.payload_json),
                "result": self._deserialize_json(job.result_json),
                "error_message": job.error_message,
                "celery_task_id": job.celery_task_id,
                "retry_count": job.retry_count,
                "created_at": job.created_at,
                "updated_at": job.updated_at,
            }
        )

    def _require_storyboard(self, project_id: str) -> StoryboardDraft:
        storyboard = self.project_service.load_storyboard(project_id)
        if storyboard is None:
            raise ValueError("请先生成并确认剧本稿后再发起素材生成")
        return storyboard

    def _require_job(self, project_id: Optional[str], job_id: str) -> GenerationJob:
        job = self.get_job(job_id)
        if job is None or (project_id is not None and job.project_id != project_id):
            raise ValueError(f"任务不存在: {job_id}")
        return job

    def _build_job(
        self,
        project_id: str,
        provider_key: str,
        job_type: JobType,
        target_id: str,
        payload: dict[str, Any],
    ) -> GenerationJob:
        return GenerationJob(
            project_id=project_id,
            provider_key=provider_key,
            job_type=job_type,
            target_id=target_id,
            status=JobStatus.pending,
            payload_json=json.dumps(payload, ensure_ascii=False),
        )

    def _generate_asset(
        self,
        provider: Any,
        project: Any,
        job_type: JobType,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if job_type == JobType.character_image:
            return provider.generate_character_image(project, payload)
        if job_type == JobType.scene_image:
            return provider.generate_scene_image(project, payload)
        if job_type == JobType.tts:
            return self._generate_tts_manifest(provider, project, payload)
        raise ValueError(f"不支持的任务类型: {job_type.value}")

    def _build_tts_segments(
        self,
        storyboard: StoryboardDraft,
        shot: StoryShot,
    ) -> list[dict[str, str]]:
        character_map = {character.id: character for character in storyboard.characters}
        segments: list[dict[str, str]] = []

        if shot.narration and shot.narration.strip():
            segments.append(
                {
                    "segment_id": f"{shot.id}-narration",
                    "segment_type": "narration",
                    "script": shot.narration.strip(),
                    "speaker": "旁白",
                    "voice_id": self._resolve_narration_voice(storyboard.characters),
                    "voice_label": "旁白",
                }
            )

        for index, dialogue in enumerate(shot.dialogues, start=1):
            voice_owner = character_map.get(dialogue.speaker_id or "")
            segments.append(
                {
                    "segment_id": f"{shot.id}-dialogue-{index}",
                    "segment_type": "dialogue",
                    "script": dialogue.content.strip(),
                    "speaker": dialogue.speaker,
                    "speaker_id": dialogue.speaker_id or "",
                    "voice_id": (
                        voice_owner.voice_id
                        if voice_owner and voice_owner.voice_id
                        else self._resolve_narration_voice(storyboard.characters)
                    ),
                    "voice_label": (
                        voice_owner.voice_label
                        if voice_owner and voice_owner.voice_label
                        else "角色对白"
                    ),
                }
            )

        if not segments:
            segments.append(
                {
                    "segment_id": f"{shot.id}-summary",
                    "segment_type": "narration",
                    "script": shot.summary.strip() or shot.title,
                    "speaker": "旁白",
                    "voice_id": self._resolve_narration_voice(storyboard.characters),
                    "voice_label": "旁白",
                }
            )
        return segments

    def _generate_tts_manifest(
        self,
        provider: Any,
        project: Any,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        segments = payload.get("segments") or []
        if not isinstance(segments, list) or not segments:
            raise ValueError("当前分镜没有可生成的语音片段")

        manifest_segments: list[dict[str, Any]] = []
        for item in segments:
            if not isinstance(item, dict):
                continue
            script = str(item.get("script") or "").strip()
            if not script:
                continue
            raw_segment = provider.generate_tts(
                project,
                {
                    "target_id": str(item.get("segment_id") or ""),
                    "script": script,
                    "voice_id": str(item.get("voice_id") or ""),
                    "voice_label": str(item.get("voice_label") or ""),
                },
            )
            manifest_segments.append(
                {
                    **raw_segment,
                    "segment_id": str(item.get("segment_id") or ""),
                    "segment_type": str(item.get("segment_type") or "dialogue"),
                    "speaker": str(item.get("speaker") or ""),
                    "speaker_id": str(item.get("speaker_id") or ""),
                    "target_kind": "segment",
                }
            )

        if not manifest_segments:
            raise ValueError("未生成任何语音片段")

        return {
            "asset_type": JobType.tts.value,
            "provider": manifest_segments[0].get("provider"),
            "target_id": payload.get("target_id", ""),
            "target_kind": "shot",
            "segments": manifest_segments,
            "script": "\n".join(str(item.get("script") or "") for item in manifest_segments),
        }

    def _finalize_result_payload(
        self,
        project_id: str,
        job_type: JobType,
        target_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        result = dict(payload)

        if job_type in {JobType.character_image, JobType.scene_image}:
            remote_url = result.get("remote_url")
            if isinstance(remote_url, str) and remote_url:
                content, extension = self._download_remote_binary(remote_url)
                local_path = self.file_store.save_generated_binary(
                    project_id=project_id,
                    asset_type=job_type.value,
                    target_id=target_id,
                    content=content,
                    extension=extension,
                )
                result["image_local_path"] = str(local_path)

        if job_type == JobType.tts:
            if result.get("target_kind") == "shot":
                finalized_segments: list[dict[str, Any]] = []
                for segment in result.get("segments") or []:
                    if not isinstance(segment, dict):
                        continue
                    segment_target_id = str(
                        segment.get("segment_id") or segment.get("target_id") or ""
                    )
                    finalized_segment = self._materialize_tts_segment(
                        project_id=project_id,
                        target_id=segment_target_id,
                        payload=segment,
                    )
                    finalized_segments.append(finalized_segment)
                    self.file_store.save_generated_asset(
                        project_id=project_id,
                        asset_type=job_type.value,
                        target_id=segment_target_id,
                        payload=finalized_segment,
                    )
                result["segments"] = finalized_segments
            else:
                result = self._materialize_tts_segment(
                    project_id=project_id,
                    target_id=target_id,
                    payload=result,
                )

        return result

    def _materialize_tts_segment(
        self,
        project_id: str,
        target_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        result = dict(payload)
        audio_base64 = result.pop("audio_base64", None)
        audio_format = result.get("audio_format") or "mp3"
        if isinstance(audio_base64, str) and audio_base64:
            content = self._decode_audio_content(audio_base64)
            local_path = self.file_store.save_generated_binary(
                project_id=project_id,
                asset_type=JobType.tts.value,
                target_id=target_id,
                content=content,
                extension=str(audio_format),
            )
            result["audio_local_path"] = str(local_path)
        return result

    def _deserialize_json(self, value: Optional[str]) -> Optional[dict[str, Any]]:
        if not value:
            return None
        return json.loads(value)

    def _sync_project_status(self, project_id: str) -> None:
        jobs = self.list_jobs(project_id)
        if not jobs:
            return
        if any(job.status == JobStatus.failed for job in jobs):
            self.project_service.update_project_metadata(project_id, status=ProjectStatus.failed)
            return
        if all(job.status == JobStatus.completed for job in jobs):
            self.project_service.update_project_metadata(
                project_id, status=ProjectStatus.preview_ready
            )
            return
        self.project_service.update_project_metadata(project_id, status=ProjectStatus.generating)

    def _build_asset_payload(
        self,
        storyboard: StoryboardDraft,
        asset_type: str,
        target_id: str,
    ) -> dict[str, Any]:
        if asset_type == JobType.character_image.value:
            character = next(
                (item for item in storyboard.characters if item.id == target_id),
                None,
            )
            if character is None:
                raise ValueError(f"角色不存在: {target_id}")
            return {
                "target_id": character.id,
                "name": character.name,
                "appearance": character.appearance or "",
            }

        if asset_type == JobType.scene_image.value:
            scene = next((item for item in storyboard.scenes if item.id == target_id), None)
            if scene is None:
                raise ValueError(f"场景不存在: {target_id}")
            return {
                "target_id": scene.id,
                "name": scene.name,
                "description": scene.description,
            }

        if asset_type == JobType.tts.value:
            shot = next((item for item in storyboard.shots if item.id == target_id), None)
            if shot is None:
                raise ValueError(f"分镜不存在: {target_id}")
            return {
                "target_id": shot.id,
                "segments": self._build_tts_segments(storyboard, shot),
            }

        raise ValueError(f"当前不支持重生成的素材类型: {asset_type}")

    def _download_remote_binary(self, remote_url: str) -> tuple[bytes, str]:
        response = httpx.get(remote_url, timeout=120, follow_redirects=True)
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").split(";")[0].strip()
        extension = mimetypes.guess_extension(content_type, strict=False) if content_type else None
        if not extension:
            parsed = urlparse(remote_url)
            suffix = parsed.path.rsplit(".", 1)
            extension = f".{suffix[1]}" if len(suffix) == 2 else ".png"
        return response.content, extension.lstrip(".")

    def _decode_audio_content(self, audio_payload: str) -> bytes:
        if re.fullmatch(r"[0-9a-fA-F]+", audio_payload) and len(audio_payload) % 2 == 0:
            return bytes.fromhex(audio_payload)
        return base64.b64decode(audio_payload)

    def _resolve_narration_voice(self, characters: list[StoryCharacter]) -> str:
        main_voice = next(
            (character.voice_id for character in characters if character.role == "主角" and character.voice_id),
            None,
        )
        if main_voice:
            return main_voice
        fallback_voice = next((character.voice_id for character in characters if character.voice_id), None)
        if fallback_voice:
            return fallback_voice
        return get_settings().minimax_tts_voice_id


def create_storyboard_generation_service(session: Session) -> StoryboardGenerationService:
    settings = get_settings()
    file_store = ProjectFileStore(settings.data_root)
    project_service = ProjectService(session=session, file_store=file_store)
    provider_registry = ProviderRegistry()
    return StoryboardGenerationService(
        session=session,
        file_store=file_store,
        project_service=project_service,
        provider_registry=provider_registry,
    )
