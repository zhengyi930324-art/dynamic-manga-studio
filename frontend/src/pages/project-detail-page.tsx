import { useEffect, useMemo, useState } from "react";

import { ExportPanel } from "@/components/project/export-panel";
import { ProjectCreateForm } from "@/components/project/project-create-form";
import { ScriptDraftPanel } from "@/components/project/script-draft-panel";
import { StoryboardEditor } from "@/components/project/storyboard-editor";
import { apiClient } from "@/lib/api-client";
import type {
  CreateProjectPayload,
  ExportStatus,
  GenerationJob,
  PreviewTimeline,
  ProjectAssetType,
  ProjectDetail,
  ProjectListItem,
  ReplaceProjectAssetPayload,
  StoryboardDraft,
} from "@/types/project";

type ProjectDetailPageProps = {
  onProjectIdChange: (projectId: string | null) => void;
};

export function ProjectDetailPage({ onProjectIdChange }: ProjectDetailPageProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectListItem[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [previewTimeline, setPreviewTimeline] = useState<PreviewTimeline | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    void refreshProjects(false);
  }, []);

  useEffect(() => {
    onProjectIdChange(project?.id ?? null);
  }, [onProjectIdChange, project?.id]);

  useEffect(() => {
    if (project?.storyboard) {
      setDraftText(JSON.stringify(project.storyboard, null, 2));
    } else {
      setDraftText("");
    }
  }, [project]);

  useEffect(() => {
    if (!project?.id) {
      setJobs([]);
      setPreviewTimeline(null);
      setExportStatus(null);
      return;
    }

    if (project.status !== "generating") {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshJobs(project.id, false);
      void refreshProject(project.id, false);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [project?.id, project?.status]);

  useEffect(() => {
    if (!project?.id || !project.storyboard) {
      return;
    }

    if (project.status !== "preview_ready" && project.status !== "exported") {
      return;
    }

    void apiClient.getPreview(project.id).then(setPreviewTimeline).catch(() => undefined);
    void apiClient
      .getExportStatus(project.id)
      .then(setExportStatus)
      .catch(() => undefined);
  }, [project?.id, project?.status, project?.storyboard]);

  const shotCount = useMemo(
    () => project?.storyboard?.shots.length ?? 0,
    [project?.storyboard?.shots.length]
  );

  const readyAssetCount = useMemo(
    () =>
      project
        ? Object.values(project.assets).reduce(
            (count, assetGroup) => count + Object.keys(assetGroup ?? {}).length,
            0
          )
        : 0,
    [project]
  );

  const refreshProject = async (projectId: string, showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const updatedProject = await apiClient.getProject(projectId);
      setProject(updatedProject);
      void refreshProjects(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "获取项目详情失败");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const refreshJobs = async (projectId: string, showLoading = true) => {
    if (showLoading) {
      setJobsLoading(true);
    }
    try {
      const nextJobs = await apiClient.getJobs(projectId);
      setJobs(nextJobs);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "获取任务状态失败");
    } finally {
      if (showLoading) {
        setJobsLoading(false);
      }
    }
  };

  const refreshProjects = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const items = await apiClient.getProjects();
      setRecentProjects(items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "获取项目列表失败");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleCreateProject = async (payload: CreateProjectPayload) => {
    setLoading(true);
    setError(null);
    try {
      const createdProject = await apiClient.createProject(payload);
      setProject(createdProject);
      await refreshProjects(false);
      setJobs([]);
      setPreviewTimeline(null);
      setExportStatus(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建项目失败");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateScriptDraft = async () => {
    if (!project) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const updatedProject = await apiClient.generateScriptDraft(project.id);
      setProject(updatedProject);
      await refreshProjects(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成剧本稿失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async (storyboard: StoryboardDraft) => {
    if (!project) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updatedProject = await apiClient.updateScriptDraft(project.id, storyboard);
      setProject(updatedProject);
      await refreshProjects(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存剧本稿失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraftText = async (draftTextValue: string) => {
    try {
      const storyboard = JSON.parse(draftTextValue) as StoryboardDraft;
      await handleSaveDraft({
        ...storyboard,
        suggested_duration: project?.target_duration ?? storyboard.suggested_duration,
      });
    } catch {
      setError("剧本稿 JSON 格式不合法，先修正后再保存。");
    }
  };

  const handleGenerateAssets = async () => {
    if (!project) {
      return;
    }
    setJobsLoading(true);
    setError(null);
    try {
      await apiClient.generateDraft(project.id);
      await Promise.all([refreshProject(project.id, false), refreshJobs(project.id, false)]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成动态草稿失败");
    } finally {
      setJobsLoading(false);
    }
  };

  const handleRefreshPreview = async () => {
    if (!project) {
      return;
    }
    setJobsLoading(true);
    setError(null);
    try {
      const preview = await apiClient.getPreview(project.id);
      setPreviewTimeline(preview);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "获取预览时间轴失败");
    } finally {
      setJobsLoading(false);
    }
  };

  const handleExportProject = async () => {
    if (!project) {
      return;
    }
    setJobsLoading(true);
    setError(null);
    try {
      const [nextExportStatus] = await Promise.all([
        apiClient.exportProject(project.id),
        refreshProject(project.id, false),
      ]);
      setExportStatus(nextExportStatus);
      const preview = await apiClient.getPreview(project.id);
      setPreviewTimeline(preview);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "导出 MP4 失败");
    } finally {
      setJobsLoading(false);
    }
  };

  const handleRefreshExportStatus = async () => {
    if (!project) {
      return;
    }
    setJobsLoading(true);
    setError(null);
    try {
      const nextExportStatus = await apiClient.getExportStatus(project.id);
      setExportStatus(nextExportStatus);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "获取导出状态失败");
    } finally {
      setJobsLoading(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    if (!project) {
      return;
    }
    setJobsLoading(true);
    setError(null);
    try {
      await apiClient.retryJob(project.id, jobId);
      await Promise.all([refreshProject(project.id, false), refreshJobs(project.id, false)]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重试任务失败");
    } finally {
      setJobsLoading(false);
    }
  };

  const handleRegenerateAsset = async (assetType: ProjectAssetType, targetId: string) => {
    if (!project) {
      return;
    }
    setError(null);
    try {
      const updatedProject = await apiClient.regenerateAsset(project.id, assetType, targetId);
      setProject(updatedProject);
      await refreshProjects(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重生成素材失败");
    }
  };

  const handleReplaceAsset = async (
    assetType: Extract<ProjectAssetType, "character_image" | "scene_image">,
    targetId: string,
    payload: ReplaceProjectAssetPayload
  ) => {
    if (!project) {
      return;
    }
    setError(null);
    try {
      const updatedProject = await apiClient.replaceAsset(project.id, assetType, targetId, payload);
      setProject(updatedProject);
      await refreshProjects(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "替换素材失败");
    }
  };

  const handleSelectProject = async (projectId: string) => {
    setError(null);
    await refreshProject(projectId);
    await refreshJobs(projectId, false);
  };

  return (
    <main className="app-shell relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-5 md:px-6 md:py-7 xl:px-8">
      <section className="cyber-hero px-6 py-7 md:px-8 md:py-9 xl:px-10">
        <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div>
            <div className="flex flex-wrap gap-3">
              <span className="cyber-chip">Task 6 已打通</span>
              <span className="cyber-chip">赛博电影感创作台</span>
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.05em] text-white md:text-6xl">
              动态漫剧创作控制台
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--text-1)] md:text-lg">
              从章节输入、剧本拆解、分镜精修，到预览时间轴和 MP4 导出，这一页就是整个漫剧项目的导演工作台。
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <article className="cyber-stat">
                <div className="cyber-stat-label">当前项目</div>
                <div className="cyber-stat-value text-lg">
                  {project?.title ? project.title : "等待创建"}
                </div>
              </article>
              <article className="cyber-stat">
                <div className="cyber-stat-label">镜头数量</div>
                <div className="cyber-stat-value">{shotCount}</div>
              </article>
              <article className="cyber-stat">
                <div className="cyber-stat-label">素材落盘</div>
                <div className="cyber-stat-value">{readyAssetCount}</div>
              </article>
            </div>
          </div>

          <aside className="cyber-panel-soft p-5">
            <div className="panel-kicker">Mission Control</div>
            <div className="mt-4 space-y-4">
              <div className="rounded-[22px] border border-white/8 bg-[rgba(7,14,30,0.76)] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-2)]">
                  项目状态
                </div>
                <div className="cyber-code mt-2 text-xl font-semibold text-[var(--text-0)]">
                  {project?.status ?? "draft"}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-[rgba(7,14,30,0.76)] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-2)]">
                  项目目录
                </div>
                <div className="mt-2 break-all text-sm leading-6 text-[var(--text-1)]">
                  {project?.storage.project_dir ?? "创建项目后显示"}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-[rgba(7,14,30,0.76)] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-2)]">
                  当前节奏
                </div>
                <div className="mt-2 text-sm leading-7 text-[var(--text-1)]">
                  先创建项目，再生成剧本稿。分镜台是主舞台，导出区负责时间轴和 MP4。
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {error ? (
        <section className="mt-6 rounded-[24px] border border-[rgba(255,122,143,0.25)] bg-[rgba(63,10,21,0.82)] px-5 py-4 text-sm text-[var(--danger)]">
          {error}
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <ProjectCreateForm
          loading={loading}
          onSelectProject={handleSelectProject}
          onSubmit={handleCreateProject}
          project={project}
          recentProjects={recentProjects}
        />

        <aside className="cyber-panel p-6 md:p-7">
          <div className="panel-kicker">Workflow Map</div>
          <h2 className="section-title mt-3">工作流总览</h2>
          <p className="section-copy mt-3">
            这不是一个普通后台，而是一条有节奏的创作流水线。上游负责输入和剧本结构，中游负责导演视角编辑，下游负责生成和导出。
          </p>

          <div className="mt-6 space-y-4">
            {[
              ["01", "输入舱", "定义文本、题材、画风和配音基调。"],
              ["02", "剧本稿层", "确认角色、场景、剧情节拍和 JSON 草稿。"],
              ["03", "导演台", "调整分镜顺序、对白、旁白、镜头时长。"],
              ["04", "输出坞", "查看任务状态、预览时间轴并导出 MP4。"],
            ].map(([index, title, description]) => (
              <div
                className="grid gap-4 rounded-[24px] border border-white/8 bg-[rgba(6,12,24,0.72)] p-4 md:grid-cols-[72px_minmax(0,1fr)]"
                key={index}
              >
                <div className="cyber-code text-2xl font-semibold text-cyan-200/90">{index}</div>
                <div>
                  <div className="text-lg font-bold text-[var(--text-0)]">{title}</div>
                  <div className="mt-2 text-sm leading-6 text-[var(--text-1)]">{description}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {project ? (
        <>
          <section className="mt-8">
            <ScriptDraftPanel
              project={project}
              draftText={draftText}
              loading={loading}
              saving={saving}
              error={error}
              onDraftTextChange={setDraftText}
              onGenerateDraft={handleGenerateScriptDraft}
              onSaveDraft={handleSaveDraftText}
              onSaveStoryboard={handleSaveDraft}
            />
          </section>

          {project.storyboard ? (
            <>
              <section className="mt-8">
                <StoryboardEditor
                  jobs={jobs}
                  onRegenerateAsset={handleRegenerateAsset}
                  onReplaceAsset={handleReplaceAsset}
                  onSaveStoryboard={handleSaveDraft}
                  project={project}
                  saving={saving}
                />
              </section>

              <section className="mt-8 pb-8">
                <ExportPanel
                  exportStatus={exportStatus}
                  jobs={jobs}
                  loading={jobsLoading}
                  onExport={handleExportProject}
                  onGenerateDraft={handleGenerateAssets}
                  onRefreshExportStatus={handleRefreshExportStatus}
                  onRefreshJobs={() => refreshJobs(project.id)}
                  onRefreshPreview={handleRefreshPreview}
                  onRetryJob={handleRetryJob}
                  previewTimeline={previewTimeline}
                  project={project}
                />
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
