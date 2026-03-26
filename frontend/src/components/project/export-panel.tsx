import type {
  ExportStatus,
  GenerationJob,
  PreviewTimeline,
  ProjectDetail,
} from "@/types/project";

type ExportPanelProps = {
  project: ProjectDetail;
  jobs: GenerationJob[];
  previewTimeline: PreviewTimeline | null;
  exportStatus: ExportStatus | null;
  loading: boolean;
  onGenerateDraft: () => Promise<void>;
  onRefreshJobs: () => Promise<void>;
  onRetryJob: (jobId: string) => Promise<void>;
  onRefreshPreview: () => Promise<void>;
  onExport: () => Promise<void>;
  onRefreshExportStatus: () => Promise<void>;
};

export function ExportPanel({
  project,
  jobs,
  previewTimeline,
  exportStatus,
  loading,
  onGenerateDraft,
  onRefreshJobs,
  onRetryJob,
  onRefreshPreview,
  onExport,
  onRefreshExportStatus,
}: ExportPanelProps) {
  const completedCount = jobs.filter((job) => job.status === "completed").length;
  const pendingCount = jobs.filter((job) => job.status === "pending").length;
  const runningCount = jobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  ).length;
  const failedJobs = jobs.filter((job) => job.status === "failed");
  const runningJobs = jobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  );
  const groupedRunningJobs = [
    {
      label: "角色图",
      count: runningJobs.filter((job) => job.job_type === "character_image").length,
    },
    {
      label: "场景图",
      count: runningJobs.filter((job) => job.job_type === "scene_image").length,
    },
    {
      label: "语音",
      count: runningJobs.filter((job) => job.job_type === "tts").length,
    },
  ].filter((item) => item.count > 0);
  const previewReady = project.status === "preview_ready" || project.status === "exported";
  const assetCount = Object.values(project.assets).reduce(
    (count, assetGroup) => count + Object.keys(assetGroup ?? {}).length,
    0
  );
  const exportStateText =
    exportStatus?.status === "completed"
      ? "导出成功"
      : exportStatus?.status === "failed"
        ? "导出失败"
        : exportStatus?.status === "running"
        ? "导出中"
          : "尚未导出";
  const timelineRenderMode = previewTimeline?.render_mode ?? exportStatus?.render_mode ?? "placeholder";
  const renderModeText =
    timelineRenderMode === "real_assets"
      ? "真实素材导出"
      : timelineRenderMode === "mixed"
        ? "混合导出"
        : "占位导出";
  const characterCoverageCount =
    previewTimeline?.shots.filter((shot) => shot.character_asset_paths.length > 0).length ?? 0;
  const audioSegmentCount =
    previewTimeline?.audio_tracks.length ??
    previewTimeline?.shots.reduce((count, shot) => count + shot.audio_segments.length, 0) ??
    0;

  return (
    <section className="cyber-panel p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="panel-kicker">Output Dock</div>
          <h2 className="section-title mt-3">预览与导出</h2>
          <p className="section-copy mt-3">
            这里是当前项目的输出坞。上半区负责生成动态草稿和预览时间轴，下半区负责导出状态和失败任务回收。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="cyber-button-secondary" disabled={loading} onClick={() => void onRefreshJobs()} type="button">
            刷新任务状态
          </button>
          <button
            className="cyber-button-secondary"
            disabled={loading || !project.storyboard}
            onClick={() => void onRefreshPreview()}
            type="button"
          >
            刷新预览时间轴
          </button>
          <button
            className="cyber-button-primary"
            disabled={loading || !project.storyboard}
            onClick={() => void onGenerateDraft()}
            type="button"
          >
            {loading ? "处理中..." : "生成动态草稿"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <article className="cyber-stat">
          <div className="cyber-stat-label">项目状态</div>
          <div className="cyber-stat-value">{project.status}</div>
        </article>
        <article className="cyber-stat">
          <div className="cyber-stat-label">预览状态</div>
          <div className="cyber-stat-value">{previewReady ? "ready" : "pending"}</div>
        </article>
        <article className="cyber-stat">
          <div className="cyber-stat-label">已完成任务</div>
          <div className="cyber-stat-value">
            {completedCount}/{jobs.length || 0}
          </div>
        </article>
        <article className="cyber-stat">
          <div className="cyber-stat-label">已落盘素材</div>
          <div className="cyber-stat-value">{assetCount}</div>
        </article>
      </div>

      {groupedRunningJobs.length ? (
        <div className="mt-4 flex flex-wrap gap-3 rounded-[22px] border border-cyan-300/15 bg-[rgba(7,14,30,0.7)] px-4 py-4 text-sm text-[var(--text-1)]">
          <span className="font-semibold text-[var(--text-0)]">当前生成中</span>
          {groupedRunningJobs.map((item) => (
            <span className="cyber-chip" key={item.label}>
              {item.label} {item.count}
            </span>
          ))}
          {pendingCount ? <span className="cyber-chip">排队 {pendingCount}</span> : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="cyber-panel-soft overflow-hidden p-5">
          <div className="relative overflow-hidden rounded-[24px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.22),transparent_30%),linear-gradient(180deg,rgba(7,14,30,0.96),rgba(4,9,22,0.94))] p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="panel-kicker">Export Dock</div>
                <div className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-white">
                  {exportStateText}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="cyber-button-secondary"
                  disabled={loading || !project.storyboard}
                  onClick={() => void onRefreshExportStatus()}
                  type="button"
                >
                  刷新导出状态
                </button>
                <button
                  className="cyber-button-primary"
                  disabled={loading || !project.storyboard}
                  onClick={() => void onExport()}
                  type="button"
                >
                  {loading ? "处理中..." : "导出 MP4"}
                </button>
              </div>
            </div>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
              导出会优先使用已经落盘的真实场景图和真实语音。缺失的部分才会回退到当前最小占位导出逻辑，文件会写进项目目录的
              <span className="cyber-code"> exports/</span>。
            </p>

            <div className="neon-divider mt-5" />

            <div className="mt-5 grid gap-3 text-sm text-white/72 md:grid-cols-4">
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  素材模式
                </div>
                <div className="mt-2 leading-6">{renderModeText}</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  预览配置
                </div>
                <div className="mt-2 break-all leading-6">{previewTimeline?.preview_file ?? "尚未生成"}</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  导出文件
                </div>
                <div className="mt-2 break-all leading-6">{exportStatus?.export_file ?? "尚未生成"}</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  错误信息
                </div>
                <div className="mt-2 leading-6">{exportStatus?.error_message ?? "无"}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-white/72 md:grid-cols-2">
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  真实场景图覆盖
                </div>
                <div className="mt-2 leading-6">
                  {previewTimeline?.scene_asset_count ?? exportStatus?.scene_asset_count ?? 0} /{" "}
                  {previewTimeline?.shot_count ?? exportStatus?.shot_count ?? 0}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  真实语音覆盖
                </div>
                <div className="mt-2 leading-6">
                  {previewTimeline?.audio_asset_count ?? exportStatus?.audio_asset_count ?? 0} /{" "}
                  {previewTimeline?.shot_count ?? exportStatus?.shot_count ?? 0}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  角色素材入镜
                </div>
                <div className="mt-2 leading-6">
                  {characterCoverageCount} / {previewTimeline?.shot_count ?? exportStatus?.shot_count ?? 0}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                  语音片段数
                </div>
                <div className="mt-2 leading-6">{audioSegmentCount}</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="panel-kicker">Preview Timeline</div>
                <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">预览时间轴</h3>
              </div>
              <span className="cyber-chip">
                {previewTimeline?.shot_count ?? 0} 镜 / {previewTimeline?.total_duration ?? 0} 秒
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {previewTimeline ? (
                previewTimeline.shots.map((shot) => (
                  <div
                    className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.78)] px-4 py-4"
                    key={shot.shot_id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[var(--text-0)]">
                        第 {shot.order} 镜 · {shot.title}
                      </div>
                      <div className="cyber-code text-sm text-cyan-200/80">{shot.duration_seconds}s</div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--text-1)]">{shot.subtitle}</div>
                    {shot.audio_segments.length ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-2)]">
                        {shot.audio_segments.map((segment) => (
                          <span className="cyber-chip" key={segment.target_id}>
                            {segment.speaker ?? segment.label} · {segment.duration_seconds.toFixed(1)}s
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-[rgba(5,10,22,0.68)] px-4 py-5 text-sm text-[var(--text-2)]">
                  还没有预览时间轴。你可以先点击“刷新预览时间轴”，让后端根据 storyboard 生成一版可播放配置。
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="cyber-panel-soft p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="panel-kicker">Task Monitor</div>
              <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">任务监看</h3>
            </div>
            <span className="cyber-chip">进行中 {runningCount} 项</span>
          </div>

          <div className="mt-4 space-y-3">
            {jobs.length ? (
              jobs.map((job) => (
                <div
                  className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.76)] px-4 py-4"
                  key={job.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-0)]">
                        {job.job_type} / {job.target_id}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-[var(--text-2)]">
                        状态：{job.status}
                        {job.error_message ? ` · ${job.error_message}` : ""}
                      </div>
                    </div>

                    {job.status === "failed" ? (
                      <button className="cyber-button-secondary" onClick={() => void onRetryJob(job.id)} type="button">
                        重试
                      </button>
                    ) : (
                      <span className="text-sm text-[var(--text-2)]">已重试 {job.retry_count} 次</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-[rgba(5,10,22,0.68)] px-4 py-5 text-sm text-[var(--text-2)]">
                还没有生成任务。先确认剧本稿，再点击“生成动态草稿”。
              </div>
            )}
          </div>

          {failedJobs.length ? (
            <div className="mt-4 rounded-[22px] border border-[rgba(255,122,143,0.25)] bg-[rgba(63,10,21,0.78)] px-4 py-4 text-sm text-[var(--danger)]">
              当前有 {failedJobs.length} 个失败任务，建议先局部重试，不要整项目重跑。
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
