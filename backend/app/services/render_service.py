from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from app.models.project import ProjectStatus
from app.models.storyboard import StoryShot
from app.schemas.project import (
    ExportStatusResponse,
    PreviewTimelineResponse,
    TimelineAudioTrackResponse,
    TimelineShotResponse,
    VideoGenerationPlanResponse,
)
from app.services.project_service import ProjectService
from app.storage.file_store import ProjectFileStore


class RenderService:
    SHOT_AUDIO_GAP_SECONDS = 0.35
    SHOT_END_BUFFER_SECONDS = 0.4
    VIDEO_CROSSFADE_SECONDS = 0.35
    AUDIO_CROSSFADE_SECONDS = 0.28

    def __init__(self, project_service: ProjectService, file_store: ProjectFileStore) -> None:
        self.project_service = project_service
        self.file_store = file_store

    def build_preview_timeline(self, project_id: str) -> PreviewTimelineResponse:
        self.project_service._require_project(project_id)
        raw_video_plan = self.file_store.load_video_plan(project_id)
        video_plan = (
            VideoGenerationPlanResponse.model_validate(raw_video_plan)
            if raw_video_plan is not None
            else None
        )

        if video_plan and self._has_video_segment_assets(video_plan):
            timeline_shots, audio_tracks, render_mode = self._build_video_segment_timeline(video_plan)
        elif video_plan and self._has_ready_remote_segment_selection(video_plan):
            raise ValueError(
                "当前环境已拿到远程视频片段，但本地缓存失败。请配置 HTTP_PROXY_URL 或 VIDEO_DOWNLOAD_PROXY_URL 后重试。"
            )
        else:
            storyboard = self._require_storyboard(project_id)
            timeline_shots, audio_tracks, render_mode = self._build_storyboard_timeline(
                project_id=project_id,
                storyboard=storyboard,
            )

        total_duration = self._resolve_total_duration(timeline_shots)
        scene_asset_count = sum(1 for shot in timeline_shots if shot.scene_asset_path or shot.video_asset_path)
        audio_asset_count = sum(1 for shot in timeline_shots if shot.audio_segments)

        preview_path = self._preview_file(project_id)
        payload = {
            "project_id": project_id,
            "status": "ready",
            "preview_file": str(preview_path),
            "total_duration": total_duration,
            "shot_count": len(timeline_shots),
            "render_mode": render_mode,
            "scene_asset_count": scene_asset_count,
            "audio_asset_count": audio_asset_count,
            "updated_at": datetime.now().isoformat(),
            "shots": [shot.model_dump(mode="json") for shot in timeline_shots],
            "audio_tracks": [track.model_dump(mode="json") for track in audio_tracks],
        }
        self.file_store.write_json(preview_path, payload)
        return PreviewTimelineResponse.model_validate(payload)

    def get_export_status(self, project_id: str) -> ExportStatusResponse:
        self.project_service._require_project(project_id)
        raw_status = self.file_store.read_json(self._export_status_file(project_id))
        if raw_status is None:
            return ExportStatusResponse(
                project_id=project_id,
                status="idle",
                render_mode="placeholder",
                updated_at=datetime.now(),
            )
        return ExportStatusResponse.model_validate(raw_status)

    def export_project(self, project_id: str) -> ExportStatusResponse:
        raw_video_plan = self.file_store.load_video_plan(project_id)
        if raw_video_plan is not None:
            video_plan = VideoGenerationPlanResponse.model_validate(raw_video_plan)
            if self._has_ready_remote_segment_selection(video_plan) and not self._has_complete_video_segment_selection(video_plan):
                return self._write_export_status(
                    project_id=project_id,
                    status="failed",
                    render_mode="video_segments",
                    error_message=(
                        "当前环境已拿到远程视频片段，但本地缓存失败。"
                        "请配置 HTTP_PROXY_URL 或 VIDEO_DOWNLOAD_PROXY_URL 后重试导出。"
                    ),
                )
        preview = self.build_preview_timeline(project_id)
        self._write_export_status(
            project_id=project_id,
            status="running",
            preview_file=preview.preview_file,
            total_duration=preview.total_duration,
            shot_count=preview.shot_count,
            render_mode=preview.render_mode,
            scene_asset_count=preview.scene_asset_count,
            audio_asset_count=preview.audio_asset_count,
        )

        export_file = self._export_file(project_id)
        ffmpeg_executable = self._resolve_ffmpeg_executable()
        if ffmpeg_executable is None:
            return self._write_export_status(
                project_id=project_id,
                status="failed",
                preview_file=preview.preview_file,
                total_duration=preview.total_duration,
                shot_count=preview.shot_count,
                render_mode=preview.render_mode,
                scene_asset_count=preview.scene_asset_count,
                audio_asset_count=preview.audio_asset_count,
                error_message="未找到可用的 FFmpeg，可安装系统 ffmpeg 或补装 imageio-ffmpeg。",
            )

        try:
            self._run_ffmpeg_export(
                ffmpeg_executable=ffmpeg_executable,
                export_file=export_file,
                preview=preview,
            )
        except Exception as exc:
            return self._write_export_status(
                project_id=project_id,
                status="failed",
                preview_file=preview.preview_file,
                total_duration=preview.total_duration,
                shot_count=preview.shot_count,
                render_mode=preview.render_mode,
                scene_asset_count=preview.scene_asset_count,
                audio_asset_count=preview.audio_asset_count,
                error_message=str(exc),
            )

        self.project_service.update_project_metadata(project_id, status=ProjectStatus.exported)
        return self._write_export_status(
            project_id=project_id,
            status="completed",
            preview_file=preview.preview_file,
            export_file=str(export_file),
            total_duration=preview.total_duration,
            shot_count=preview.shot_count,
            render_mode=preview.render_mode,
            scene_asset_count=preview.scene_asset_count,
            audio_asset_count=preview.audio_asset_count,
        )

    def _build_storyboard_timeline(
        self,
        project_id: str,
        storyboard,
    ) -> tuple[list[TimelineShotResponse], list[TimelineAudioTrackResponse], str]:
        timeline_shots: list[TimelineShotResponse] = []
        audio_tracks: list[TimelineAudioTrackResponse] = []

        for index, shot in enumerate(storyboard.shots, start=1):
            scene_asset = (
                self.file_store.load_generated_asset(project_id, "scene_image", shot.scene_id or "")
                if shot.scene_id
                else None
            )
            tts_asset = self.file_store.load_generated_asset(project_id, "tts", shot.id)
            audio_segments = self._extract_audio_segments(project_id, shot, tts_asset)
            character_asset_paths = self._extract_character_asset_paths(project_id, shot)

            duration = self._resolve_shot_duration(
                shot=shot,
                suggested_duration=storyboard.suggested_duration,
                shot_count=len(storyboard.shots),
                audio_segments=audio_segments,
            )
            timeline_shot = TimelineShotResponse(
                order=index,
                shot_id=shot.id,
                title=shot.title,
                duration_seconds=duration,
                subtitle=self._build_subtitle(shot),
                narration=shot.narration,
                scene_asset_path=self._extract_asset_path(scene_asset),
                character_asset_paths=character_asset_paths,
                audio_segments=audio_segments,
            )
            timeline_shots.append(timeline_shot)
            audio_tracks.extend(audio_segments)

        render_mode = self._resolve_render_mode(
            shot_count=len(timeline_shots),
            scene_asset_count=sum(1 for shot in timeline_shots if shot.scene_asset_path),
            audio_asset_count=sum(1 for shot in timeline_shots if shot.audio_segments),
        )
        return timeline_shots, audio_tracks, render_mode

    def _build_video_segment_timeline(
        self,
        video_plan: VideoGenerationPlanResponse,
    ) -> tuple[list[TimelineShotResponse], list[TimelineAudioTrackResponse], str]:
        timeline_shots: list[TimelineShotResponse] = []
        for index, segment in enumerate(video_plan.segments, start=1):
            selected_variant = self._selected_variant(segment)
            if selected_variant is None or not selected_variant.video_asset_path:
                continue
            video_asset_path = Path(selected_variant.video_asset_path)
            if not video_asset_path.exists():
                continue
            duration = self._probe_media_duration(video_asset_path) or selected_variant.duration_seconds or 6
            timeline_shots.append(
                TimelineShotResponse(
                    order=index,
                    shot_id=segment.segment_id,
                    title=segment.title,
                    duration_seconds=max(math.ceil(duration), 2),
                    subtitle=segment.summary,
                    narration=segment.summary,
                    video_asset_path=str(video_asset_path),
                    audio_segments=[],
                )
            )
        return timeline_shots, [], "video_segments"

    def _require_storyboard(self, project_id: str):
        storyboard = self.project_service.load_storyboard(project_id)
        if storyboard is None:
            raise ValueError("请先生成并确认剧本稿，再生成预览或导出视频。")
        return storyboard

    def _build_subtitle(self, shot: StoryShot) -> str:
        if shot.dialogues:
            return " ".join(dialogue.content for dialogue in shot.dialogues if dialogue.content)
        if shot.narration:
            return shot.narration
        return shot.summary

    def _extract_audio_segments(
        self,
        project_id: str,
        shot: StoryShot,
        tts_asset: Optional[dict[str, Any]],
    ) -> list[TimelineAudioTrackResponse]:
        if not tts_asset:
            return []

        if tts_asset.get("segments"):
            raw_segments = [
                item for item in tts_asset.get("segments", []) if isinstance(item, dict)
            ]
        else:
            raw_segments = [tts_asset]

        audio_segments: list[TimelineAudioTrackResponse] = []
        current_offset = 0.0
        for index, segment in enumerate(raw_segments, start=1):
            source_path = self._extract_asset_path(segment)
            if not source_path:
                continue
            duration = self._resolve_audio_duration(segment)
            audio_segments.append(
                TimelineAudioTrackResponse(
                    track_type="tts",
                    segment_type=str(segment.get("segment_type") or "dialogue"),
                    target_id=str(segment.get("segment_id") or segment.get("target_id") or shot.id),
                    shot_id=shot.id,
                    source_path=source_path,
                    label=str(segment.get("speaker") or f"{shot.title} 语音 {index}"),
                    speaker=str(segment.get("speaker") or "") or None,
                    voice_id=str(segment.get("voice_id") or "") or None,
                    start_offset_seconds=round(current_offset, 3),
                    duration_seconds=round(duration, 3),
                )
            )
            next_segment = raw_segments[index] if index < len(raw_segments) else None
            current_offset += duration + self._resolve_segment_gap_seconds(segment, next_segment)
        return audio_segments

    def _extract_character_asset_paths(self, project_id: str, shot: StoryShot) -> list[str]:
        paths: list[str] = []
        for character_id in shot.character_ids:
            payload = self.file_store.load_generated_asset(project_id, "character_image", character_id)
            path = self._extract_asset_path(payload)
            if path and Path(path).exists():
                paths.append(path)
        return paths

    def _resolve_shot_duration(
        self,
        shot: StoryShot,
        suggested_duration: Optional[int],
        shot_count: int,
        audio_segments: list[TimelineAudioTrackResponse],
    ) -> int:
        configured_duration = 0
        if shot.expected_duration and shot.expected_duration > 0:
            configured_duration = shot.expected_duration
        elif suggested_duration and shot_count > 0:
            configured_duration = max(3, suggested_duration // shot_count)
        else:
            configured_duration = 6

        audio_duration = 0.0
        if audio_segments:
            audio_duration = (
                sum(segment.duration_seconds for segment in audio_segments)
                + sum(
                    self._resolve_segment_gap_seconds_from_track(
                        audio_segments[index],
                        audio_segments[index + 1],
                    )
                    for index in range(len(audio_segments) - 1)
                )
                + self.SHOT_END_BUFFER_SECONDS
            )
        return max(configured_duration, math.ceil(audio_duration), 2)

    def _resolve_total_duration(self, timeline_shots: list[TimelineShotResponse]) -> int:
        if not timeline_shots:
            return 0
        total_duration = sum(shot.duration_seconds for shot in timeline_shots)
        overlap_count = max(len(timeline_shots) - 1, 0)
        total_duration -= overlap_count * self.VIDEO_CROSSFADE_SECONDS
        return max(math.ceil(total_duration), 1)

    def _resolve_segment_gap_seconds(
        self,
        segment: dict[str, Any],
        next_segment: Optional[dict[str, Any]],
    ) -> float:
        if next_segment is None:
            return self.SHOT_END_BUFFER_SECONDS

        current_type = str(segment.get("segment_type") or "dialogue")
        next_type = str(next_segment.get("segment_type") or "dialogue")
        if current_type == "narration":
            return 0.22
        if current_type == "dialogue" and next_type == "dialogue":
            return 0.42
        if next_type == "narration":
            return 0.25
        return self.SHOT_AUDIO_GAP_SECONDS

    def _resolve_segment_gap_seconds_from_track(
        self,
        segment: TimelineAudioTrackResponse,
        next_segment: TimelineAudioTrackResponse,
    ) -> float:
        if segment.segment_type == "narration":
            return 0.22
        if segment.segment_type == "dialogue" and next_segment.segment_type == "dialogue":
            return 0.42
        if next_segment.segment_type == "narration":
            return 0.25
        return self.SHOT_AUDIO_GAP_SECONDS

    def _resolve_audio_duration(self, payload: dict[str, Any]) -> float:
        duration_ms = payload.get("duration_ms")
        if isinstance(duration_ms, (int, float)) and duration_ms > 0:
            return max(float(duration_ms) / 1000, 0.5)

        source_path = self._extract_asset_path(payload)
        if source_path:
            probed_duration = self._probe_media_duration(Path(source_path))
            if probed_duration:
                return max(probed_duration, 0.5)

        script = str(payload.get("script") or "")
        return max(len(script) / 6.0, 1.2)

    def _probe_media_duration(self, source_path: Path) -> Optional[float]:
        if not source_path.exists():
            return None
        ffprobe = self._resolve_ffprobe_executable()
        if ffprobe is None:
            return None
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
        if result.returncode != 0:
            return None
        try:
            duration = float(result.stdout.strip())
        except ValueError:
            return None
        return duration if duration > 0 else None

    def _extract_asset_path(self, payload: Optional[dict[str, Any]]) -> Optional[str]:
        if not payload:
            return None
        local_path = payload.get("image_local_path") or payload.get("audio_local_path")
        if local_path:
            return str(local_path)
        asset_path = payload.get("asset_path")
        return str(asset_path) if asset_path else None

    def _preview_file(self, project_id: str) -> Path:
        return self.file_store.get_exports_dir(project_id) / "preview-timeline.json"

    def _export_status_file(self, project_id: str) -> Path:
        return self.file_store.get_exports_dir(project_id) / "export-status.json"

    def _export_file(self, project_id: str) -> Path:
        return self.file_store.get_exports_dir(project_id) / "dynamic-manga-preview.mp4"

    def _write_export_status(
        self,
        project_id: str,
        status: str,
        preview_file: Optional[str] = None,
        export_file: Optional[str] = None,
        total_duration: Optional[int] = None,
        shot_count: int = 0,
        render_mode: str = "placeholder",
        scene_asset_count: int = 0,
        audio_asset_count: int = 0,
        error_message: Optional[str] = None,
    ) -> ExportStatusResponse:
        payload = {
            "project_id": project_id,
            "status": status,
            "preview_file": preview_file,
            "export_file": export_file,
            "total_duration": total_duration,
            "shot_count": shot_count,
            "render_mode": render_mode,
            "scene_asset_count": scene_asset_count,
            "audio_asset_count": audio_asset_count,
            "error_message": error_message,
            "updated_at": datetime.now().isoformat(),
        }
        self.file_store.write_json(self._export_status_file(project_id), payload)
        return ExportStatusResponse.model_validate(payload)

    def _resolve_ffmpeg_executable(self) -> Optional[str]:
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg:
            return system_ffmpeg

        try:
            from imageio_ffmpeg import get_ffmpeg_exe

            return get_ffmpeg_exe()
        except Exception:
            return None

    def _resolve_ffprobe_executable(self) -> Optional[str]:
        system_ffprobe = shutil.which("ffprobe")
        if system_ffprobe:
            return system_ffprobe

        ffmpeg_executable = self._resolve_ffmpeg_executable()
        if not ffmpeg_executable:
            return None
        ffprobe_candidate = Path(ffmpeg_executable).with_name("ffprobe")
        if ffprobe_candidate.exists():
            return str(ffprobe_candidate)
        return None

    def _run_ffmpeg_export(
        self,
        ffmpeg_executable: str,
        export_file: Path,
        preview: PreviewTimelineResponse,
    ) -> None:
        export_file.parent.mkdir(parents=True, exist_ok=True)
        total_duration = max(preview.total_duration, 3)

        if preview.shots:
            with tempfile.TemporaryDirectory(prefix="manga-render-") as temp_dir:
                temp_dir_path = Path(temp_dir)
                segment_files: list[Path] = []
                for shot in preview.shots:
                    segment_file = temp_dir_path / f"{shot.order:03d}-{shot.shot_id}.mp4"
                    if shot.video_asset_path and Path(shot.video_asset_path).exists():
                        self._prepare_video_segment_asset(
                            ffmpeg_executable=ffmpeg_executable,
                            shot=shot,
                            segment_file=segment_file,
                        )
                    else:
                        self._render_shot_segment(
                            ffmpeg_executable=ffmpeg_executable,
                            shot=shot,
                            segment_file=segment_file,
                        )
                    segment_files.append(segment_file)

                command = [ffmpeg_executable, "-y"]
                for segment_file in segment_files:
                    command.extend(["-i", str(segment_file)])

                if len(segment_files) == 1:
                    command.extend(
                        [
                            "-c:v",
                            "libx264",
                            "-c:a",
                            "aac",
                            "-pix_fmt",
                            "yuv420p",
                            "-movflags",
                            "+faststart",
                            str(export_file),
                        ]
                    )
                else:
                    video_filters: list[str] = []
                    audio_filters: list[str] = []
                    cumulative_duration = preview.shots[0].duration_seconds
                    current_video_label = "0:v"
                    current_audio_label = "0:a"

                    for index in range(1, len(segment_files)):
                        next_video_label = f"{index}:v"
                        next_audio_label = f"{index}:a"
                        output_video_label = f"vxf{index}"
                        output_audio_label = f"axf{index}"
                        offset = max(
                            cumulative_duration - self.VIDEO_CROSSFADE_SECONDS,
                            0,
                        )
                        video_filters.append(
                            f"[{current_video_label}][{next_video_label}]xfade=transition=fade:duration={self.VIDEO_CROSSFADE_SECONDS}:offset={offset}[{output_video_label}]"
                        )
                        audio_filters.append(
                            f"[{current_audio_label}][{next_audio_label}]acrossfade=d={self.AUDIO_CROSSFADE_SECONDS}:c1=tri:c2=tri[{output_audio_label}]"
                        )
                        current_video_label = output_video_label
                        current_audio_label = output_audio_label
                        cumulative_duration += (
                            preview.shots[index].duration_seconds - self.VIDEO_CROSSFADE_SECONDS
                        )

                    command.extend(
                        [
                            "-filter_complex",
                            ";".join(video_filters + audio_filters),
                            "-map",
                            f"[{current_video_label}]",
                            "-map",
                            f"[{current_audio_label}]",
                            "-c:v",
                            "libx264",
                            "-c:a",
                            "aac",
                            "-pix_fmt",
                            "yuv420p",
                            "-movflags",
                            "+faststart",
                            str(export_file),
                        ]
                    )
                result = subprocess.run(command, capture_output=True, text=True, check=False)
                if result.returncode != 0:
                    error_message = result.stderr.strip() or "FFmpeg 拼接导出失败"
                    raise RuntimeError(error_message)
                return

        command = [
            ffmpeg_executable,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x171717:s=1280x720:d={total_duration}",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(export_file),
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            error_message = result.stderr.strip() or "FFmpeg 导出失败"
            raise RuntimeError(error_message)

    def _render_shot_segment(
        self,
        ffmpeg_executable: str,
        shot: TimelineShotResponse,
        segment_file: Path,
    ) -> None:
        duration = max(shot.duration_seconds, 2)
        command: list[str] = [ffmpeg_executable, "-y"]

        if shot.scene_asset_path and Path(shot.scene_asset_path).exists():
            command.extend(["-loop", "1", "-i", shot.scene_asset_path])
        else:
            command.extend(
                [
                    "-f",
                    "lavfi",
                    "-i",
                    f"color=c=0x171717:s=1280x720:d={duration}",
                ]
            )

        character_paths = [
            path for path in shot.character_asset_paths if path and Path(path).exists()
        ]
        for path in character_paths:
            command.extend(["-loop", "1", "-i", path])

        audio_stream_indexes: list[int] = []
        next_input_index = 1 + len(character_paths)
        if shot.audio_segments:
            for index, segment in enumerate(shot.audio_segments):
                if segment.source_path and Path(segment.source_path).exists():
                    command.extend(["-i", segment.source_path])
                    audio_stream_indexes.append(next_input_index)
                    next_input_index += 1
                if index < len(shot.audio_segments) - 1:
                    command.extend(
                        [
                            "-f",
                            "lavfi",
                            "-t",
                            str(self.SHOT_AUDIO_GAP_SECONDS),
                            "-i",
                            "anullsrc=channel_layout=stereo:sample_rate=44100",
                        ]
                    )
                    audio_stream_indexes.append(next_input_index)
                    next_input_index += 1
        else:
            command.extend(
                [
                    "-f",
                    "lavfi",
                    "-t",
                    str(duration),
                    "-i",
                    "anullsrc=channel_layout=stereo:sample_rate=44100",
                ]
            )
            audio_stream_indexes.append(next_input_index)

        video_filters = ["[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=rgba[v0]"]
        current_video_label = "v0"
        if character_paths:
            x_positions = self._resolve_overlay_positions(len(character_paths))
            for index, _ in enumerate(character_paths, start=1):
                input_label = f"char{index}"
                output_label = f"v{index}"
                overlay_x = x_positions[index - 1]
                video_filters.append(
                    f"[{index}:v]scale=360:-1,format=rgba[{input_label}]"
                )
                video_filters.append(
                    f"[{current_video_label}][{input_label}]overlay={overlay_x}:H-h-30:enable='between(t,0,{duration})'[{output_label}]"
                )
                current_video_label = output_label
        video_filters.append(f"[{current_video_label}]format=yuv420p[vout]")

        audio_inputs = "".join(f"[{stream_index}:a]" for stream_index in audio_stream_indexes)
        fade_out_start = max(duration - 0.18, 0)
        audio_filters = [
            f"{audio_inputs}concat=n={len(audio_stream_indexes)}:v=0:a=1[audio_concat]",
            f"[audio_concat]afade=t=in:st=0:d=0.08,afade=t=out:st={fade_out_start}:d=0.18[aout]",
        ]

        command.extend(
            [
                "-filter_complex",
                ";".join(video_filters + audio_filters),
                "-map",
                "[vout]",
                "-map",
                "[aout]",
                "-t",
                str(duration),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(segment_file),
            ]
        )
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            error_message = result.stderr.strip() or f"镜头片段导出失败: {shot.title}"
            raise RuntimeError(error_message)

    def _prepare_video_segment_asset(
        self,
        ffmpeg_executable: str,
        shot: TimelineShotResponse,
        segment_file: Path,
    ) -> None:
        if not shot.video_asset_path or not Path(shot.video_asset_path).exists():
            raise RuntimeError(f"视频片段不存在: {shot.title}")

        duration = max(shot.duration_seconds, 2)
        command = [
            ffmpeg_executable,
            "-y",
            "-i",
            shot.video_asset_path,
            "-f",
            "lavfi",
            "-t",
            str(duration),
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-filter_complex",
            "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p[vout]",
            "-map",
            "[vout]",
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(segment_file),
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            error_message = result.stderr.strip() or f"视频片段预处理失败: {shot.title}"
            raise RuntimeError(error_message)

    def _resolve_overlay_positions(self, count: int) -> list[str]:
        if count <= 1:
            return ["(W-w)/2"]
        if count == 2:
            return ["W*0.16", "W*0.56"]
        if count == 3:
            return ["W*0.04", "W*0.36", "W*0.68"]
        return ["W*0.02", "W*0.28", "W*0.54", "W*0.78"]

    def _resolve_render_mode(
        self,
        shot_count: int,
        scene_asset_count: int,
        audio_asset_count: int,
    ) -> str:
        if shot_count == 0:
            return "placeholder"
        if scene_asset_count >= shot_count and audio_asset_count >= shot_count:
            return "real_assets"
        if scene_asset_count > 0 or audio_asset_count > 0:
            return "mixed"
        return "placeholder"

    def _has_video_segment_assets(self, video_plan: VideoGenerationPlanResponse) -> bool:
        for segment in video_plan.segments:
            selected_variant = self._selected_variant(segment)
            if selected_variant and selected_variant.video_asset_path:
                asset_path = Path(selected_variant.video_asset_path)
                if asset_path.exists():
                    return True
        return False

    def _has_complete_video_segment_selection(
        self,
        video_plan: VideoGenerationPlanResponse,
    ) -> bool:
        if not video_plan.segments:
            return False
        for segment in video_plan.segments:
            selected_variant = self._selected_variant(segment)
            if selected_variant is None or not selected_variant.video_asset_path:
                return False
            if not Path(selected_variant.video_asset_path).exists():
                return False
        return True

    def _has_ready_remote_segment_selection(
        self,
        video_plan: VideoGenerationPlanResponse,
    ) -> bool:
        if not video_plan.segments:
            return False
        for segment in video_plan.segments:
            selected_variant = self._selected_variant(segment)
            if selected_variant is None or selected_variant.status != "completed":
                return False
            if not selected_variant.video_asset_path and not selected_variant.remote_video_url:
                return False
        return True

    def _selected_variant(self, segment) -> Optional[Any]:
        if segment.selected_variant_id:
            for variant in segment.variants:
                if variant.variant_id == segment.selected_variant_id:
                    return variant
        for variant in segment.variants:
            if variant.status == "completed" and variant.video_asset_path:
                return variant
        return None


def create_render_service(project_service: ProjectService) -> RenderService:
    return RenderService(project_service=project_service, file_store=project_service.file_store)
