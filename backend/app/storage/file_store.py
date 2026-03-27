from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from app.models.storyboard import StoryboardDraft


class ProjectFileStore:
    def __init__(self, data_root: str | Path):
        self.data_root = Path(data_root)
        self.projects_root = self.data_root / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)

    def get_project_dir(self, project_id: str) -> Path:
        return self.projects_root / project_id

    def get_project_file(self, project_id: str) -> Path:
        return self.get_project_dir(project_id) / "project.json"

    def get_storyboard_file(self, project_id: str) -> Path:
        return self.get_project_dir(project_id) / "draft" / "storyboard.json"

    def get_video_dir(self, project_id: str) -> Path:
        return self.get_project_dir(project_id) / "video"

    def get_video_plan_file(self, project_id: str) -> Path:
        return self.get_video_dir(project_id) / "plan.json"

    def get_assets_dir(self, project_id: str) -> Path:
        return self.get_project_dir(project_id) / "assets"

    def get_exports_dir(self, project_id: str) -> Path:
        return self.get_project_dir(project_id) / "exports"

    def ensure_project_dirs(self, project_id: str) -> None:
        project_dir = self.get_project_dir(project_id)
        (project_dir / "draft").mkdir(parents=True, exist_ok=True)
        self.get_video_dir(project_id).mkdir(parents=True, exist_ok=True)
        self.get_assets_dir(project_id).mkdir(parents=True, exist_ok=True)
        self.get_exports_dir(project_id).mkdir(parents=True, exist_ok=True)

    def write_json(self, path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def read_json(self, path: Path) -> Optional[dict[str, Any]]:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def save_project_snapshot(self, project_id: str, payload: dict[str, Any]) -> Path:
        self.ensure_project_dirs(project_id)
        project_file = self.get_project_file(project_id)
        self.write_json(project_file, payload)
        return project_file

    def load_project_snapshot(self, project_id: str) -> Optional[dict[str, Any]]:
        return self.read_json(self.get_project_file(project_id))

    def save_storyboard(self, project_id: str, storyboard: StoryboardDraft) -> Path:
        self.ensure_project_dirs(project_id)
        storyboard_file = self.get_storyboard_file(project_id)
        self.write_json(
            storyboard_file,
            storyboard.model_dump(mode="json"),
        )
        return storyboard_file

    def load_storyboard(self, project_id: str) -> Optional[StoryboardDraft]:
        raw_storyboard = self.read_json(self.get_storyboard_file(project_id))
        if raw_storyboard is None:
            return None
        return StoryboardDraft.model_validate(raw_storyboard)

    def save_video_plan(self, project_id: str, payload: dict[str, Any]) -> Path:
        self.ensure_project_dirs(project_id)
        plan_file = self.get_video_plan_file(project_id)
        self.write_json(plan_file, payload)
        return plan_file

    def load_video_plan(self, project_id: str) -> Optional[dict[str, Any]]:
        return self.read_json(self.get_video_plan_file(project_id))

    def build_storage_paths(self, project_id: str) -> dict[str, str]:
        return {
            "project_dir": str(self.get_project_dir(project_id)),
            "project_file": str(self.get_project_file(project_id)),
            "storyboard_file": str(self.get_storyboard_file(project_id)),
            "video_plan_file": str(self.get_video_plan_file(project_id)),
            "assets_dir": str(self.get_assets_dir(project_id)),
            "exports_dir": str(self.get_exports_dir(project_id)),
        }

    def save_generated_asset(
        self,
        project_id: str,
        asset_type: str,
        target_id: str,
        payload: dict[str, Any],
    ) -> Path:
        asset_dir = self.get_assets_dir(project_id) / asset_type
        asset_dir.mkdir(parents=True, exist_ok=True)
        asset_path = asset_dir / f"{target_id}.json"
        self.write_json(asset_path, payload)
        return asset_path

    def save_generated_binary(
        self,
        project_id: str,
        asset_type: str,
        target_id: str,
        content: bytes,
        extension: str,
    ) -> Path:
        asset_dir = self.get_assets_dir(project_id) / asset_type
        asset_dir.mkdir(parents=True, exist_ok=True)
        normalized_extension = extension.lstrip(".") or "bin"
        binary_path = asset_dir / f"{target_id}.{normalized_extension}"
        binary_path.write_bytes(content)
        return binary_path

    def load_generated_asset(
        self,
        project_id: str,
        asset_type: str,
        target_id: str,
    ) -> Optional[dict[str, Any]]:
        asset_path = self.get_assets_dir(project_id) / asset_type / f"{target_id}.json"
        return self.read_json(asset_path)

    def list_generated_assets(self, project_id: str) -> dict[str, dict[str, dict[str, Any]]]:
        assets_dir = self.get_assets_dir(project_id)
        if not assets_dir.exists():
            return {}

        assets: dict[str, dict[str, dict[str, Any]]] = {}
        for asset_type_dir in assets_dir.iterdir():
            if not asset_type_dir.is_dir():
                continue

            type_assets: dict[str, dict[str, Any]] = {}
            for asset_file in sorted(asset_type_dir.glob("*.json")):
                payload = self.read_json(asset_file)
                if payload is None:
                    continue
                if (
                    asset_type_dir.name == "tts"
                    and payload.get("target_kind") == "segment"
                ):
                    continue
                type_assets[asset_file.stem] = payload

            if type_assets:
                assets[asset_type_dir.name] = type_assets

        return assets
