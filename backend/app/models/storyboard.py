from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class StoryCharacter(BaseModel):
    id: str
    name: str
    role: Optional[str] = None
    appearance: Optional[str] = None
    notes: Optional[str] = None
    voice_id: Optional[str] = None
    voice_label: Optional[str] = None


class StoryScene(BaseModel):
    id: str
    name: str
    description: str
    visual_prompt: Optional[str] = None


class StoryBeat(BaseModel):
    id: str
    title: str
    summary: str
    emotion: Optional[str] = None


class StoryDialogue(BaseModel):
    speaker: str
    speaker_id: Optional[str] = None
    content: str


class StoryShot(BaseModel):
    id: str
    title: str
    scene_id: Optional[str] = None
    beat_id: Optional[str] = None
    summary: str
    narration: Optional[str] = None
    dialogues: list[StoryDialogue] = Field(default_factory=list)
    character_ids: list[str] = Field(default_factory=list)
    camera: Optional[str] = None
    emotion: Optional[str] = None
    expected_duration: Optional[int] = None


class StoryboardDraft(BaseModel):
    version: int = 1
    characters: list[StoryCharacter] = Field(default_factory=list)
    scenes: list[StoryScene] = Field(default_factory=list)
    beats: list[StoryBeat] = Field(default_factory=list)
    shots: list[StoryShot] = Field(default_factory=list)
    suggested_duration: Optional[int] = None
    notes: list[str] = Field(default_factory=list)
