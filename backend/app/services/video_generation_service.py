from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.models.project import Project
from app.schemas.project import (
    VideoGenerationPlanResponse,
    VideoSegmentResponse,
    VideoSegmentVariantResponse,
)
from app.services.video_download_proxy import VideoDownloadProxy
from app.services.provider_registry import AssetProvider
from app.storage.file_store import ProjectFileStore


class VideoGenerationService:
    DEFAULT_SEGMENT_COUNT = 4
    DEFAULT_VARIANT_COUNT = 3

    def __init__(self, file_store: ProjectFileStore):
        self.file_store = file_store
        self.settings = get_settings()
        self.download_proxy = VideoDownloadProxy(self.settings)

    def build_generation_plan(self, project: Project) -> VideoGenerationPlanResponse:
        text = (project.source_text or "").strip()
        chunks = self._split_story_text(text)
        style = (project.style_template or "电影感 AI 视频").strip()
        global_style_bible = {
            "title": project.title,
            "video_style": style,
            "tone": "cinematic",
            "segment_strategy": "auto_four_segments",
        }

        segments = [
            VideoSegmentResponse(
                segment_id=f"segment-{index}",
                title=f"第 {index} 段",
                summary=chunk,
                prompt=self._build_segment_prompt(project, chunk, style, index),
                selected_variant_id=f"segment-{index}-variant-a",
                variants=[
                    VideoSegmentVariantResponse(
                        variant_id=f"segment-{index}-variant-{variant_suffix}",
                        label=f"候选 {variant_suffix.upper()}",
                    )
                    for variant_suffix in ("a", "b", "c")[: self.DEFAULT_VARIANT_COUNT]
                ],
            )
            for index, chunk in enumerate(chunks, start=1)
        ]

        plan = VideoGenerationPlanResponse(
            segment_count=len(segments),
            global_style_bible=global_style_bible,
            segments=segments,
        )
        self.file_store.save_video_plan(project.id, plan.model_dump(mode="json"))
        return plan

    def submit_generation_plan(
        self,
        project: Project,
        provider: AssetProvider,
    ) -> VideoGenerationPlanResponse:
        plan = self.load_generation_plan(project.id) or self.build_generation_plan(project)

        updated_segments: list[VideoSegmentResponse] = []
        for segment in plan.segments:
            updated_variants: list[VideoSegmentVariantResponse] = []
            for variant in segment.variants:
                if variant.status in {"submitted", "running", "completed"} and variant.provider_task_id:
                    updated_variants.append(variant)
                    continue

                target_id = variant.variant_id
                task_payload = provider.create_video_segment_task(
                    project,
                    {
                        "target_id": target_id,
                        "prompt": segment.prompt,
                    },
                )
                next_variant = variant.model_copy(
                    update={
                        "status": "submitted",
                        "provider_task_id": task_payload.get("task_id"),
                        "provider_file_id": None,
                        "raw_status": task_payload.get("status"),
                        "error_message": None,
                        "video_asset_path": None,
                        "duration_seconds": None,
                    }
                )
                updated_variants.append(next_variant)

            updated_segments.append(
                segment.model_copy(
                    update={
                        "variants": updated_variants,
                    }
                )
            )

        updated_plan = plan.model_copy(update={"segments": updated_segments})
        self.file_store.save_video_plan(project.id, updated_plan.model_dump(mode="json"))
        return updated_plan

    def refresh_generation_plan(
        self,
        project: Project,
        provider: AssetProvider,
    ) -> VideoGenerationPlanResponse:
        plan = self.load_generation_plan(project.id)
        if plan is None:
            raise ValueError("视频生成计划不存在，请先发起生成。")

        updated_segments: list[VideoSegmentResponse] = []
        for segment in plan.segments:
            updated_variants: list[VideoSegmentVariantResponse] = []
            for variant in segment.variants:
                next_variant = variant
                if not variant.provider_task_id or variant.status == "pending":
                    updated_variants.append(next_variant)
                    continue

                if variant.status == "completed" and (variant.video_asset_path or variant.remote_video_url):
                    updated_variants.append(next_variant)
                    continue

                status_payload = provider.get_video_segment_task_status(
                    project,
                    {
                        "target_id": variant.variant_id,
                        "task_id": variant.provider_task_id,
                    },
                )
                next_status = self._normalize_variant_status(status_payload.get("status"))
                next_variant = variant.model_copy(
                    update={
                        "status": next_status,
                        "raw_status": status_payload.get("raw_status")
                        or status_payload.get("status"),
                        "provider_file_id": status_payload.get("file_id"),
                        "error_message": None,
                    }
                )

                if next_status == "failed":
                    next_variant = next_variant.model_copy(
                        update={
                            "error_message": str(
                                status_payload.get("error_message")
                                or status_payload.get("raw_status")
                                or "视频生成失败"
                            )
                        }
                    )
                    updated_variants.append(next_variant)
                    continue

                if next_status != "completed":
                    updated_variants.append(next_variant)
                    continue

                video_asset_path = self._resolve_local_video_asset_path(project.id, variant.variant_id)
                duration_seconds = self._probe_media_duration(Path(video_asset_path)) if video_asset_path else None
                remote_video_url: Optional[str] = None
                download_error: Optional[str] = None

                if not video_asset_path:
                    download_payload = provider.download_generated_video(
                        project,
                        {
                            "target_id": variant.variant_id,
                            "file_id": status_payload.get("file_id"),
                        },
                    )
                    remote_video_url = str(download_payload.get("video_url") or "").strip() or None
                    try:
                        video_asset_path = self._download_video_binary(
                            project_id=project.id,
                            target_id=variant.variant_id,
                            download_payload=download_payload,
                        )
                        duration_seconds = self._probe_media_duration(Path(video_asset_path))
                    except Exception as exc:
                        download_error = str(exc)

                self.file_store.save_generated_asset(
                    project.id,
                    "video_segment",
                    variant.variant_id,
                    {
                        "provider": provider.key,
                        "target_id": variant.variant_id,
                        "asset_path": video_asset_path,
                        "video_local_path": video_asset_path,
                        "provider_task_id": variant.provider_task_id,
                        "provider_file_id": status_payload.get("file_id"),
                        "raw_status": status_payload.get("raw_status")
                        or status_payload.get("status"),
                        "remote_video_url": remote_video_url,
                        "download_error": download_error,
                        "duration_seconds": duration_seconds,
                    },
                )
                next_variant = next_variant.model_copy(
                    update={
                        "video_asset_path": video_asset_path,
                        "remote_video_url": remote_video_url,
                        "duration_seconds": duration_seconds,
                        "error_message": download_error,
                    }
                )
                updated_variants.append(next_variant)

            updated_segments.append(segment.model_copy(update={"variants": updated_variants}))

        updated_plan = plan.model_copy(update={"segments": updated_segments})
        self.file_store.save_video_plan(project.id, updated_plan.model_dump(mode="json"))
        return updated_plan

    def load_generation_plan(self, project_id: str) -> Optional[VideoGenerationPlanResponse]:
        payload = self.file_store.load_video_plan(project_id)
        if payload is None:
            return None
        return VideoGenerationPlanResponse.model_validate(payload)

    def select_segment_variant(
        self,
        project_id: str,
        segment_id: str,
        variant_id: str,
    ) -> VideoGenerationPlanResponse:
        plan = self.load_generation_plan(project_id)
        if plan is None:
            raise ValueError("视频生成计划不存在，请先发起生成。")

        updated_segments: list[VideoSegmentResponse] = []
        matched_segment = False
        matched_variant = False
        for segment in plan.segments:
            if segment.segment_id != segment_id:
                updated_segments.append(segment)
                continue

            matched_segment = True
            for variant in segment.variants:
                if variant.variant_id == variant_id:
                    matched_variant = True
                    break

            if not matched_variant:
                raise ValueError(f"候选片段不存在: {variant_id}")

            updated_segments.append(
                segment.model_copy(update={"selected_variant_id": variant_id})
            )

        if not matched_segment:
            raise ValueError(f"片段不存在: {segment_id}")

        updated_plan = plan.model_copy(update={"segments": updated_segments})
        self.file_store.save_video_plan(project_id, updated_plan.model_dump(mode="json"))
        return updated_plan

    def regenerate_segment(
        self,
        project_id: str,
        segment_id: str,
    ) -> VideoGenerationPlanResponse:
        plan = self.load_generation_plan(project_id)
        if plan is None:
            raise ValueError("视频生成计划不存在，请先发起生成。")

        updated_segments: list[VideoSegmentResponse] = []
        matched_segment = False
        for segment in plan.segments:
            if segment.segment_id != segment_id:
                updated_segments.append(segment)
                continue

            matched_segment = True
            refreshed_variants = [
                variant.model_copy(
                    update={
                        "status": "pending",
                        "video_asset_path": None,
                        "thumbnail_asset_path": None,
                        "provider_task_id": None,
                        "provider_file_id": None,
                        "raw_status": None,
                        "error_message": None,
                        "duration_seconds": None,
                    }
                )
                for variant in segment.variants
            ]
            updated_segments.append(
                segment.model_copy(
                    update={
                        "selected_variant_id": refreshed_variants[0].variant_id
                        if refreshed_variants
                        else None,
                        "variants": refreshed_variants,
                    }
                )
            )

        if not matched_segment:
            raise ValueError(f"片段不存在: {segment_id}")

        updated_plan = plan.model_copy(update={"segments": updated_segments})
        self.file_store.save_video_plan(project_id, updated_plan.model_dump(mode="json"))
        return updated_plan

    def has_ready_selected_variants(self, plan: VideoGenerationPlanResponse) -> bool:
        if not plan.segments:
            return False
        for segment in plan.segments:
            selected_variant = self._find_selected_variant(segment)
            if selected_variant is None:
                return False
            if selected_variant.status != "completed":
                return False
            if not selected_variant.video_asset_path and not selected_variant.remote_video_url:
                return False
        return True

    def has_pending_variants(self, plan: VideoGenerationPlanResponse) -> bool:
        for segment in plan.segments:
            for variant in segment.variants:
                if variant.status in {"pending", "submitted", "running"}:
                    return True
        return False

    def _split_story_text(self, text: str) -> list[str]:
        if not text:
            return ["请补充故事文本后再生成视频。"]

        normalized = re.sub(r"\s+", " ", text)
        raw_parts = re.split(r"(?<=[。！？!?；;])", normalized)
        sentences = [part.strip() for part in raw_parts if part.strip()]
        if not sentences:
            sentences = [normalized]

        target_segment_count = min(self.DEFAULT_SEGMENT_COUNT, max(1, len(sentences)))
        chunk_size = max(1, math.ceil(len(sentences) / target_segment_count))
        chunks = [
            "".join(sentences[index : index + chunk_size]).strip()
            for index in range(0, len(sentences), chunk_size)
        ]
        return chunks[: self.DEFAULT_SEGMENT_COUNT]

    def _build_segment_prompt(
        self,
        project: Project,
        chunk: str,
        style: str,
        segment_index: int,
    ) -> str:
        return (
            f"{style}，第{segment_index}段剧情视频，"
            f"故事标题：{project.title}，"
            f"剧情摘要：{chunk}，"
            "要求人物连贯、镜头自然、适合后续对白字幕与 BGM 合成。"
        )

    def _normalize_variant_status(self, raw_status: object) -> str:
        if not isinstance(raw_status, str):
            return "submitted"
        if raw_status in {"pending", "submitted", "completed", "failed"}:
            return raw_status
        if raw_status in {"preparing", "queueing"}:
            return "submitted"
        if raw_status in {"processing", "running"}:
            return "running"
        return "submitted"

    def _resolve_local_video_asset_path(self, project_id: str, target_id: str) -> Optional[str]:
        payload = self.file_store.load_generated_asset(project_id, "video_segment", target_id)
        if payload is None:
            return None
        candidate_path = payload.get("video_local_path") or payload.get("asset_path")
        if not isinstance(candidate_path, str) or not candidate_path.strip():
            return None
        asset_path = Path(candidate_path)
        return str(asset_path) if asset_path.exists() else None

    def _download_video_binary(
        self,
        project_id: str,
        target_id: str,
        download_payload: dict[str, object],
    ) -> str:
        video_url = str(download_payload.get("video_url") or "").strip()
        if not video_url:
            raise ValueError("视频下载地址为空")

        content, extension = self.download_proxy.download(
            remote_url=video_url,
            file_id=str(download_payload.get("file_id") or ""),
            target_id=target_id,
            filename=self._safe_string(download_payload.get("filename")),
        )
        local_path = self.file_store.save_generated_binary(
            project_id=project_id,
            asset_type="video_segment",
            target_id=target_id,
            content=content,
            extension=extension,
        )
        return str(local_path)

    def _probe_media_duration(self, source_path: Path) -> Optional[float]:
        if not source_path.exists():
            return None
        ffprobe = self._resolve_ffprobe_executable()
        if ffprobe is None:
            return None
        try:
            import subprocess

            result = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(source_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception:
            return None
        if result.returncode != 0:
            return None
        try:
            duration = float(result.stdout.strip())
        except ValueError:
            return None
        return duration if duration > 0 else None

    def _resolve_ffprobe_executable(self) -> Optional[str]:
        try:
            import shutil

            system_ffprobe = shutil.which("ffprobe")
            if system_ffprobe:
                return system_ffprobe
            system_ffmpeg = shutil.which("ffmpeg")
            if system_ffmpeg:
                ffprobe_candidate = Path(system_ffmpeg).with_name("ffprobe")
                if ffprobe_candidate.exists():
                    return str(ffprobe_candidate)
        except Exception:
            return None
        return None

    def _safe_string(self, value: object) -> Optional[str]:
        if isinstance(value, str) and value.strip():
            return value
        return None

    def _find_selected_variant(
        self,
        segment: VideoSegmentResponse,
    ) -> Optional[VideoSegmentVariantResponse]:
        selected_variant_id = segment.selected_variant_id
        if selected_variant_id:
            for variant in segment.variants:
                if variant.variant_id == selected_variant_id:
                    return variant
        for variant in segment.variants:
            if variant.status == "completed" and (variant.video_asset_path or variant.remote_video_url):
                return variant
        return None


def create_video_generation_service(file_store: ProjectFileStore) -> VideoGenerationService:
    return VideoGenerationService(file_store=file_store)
