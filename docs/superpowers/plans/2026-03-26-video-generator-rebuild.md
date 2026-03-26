# AI 视频生成器重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前“动态漫剧创作台”重构为桌面优先的一键式 AI 视频生成器，并打通以 `MiniMax` 为默认 provider 的最小真实视频生成闭环。

**Architecture:** 保留现有 `projects` / `generation_jobs` / 文件存储 / 导出服务基础设施，但将业务中心从“用户可编辑 storyboard”切换为“系统自动弱分段 + 段级候选视频 + 对白/BGM/字幕合成”。前端改为单页式生成器，结果页支持轻量候选切换和单段重生成，不再默认暴露旧的分镜导演台。

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, file-based storage, FFmpeg, React 18, TypeScript, Vite, Tailwind CSS, MiniMax provider abstraction

---

### Task 1: 收紧现有项目模型与项目详情返回

**Files:**
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/models/project.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/schemas/project.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/services/project_service.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/types/project.ts`

- [ ] **Step 1: 明确新首页所需字段并写到 plan 注释里**

需要保留并统一这些字段语义：

```text
story_text        -> 用户输入的故事文本
video_style       -> 视频风格
target_duration   -> 用户期望时长
aspect_ratio      -> 画幅，例如 16:9 / 9:16
bgm_style         -> BGM 风格
status            -> 生成状态机
```

- [ ] **Step 2: 为 `Project` 增加新生成器字段**

在 `/backend/app/models/project.py` 中最小增量加入：

```python
source_text = mapped_column(Text, nullable=False)
video_style = mapped_column(String(64), nullable=True)
aspect_ratio = mapped_column(String(16), nullable=True)
bgm_style = mapped_column(String(64), nullable=True)
```

保留旧字段仅作为过渡兼容，避免一次性大拆表。

- [ ] **Step 3: 更新 Pydantic schema**

在 `/backend/app/schemas/project.py` 中：

```python
class CreateProjectRequest(BaseModel):
    title: str
    source_text: str
    video_style: str | None = None
    target_duration: int | None = None
    aspect_ratio: str | None = None
    bgm_style: str | None = None
```

新增项目详情响应中的生成器字段，减少前端自行拼装。

- [ ] **Step 4: 让 `ProjectService` 输出新字段**

在 `/backend/app/services/project_service.py` 中统一序列化结果：

```python
return {
    "id": project.id,
    "title": project.title,
    "source_text": project.source_text,
    "video_style": project.video_style,
    "target_duration": project.target_duration,
    "aspect_ratio": project.aspect_ratio,
    "bgm_style": project.bgm_style,
    "status": project.status.value,
}
```

- [ ] **Step 5: 同步前端类型**

在 `/frontend/src/types/project.ts` 中把旧创作台强耦合字段降为可选，把新生成器字段补齐。

- [ ] **Step 6: 运行最小验证**

Run:

```bash
cd /Users/zhengy1/Documents/后端学习/漫剧项目/backend
python3 -m compileall app/models/project.py app/schemas/project.py app/services/project_service.py
```

Expected: compile 成功，无语法错误

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/project.py backend/app/schemas/project.py backend/app/services/project_service.py frontend/src/types/project.ts
git commit -m "feat: align project model for video generator flow"
```

### Task 2: 新增系统自动弱分段与段级候选视频数据结构

**Files:**
- Create: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/services/video_generation_service.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/schemas/project.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/storage/file_store.py`
- Test: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/tests/test_video_generation_service.py`

- [ ] **Step 1: 先写服务层测试用例**

在 `/backend/tests/test_video_generation_service.py` 中至少覆盖：

```python
def test_build_generation_plan_returns_four_segments_for_long_story(): ...
def test_generation_plan_keeps_global_style_context(): ...
def test_segment_selection_updates_current_variant_only(): ...
```

- [ ] **Step 2: 定义内部计划结构**

在 `/backend/app/schemas/project.py` 中新增内部响应模型：

```python
class VideoSegmentVariantResponse(BaseModel):
    variant_id: str
    status: str
    video_asset_path: str | None = None
    thumbnail_asset_path: str | None = None

class VideoSegmentResponse(BaseModel):
    segment_id: str
    title: str
    summary: str
    selected_variant_id: str | None = None
    variants: list[VideoSegmentVariantResponse] = []

class VideoGenerationPlanResponse(BaseModel):
    segment_count: int
    global_style_bible: dict[str, str]
    segments: list[VideoSegmentResponse] = []
```

- [ ] **Step 3: 实现最小 `VideoGenerationService`**

在 `/backend/app/services/video_generation_service.py` 中先做可测试的纯 Python 编排：

```python
class VideoGenerationService:
    def build_generation_plan(self, project: Project) -> VideoGenerationPlanResponse:
        ...

    def select_segment_variant(self, project_id: str, segment_id: str, variant_id: str) -> None:
        ...
```

规则：
- 默认拆 4 段
- 每段继承全局风格字典
- 初始 variants 先预留 3 个槽位

- [ ] **Step 4: 把计划落盘**

在 `/backend/app/storage/file_store.py` 中增加：

```python
def save_video_plan(self, project_id: str, payload: dict[str, Any]) -> None: ...
def load_video_plan(self, project_id: str) -> dict[str, Any] | None: ...
```

目标路径：

```text
data/.../video/plan.json
```

- [ ] **Step 5: 跑测试**

Run:

```bash
cd /Users/zhengy1/Documents/后端学习/漫剧项目/backend
pytest tests/test_video_generation_service.py -v
```

Expected: 新测试全部通过

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/video_generation_service.py backend/app/schemas/project.py backend/app/storage/file_store.py backend/tests/test_video_generation_service.py
git commit -m "feat: add internal video generation plan"
```

### Task 3: 扩展 provider 与任务编排，打通 MiniMax 段级视频生成

**Files:**
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/services/provider_registry.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/services/storyboard_generation_service.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/models/job.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/tasks/job_runner.py`
- Test: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/tests/test_provider_registry.py`

- [ ] **Step 1: 为 job 类型补充视频片段生成**

在 `/backend/app/models/job.py` 中新增：

```python
class JobType(str, Enum):
    ...
    video_segment = "video_segment"
    subtitle = "subtitle"
    bgm = "bgm"
```

- [ ] **Step 2: 扩展 provider 协议**

在 `/backend/app/services/provider_registry.py` 中新增能力：

```python
def create_video_segment_task(self, project: Project, payload: dict[str, Any]) -> dict[str, Any]:
    ...

def get_video_segment_task_status(self, project: Project, payload: dict[str, Any]) -> dict[str, Any]:
    ...

def download_generated_video(self, project: Project, payload: dict[str, Any]) -> dict[str, Any]:
    ...
```

要求：

- `LocalMockProvider` 先返回可预测的伪造任务结构
- `ArkMiniMaxProvider` 按异步视频接口实现三段式调用
- 第一阶段只接“文生视频任务”
- 图生视频、首尾帧、主体参考能力先不接入 UI 和主链路

建议 provider 返回结构：

```python
{
    "provider": "ark_minimax",
    "task_id": "...",
    "status": "submitted",
    "target_id": "segment-1-variant-a",
}
```

状态查询结构：

```python
{
    "provider": "ark_minimax",
    "task_id": "...",
    "status": "processing" | "completed" | "failed",
    "file_id": "...",
}
```

下载结构：

```python
{
    "provider": "ark_minimax",
    "file_id": "...",
    "video_url": "...",
    "target_id": "segment-1-variant-a",
}
```

- [ ] **Step 3: 将现有生成服务改造成“视频主导编排”**

在 `/backend/app/services/storyboard_generation_service.py` 中：

- 新增 `generate_video_project(project_id)` 入口
- 先构建 video plan
- 为每个 segment 提交 2~3 个异步视频任务
- 为每段补对白/TTS 任务
- 轮询各段状态并在完成时下载视频
- 当所有已选段片段可用后触发合成

最小代码骨架：

```python
def generate_video_project(self, project_id: str) -> None:
    plan = self.video_generation_service.build_generation_plan(project)
    for segment in plan.segments:
        self._enqueue_segment_variants(project, segment)
    self._poll_segment_tasks(project, plan)
    self._enqueue_audio_jobs(project, plan)
```

- [ ] **Step 4: 更新 job runner**

在 `/backend/app/tasks/job_runner.py` 中将 `video_segment` job 拆成明确阶段：

- `submit`：调用 `create_video_segment_task`
- `poll`：调用 `get_video_segment_task_status`
- `download`：调用 `download_generated_video`

并将结果写回文件存储，例如：

```text
data/.../video/segments/{segment_id}/{variant_id}.json
data/.../video/segments/{segment_id}/{variant_id}.mp4
```

- [ ] **Step 5: 写 provider 测试**

在 `/backend/tests/test_provider_registry.py` 中覆盖：

```python
def test_local_mock_provider_returns_segment_variants(): ...
def test_registry_exposes_generate_video_segment(): ...
```

- [ ] **Step 6: 运行验证**

Run:

```bash
cd /Users/zhengy1/Documents/后端学习/漫剧项目/backend
python3 -m compileall app/services/provider_registry.py app/services/storyboard_generation_service.py app/tasks/job_runner.py app/models/job.py
pytest tests/test_provider_registry.py -v
```

Expected: compile 与测试通过

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/provider_registry.py backend/app/services/storyboard_generation_service.py backend/app/models/job.py backend/app/tasks/job_runner.py backend/tests/test_provider_registry.py
git commit -m "feat: orchestrate minimax segment video generation"
```

### Task 4: 重写项目 API，暴露生成器首页与片段候选能力

**Files:**
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/api/routes/projects.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/schemas/project.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/services/project_service.py`
- Test: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/tests/test_project_routes.py`

- [ ] **Step 1: 定义新接口**

需要补齐：

```text
POST   /api/projects                     创建视频生成项目
POST   /api/projects/{id}/generate      启动整片生成
POST   /api/projects/{id}/segments/{segment_id}/regenerate
POST   /api/projects/{id}/segments/{segment_id}/select
GET    /api/projects/{id}               返回首页与结果页所需详情
```

- [ ] **Step 2: 更新项目详情响应**

在 `/backend/app/schemas/project.py` 中让 `ProjectDetailResponse` 带上：

```python
video_plan: VideoGenerationPlanResponse | None = None
generation_progress: dict[str, Any] | None = None
final_video_path: str | None = None
subtitle_tracks: list[dict[str, Any]] = []
```

- [ ] **Step 3: 改写项目路由**

在 `/backend/app/api/routes/projects.py` 中移除首页对旧创作台动作的依赖，新增段级选择和单段重生成端点。

- [ ] **Step 4: 写 API 测试**

在 `/backend/tests/test_project_routes.py` 中覆盖：

```python
def test_generate_endpoint_starts_video_flow(): ...
def test_select_segment_variant_updates_project_detail(): ...
def test_regenerate_segment_returns_updated_detail(): ...
```

- [ ] **Step 5: 运行验证**

Run:

```bash
cd /Users/zhengy1/Documents/后端学习/漫剧项目/backend
pytest tests/test_project_routes.py -v
```

Expected: 路由测试通过

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/projects.py backend/app/schemas/project.py backend/app/services/project_service.py backend/tests/test_project_routes.py
git commit -m "feat: expose video generator project APIs"
```

### Task 5: 将导出服务切换为“视频片段 + 对白 + 字幕 + BGM”合成

**Files:**
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/services/render_service.py`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/storage/file_store.py`
- Test: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/tests/test_render_service.py`

- [ ] **Step 1: 为 render_service 增加段级输入模型测试**

新增测试：

```python
def test_export_project_uses_selected_segment_variants(): ...
def test_export_project_keeps_bgm_and_subtitles(): ...
def test_export_project_handles_regenerated_segment_variant(): ...
```

- [ ] **Step 2: 调整导出入口的数据来源**

在 `/backend/app/services/render_service.py` 中改成从 `video/plan.json` 读取已选段级视频，而不是从 storyboard 静态图推导片段。

核心骨架：

```python
selected_segments = self._load_selected_segments(project_id)
dialogue_tracks = self._load_dialogue_tracks(project_id)
bgm_track = self._load_bgm_track(project_id)
subtitle_track = self._load_subtitle_track(project_id)
```

- [ ] **Step 3: 保持轻量自然转场**

延续现在已有的淡入淡出策略，但输入改为真实视频片段：

```python
xfade duration=0.35
acrossfade duration=0.28
```

- [ ] **Step 4: 更新预览接口**

让 `/preview` 返回：
- 选中的段列表
- 每段候选数
- 整片时长
- 可播放资源路径

- [ ] **Step 5: 跑导出测试**

Run:

```bash
cd /Users/zhengy1/Documents/后端学习/漫剧项目/backend
pytest tests/test_render_service.py -v
```

Expected: 段级合成相关测试通过

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/render_service.py backend/app/storage/file_store.py backend/tests/test_render_service.py
git commit -m "feat: compose final mp4 from video segments"
```

### Task 6: 重建前端为一键式 AI 视频生成器

**Files:**
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/App.tsx`
- Create: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/pages/video-generator-page.tsx`
- Create: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/components/video-generator/generator-form.tsx`
- Create: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/components/video-generator/generation-status-panel.tsx`
- Create: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/components/video-generator/video-result-stage.tsx`
- Create: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/components/video-generator/segment-variant-strip.tsx`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/lib/api-client.ts`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/index.css`

- [ ] **Step 1: 新建页面壳子，不复用旧导演台布局**

`/frontend/src/pages/video-generator-page.tsx` 先搭三栏结构：

```tsx
<main>
  <GeneratorForm />
  <VideoResultStage />
  <GenerationStatusPanel />
</main>
```

- [ ] **Step 2: 表单组件改为受控输入**

`generator-form.tsx` 中只保留：

```tsx
storyText
videoStyle
targetDuration
aspectRatio
bgmStyle
```

确保每个字段有 label，不靠 placeholder 传语义。

- [ ] **Step 3: 结果区支持段级候选切换**

`segment-variant-strip.tsx` 至少支持：

```tsx
onSelectVariant(segmentId, variantId)
onRegenerateSegment(segmentId)
```

UI 规则：
- 默认显示已选片段
- 候选卡片 hover 有明确反馈
- 不使用会导致布局抖动的 scale hover

- [ ] **Step 4: 状态区补全 4 步进度**

`generation-status-panel.tsx` 显示：

```text
剧情拆解中
视频片段生成中
对白与字幕生成中
BGM 与成片合成中
```

- [ ] **Step 5: 更新 API client**

在 `/frontend/src/lib/api-client.ts` 中新增：

```ts
createProject()
generateProject()
selectSegmentVariant()
regenerateSegment()
getProject()
```

- [ ] **Step 6: 把 App 切到新首页**

在 `/frontend/src/App.tsx` 中移除默认进入旧创作台的逻辑，让新生成器页面成为默认主入口。旧页面如需保留，放到次级入口。

- [ ] **Step 7: 用设计系统重写样式**

在 `/frontend/src/index.css` 中统一：
- OLED 深黑背景
- 靛紫层次
- 玫红 CTA
- 轻玻璃卡片
- `prefers-reduced-motion` 降级

- [ ] **Step 8: 运行前端验证**

Run:

```bash
cd /Users/zhengy1/Documents/后端学习/漫剧项目/frontend
npm run build
npx eslint src/App.tsx src/pages/video-generator-page.tsx src/components/video-generator/*.tsx src/lib/api-client.ts
```

Expected: build 与 lint 通过

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/video-generator-page.tsx frontend/src/components/video-generator frontend/src/lib/api-client.ts frontend/src/index.css
git commit -m "feat: rebuild frontend as ai video generator"
```

### Task 7: 集成联调与旧路径收口

**Files:**
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/README.md`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/frontend/src/pages/project-detail-page.tsx`
- Modify: `/Users/zhengy1/Documents/后端学习/漫剧项目/backend/app/main.py`

- [ ] **Step 1: 明确旧导演台保留策略**

`project-detail-page.tsx` 不再作为默认首页。若保留，则只作为 legacy 调试入口。

- [ ] **Step 2: 更新 README**

补充：
- 新首页入口说明
- MiniMax 相关环境变量
- 段级候选切换说明
- 运行时资源不提交的约定

- [ ] **Step 3: 做一次端到端手测**

检查链路：

```text
创建项目 -> 一键生成 -> 看到 4 段左右候选 -> 切换一段候选 -> 再导出 -> MP4 可播放
```

- [ ] **Step 4: 记录未完成项**

在 README 或计划尾部注明：
- 角色参考图未接入
- 模型替换未开放 UI
- 高级时间轴编辑已下线/延期

- [ ] **Step 5: 最终提交**

```bash
git add README.md frontend/src/pages/project-detail-page.tsx backend/app/main.py docs/superpowers/plans/2026-03-26-video-generator-rebuild.md
git commit -m "chore: finalize video generator rebuild phase one"
```
