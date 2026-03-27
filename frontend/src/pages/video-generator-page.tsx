import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { apiClient, buildProjectAssetFileUrl, buildProjectExportFileUrl } from "@/lib/api-client";
import type {
  CreateProjectPayload,
  ExportStatus,
  ProjectDetail,
  ProjectListItem,
  ProjectStatus,
  VideoSegment,
  VideoSegmentVariant,
} from "@/types/project";

type VideoGeneratorPageProps = {
  onProjectIdChange: (projectId: string | null) => void;
};

const defaultPayload: CreateProjectPayload = {
  title: "",
  source_text: "",
  video_style: "电影感国风短剧",
  target_duration: 45,
  aspect_ratio: "16:9",
  bgm_style: "悬疑铺陈"
};

const statusLabels: Record<ProjectStatus, string> = {
  draft: "待生成",
  script_ready: "脚本已就绪",
  generating: "生成中",
  preview_ready: "可预览",
  exported: "已导出",
  failed: "生成失败"
};

const generatorSteps = [
  "剧情拆解中",
  "视频片段生成中",
  "对白与字幕生成中",
  "BGM 与成片合成中"
] as const;

export function VideoGeneratorPage({ onProjectIdChange }: VideoGeneratorPageProps) {
  const [formState, setFormState] = useState<CreateProjectPayload>(defaultPayload);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectListItem[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    onProjectIdChange(project?.id ?? null);
  }, [onProjectIdChange, project?.id]);

  useEffect(() => {
    if (!project?.id || project.status !== "generating") {
      return;
    }

    const pollProject = async () => {
      try {
        const detail = await apiClient.getProject(project.id);
        setProject(detail);
        setFormState((current) => ({
          ...current,
          title: detail.title,
          source_text: detail.source_text,
          video_style: detail.video_style ?? detail.style_template ?? current.video_style,
          target_duration: detail.target_duration,
          aspect_ratio: detail.aspect_ratio ?? current.aspect_ratio,
          bgm_style: detail.bgm_style ?? current.bgm_style
        }));
        if (
          detail.status === "preview_ready" ||
          detail.status === "exported" ||
          exportStatus?.status === "running"
        ) {
          await refreshExportStatus(project.id);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "获取项目详情失败");
      }
    };

    const timer = window.setInterval(() => {
      void pollProject();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [exportStatus?.status, project?.id, project?.status]);

  useEffect(() => {
    if (!project?.id || exportStatus?.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshExportStatus(project.id);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [exportStatus?.status, project?.id]);

  const selectedSegments = useMemo(
    () => project?.video_plan?.segments ?? [],
    [project?.video_plan]
  );

  const selectedVariants = useMemo(
    () =>
      selectedSegments
        .map((segment) => ({
          segment,
          variant:
            segment.variants.find((item) => item.variant_id === segment.selected_variant_id) ?? null
        }))
        .filter((item) => item.variant),
    [selectedSegments]
  );

  const stageIndex = useMemo(() => {
    if (exportStatus?.status === "completed" || project?.status === "exported") {
      return 3;
    }
    if (selectedSegments.some((segment) => segment.variants.some((variant) => variant.status === "completed"))) {
      return 2;
    }
    if (project?.video_plan) {
      return 1;
    }
    return 0;
  }, [exportStatus?.status, project?.status, project?.video_plan, selectedSegments]);

  const handleFieldChange = <K extends keyof CreateProjectPayload>(
    key: K,
    value: CreateProjectPayload[K]
  ) => {
    setFormState((current) => ({ ...current, [key]: value }));
  };

  const resolveLocalVariantVideoSource = (projectId: string, variant: VideoSegmentVariant) => {
    if (!variant.video_asset_path) {
      return null;
    }
    return buildProjectAssetFileUrl(projectId, "video_segment", variant.variant_id);
  };

  const refreshProjects = async () => {
    setRefreshing(true);
    try {
      const items = await apiClient.getProjects();
      setRecentProjects(items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "获取项目列表失败");
    } finally {
      setRefreshing(false);
    }
  };

  const refreshProject = async (projectId: string) => {
    try {
      const detail = await apiClient.getProject(projectId);
      setProject(detail);
      if (detail.status === "preview_ready" || detail.status === "exported" || exportStatus?.status === "running") {
        await refreshExportStatus(projectId);
      }
      setFormState((current) => ({
        ...current,
        title: detail.title,
        source_text: detail.source_text,
        video_style: detail.video_style ?? detail.style_template ?? current.video_style,
        target_duration: detail.target_duration,
        aspect_ratio: detail.aspect_ratio ?? current.aspect_ratio,
        bgm_style: detail.bgm_style ?? current.bgm_style
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "获取项目详情失败");
    }
  };

  const refreshExportStatus = async (projectId: string) => {
    try {
      const nextExportStatus = await apiClient.getExportStatus(projectId);
      setExportStatus(nextExportStatus);
    } catch {
      setExportStatus(null);
    }
  };

  const handleSelectProject = async (projectId: string) => {
    setError(null);
    setLoading(true);
    try {
      await refreshProject(projectId);
    } finally {
      setLoading(false);
    }
  };

  const handleExportProject = async () => {
    if (!project) {
      return;
    }
    setError(null);
    setExporting(true);
    try {
      const nextExportStatus = await apiClient.exportProject(project.id);
      setExportStatus(nextExportStatus);
      await refreshProject(project.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "导出成片失败");
    } finally {
      setExporting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setExportStatus(null);
    try {
      const createdProject = await apiClient.createProject(formState);
      const generatedProject = await apiClient.generateVideoProject(createdProject.id);
      setProject(generatedProject);
      await refreshProjects();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建并生成项目失败");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateExistingProject = async () => {
    if (!project) {
      return;
    }
    setLoading(true);
    setError(null);
    setExportStatus(null);
    try {
      const nextProject = await apiClient.generateVideoProject(project.id);
      setProject(nextProject);
      await refreshProjects();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "发起视频生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVariant = async (segment: VideoSegment, variant: VideoSegmentVariant) => {
    if (!project) {
      return;
    }
    setError(null);
    try {
      const nextProject = await apiClient.selectSegmentVariant(
        project.id,
        segment.segment_id,
        variant.variant_id
      );
      setProject(nextProject);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "切换候选失败");
    }
  };

  const handleRegenerateSegment = async (segmentId: string) => {
    if (!project) {
      return;
    }
    setError(null);
    try {
      const nextProject = await apiClient.regenerateSegment(project.id, segmentId);
      setProject(nextProject);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重生成片段失败");
    }
  };

  return (
    <main className="app-shell relative mx-auto flex min-h-screen max-w-[1620px] flex-col px-4 py-5 md:px-6 md:py-7 xl:px-8">
      <section className="cyber-hero px-6 py-7 md:px-8 md:py-9 xl:px-10">
        <div className="relative z-10 grid gap-8 xl:grid-cols-[360px_minmax(0,1.25fr)_320px]">
          <form className="cyber-panel-soft space-y-4 p-5" onSubmit={handleSubmit}>
            <div>
              <div className="panel-kicker">Generate Video</div>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">
                一键生成会动的视频
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--text-1)]">
                输入故事、风格、时长、画幅和 BGM，系统自动拆分片段并生成候选视频。
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                项目标题
              </span>
              <input
                className="cyber-input"
                required
                value={formState.title}
                onChange={(event) => handleFieldChange("title", event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                故事文本
              </span>
              <textarea
                className="cyber-textarea min-h-[240px]"
                required
                value={formState.source_text}
                onChange={(event) => handleFieldChange("source_text", event.target.value)}
                placeholder="输入章节或剧情概要，系统会自动拆成 4 段左右的内部生成计划。"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                视频风格
              </span>
              <input
                className="cyber-input"
                value={formState.video_style ?? ""}
                onChange={(event) => handleFieldChange("video_style", event.target.value)}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                  时长
                </span>
                <input
                  className="cyber-input"
                  type="number"
                  min={15}
                  max={180}
                  value={formState.target_duration}
                  onChange={(event) =>
                    handleFieldChange("target_duration", Number(event.target.value))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                  画幅
                </span>
                <select
                  className="cyber-input"
                  value={formState.aspect_ratio ?? "16:9"}
                  onChange={(event) => handleFieldChange("aspect_ratio", event.target.value)}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                  BGM 风格
                </span>
                <input
                  className="cyber-input"
                  value={formState.bgm_style ?? ""}
                  onChange={(event) => handleFieldChange("bgm_style", event.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button className="cyber-button-primary min-w-[170px]" disabled={loading} type="submit">
                {loading ? "生成中..." : "创建并生成视频"}
              </button>
              {project ? (
                <button
                  className="cyber-button-secondary min-w-[150px]"
                  disabled={loading}
                  onClick={() => void handleGenerateExistingProject()}
                  type="button"
                >
                  重新生成整片
                </button>
              ) : null}
            </div>
          </form>

          <section className="cyber-panel overflow-hidden p-6 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="panel-kicker">Result Stage</div>
                <h2 className="section-title mt-3">生成结果舞台</h2>
              </div>
              <span className="cyber-chip">
                {project ? statusLabels[project.status] : "等待项目"}
              </span>
            </div>

            <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(140deg,rgba(7,11,24,0.96),rgba(22,16,51,0.84))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              {project ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-2)]">
                        Current Project
                      </div>
                      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-0)]">
                        {project.title}
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text-1)]">
                      {project.video_plan?.segment_count ?? 0} 段自动生成计划
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {(selectedVariants.length ? selectedVariants : [null]).map((item, index) => (
                      <article
                        key={item?.segment.segment_id ?? `placeholder-${index}`}
                        className="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5"
                      >
                        {item?.variant ? (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-[var(--text-0)]">
                                  {item.segment.title}
                                </div>
                                <div className="mt-2 text-sm leading-6 text-[var(--text-1)]">
                                  {item.segment.summary}
                                </div>
                              </div>
                              <button
                                className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-[var(--text-1)] transition-colors hover:border-[var(--line-strong)] hover:text-white"
                                onClick={() => void handleRegenerateSegment(item.segment.segment_id)}
                                type="button"
                              >
                                重生成本段
                              </button>
                            </div>
                            {resolveLocalVariantVideoSource(project.id, item.variant) ? (
                              <video
                                className="mt-4 aspect-video w-full rounded-[20px] border border-white/8 bg-black object-cover"
                                controls
                                preload="metadata"
                                src={resolveLocalVariantVideoSource(project.id, item.variant) ?? undefined}
                              />
                            ) : item.variant.remote_video_url ? (
                              <div className="mt-4 flex aspect-video items-center justify-center rounded-[20px] border border-white/8 bg-black/30 px-6 text-center text-sm leading-7 text-[var(--text-1)]">
                                远程片段已完成，但当前环境暂时无法直连预览，后端已保留任务状态与文件标识。
                              </div>
                            ) : (
                              <div className="mt-4 flex aspect-video items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-black/30 text-sm text-[var(--text-2)]">
                                当前候选还在生成中
                              </div>
                            )}
                            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--text-2)]">
                              <span>{item.variant.label}</span>
                              <span>{item.variant.raw_status ?? item.variant.status}</span>
                            </div>
                          </>
                        ) : (
                          <div className="min-h-[180px] animate-pulse rounded-[20px] bg-white/5" />
                        )}
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[460px] flex-col justify-between">
                  <div>
                    <div className="max-w-3xl text-5xl font-black leading-[1.02] tracking-[-0.06em] text-white">
                      从故事文本到动态视频，不再进入复杂创作台。
                    </div>
                    <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-1)]">
                      我们会自动拆解剧情、生成片段候选、补对白和字幕，并把整片结果集中呈现在同一页。
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      ["自动拆 4 段", "降低长文本直接出片的随机性"],
                      ["每段 3 个候选", "保留轻选择，不把你拖进导演台"],
                      ["对白 + BGM + 字幕", "保留叙事完整度"],
                    ].map(([title, description]) => (
                      <div
                        key={title}
                        className="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5"
                      >
                        <div className="text-lg font-bold text-[var(--text-0)]">{title}</div>
                        <div className="mt-2 text-sm leading-6 text-[var(--text-1)]">
                          {description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {project?.video_plan ? (
              <div className="mt-6 space-y-4">
                {project.video_plan.segments.map((segment) => (
                  <section className="cyber-panel-soft p-4" key={segment.segment_id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-0)]">
                          {segment.title}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--text-2)]">
                          已选 {segment.selected_variant_id ?? "未选择"}
                        </div>
                      </div>
                      <div className="text-xs text-[var(--text-2)]">
                        {segment.variants.length} 个候选
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {segment.variants.map((variant) => {
                        const isSelected = variant.variant_id === segment.selected_variant_id;
                        return (
                          <div
                            className={`rounded-[20px] border p-4 transition-colors ${
                              isSelected
                                ? "border-[var(--line-strong)] bg-[rgba(35,212,255,0.12)]"
                                : "border-white/10 bg-[rgba(255,255,255,0.03)]"
                            }`}
                            key={variant.variant_id}
                          >
                            <button
                              className="w-full cursor-pointer text-left"
                              onClick={() => void handleSelectVariant(segment, variant)}
                              type="button"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-[var(--text-0)]">
                                  {variant.label}
                                </div>
                                <div className="text-xs text-[var(--text-2)]">
                                  {variant.raw_status ?? variant.status}
                                </div>
                              </div>
                              <div className="mt-3 text-xs leading-6 text-[var(--text-1)]">
                                {resolveLocalVariantVideoSource(project.id, variant)
                                  ? variant.video_asset_path
                                    ? "已回填本地片段，可直接预览与导出"
                                    : "已拿到远程片段地址，可直接预览"
                                  : variant.remote_video_url
                                    ? "远程片段已完成，但当前环境无法直连预览"
                                    : variant.error_message || "当前候选还在等待回填真实片段"}
                              </div>
                            </button>
                            {project && resolveLocalVariantVideoSource(project.id, variant) ? (
                              <video
                                className="mt-3 aspect-video w-full rounded-[16px] border border-white/8 bg-black object-cover"
                                controls
                                preload="metadata"
                                src={resolveLocalVariantVideoSource(project.id, variant) ?? undefined}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </section>

          <aside className="cyber-panel-soft p-5">
            <div className="panel-kicker">Mission Feed</div>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-[var(--text-0)]">
              当前状态
            </h2>

            <div className="mt-6 space-y-3">
              {generatorSteps.map((step, index) => {
                const isActive = index <= stageIndex;
                return (
                  <div
                    className={`rounded-[22px] border px-4 py-4 ${
                      isActive
                        ? "border-[var(--line-strong)] bg-[rgba(225,29,72,0.12)]"
                        : "border-white/8 bg-[rgba(255,255,255,0.04)]"
                    }`}
                    key={step}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[var(--text-0)]">{step}</div>
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-2)]">
                        {isActive ? "active" : "idle"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.04)] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-2)]">
                项目摘要
              </div>
              <div className="mt-3 space-y-2 text-sm text-[var(--text-1)]">
                <div>风格：{project?.video_style ?? formState.video_style}</div>
                <div>时长：{project?.target_duration ?? formState.target_duration} 秒</div>
                <div>画幅：{project?.aspect_ratio ?? formState.aspect_ratio}</div>
                <div>BGM：{project?.bgm_style ?? formState.bgm_style}</div>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-white/8 bg-[rgba(255,255,255,0.04)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--text-0)]">成片导出</div>
                <div className="text-xs text-[var(--text-2)]">
                  {exportStatus?.status ?? "idle"}
                </div>
              </div>
              <div className="mt-3 text-sm leading-6 text-[var(--text-1)]">
                {exportStatus?.error_message ??
                  "当每段已选候选都拿到真实视频后，可以直接导出整片 MP4。"}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="cyber-button-secondary"
                  disabled={!project || exporting}
                  onClick={() => void handleExportProject()}
                  type="button"
                >
                  {exporting ? "导出中..." : "导出成片"}
                </button>
                {project && exportStatus?.status === "completed" ? (
                  <a
                    className="cyber-button-primary"
                    href={buildProjectExportFileUrl(project.id)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    下载 MP4
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--text-0)]">最近项目</div>
                <div className="text-xs text-[var(--text-2)]">
                  {refreshing ? "刷新中" : `${recentProjects.length} 个`}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {recentProjects.length ? (
                  recentProjects.map((item) => (
                    <button
                      className={`w-full cursor-pointer rounded-[20px] border px-4 py-4 text-left transition-colors ${
                        item.id === project?.id
                          ? "border-[var(--line-strong)] bg-[rgba(35,212,255,0.1)]"
                          : "border-white/8 bg-[rgba(255,255,255,0.04)] hover:border-white/20 hover:bg-[rgba(255,255,255,0.06)]"
                      }`}
                      key={item.id}
                      onClick={() => void handleSelectProject(item.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[var(--text-0)]">{item.title}</div>
                        <div className="text-xs text-[var(--text-2)]">{statusLabels[item.status]}</div>
                      </div>
                      <div className="mt-2 text-xs leading-6 text-[var(--text-1)]">
                        {item.video_style ?? item.style_template ?? "默认风格"} · {item.target_duration}
                        秒
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-5 text-sm leading-6 text-[var(--text-2)]">
                    还没有历史项目。创建一个后，这里会成为你的快速入口。
                  </div>
                )}
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
    </main>
  );
}
