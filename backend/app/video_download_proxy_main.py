from __future__ import annotations

from collections.abc import Iterator

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.config import get_settings


app = FastAPI(title="动态漫剧视频下载中转服务")


def _require_proxy_token(x_proxy_token: str | None) -> None:
    settings = get_settings()
    expected_token = settings.video_download_proxy_token.strip()
    if not expected_token:
        return
    if x_proxy_token != expected_token:
        raise HTTPException(status_code=401, detail="视频中转服务鉴权失败")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/proxy")
def proxy_video(
    source_url: str = Query(..., min_length=1),
    file_id: str = Query(..., min_length=1),
    target_id: str = Query(..., min_length=1),
    x_proxy_token: str | None = Header(default=None, alias="X-Proxy-Token"),
):
    _require_proxy_token(x_proxy_token)

    settings = get_settings()
    request_kwargs: dict[str, object] = {
        "timeout": settings.video_download_timeout_seconds,
        "follow_redirects": True,
    }
    if settings.http_proxy_url.strip():
        request_kwargs["proxy"] = settings.http_proxy_url.strip()

    client = httpx.Client(**request_kwargs)
    try:
        request = client.build_request("GET", source_url)
        response = client.send(request, stream=True)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        client.close()
        raise HTTPException(status_code=502, detail=f"中转拉取远程视频失败: {exc}") from exc

    media_type = (response.headers.get("content-type") or "application/octet-stream").split(";")[0]
    passthrough_headers = {
        "X-Proxy-File-Id": file_id,
        "X-Proxy-Target-Id": target_id,
    }
    if response.headers.get("content-length"):
        passthrough_headers["Content-Length"] = response.headers["content-length"]
    if response.headers.get("content-disposition"):
        passthrough_headers["Content-Disposition"] = response.headers["content-disposition"]
    if response.headers.get("accept-ranges"):
        passthrough_headers["Accept-Ranges"] = response.headers["accept-ranges"]

    def stream_bytes() -> Iterator[bytes]:
        try:
            for chunk in response.iter_bytes():
                if chunk:
                    yield chunk
        finally:
            response.close()
            client.close()

    return StreamingResponse(
        stream_bytes(),
        media_type=media_type,
        headers=passthrough_headers,
    )
