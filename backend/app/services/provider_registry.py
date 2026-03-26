from __future__ import annotations

from typing import Any, Protocol

import httpx

from app.core.config import Settings, get_settings
from app.models.job import JobType
from app.models.project import Project


class AssetProvider(Protocol):
    key: str

    def generate_script_draft(self, project: Project, source_text: str) -> dict[str, Any]:
        ...

    def generate_character_image(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        ...

    def generate_scene_image(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        ...

    def generate_tts(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        ...


class LocalMockProvider:
    key = "local_mock"

    def generate_script_draft(self, project: Project, source_text: str) -> dict[str, Any]:
        return {
            "project_id": project.id,
            "summary": source_text[:80],
            "provider": self.key,
        }

    def generate_character_image(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        return {
            "asset_type": JobType.character_image.value,
            "provider": self.key,
            "prompt": f"{project.style_template or '漫剧风格'} 角色立绘：{payload.get('name', '未命名角色')}",
            "target_id": payload.get("target_id", ""),
        }

    def generate_scene_image(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        return {
            "asset_type": JobType.scene_image.value,
            "provider": self.key,
            "prompt": f"{project.style_template or '漫剧风格'} 场景图：{payload.get('description', '')}",
            "target_id": payload.get("target_id", ""),
        }

    def generate_tts(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        return {
            "asset_type": JobType.tts.value,
            "provider": self.key,
            "voice_style": project.voice_style or "默认旁白",
            "voice_id": payload.get("voice_id") or "mock-voice",
            "script": payload.get("script", ""),
            "target_id": payload.get("target_id", ""),
        }


class ArkMiniMaxProvider:
    key = "ark_minimax"

    def __init__(
        self,
        settings: Settings | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.client = client

    def generate_script_draft(self, project: Project, source_text: str) -> dict[str, Any]:
        return {
            "project_id": project.id,
            "provider": self.key,
            "summary": source_text[:80],
        }

    def generate_character_image(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        prompt = self._build_character_prompt(project, payload)
        return self._generate_image(project, payload, prompt, JobType.character_image.value)

    def generate_scene_image(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        prompt = self._build_scene_prompt(project, payload)
        return self._generate_image(project, payload, prompt, JobType.scene_image.value)

    def generate_tts(self, project: Project, payload: dict[str, str]) -> dict[str, Any]:
        if not self.settings.minimax_api_key:
            raise ValueError("未配置 MiniMax API Key")

        voice_id = payload.get("voice_id") or self.settings.minimax_tts_voice_id
        script = payload.get("script", "")
        request_payload = {
            "model": self.settings.minimax_tts_model,
            "text": script,
            "stream": False,
            "voice_setting": {
                "voice_id": voice_id,
                "speed": 1,
                "vol": 1,
                "pitch": 0,
                "emotion": self.settings.minimax_tts_emotion,
            },
            "audio_setting": {
                "sample_rate": 32000,
                "bitrate": 128000,
                "format": self.settings.minimax_tts_audio_format,
                "channel": 1,
            },
            "subtitle_enable": False,
        }
        response = self._post_json(
            f"{self.settings.minimax_base_url}/t2a_v2",
            headers={
                "Authorization": f"Bearer {self.settings.minimax_api_key}",
                "Content-Type": "application/json",
            },
            payload=request_payload,
        )
        data = response.get("data") or {}
        audio_base64 = data.get("audio")
        if not isinstance(audio_base64, str) or not audio_base64:
            raise ValueError("MiniMax 未返回音频内容")
        extra_info = data.get("extra_info") or {}
        audio_length = extra_info.get("audio_length")

        return {
            "asset_type": JobType.tts.value,
            "provider": self.key,
            "model": self.settings.minimax_tts_model,
            "script": script,
            "voice_style": payload.get("voice_label") or project.voice_style or "默认旁白",
            "voice_id": voice_id,
            "audio_format": self.settings.minimax_tts_audio_format,
            "audio_base64": audio_base64,
            "duration_ms": audio_length if isinstance(audio_length, (int, float)) else None,
            "target_id": payload.get("target_id", ""),
        }

    def _generate_image(
        self,
        project: Project,
        payload: dict[str, str],
        prompt: str,
        asset_type: str,
    ) -> dict[str, Any]:
        if not self.settings.ark_api_key:
            raise ValueError("未配置火山 Ark API Key")

        request_payload = {
            "model": self.settings.ark_image_model,
            "prompt": prompt,
            "sequential_image_generation": "disabled",
            "response_format": "url",
            "size": "2K",
            "stream": False,
            "watermark": False,
        }
        response = self._post_json(
            f"{self.settings.ark_base_url}/images/generations",
            headers={
                "Authorization": f"Bearer {self.settings.ark_api_key}",
                "Content-Type": "application/json",
            },
            payload=request_payload,
        )
        data = response.get("data") or []
        item = data[0] if data else {}
        image_url = item.get("url")
        if not isinstance(image_url, str) or not image_url:
            raise ValueError("火山图片模型未返回图片地址")

        return {
            "asset_type": asset_type,
            "provider": self.key,
            "model": self.settings.ark_image_model,
            "prompt": prompt,
            "remote_url": image_url,
            "target_id": payload.get("target_id", ""),
        }

    def _build_character_prompt(self, project: Project, payload: dict[str, str]) -> str:
        style = project.style_template or "日漫/国漫分镜感"
        name = payload.get("name", "未命名角色")
        appearance = payload.get("appearance", "")
        return (
            f"{style}，角色立绘，单人，半身到全身构图，"
            f"角色名：{name}，外观：{appearance}，"
            "高辨识度，适合动态漫剧创作台后续复用，干净背景，电影感光影。"
        )

    def _build_scene_prompt(self, project: Project, payload: dict[str, str]) -> str:
        style = project.style_template or "日漫/国漫分镜感"
        name = payload.get("name", "场景")
        description = payload.get("description", "")
        return (
            f"{style}，漫剧场景图，场景名：{name}，"
            f"场景描述：{description}，适合分镜背景，电影感构图，氛围明确，细节清晰。"
        )

    def _post_json(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if self.client is not None:
            response = self.client.post(url, headers=headers, json=payload, timeout=120)
            response.raise_for_status()
            return response.json()

        with httpx.Client(timeout=120) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()


class ProviderRegistry:
    def __init__(self) -> None:
        self.providers: dict[str, AssetProvider] = {
            LocalMockProvider.key: LocalMockProvider(),
            ArkMiniMaxProvider.key: ArkMiniMaxProvider(),
        }

    def get_provider(self, provider_key: str) -> AssetProvider:
        provider = self.providers.get(provider_key)
        if provider is None:
            raise ValueError(f"未找到 provider: {provider_key}")
        return provider
