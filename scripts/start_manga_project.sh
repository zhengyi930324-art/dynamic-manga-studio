#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
PIP_BIN="$ROOT_DIR/.venv/bin/pip"
UVICORN_BIN="$ROOT_DIR/.venv/bin/uvicorn"

RUN_ROOT="$ROOT_DIR/tmp/local-stack"
LOG_DIR="$RUN_ROOT/logs"
PID_DIR="$RUN_ROOT/pids"

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-manga_drama}"
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-manga-project-postgres}"

FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT}}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}}"
DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
CELERY_BROKER_URL="${CELERY_BROKER_URL:-redis://localhost:6379/0}"
CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND:-redis://localhost:6379/1}"
DATA_ROOT="${DATA_ROOT:-$ROOT_DIR/data/runtime}"
CELERY_TASK_ALWAYS_EAGER="${CELERY_TASK_ALWAYS_EAGER:-true}"

mkdir -p "$LOG_DIR" "$PID_DIR" "$DATA_ROOT"

log() {
  printf '[漫剧项目] %s\n' "$1"
}

fail() {
  printf '[漫剧项目] %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

is_pid_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file")"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

port_listener_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1
}

ensure_port_available() {
  local port="$1"
  local pid_file="$2"
  local service_name="$3"
  local listener_pid
  listener_pid="$(port_listener_pid "$port" || true)"

  if [[ -z "$listener_pid" ]]; then
    return 0
  fi

  if is_pid_running "$pid_file" && [[ "$(cat "$pid_file")" == "$listener_pid" ]]; then
    return 0
  fi

  fail "${service_name} 需要的端口 ${port} 已被其他进程占用，请先释放后再重试。"
}

http_ready() {
  local url="$1"
  curl -fsS "$url" >/dev/null 2>&1
}

wait_for_docker() {
  require_command docker

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    log "检测到 Docker 未启动，尝试打开 Docker Desktop。"
    open -a Docker >/dev/null 2>&1 || true
  fi

  log "等待 Docker 就绪..."
  for _ in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  fail "Docker 未在预期时间内启动完成。"
}

ensure_postgres_container() {
  wait_for_docker
  require_command lsof

  local existing_container
  existing_container="$(docker ps -a --format '{{.Names}}' | grep -Fx "$POSTGRES_CONTAINER_NAME" || true)"

  if [[ -z "$existing_container" ]]; then
    ensure_port_available "$POSTGRES_PORT" "/dev/null" "PostgreSQL"
    log "创建 PostgreSQL 容器：$POSTGRES_CONTAINER_NAME"
    docker run -d \
      --name "$POSTGRES_CONTAINER_NAME" \
      -e POSTGRES_USER="$POSTGRES_USER" \
      -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      -e POSTGRES_DB="$POSTGRES_DB" \
      -p "${POSTGRES_PORT}:5432" \
      postgres:16-alpine >/dev/null
  else
    local running_container
    running_container="$(docker ps --format '{{.Names}}' | grep -Fx "$POSTGRES_CONTAINER_NAME" || true)"
    if [[ -z "$running_container" ]]; then
      log "启动已有 PostgreSQL 容器：$POSTGRES_CONTAINER_NAME"
      docker start "$POSTGRES_CONTAINER_NAME" >/dev/null
    else
      log "PostgreSQL 容器已在运行：$POSTGRES_CONTAINER_NAME"
    fi
  fi

  log "等待 PostgreSQL 就绪..."
  for _ in $(seq 1 40); do
    if docker exec "$POSTGRES_CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  fail "PostgreSQL 容器已启动，但数据库尚未就绪。"
}

ensure_frontend_dependencies() {
  require_command npm
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "安装前端依赖..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
}

ensure_backend_dependencies() {
  [[ -x "$PYTHON_BIN" ]] || fail "未找到项目虚拟环境，请先准备 $ROOT_DIR/.venv"
  if ! "$PYTHON_BIN" -c "import fastapi, sqlalchemy, psycopg, uvicorn" >/dev/null 2>&1; then
    log "安装后端依赖..."
    "$PIP_BIN" install -e "$BACKEND_DIR"
  fi
}

wait_for_http() {
  local url="$1"
  local service_name="$2"

  for _ in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  fail "${service_name} 启动超时，请查看日志：$LOG_DIR"
}

start_backend() {
  local pid_file="$PID_DIR/backend.pid"
  local log_file="$LOG_DIR/backend.log"

  if is_pid_running "$pid_file"; then
    log "后端已在运行，PID=$(cat "$pid_file")"
    return 0
  fi

  local listener_pid
  listener_pid="$(port_listener_pid "$BACKEND_PORT" || true)"
  if [[ -n "$listener_pid" ]]; then
    if http_ready "${API_BASE_URL}/health"; then
      log "检测到后端已可访问，复用现有服务：${API_BASE_URL}"
      return 0
    fi
    fail "后端端口 ${BACKEND_PORT} 已被占用，但健康检查不可用，请先释放后再重试。"
  fi

  log "启动 FastAPI 后端..."
  (
    cd "$BACKEND_DIR"
    FRONTEND_BASE_URL="$FRONTEND_BASE_URL" \
    API_BASE_URL="$API_BASE_URL" \
    DATABASE_URL="$DATABASE_URL" \
    REDIS_URL="$REDIS_URL" \
    CELERY_BROKER_URL="$CELERY_BROKER_URL" \
    CELERY_RESULT_BACKEND="$CELERY_RESULT_BACKEND" \
    CELERY_TASK_ALWAYS_EAGER="$CELERY_TASK_ALWAYS_EAGER" \
    DATA_ROOT="$DATA_ROOT" \
    nohup "$UVICORN_BIN" app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" \
      >"$log_file" 2>&1 &
    echo $! > "$pid_file"
  )

  wait_for_http "${API_BASE_URL}/health" "后端"
}

start_frontend() {
  local pid_file="$PID_DIR/frontend.pid"
  local log_file="$LOG_DIR/frontend.log"

  if is_pid_running "$pid_file"; then
    log "前端已在运行，PID=$(cat "$pid_file")"
    return 0
  fi

  local listener_pid
  listener_pid="$(port_listener_pid "$FRONTEND_PORT" || true)"
  if [[ -n "$listener_pid" ]]; then
    if http_ready "$FRONTEND_BASE_URL"; then
      log "检测到前端已可访问，复用现有服务：${FRONTEND_BASE_URL}"
      return 0
    fi
    fail "前端端口 ${FRONTEND_PORT} 已被占用，但页面不可访问，请先释放后再重试。"
  fi

  log "启动 Vite 前端..."
  (
    cd "$FRONTEND_DIR"
    VITE_API_BASE_URL="$API_BASE_URL" \
    nohup npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" \
      >"$log_file" 2>&1 &
    echo $! > "$pid_file"
  )

  wait_for_http "$FRONTEND_BASE_URL" "前端"
}

main() {
  require_command curl
  require_command lsof
  ensure_postgres_container
  ensure_backend_dependencies
  ensure_frontend_dependencies
  start_backend
  start_frontend

  cat <<EOF

[漫剧项目] 本地环境已启动完成。
- 前端地址：$FRONTEND_BASE_URL
- 后端地址：$API_BASE_URL
- 健康检查：$API_BASE_URL/health
- PostgreSQL 容器：$POSTGRES_CONTAINER_NAME
- 后端日志：$LOG_DIR/backend.log
- 前端日志：$LOG_DIR/frontend.log

当前脚本默认启用 CELERY_TASK_ALWAYS_EAGER=true，因此本地体验完整流程时不需要额外启动 Redis 和 Celery Worker。
EOF
}

main "$@"
