import { useEffect, useMemo, useState } from "react";

import { buildProjectAssetFileUrl } from "@/lib/api-client";
import type {
  GenerationJob,
  GenerationJobStatus,
  ProjectAssetPayload,
  ProjectDetail,
  ProjectAssetType,
  ReplaceProjectAssetPayload,
  StoryDialogue,
  StoryShot,
  StoryboardDraft,
} from "@/types/project";

type EditableAssetType = Extract<ProjectAssetType, "character_image" | "scene_image">;
type RegeneratableAssetType = ProjectAssetType;

type StoryboardEditorProps = {
  project: ProjectDetail;
  jobs: GenerationJob[];
  saving: boolean;
  onSaveStoryboard: (storyboard: StoryboardDraft) => Promise<void>;
  onRegenerateAsset: (assetType: RegeneratableAssetType, targetId: string) => Promise<void>;
  onReplaceAsset: (
    assetType: EditableAssetType,
    targetId: string,
    payload: ReplaceProjectAssetPayload
  ) => Promise<void>;
};

function cloneStoryboard(storyboard: StoryboardDraft): StoryboardDraft {
  return JSON.parse(JSON.stringify(storyboard)) as StoryboardDraft;
}

function buildAssetKey(assetType: ProjectAssetType, targetId: string) {
  return `${assetType}:${targetId}`;
}

function buildJobKey(assetType: ProjectAssetType, targetId: string) {
  return `${assetType}:${targetId}`;
}

function buildAssetPreviewUrl(
  projectId: string,
  assetType: ProjectAssetType,
  targetId: string,
  asset?: ProjectAssetPayload
) {
  if (!asset) {
    return null;
  }

  if (!asset.image_local_path || asset.manual_override) {
    return null;
  }

  return buildProjectAssetFileUrl(projectId, assetType, targetId);
}

function buildTtsSegmentFileUrl(projectId: string, segmentId: string) {
  return buildProjectAssetFileUrl(projectId, "tts", segmentId);
}

export function StoryboardEditor({
  project,
  jobs,
  saving,
  onSaveStoryboard,
  onRegenerateAsset,
  onReplaceAsset,
}: StoryboardEditorProps) {
  const [localStoryboard, setLocalStoryboard] = useState<StoryboardDraft | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [assetBusyKey, setAssetBusyKey] = useState<string | null>(null);
  const [replaceInputs, setReplaceInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!project.storyboard) {
      setLocalStoryboard(null);
      setSelectedShotId(null);
      return;
    }

    const nextStoryboard = cloneStoryboard(project.storyboard);
    setLocalStoryboard(nextStoryboard);
    setSelectedShotId((current) => {
      if (current && nextStoryboard.shots.some((shot) => shot.id === current)) {
        return current;
      }
      return nextStoryboard.shots[0]?.id ?? null;
    });
  }, [project.storyboard]);

  const selectedShot = useMemo(() => {
    if (!localStoryboard || !selectedShotId) {
      return null;
    }
    return localStoryboard.shots.find((shot) => shot.id === selectedShotId) ?? null;
  }, [localStoryboard, selectedShotId]);

  const selectedScene = useMemo(() => {
    if (!localStoryboard || !selectedShot?.scene_id) {
      return null;
    }
    return localStoryboard.scenes.find((scene) => scene.id === selectedShot.scene_id) ?? null;
  }, [localStoryboard, selectedShot?.scene_id]);

  const selectedSceneAsset = selectedShot?.scene_id
    ? project.assets.scene_image?.[selectedShot.scene_id]
    : undefined;
  const selectedTtsAsset = selectedShot ? project.assets.tts?.[selectedShot.id] : undefined;
  const selectedTtsSegments = Array.isArray(selectedTtsAsset?.segments)
    ? selectedTtsAsset.segments.filter(
        (segment): segment is Record<string, unknown> =>
          typeof segment === "object" &&
          segment !== null &&
          typeof segment.audio_local_path === "string"
      )
    : [];
  const selectedSceneImageUrl =
    selectedShot?.scene_id && selectedSceneAsset
      ? buildAssetPreviewUrl(
          project.id,
          "scene_image",
          selectedShot.scene_id,
          selectedSceneAsset
        )
      : null;

  const jobsByKey = useMemo(() => {
    const mapping = new Map<string, GenerationJob>();
    jobs.forEach((job) => {
      mapping.set(buildJobKey(job.job_type, job.target_id), job);
    });
    return mapping;
  }, [jobs]);

  const selectedSceneJob = selectedShot?.scene_id
    ? jobsByKey.get(buildJobKey("scene_image", selectedShot.scene_id))
    : undefined;
  const selectedTtsJob = selectedShot
    ? jobsByKey.get(buildJobKey("tts", selectedShot.id))
    : undefined;

  const resolveAssetState = (
    assetType: ProjectAssetType,
    targetId: string,
    asset?: ProjectAssetPayload
  ): {
    status: GenerationJobStatus | "ready" | "idle";
    label: string;
    errorMessage?: string | null;
  } => {
    const job = jobsByKey.get(buildJobKey(assetType, targetId));
    if (job?.status === "running" || job?.status === "pending") {
      return {
        status: job.status,
        label: job.status === "running" ? "生成中" : "排队中",
        errorMessage: job.error_message,
      };
    }
    if (job?.status === "failed") {
      return {
        status: "failed",
        label: "生成失败",
        errorMessage: job.error_message,
      };
    }
    if (
      asset?.image_local_path ||
      asset?.audio_local_path ||
      (asset?.manual_override && asset?.content)
    ) {
      return { status: "ready", label: asset.manual_override ? "手动素材" : "已就绪" };
    }
    if (job?.status === "completed") {
      return { status: "completed", label: "已生成" };
    }
    return { status: "idle", label: "待生成" };
  };

  const isDirty = useMemo(() => {
    if (!localStoryboard || !project.storyboard) {
      return false;
    }
    return JSON.stringify(localStoryboard) !== JSON.stringify(project.storyboard);
  }, [localStoryboard, project.storyboard]);

  if (!localStoryboard) {
    return null;
  }

  const updateShot = (updater: (shot: StoryShot) => StoryShot) => {
    if (!selectedShot) {
      return;
    }
    setLocalStoryboard((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        shots: current.shots.map((shot) =>
          shot.id === selectedShot.id ? updater(shot) : shot
        ),
      };
    });
  };

  const updateCharacter = (
    characterId: string,
    updater: (character: StoryboardDraft["characters"][number]) => StoryboardDraft["characters"][number]
  ) => {
    setLocalStoryboard((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        characters: current.characters.map((character) =>
          character.id === characterId ? updater(character) : character
        ),
      };
    });
  };

  const resolveCharacterIdBySpeaker = (speaker: string) => {
    const normalizedSpeaker = speaker.trim();
    if (!normalizedSpeaker) {
      return null;
    }
    return (
      localStoryboard.characters.find((character) => character.name === normalizedSpeaker)?.id ?? null
    );
  };

  const moveShot = (direction: -1 | 1) => {
    if (!selectedShot) {
      return;
    }
    setLocalStoryboard((current) => {
      if (!current) {
        return current;
      }
      const currentIndex = current.shots.findIndex((shot) => shot.id === selectedShot.id);
      const nextIndex = currentIndex + direction;
      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= current.shots.length) {
        return current;
      }

      const nextShots = [...current.shots];
      const [shot] = nextShots.splice(currentIndex, 1);
      nextShots.splice(nextIndex, 0, shot);
      return { ...current, shots: nextShots };
    });
  };

  const updateDialogue = (index: number, patch: Partial<StoryDialogue>) => {
    const nextSpeaker = patch.speaker;
    updateShot((shot) => ({
      ...shot,
      dialogues: shot.dialogues.map((dialogue, dialogueIndex) =>
        dialogueIndex === index
          ? {
              ...dialogue,
              ...patch,
              speaker_id:
                typeof nextSpeaker === "string"
                  ? resolveCharacterIdBySpeaker(nextSpeaker)
                  : patch.speaker_id ?? dialogue.speaker_id ?? null,
            }
          : dialogue
      ),
    }));
  };

  const addDialogue = () => {
    const defaultCharacter = localStoryboard.characters[0];
    updateShot((shot) => ({
      ...shot,
      dialogues: [
        ...shot.dialogues,
        {
          speaker: defaultCharacter?.name ?? "角色",
          speaker_id: defaultCharacter?.id ?? null,
          content: "",
        },
      ],
    }));
  };

  const removeDialogue = (index: number) => {
    updateShot((shot) => ({
      ...shot,
      dialogues: shot.dialogues.filter((_, dialogueIndex) => dialogueIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (!localStoryboard) {
      return;
    }
    await onSaveStoryboard(localStoryboard);
  };

  const handleRegenerateAsset = async (assetType: RegeneratableAssetType, targetId: string) => {
    const assetKey = buildAssetKey(assetType, targetId);
    setAssetBusyKey(assetKey);
    try {
      await onRegenerateAsset(assetType, targetId);
    } finally {
      setAssetBusyKey(null);
    }
  };

  const handleReplaceAsset = async (assetType: EditableAssetType, targetId: string) => {
    const assetKey = buildAssetKey(assetType, targetId);
    const content = replaceInputs[assetKey]?.trim();
    if (!content) {
      return;
    }

    setAssetBusyKey(assetKey);
    try {
      await onReplaceAsset(assetType, targetId, { content });
      setReplaceInputs((current) => ({ ...current, [assetKey]: "" }));
    } finally {
      setAssetBusyKey(null);
    }
  };

  const selectedTtsBusy = selectedShot
    ? assetBusyKey === buildAssetKey("tts", selectedShot.id)
    : false;

  const toggleShotCharacter = (characterId: string) => {
    updateShot((shot) => {
      const exists = shot.character_ids.includes(characterId);
      return {
        ...shot,
        character_ids: exists
          ? shot.character_ids.filter((item) => item !== characterId)
          : [...shot.character_ids, characterId],
      };
    });
  };

  return (
    <section className="cyber-panel p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="panel-kicker">Director Workspace</div>
          <h2 className="section-title mt-3">分镜创作台</h2>
          <p className="section-copy mt-3">
            这里是整页的中心舞台。左侧是镜头序列，中间是导演监看区，右下是角色与场景素材舱。
          </p>
        </div>
        <button
          className={isDirty ? "cyber-button-primary" : "cyber-button-secondary"}
          disabled={saving || !isDirty}
          onClick={() => void handleSave()}
          type="button"
        >
          {saving ? "保存中..." : isDirty ? "保存创作台修改" : "当前已同步"}
        </button>
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="cyber-panel-soft p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="panel-kicker">Shot Track</div>
              <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">分镜序列</h3>
            </div>
            <span className="cyber-chip">{localStoryboard.shots.length} 镜</span>
          </div>

          <div className="mt-5 space-y-3">
            {localStoryboard.shots.map((shot, index) => {
              const isActive = shot.id === selectedShotId;
              return (
                <button
                  key={shot.id}
                  className={`w-full cursor-pointer rounded-[22px] border px-4 py-4 text-left transition ${
                    isActive
                      ? "border-[rgba(103,232,249,0.48)] bg-[rgba(9,18,38,0.94)] shadow-[0_0_0_1px_rgba(103,232,249,0.18),0_18px_36px_rgba(10,203,255,0.12)]"
                      : "border-white/8 bg-[rgba(6,12,26,0.72)] hover:border-[rgba(103,232,249,0.24)] hover:bg-[rgba(8,14,30,0.88)]"
                  }`}
                  onClick={() => setSelectedShotId(shot.id)}
                  type="button"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-2)]">
                    Shot {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-2 text-base font-semibold text-[var(--text-0)]">
                    {shot.title}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-1)]">
                    {shot.summary}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-6">
          {selectedShot ? (
            <section className="cyber-panel-soft p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="panel-kicker">Focus Shot</div>
                  <h3 className="mt-2 text-[2rem] font-extrabold tracking-[-0.03em] text-[var(--text-0)]">
                    {selectedShot.title}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-2)]">
                    调整当前镜头的文字、时长和对白，再把变化保存回 storyboard。
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="cyber-button-secondary" onClick={() => moveShot(-1)} type="button">
                    上移
                  </button>
                  <button className="cyber-button-secondary" onClick={() => moveShot(1)} type="button">
                    下移
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="cyber-inset p-4">
                  <div className="panel-kicker">Narrative</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-[var(--text-1)]">
                        分镜标题
                      </span>
                      <input
                        className="cyber-input"
                        onChange={(event) =>
                          updateShot((shot) => ({ ...shot, title: event.target.value }))
                        }
                        value={selectedShot.title}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-[var(--text-1)]">
                        镜头时长（秒）
                      </span>
                      <input
                        className="cyber-input"
                        min={1}
                        onChange={(event) =>
                          updateShot((shot) => ({
                            ...shot,
                            expected_duration: Number(event.target.value) || null,
                          }))
                        }
                        type="number"
                        value={selectedShot.expected_duration ?? ""}
                      />
                    </label>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-1)]">
                      分镜摘要
                    </span>
                    <textarea
                      className="cyber-textarea min-h-28"
                      onChange={(event) =>
                        updateShot((shot) => ({ ...shot, summary: event.target.value }))
                      }
                      value={selectedShot.summary}
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-1)]">
                      旁白
                    </span>
                    <textarea
                      className="cyber-textarea min-h-24"
                      onChange={(event) =>
                        updateShot((shot) => ({ ...shot, narration: event.target.value }))
                      }
                      value={selectedShot.narration ?? ""}
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-1)]">
                      镜头语言
                    </span>
                    <input
                      className="cyber-input"
                      onChange={(event) =>
                        updateShot((shot) => ({ ...shot, camera: event.target.value }))
                      }
                      value={selectedShot.camera ?? ""}
                    />
                  </label>

                  <div className="mt-4">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-1)]">
                      本镜角色出场
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {localStoryboard.characters.map((character) => {
                        const active = selectedShot.character_ids.includes(character.id);
                        return (
                          <button
                            className={active ? "cyber-button-primary" : "cyber-button-secondary"}
                            key={character.id}
                            onClick={() => toggleShotCharacter(character.id)}
                            type="button"
                          >
                            {character.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="cyber-inset p-4">
                  <div className="panel-kicker">Dialogue Board</div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <h4 className="text-lg font-bold text-[var(--text-0)]">对白与表演</h4>
                    <button className="cyber-button-secondary" onClick={addDialogue} type="button">
                      新增对白
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {selectedShot.dialogues.length ? (
                      selectedShot.dialogues.map((dialogue, index) => (
                        <div
                          className="rounded-[22px] border border-white/8 bg-[rgba(5,10,22,0.82)] p-4"
                          key={`${selectedShot.id}-dialogue-${index}`}
                        >
                          <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                            <select
                              className="cyber-input"
                              onChange={(event) =>
                                updateDialogue(index, {
                                  speaker: event.target.value,
                                  speaker_id: resolveCharacterIdBySpeaker(event.target.value),
                                })
                              }
                              value={dialogue.speaker}
                            >
                              {localStoryboard.characters.map((character) => (
                                <option key={character.id} value={character.name}>
                                  {character.name}
                                </option>
                              ))}
                            </select>
                            <input
                              className="cyber-input"
                              onChange={(event) =>
                                updateDialogue(index, { content: event.target.value })
                              }
                              value={dialogue.content}
                            />
                          </div>
                          <button
                            className="cyber-button-ghost mt-3"
                            onClick={() => removeDialogue(index)}
                            type="button"
                          >
                            删除这条对白
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-white/10 bg-[rgba(5,10,22,0.68)] px-4 py-5 text-sm text-[var(--text-2)]">
                        当前分镜还没有对白，可以先加一条测试内容。
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="cyber-inset overflow-hidden p-4">
                  <div className="panel-kicker">Scene Preview</div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <h4 className="text-lg font-bold text-[var(--text-0)]">
                      {selectedScene?.name ?? "当前场景"}
                    </h4>
                    <span className="cyber-chip">
                      {resolveAssetState(
                        "scene_image",
                        selectedShot?.scene_id ?? "",
                        selectedSceneAsset
                      ).label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">
                    {selectedSceneAsset?.prompt ||
                      selectedScene?.description ||
                      "当前分镜还没有对应场景说明。"}
                  </p>

                  {selectedSceneImageUrl ? (
                    <div className="mt-4 overflow-hidden rounded-[24px] border border-cyan-300/15 bg-[rgba(6,12,24,0.8)]">
                      <img
                        alt={selectedScene?.name ?? "场景素材"}
                        className="aspect-[16/10] w-full object-cover"
                        src={selectedSceneImageUrl}
                      />
                    </div>
                  ) : selectedSceneJob?.status === "running" || selectedSceneJob?.status === "pending" ? (
                    <div className="mt-4 animate-pulse rounded-[24px] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(16,36,56,0.92),rgba(5,10,22,0.9))] p-6">
                      <div className="aspect-[16/10] rounded-[18px] bg-[rgba(103,232,249,0.08)]" />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-[rgba(5,10,22,0.68)] px-4 py-8 text-sm text-[var(--text-2)]">
                      生成动态草稿或单独重生成这个场景后，这里会直接显示真实场景图。
                    </div>
                  )}
                </div>

                <div className="cyber-inset p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="panel-kicker">Voice Monitor</div>
                      <div className="mt-4 flex items-center gap-3">
                        <h4 className="text-lg font-bold text-[var(--text-0)]">当前分镜语音</h4>
                        <span className="cyber-chip">
                          {resolveAssetState("tts", selectedShot?.id ?? "", selectedTtsAsset).label}
                        </span>
                      </div>
                    </div>
                    <button
                      className="cyber-button-secondary"
                      disabled={!selectedShot || selectedTtsBusy}
                      onClick={() =>
                        selectedShot ? void handleRegenerateAsset("tts", selectedShot.id) : undefined
                      }
                      type="button"
                    >
                      {selectedTtsBusy ? "处理中..." : "重生成语音"}
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">
                    {selectedTtsAsset?.script ||
                      selectedShot.narration ||
                      "当前分镜还没有可用的语音内容。"}
                  </p>

                  {selectedTtsSegments.length ? (
                    <div className="mt-4 space-y-3">
                      {selectedTtsSegments.map((segment, index) => {
                        const segmentId = String(segment.segment_id ?? segment.target_id ?? "");
                        const speaker = String(segment.speaker ?? `片段 ${index + 1}`);
                        const voiceId = String(segment.voice_id ?? "");
                        return (
                          <div
                            className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.78)] p-4"
                            key={segmentId || `${selectedShot.id}-segment-${index}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-[var(--text-0)]">
                                {speaker}
                              </div>
                              <div className="text-xs text-[var(--text-2)]">
                                音色 {voiceId || "默认"}
                              </div>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-[var(--text-2)]">
                              {String(segment.script ?? "")}
                            </div>
                            <audio
                              className="mt-3 w-full"
                              controls
                              preload="none"
                              src={buildTtsSegmentFileUrl(project.id, segmentId)}
                            >
                              你的浏览器暂不支持音频播放。
                            </audio>
                          </div>
                        );
                      })}
                    </div>
                  ) : selectedTtsJob?.status === "running" || selectedTtsJob?.status === "pending" ? (
                    <div className="mt-4 animate-pulse rounded-[22px] border border-cyan-300/15 bg-[rgba(6,12,24,0.78)] px-4 py-6">
                      <div className="h-4 rounded-full bg-[rgba(103,232,249,0.12)]" />
                      <div className="mt-3 h-4 w-2/3 rounded-full bg-[rgba(103,232,249,0.08)]" />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-[rgba(5,10,22,0.68)] px-4 py-8 text-sm text-[var(--text-2)]">
                      动态草稿生成完成后，这里会直接提供当前分镜的语音试听，也可以单独重生成这一镜的语音。
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="cyber-panel-soft p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="panel-kicker">Character Bay</div>
                  <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">角色素材舱</h3>
                </div>
                <span className="cyber-chip">{localStoryboard.characters.length} 角</span>
              </div>
              <div className="mt-4 space-y-4">
                {localStoryboard.characters.map((character) => {
                  const assetKey = buildAssetKey("character_image", character.id);
                  const asset = project.assets.character_image?.[character.id];
                  const assetState = resolveAssetState("character_image", character.id, asset);
                  const imageUrl = buildAssetPreviewUrl(
                    project.id,
                    "character_image",
                    character.id,
                    asset
                  );
                  const busy = assetBusyKey === assetKey;
                  return (
                    <div
                      className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.76)] p-4"
                      key={character.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-[var(--text-0)]">
                            {character.name}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="cyber-chip">{assetState.label}</span>
                            {assetState.errorMessage ? (
                              <span className="text-[var(--danger)]">{assetState.errorMessage}</span>
                            ) : null}
                          </div>
                        <div className="mt-1 text-sm leading-6 text-[var(--text-2)]">
                          {asset?.manual_override
                            ? asset.label || "手动替换"
                            : asset?.prompt || character.appearance || "暂未生成角色素材"}
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-xs font-semibold text-[var(--text-2)]">
                              角色音色标签
                            </span>
                            <input
                              className="cyber-input"
                              onChange={(event) =>
                                updateCharacter(character.id, (item) => ({
                                  ...item,
                                  voice_label: event.target.value,
                                }))
                              }
                              value={character.voice_label ?? ""}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-xs font-semibold text-[var(--text-2)]">
                              Voice ID
                            </span>
                            <input
                              className="cyber-input"
                              onChange={(event) =>
                                updateCharacter(character.id, (item) => ({
                                  ...item,
                                  voice_id: event.target.value,
                                }))
                              }
                              value={character.voice_id ?? ""}
                            />
                          </label>
                        </div>
                      </div>
                        <button
                          className="cyber-button-secondary"
                          disabled={busy}
                          onClick={() => void handleRegenerateAsset("character_image", character.id)}
                          type="button"
                        >
                          {busy ? "处理中..." : "重生成"}
                        </button>
                      </div>
                      {imageUrl ? (
                        <div className="mt-4 overflow-hidden rounded-[22px] border border-cyan-300/15 bg-[rgba(5,10,22,0.82)]">
                          <img
                            alt={character.name}
                            className="aspect-[4/5] w-full object-cover"
                            src={imageUrl}
                          />
                        </div>
                      ) : assetState.status === "running" || assetState.status === "pending" ? (
                        <div className="mt-4 animate-pulse rounded-[22px] border border-cyan-300/15 bg-[rgba(5,10,22,0.82)] p-4">
                          <div className="aspect-[4/5] rounded-[18px] bg-[rgba(103,232,249,0.08)]" />
                        </div>
                      ) : null}
                      <textarea
                        className="cyber-textarea mt-3 min-h-20"
                        onChange={(event) =>
                          setReplaceInputs((current) => ({
                            ...current,
                            [assetKey]: event.target.value,
                          }))
                        }
                        placeholder="手动替换说明，例如：黑发长风衣侧身立绘"
                        value={replaceInputs[assetKey] ?? ""}
                      />
                      <button
                        className="cyber-button-primary mt-3"
                        disabled={busy || !(replaceInputs[assetKey] ?? "").trim()}
                        onClick={() => void handleReplaceAsset("character_image", character.id)}
                        type="button"
                      >
                        手动替换
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="cyber-panel-soft p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="panel-kicker">Scene Bay</div>
                  <h3 className="mt-2 text-xl font-bold text-[var(--text-0)]">场景素材舱</h3>
                </div>
                <span className="cyber-chip">{localStoryboard.scenes.length} 景</span>
              </div>
              <div className="mt-4 space-y-4">
                {localStoryboard.scenes.map((scene) => {
                  const assetKey = buildAssetKey("scene_image", scene.id);
                  const asset = project.assets.scene_image?.[scene.id];
                  const assetState = resolveAssetState("scene_image", scene.id, asset);
                  const imageUrl = buildAssetPreviewUrl(project.id, "scene_image", scene.id, asset);
                  const busy = assetBusyKey === assetKey;
                  return (
                    <div
                      className="rounded-[22px] border border-white/8 bg-[rgba(6,12,24,0.76)] p-4"
                      key={scene.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-[var(--text-0)]">
                            {scene.name}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="cyber-chip">{assetState.label}</span>
                            {assetState.errorMessage ? (
                              <span className="text-[var(--danger)]">{assetState.errorMessage}</span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-[var(--text-2)]">
                            {asset?.manual_override
                              ? asset.label || "手动替换"
                              : asset?.prompt || scene.description}
                          </div>
                        </div>
                        <button
                          className="cyber-button-secondary"
                          disabled={busy}
                          onClick={() => void handleRegenerateAsset("scene_image", scene.id)}
                          type="button"
                        >
                          {busy ? "处理中..." : "重生成"}
                        </button>
                      </div>
                      {imageUrl ? (
                        <div className="mt-4 overflow-hidden rounded-[22px] border border-cyan-300/15 bg-[rgba(5,10,22,0.82)]">
                          <img
                            alt={scene.name}
                            className="aspect-[16/10] w-full object-cover"
                            src={imageUrl}
                          />
                        </div>
                      ) : assetState.status === "running" || assetState.status === "pending" ? (
                        <div className="mt-4 animate-pulse rounded-[22px] border border-cyan-300/15 bg-[rgba(5,10,22,0.82)] p-4">
                          <div className="aspect-[16/10] rounded-[18px] bg-[rgba(103,232,249,0.08)]" />
                        </div>
                      ) : null}
                      <textarea
                        className="cyber-textarea mt-3 min-h-20"
                        onChange={(event) =>
                          setReplaceInputs((current) => ({
                            ...current,
                            [assetKey]: event.target.value,
                          }))
                        }
                        placeholder="手动替换说明，例如：暴雨中的高架桥，冷蓝色霓虹"
                        value={replaceInputs[assetKey] ?? ""}
                      />
                      <button
                        className="cyber-button-primary mt-3"
                        disabled={busy || !(replaceInputs[assetKey] ?? "").trim()}
                        onClick={() => void handleReplaceAsset("scene_image", scene.id)}
                        type="button"
                      >
                        手动替换
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>
        </div>
      </div>
    </section>
  );
}
