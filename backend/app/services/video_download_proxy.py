from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.core.config import Settings, get_settings


class VideoDownloadProxy:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def download(
        self,
        *,
        remote_url: str,
        file_id: str,
        target_id: str,
        filename: str | None = None,
    ) -> tuple[bytes, str]:
        if not remote_url:
            raise ValueError("远程视频地址为空")

        if self.settings.video_download_proxy_url:
            return self._download_via_middleman(
                remote_url=remote_url,
                file_id=file_id,
                target_id=target_id,
                filename=filename,
            )

        if self.settings.http_proxy_url:
            return self._download_via_http_proxy(
                remote_url=remote_url,
                filename=filename,
            )

        raise ValueError(
            "当前网络无法直连远程视频，请配置 HTTP_PROXY_URL 或 VIDEO_DOWNLOAD_PROXY_URL。"
        )

    def _download_via_middleman(
        self,
        *,
        remote_url: str,
        file_id: str,
        target_id: str,
        filename: str | None,
    ) -> tuple[bytes, str]:
        proxy_url = self.settings.video_download_proxy_url.strip()
        headers: dict[str, str] = {}
        if self.settings.video_download_proxy_token.strip():
            headers["X-Proxy-Token"] = self.settings.video_download_proxy_token.strip()
        with httpx.Client(timeout=self.settings.video_download_timeout_seconds) as client:
            response = client.get(
                proxy_url,
                headers=headers,
                params={
                    "source_url": remote_url,
                    "file_id": file_id,
                    "target_id": target_id,
                },
                follow_redirects=True,
            )
            response.raise_for_status()
            return response.content, self._infer_extension(
                filename=filename,
                source_url=remote_url,
                content_type=response.headers.get("content-type"),
            )

    def _download_via_http_proxy(
        self,
        *,
        remote_url: str,
        filename: str | None,
    ) -> tuple[bytes, str]:
        proxy_url = self.settings.http_proxy_url.strip()
        with httpx.Client(
            timeout=self.settings.video_download_timeout_seconds,
            follow_redirects=True,
            proxy=proxy_url,
        ) as client:
            response = client.get(remote_url)
            response.raise_for_status()
            return response.content, self._infer_extension(
                filename=filename,
                source_url=remote_url,
                content_type=response.headers.get("content-type"),
            )

    def _infer_extension(
        self,
        *,
        filename: str | None,
        source_url: str,
        content_type: str | None,
    ) -> str:
        if filename and Path(filename).suffix:
            return Path(filename).suffix.lstrip(".")

        parsed = urlparse(source_url)
        if Path(parsed.path).suffix:
            return Path(parsed.path).suffix.lstrip(".")

        normalized_content_type = (content_type or "").split(";")[0].strip()
        if normalized_content_type:
            guessed = mimetypes.guess_extension(normalized_content_type, strict=False)
            if guessed:
                return guessed.lstrip(".")
        return "mp4"
