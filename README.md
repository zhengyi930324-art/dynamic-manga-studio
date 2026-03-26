# 动态漫剧创作工具

这是一个面向小说和短篇作者的 Web 创作台 MVP，目标是先完成“单章节文本输入 -> 结构化剧本稿 -> 动态漫剧草稿 -> 中度编辑 -> 站内预览 -> 导出 MP4”的基础闭环。

## 当前进度

当前已经完成到 `Task 6`：

- 前端：项目创建、剧本稿确认、分镜创作台、任务状态、预览时间轴、导出入口
- 后端：项目管理、剧本稿生成、素材任务编排、局部素材重生成/替换、预览拼装、最小 MP4 导出
- 本地导出：支持用 `imageio-ffmpeg` 兜底，不依赖系统预装 `ffmpeg`

当前仍然是 `MVP 链路版`：

- 素材 provider 默认还是 `local_mock`
- 已经能体验完整流程，但不是最终成片质量

## 目录结构

```text
漫剧项目
├── backend
├── data
├── frontend
├── scripts
├── 文档
├── 输出
├── .env.example
└── README.md
```

## 一键启动

推荐直接使用：

```bash
cd /Users/zhengy1/Documents/后端学习/漫剧项目
bash scripts/start_manga_project.sh
```

脚本会做这些事：

- 检查并等待 Docker
- 启动本地 PostgreSQL 容器 `manga-project-postgres`
- 检查后端虚拟环境依赖
- 检查前端 `node_modules`
- 启动 FastAPI 后端
- 启动 Vite 前端

默认地址：

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- 健康检查：`http://127.0.0.1:8000/health`

日志目录：

- `tmp/local-stack/logs/backend.log`
- `tmp/local-stack/logs/frontend.log`

## 为什么脚本里不额外启动 Redis / Celery Worker

为了让本地体验更轻，这个脚本会默认把：

- `CELERY_TASK_ALWAYS_EAGER=true`

也就是本地一键启动时，长任务直接在后端进程里执行。这样你可以体验完整流程，而不用再多起一套 Redis 和 Celery Worker。

如果后面要验证真实异步队列，再单独补启动脚本或 `docker compose` 更合适。

## 环境变量

脚本可以直接使用默认值，也支持你在执行前覆盖：

- `FRONTEND_PORT`
- `BACKEND_PORT`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL`
- `DATA_ROOT`

项目默认环境变量样板见：

- [`.env.example`](/Users/zhengy1/Documents/后端学习/漫剧项目/.env.example)

## 手动启动方式

如果你不想用一键脚本，也可以手动起：

### 前端

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 3000
```

### 后端

```bash
cd backend
../.venv/bin/pip install -e .
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 数据库

```bash
docker run -d \
  --name manga-project-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=manga_drama \
  -p 5432:5432 \
  postgres:16-alpine
```
