from __future__ import annotations

import json
import re
from typing import Any, Optional

import httpx

from app.core.config import Settings, get_settings
from app.models.project import Project
from app.models.storyboard import (
    StoryBeat,
    StoryCharacter,
    StoryDialogue,
    StoryScene,
    StoryShot,
    StoryboardDraft,
)


class ScriptDraftService:
    DEFAULT_VOICE_PRESETS = [
        {
            "voice_id": "Chinese (Mandarin)_Reliable_Executive",
            "voice_label": "沉稳高管",
        },
        {
            "voice_id": "Chinese (Mandarin)_News_Anchor",
            "voice_label": "新闻女声",
        },
    ]

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[httpx.Client] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.client = client

    def generate_draft(self, project: Project) -> StoryboardDraft:
        if self.settings.ark_api_key:
            try:
                return self._generate_with_ark(project)
            except Exception:
                pass
        return self._generate_with_rules(project)

    def _generate_with_ark(self, project: Project) -> StoryboardDraft:
        response_payload = self._request_ark_draft(project)
        content = self._extract_response_content(response_payload)
        draft_payload = self._extract_json_payload(content)
        return self._build_storyboard_from_model(project, draft_payload)

    def _request_ark_draft(self, project: Project) -> dict[str, Any]:
        payload = {
            "model": self.settings.ark_text_model,
            "temperature": 0.7,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是漫剧分镜策划师。"
                        "请把用户输入改写成结构化剧本稿，只输出 JSON，不要输出解释。"
                    ),
                },
                {
                    "role": "user",
                    "content": self._build_model_prompt(project),
                },
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.settings.ark_api_key}",
            "Content-Type": "application/json",
        }

        if self.client is not None:
            response = self.client.post(
                f"{self.settings.ark_base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=90,
            )
            response.raise_for_status()
            return response.json()

        with httpx.Client(timeout=90) as client:
            response = client.post(
                f"{self.settings.ark_base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    def _build_model_prompt(self, project: Project) -> str:
        return f"""
请根据下面的项目信息，生成一份“动态漫剧结构化剧本稿”。

项目标题：{project.title}
题材：{project.genre or "未指定"}
风格模板：{project.style_template or "日漫/国漫分镜感"}
目标时长：{project.target_duration} 秒
配音风格：{project.voice_style or "未指定"}

原始文本：
{project.source_text}

请只输出 JSON，字段结构固定如下：
{{
  "characters": [
    {{
      "name": "角色名",
      "role": "角色定位",
      "appearance": "外观描述",
      "notes": "补充说明"
    }}
  ],
  "scenes": [
    {{
      "name": "场景名",
      "description": "场景描述",
      "visual_prompt": "适合文生图的中文提示"
    }}
  ],
  "beats": [
    {{
      "title": "情节点标题",
      "summary": "情节点摘要",
      "emotion": "情绪"
    }}
  ],
  "shots": [
    {{
      "title": "分镜标题",
      "scene_index": 1,
      "beat_index": 1,
      "summary": "分镜摘要",
      "narration": "旁白",
      "dialogues": [
        {{
          "speaker": "说话人",
          "content": "台词"
        }}
      ],
      "camera": "镜头描述",
      "emotion": "情绪",
      "expected_duration": 8
    }}
  ],
  "suggested_duration": {project.target_duration},
  "notes": ["一句说明"]
}}

要求：
1. 全部使用中文。
2. characters 2 到 4 个，scenes 2 到 4 个，beats 3 到 6 个，shots 3 到 8 个。
3. scene_index 和 beat_index 从 1 开始。
4. expected_duration 为整数秒。
5. 保证结构可直接用于 Web 创作台编辑。
""".strip()

    def _extract_response_content(self, response_payload: dict[str, Any]) -> str:
        choices = response_payload.get("choices") or []
        if not choices:
            raise ValueError("火山文本模型未返回 choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("火山文本模型返回内容为空")
        return content

    def _extract_json_payload(self, content: str) -> dict[str, Any]:
        fenced_match = re.search(r"```json\s*(\{.*\})\s*```", content, re.S)
        if fenced_match:
            return json.loads(fenced_match.group(1))

        brace_match = re.search(r"(\{.*\})", content, re.S)
        if brace_match:
            return json.loads(brace_match.group(1))

        return json.loads(content)

    def _build_storyboard_from_model(
        self,
        project: Project,
        payload: dict[str, Any],
    ) -> StoryboardDraft:
        characters_raw = payload.get("characters") or []
        scenes_raw = payload.get("scenes") or []
        beats_raw = payload.get("beats") or []
        shots_raw = payload.get("shots") or []

        characters = [
            StoryCharacter(
                id=f"character-{index}",
                name=self._safe_text(item.get("name"), f"角色 {index}"),
                role=self._safe_optional_text(item.get("role")),
                appearance=self._safe_optional_text(item.get("appearance")),
                notes=self._safe_optional_text(item.get("notes")),
                voice_id=self._default_voice_id(index),
                voice_label=self._default_voice_label(index),
            )
            for index, item in enumerate(characters_raw[:4], start=1)
            if isinstance(item, dict)
        ]

        scenes = [
            StoryScene(
                id=f"scene-{index}",
                name=self._safe_text(item.get("name"), f"场景 {index}"),
                description=self._safe_text(item.get("description"), "场景描述待补充"),
                visual_prompt=self._safe_optional_text(item.get("visual_prompt")),
            )
            for index, item in enumerate(scenes_raw[:4], start=1)
            if isinstance(item, dict)
        ]

        beats = [
            StoryBeat(
                id=f"beat-{index}",
                title=self._safe_text(item.get("title"), f"情节节点 {index}"),
                summary=self._safe_text(item.get("summary"), "情节摘要待补充"),
                emotion=self._safe_optional_text(item.get("emotion")),
            )
            for index, item in enumerate(beats_raw[:6], start=1)
            if isinstance(item, dict)
        ]

        shots: list[StoryShot] = []
        for index, item in enumerate(shots_raw[:8], start=1):
            if not isinstance(item, dict):
                continue
            scene_id = self._resolve_reference_id(item.get("scene_index"), scenes)
            beat_id = self._resolve_reference_id(item.get("beat_index"), beats)
            dialogues_raw = item.get("dialogues") or []
            dialogues: list[StoryDialogue] = []
            character_ids: list[str] = []
            for dialogue in dialogues_raw:
                if not isinstance(dialogue, dict):
                    continue
                content = self._safe_text(dialogue.get("content"), "")
                if not content:
                    continue
                speaker = self._safe_text(dialogue.get("speaker"), "旁白")
                speaker_id = self._match_character_id(speaker, characters)
                if speaker_id and speaker_id not in character_ids:
                    character_ids.append(speaker_id)
                dialogues.append(
                    StoryDialogue(
                        speaker=speaker,
                        speaker_id=speaker_id,
                        content=content,
                    )
                )
            shots.append(
                StoryShot(
                    id=f"shot-{index}",
                    title=self._safe_text(item.get("title"), f"分镜 {index}"),
                    scene_id=scene_id,
                    beat_id=beat_id,
                    summary=self._safe_text(item.get("summary"), "分镜摘要待补充"),
                    narration=self._safe_optional_text(item.get("narration")),
                    dialogues=dialogues,
                    character_ids=character_ids,
                    camera=self._safe_optional_text(item.get("camera")),
                    emotion=self._safe_optional_text(item.get("emotion")),
                    expected_duration=self._safe_duration(
                        item.get("expected_duration"),
                        project.target_duration,
                        len(shots_raw) or 1,
                    ),
                )
            )

        if not characters or not scenes or not beats or not shots:
            raise ValueError("火山文本模型返回的结构化剧本稿不完整")

        notes = [
            note
            for note in (payload.get("notes") or [])
            if isinstance(note, str) and note.strip()
        ]
        notes.append(f"本次剧本稿由 {self.settings.ark_text_model} 生成。")

        suggested_duration = payload.get("suggested_duration")
        if not isinstance(suggested_duration, int) or suggested_duration <= 0:
            suggested_duration = project.target_duration

        return StoryboardDraft(
            characters=characters,
            scenes=scenes,
            beats=beats,
            shots=shots,
            suggested_duration=suggested_duration,
            notes=notes,
        )

    def _generate_with_rules(self, project: Project) -> StoryboardDraft:
        segments = self._split_source_text(project.source_text)
        title_prefix = project.title[:6] or "故事"
        characters = self._build_characters(title_prefix)
        scenes = self._build_scenes(segments)
        beats = self._build_beats(segments)
        shots = self._build_shots(segments, scenes, beats, title_prefix)

        return StoryboardDraft(
            characters=characters,
            scenes=scenes,
            beats=beats,
            shots=shots,
            suggested_duration=project.target_duration,
            notes=[
                "这是第一版结构化剧本稿，后续可以继续细化角色和镜头。",
                "当前剧本稿由规则拆解生成，后续可接入真实 LLM provider。",
            ],
        )

    def _resolve_reference_id(self, raw_index: Any, items: list[Any]) -> Optional[str]:
        if not items:
            return None
        if isinstance(raw_index, int) and 1 <= raw_index <= len(items):
            return items[raw_index - 1].id
        return items[min(len(items) - 1, 0)].id

    def _safe_text(self, value: Any, default: str) -> str:
        if isinstance(value, str) and value.strip():
            return value.strip()
        return default

    def _safe_optional_text(self, value: Any) -> Optional[str]:
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None

    def _safe_duration(self, value: Any, total_duration: int, shot_count: int) -> int:
        if isinstance(value, int) and value > 0:
            return value
        return max(6, total_duration // max(shot_count, 1))

    def _split_source_text(self, source_text: str) -> list[str]:
        raw_segments = re.split(r"[。！？\n]+", source_text)
        segments = [segment.strip() for segment in raw_segments if segment.strip()]
        if not segments:
            return [source_text.strip() or "故事从一个关键场景开始。"]
        return segments[:6]

    def _build_characters(self, title_prefix: str) -> list[StoryCharacter]:
        return [
            StoryCharacter(
                id="character-main",
                name=f"{title_prefix}主角",
                role="主角",
                appearance="黑发、情绪明显、适合近景表现",
                notes="默认主叙事视角人物",
                voice_id=self._default_voice_id(1),
                voice_label=self._default_voice_label(1),
            ),
            StoryCharacter(
                id="character-support",
                name="关键配角",
                role="配角",
                appearance="辨识度强，适合对话镜头",
                notes="用于推动冲突或信息揭示",
                voice_id=self._default_voice_id(2),
                voice_label=self._default_voice_label(2),
            ),
        ]

    def _build_scenes(self, segments: list[str]) -> list[StoryScene]:
        scenes: list[StoryScene] = []
        for index, segment in enumerate(segments[:3], start=1):
            scenes.append(
                StoryScene(
                    id=f"scene-{index}",
                    name=f"场景 {index}",
                    description=segment,
                    visual_prompt=f"日漫分镜风格，重点突出{segment[:18]}",
                )
            )
        return scenes

    def _build_beats(self, segments: list[str]) -> list[StoryBeat]:
        beats: list[StoryBeat] = []
        for index, segment in enumerate(segments, start=1):
            beats.append(
                StoryBeat(
                    id=f"beat-{index}",
                    title=f"情节节点 {index}",
                    summary=segment,
                    emotion="紧张" if index == len(segments) else "推进",
                )
            )
        return beats

    def _build_shots(
        self,
        segments: list[str],
        scenes: list[StoryScene],
        beats: list[StoryBeat],
        title_prefix: str,
    ) -> list[StoryShot]:
        total_segments = max(len(segments), 1)
        shots: list[StoryShot] = []
        for index, segment in enumerate(segments, start=1):
            scene_id = scenes[min(index - 1, len(scenes) - 1)].id if scenes else None
            beat_id = beats[index - 1].id if beats else None
            shots.append(
                StoryShot(
                    id=f"shot-{index}",
                    title=f"分镜 {index}",
                    scene_id=scene_id,
                    beat_id=beat_id,
                    summary=segment,
                    narration=f"{title_prefix}的故事推进到：{segment}",
                    dialogues=[
                        StoryDialogue(
                            speaker=f"{title_prefix}主角",
                            speaker_id="character-main",
                            content=f"我需要面对：{segment}",
                        )
                    ],
                    character_ids=["character-main"],
                    camera="中景推进" if index == 1 else "特写切换",
                    emotion="压迫" if index == total_segments else "铺陈",
                    expected_duration=max(6, 60 // total_segments),
                )
            )
        return shots

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

    def _default_voice_id(self, index: int) -> str:
        preset = self.DEFAULT_VOICE_PRESETS[(index - 1) % len(self.DEFAULT_VOICE_PRESETS)]
        return str(preset["voice_id"])

    def _default_voice_label(self, index: int) -> str:
        preset = self.DEFAULT_VOICE_PRESETS[(index - 1) % len(self.DEFAULT_VOICE_PRESETS)]
        return str(preset["voice_label"])
