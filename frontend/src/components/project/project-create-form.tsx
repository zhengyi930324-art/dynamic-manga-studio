import { useState } from "react";
import type { FormEvent } from "react";

import type {
  CreateProjectPayload,
  ProjectDetail,
  ProjectListItem,
} from "@/types/project";

type ProjectCreateFormProps = {
  loading: boolean;
  onSubmit: (payload: CreateProjectPayload) => Promise<void>;
  onSelectProject: (projectId: string) => Promise<void>;
  project?: ProjectDetail | null;
  recentProjects: ProjectListItem[];
};

const defaultPayload: CreateProjectPayload = {
  title: "",
  source_text: "",
  genre: "都市悬疑",
  style_template: "日漫分镜",
  target_duration: 60,
  voice_style: "沉稳旁白",
};

export function ProjectCreateForm({
  loading,
  onSubmit,
  onSelectProject,
  project,
  recentProjects,
}: ProjectCreateFormProps) {
  const [formState, setFormState] = useState<CreateProjectPayload>(defaultPayload);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(formState);
  };

  return (
    <section className="cyber-panel surface-grid relative overflow-hidden p-6 md:p-7">
      <div className="ambient-ring -left-10 top-0 h-28 w-28 bg-cyan-300/30" />
      <div className="ambient-ring right-10 top-10 h-20 w-20 bg-fuchsia-500/25" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="panel-kicker">Input Source</div>
          <h2 className="section-title mt-3">项目创建</h2>
          <p className="section-copy mt-3">
            这里是整条创作链路的输入舱。先定义故事文本、风格、片长和配音基调，后面的剧本稿与分镜都会沿用这组设定。
          </p>
        </div>
        {project ? (
          <span className="cyber-chip">
            当前项目 <span className="cyber-code">{project.title}</span>
          </span>
        ) : (
          <span className="cyber-chip">等待创建新项目</span>
        )}
      </div>

      <div className="relative mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px]">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
              项目标题
            </span>
            <input
              className="cyber-input"
              onChange={(event) =>
                setFormState((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="例如：雨夜追凶"
              required
              value={formState.title}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
              章节文本
            </span>
            <textarea
              className="cyber-textarea min-h-56"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  source_text: event.target.value,
                }))
              }
              placeholder="把单章节故事文本贴到这里，系统会据此生成角色、场景和分镜草稿。"
              required
              value={formState.source_text}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                题材模板
              </span>
              <input
                className="cyber-input"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, genre: event.target.value }))
                }
                value={formState.genre ?? ""}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                画风模板
              </span>
              <input
                className="cyber-input"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    style_template: event.target.value,
                  }))
                }
                value={formState.style_template ?? ""}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
                目标时长（秒）
              </span>
              <input
                className="cyber-input"
                max={300}
                min={15}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    target_duration: Number(event.target.value),
                  }))
                }
                type="number"
                value={formState.target_duration}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold tracking-wide text-[var(--text-1)]">
              配音风格
            </span>
            <input
              className="cyber-input"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  voice_style: event.target.value,
                }))
              }
              value={formState.voice_style ?? ""}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
            <p className="max-w-xl text-sm leading-6 text-[var(--text-2)]">
              建议先保证文本结构完整，再去生成剧本稿。输入源越稳，后面返工越少。
            </p>
            <button className="cyber-button-primary min-w-[156px]" disabled={loading} type="submit">
              {loading ? "创建中..." : "创建项目"}
            </button>
          </div>
        </form>

        <aside className="cyber-panel-soft p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="panel-kicker">Project Deck</div>
              <h3 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-[var(--text-0)]">
                最近项目
              </h3>
            </div>
            <span className="cyber-chip">{recentProjects.length} 个</span>
          </div>

          <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">
            这里像导演的项目甲板。你可以直接回到最近的创作现场，而不是每次从空白页重来。
          </p>

          <div className="mt-5 space-y-3">
            {recentProjects.length ? (
              recentProjects.map((item) => (
                <button
                  className={`w-full cursor-pointer rounded-[24px] border px-4 py-4 text-left transition ${
                    item.id === project?.id
                      ? "border-cyan-300/35 bg-[rgba(8,16,34,0.92)] shadow-[0_0_0_1px_rgba(103,232,249,0.14),0_18px_36px_rgba(10,203,255,0.08)]"
                      : "border-white/8 bg-[rgba(7,13,28,0.76)] hover:border-cyan-300/25 hover:bg-[rgba(9,17,35,0.92)]"
                  }`}
                  key={item.id}
                  onClick={() => void onSelectProject(item.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-[var(--text-0)]">
                      {item.title}
                    </div>
                    <span className="cyber-chip">{item.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-2)]">
                    <span className="rounded-full border border-white/8 px-3 py-1">
                      {item.genre || "未分类"}
                    </span>
                    <span className="rounded-full border border-white/8 px-3 py-1">
                      {item.shot_count} 镜
                    </span>
                    <span className="rounded-full border border-white/8 px-3 py-1">
                      {item.asset_count} 素材
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-[var(--text-1)]">
                    {item.style_template || "默认风格"} · {item.target_duration} 秒 ·{" "}
                    {item.storyboard_ready ? "已进入创作阶段" : "等待生成剧本稿"}
                  </div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[var(--text-2)]">
                    继续创作
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-[rgba(6,12,24,0.72)] px-4 py-6 text-sm leading-6 text-[var(--text-2)]">
                还没有历史项目。创建第一个项目后，这里会自动成为你的最近创作入口。
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
