#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
UVICORN_BIN="$ROOT_DIR/.venv/bin/uvicorn"

PROXY_HOST="${PROXY_HOST:-0.0.0.0}"
PROXY_PORT="${PROXY_PORT:-8010}"

if [[ ! -x "$UVICORN_BIN" ]]; then
  echo "[视频中转] 未找到虚拟环境中的 uvicorn：$UVICORN_BIN" >&2
  exit 1
fi

cd "$BACKEND_DIR"
exec "$UVICORN_BIN" app.video_download_proxy_main:app --host "$PROXY_HOST" --port "$PROXY_PORT"
