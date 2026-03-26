import { useEffect, useMemo, useState } from "react";

import type {
  ProjectDetail,
  StoryBeat,
  StoryCharacter,
  StoryScene,
  StoryShot,
  StoryboardDraft,
} from "@/types/project";

type ScriptDraftPanelProps = {
  project: ProjectDetail;
  draftText: string;
  loading: boolean;
  saving: boolean;
  error?: string | null;
  onDraftTextChange: (value: string) => void;
  onGenerateDraft: () => Promise<void>;
  onSaveDraft: (draftText: string) => Promise<void>;
  onSaveStoryboard: (storyboard: StoryboardDraft) => Promise<void>;
};

function cloneStoryboard(storyboard: StoryboardDraft): StoryboardDraft {
  return JSON.parse(JSON.stringify(storyboard)) as StoryboardDraft;
}

export function ScriptDraftPanel({
  project,
  draftText,
  loading,
  saving,
  error,
  onDraftTextChange,
  onGenerateDraft,
  onSaveDraft,
  onSaveStoryboard,
}: ScriptDraftPanelProps) {
  const [localStoryboard, setLocalStoryboard] = useState<StoryboardDraft | null>(
    project.storyboard ? cloneStoryboard(project.storyboard) : null
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!project.storyboard) {
      setLocalStoryboard(null);
      return;
    }
    const nextStoryboard = cloneStoryboard(project.storyboard);
    setLocalStoryboard(nextStoryboard);
    onDraftTextChange(JSON.stringify(nextStoryboard, null, 2));
  }, [onDraftTextChange, project.storyboard]);

  const isDirty = useMemo(() => {
    if (!localStoryboard || !project.storyboard) {
      return false;
    }
    return JSON.stringify(localStoryboard) !== JSON.stringify(project.storyboard);
  }, [localStoryboard, project.storyboard]);

  const syncStoryboard = (nextStoryboard: StoryboardDraft) => {
    setLocalStoryboard(nextStoryboard);
    onDraftTextChange(JSON.stringify(nextStoryboard, null, 2));
  };

  const updateCharacter = (characterId: string, patch: Partial<StoryCharacter>) => {
    if (!localStoryboard) {
      return;
    }
    syncStoryboard({
      ...localStoryboard,
      characters: localStoryboard.characters.map((character) =>
        character.id === characterId ? { ...character, ...patch } : character
      ),
    });
  };

  const updateScene = (sceneId: string, patch: Partial<StoryScene>) => {
    if (!localStoryboard) {
      return;
    }
    syncStoryboard({
      ...localStoryboard,
      scenes: localStoryboard.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, ...patch } : scene
      ),
    });
  };

  const updateBeat = (beatId: string, patch: Partial<StoryBeat>) => {
    if (!localStoryboard) {
      return;
    }
    syncStoryboard({
      ...localStoryboard,
      beats: localStoryboard.beats.map((beat) =>
        beat.id === beatId ? { ...beat, ...patch } : beat
      ),
    });
  };

  const updateShot = (shotId: string, patch: Partial<StoryShot>) => {
    if (!localStoryboard) {
      return;
    }
    syncStoryboard({
      ...localStoryboard,
      shots: localStoryboard.shots.map((shot) =>
        shot.id === shotId ? { ...shot, ...patch } : shot
      ),
    });
  };

  const handleSaveStructured = async () => {
    if (!localStoryboard) {
      return;
    }
    await onSaveStoryboard(localStoryboard);
  };

  return (
    <section className="cyber-panel p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="panel-kicker">Script Draft</div>
          <h2 className="section-title mt-3">剧本稿确认</h2>
          <p className="section-copy mt-3">
            这一层先把章节拆成可确认的角色、场景、剧情节拍和镜头骨架。先在这里定结构，再进入分镜创作台做导演级修改。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="cyber-button-secondary"
            disabled={loading}
            onClick={() => void onGenerateDraft()}
            type="button"
          >
            {loading ? "生成中..." : project.storyboard ? "重新生成剧本稿" : "生成剧本稿"}
          </button>
          <button
            className={isDirty ? "cyber-button-primary" : "cyber-button-secondary"}
            disabled={saving || !localStoryboard || !isDirty}
            onClick={() => void handleSaveStructured()}
            type="button"
          >
            {saving ? "保存中..." : isDirty ? "保存结构确认" : "结构已同步"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-[22px] border border-[rgba(255,122,143,0.25)] bg-[rgba(63,10,21,0.78)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <article className="cyber-stat">
          <div className="cyber-stat-label">项目状态</div>
          <div className="cyber-stat-value">{project.status}</div>
        </article>
        <article className="cyber-stat">
          <div className="cyber-stat-label">角色数量</div>
          <div className="cyber-stat-value">{localStoryboard?.characters.length ?? 0}</div>
        </article>
        <article className="cyber-stat">
          <div className="cyber-stat-label">场景 / 节拍</div>
          <div className="cyber-stat-value">
            {(localStoryboard?.scenes.length ?? 0)} / {(localStoryboard?.beats.length ?? 0)}
          </div>
        </article>
        <article className="cyber-stat">
          <div className="cyber-stat-label">镜头数量</div>
          <div className="cyber-stat-value">{localStoryboard?.shots.length ?? 0}</div>
        </article>
      </div>

      {localStoryboard ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <article className="cyber-panel-soft p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="panel-kicker">Characters</div>
                  <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">角色确认</h3>
                </div>
                <span className="cyber-chip">{localStoryboard.characters.length} 个</span>
              </div>
              <div className="mt-5 space-y-4">
                {localStoryboard.characters.map((character) => (
                  <div
                    className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.76)] p-4"
                    key={character.id}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        className="cyber-input"
                        onChange={(event) =>
                          updateCharacter(character.id, { name: event.target.value })
                        }
                        placeholder="角色名"
                        value={character.name}
                      />
                      <input
                        className="cyber-input"
                        onChange={(event) =>
                          updateCharacter(character.id, { role: event.target.value })
                        }
                        placeholder="角色定位"
                        value={character.role ?? ""}
                      />
                    </div>
                    <textarea
                      className="cyber-textarea mt-3 min-h-28"
                      onChange={(event) =>
                        updateCharacter(character.id, { appearance: event.target.value })
                      }
                      placeholder="角色外观与辨识特征"
                      value={character.appearance ?? ""}
                    />
                    <textarea
                      className="cyber-textarea mt-3 min-h-24"
                      onChange={(event) =>
                        updateCharacter(character.id, { notes: event.target.value })
                      }
                      placeholder="补充备注"
                      value={character.notes ?? ""}
                    />
                  </div>
                ))}
              </div>
            </article>

            <article className="cyber-panel-soft p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="panel-kicker">Scenes</div>
                  <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">场景确认</h3>
                </div>
                <span className="cyber-chip">{localStoryboard.scenes.length} 个</span>
              </div>
              <div className="mt-5 space-y-4">
                {localStoryboard.scenes.map((scene) => (
                  <div
                    className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.76)] p-4"
                    key={scene.id}
                  >
                    <input
                      className="cyber-input"
                      onChange={(event) => updateScene(scene.id, { name: event.target.value })}
                      placeholder="场景名"
                      value={scene.name}
                    />
                    <textarea
                      className="cyber-textarea mt-3 min-h-28"
                      onChange={(event) =>
                        updateScene(scene.id, { description: event.target.value })
                      }
                      placeholder="场景描述"
                      value={scene.description}
                    />
                    <textarea
                      className="cyber-textarea mt-3 min-h-24"
                      onChange={(event) =>
                        updateScene(scene.id, { visual_prompt: event.target.value })
                      }
                      placeholder="视觉提示词"
                      value={scene.visual_prompt ?? ""}
                    />
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <article className="cyber-panel-soft p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="panel-kicker">Story Beats</div>
                  <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">剧情节拍</h3>
                </div>
                <span className="cyber-chip">{localStoryboard.beats.length} 段</span>
              </div>
              <div className="mt-5 space-y-4">
                {localStoryboard.beats.map((beat, index) => (
                  <div
                    className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.76)] p-4"
                    key={beat.id}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-2)]">
                      Beat {String(index + 1).padStart(2, "0")}
                    </div>
                    <input
                      className="cyber-input mt-3"
                      onChange={(event) => updateBeat(beat.id, { title: event.target.value })}
                      placeholder="节拍标题"
                      value={beat.title}
                    />
                    <textarea
                      className="cyber-textarea mt-3 min-h-28"
                      onChange={(event) => updateBeat(beat.id, { summary: event.target.value })}
                      placeholder="节拍摘要"
                      value={beat.summary}
                    />
                    <input
                      className="cyber-input mt-3"
                      onChange={(event) => updateBeat(beat.id, { emotion: event.target.value })}
                      placeholder="情绪基调"
                      value={beat.emotion ?? ""}
                    />
                  </div>
                ))}
              </div>
            </article>

            <article className="cyber-panel-soft p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="panel-kicker">Shot Outline</div>
                  <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">镜头骨架</h3>
                </div>
                <span className="cyber-chip">{localStoryboard.shots.length} 镜</span>
              </div>
              <div className="mt-5 space-y-4">
                {localStoryboard.shots.map((shot, index) => (
                  <div
                    className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.76)] p-4"
                    key={shot.id}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-2)]">
                      Shot {String(index + 1).padStart(2, "0")}
                    </div>
                    <input
                      className="cyber-input mt-3"
                      onChange={(event) => updateShot(shot.id, { title: event.target.value })}
                      placeholder="镜头标题"
                      value={shot.title}
                    />
                    <textarea
                      className="cyber-textarea mt-3 min-h-28"
                      onChange={(event) => updateShot(shot.id, { summary: event.target.value })}
                      placeholder="镜头摘要"
                      value={shot.summary}
                    />
                    <textarea
                      className="cyber-textarea mt-3 min-h-24"
                      onChange={(event) =>
                        updateShot(shot.id, { narration: event.target.value })
                      }
                      placeholder="旁白草稿"
                      value={shot.narration ?? ""}
                    />
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <select
                        className="cyber-input"
                        onChange={(event) =>
                          updateShot(shot.id, {
                            scene_id: event.target.value || null,
                          })
                        }
                        value={shot.scene_id ?? ""}
                      >
                        <option value="">未绑定场景</option>
                        {localStoryboard.scenes.map((scene) => (
                          <option key={scene.id} value={scene.id}>
                            {scene.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="cyber-input"
                        onChange={(event) =>
                          updateShot(shot.id, {
                            beat_id: event.target.value || null,
                          })
                        }
                        value={shot.beat_id ?? ""}
                      >
                        <option value="">未绑定节拍</option>
                        {localStoryboard.beats.map((beat) => (
                          <option key={beat.id} value={beat.id}>
                            {beat.title}
                          </option>
                        ))}
                      </select>
                      <input
                        className="cyber-input"
                        min={1}
                        onChange={(event) =>
                          updateShot(shot.id, {
                            expected_duration: Number(event.target.value) || null,
                          })
                        }
                        placeholder="时长"
                        type="number"
                        value={shot.expected_duration ?? ""}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="cyber-panel-soft p-5">
            <div className="panel-kicker">Workflow</div>
            <div className="mt-4 space-y-4">
              {[
                "1. 读取章节文本与风格参数",
                "2. 抽取角色、场景和剧情节拍",
                "3. 组织成结构化镜头草稿",
                "4. 进入分镜创作台继续精修",
              ].map((item) => (
                <div
                  className="rounded-2xl border border-white/8 bg-[rgba(8,14,30,0.78)] px-4 py-3 text-sm leading-6 text-[var(--text-1)]"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="cyber-inset p-5">
            <div className="panel-kicker">Source Preview</div>
            <div className="mt-4 text-sm leading-7 text-[var(--text-1)]">
              {project.source_text || "创建项目后，章节文本会先在这里作为拆稿输入源展示。"}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-[26px] border border-white/8 bg-[rgba(6,12,24,0.72)] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="panel-kicker">Advanced JSON</div>
            <div className="mt-2 text-sm leading-6 text-[var(--text-2)]">
              结构化区负责高可读性确认，这里保留给高级编辑或排查数据用。
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="cyber-button-secondary"
              onClick={() => setShowAdvanced((current) => !current)}
              type="button"
            >
              {showAdvanced ? "收起 JSON" : "展开 JSON"}
            </button>
            <button
              className="cyber-button-secondary"
              disabled={saving || !draftText.trim()}
              onClick={() => void onSaveDraft(draftText)}
              type="button"
            >
              {saving ? "保存中..." : "按 JSON 保存"}
            </button>
          </div>
        </div>

        {showAdvanced ? (
          <div className="cyber-inset mt-4 p-4">
            <textarea
              className="cyber-textarea cyber-code min-h-[320px] border-none bg-transparent p-2 text-[13px] leading-7 text-[var(--text-1)] focus:shadow-none"
              onChange={(event) => onDraftTextChange(event.target.value)}
              placeholder="点击“生成剧本稿”后，这里会出现结构化 JSON。"
              value={draftText}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
