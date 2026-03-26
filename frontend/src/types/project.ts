export type ProjectStatus =
  | "draft"
  | "script_ready"
  | "generating"
  | "preview_ready"
  | "exported"
  | "failed";

export type ProjectAssetType = "character_image" | "scene_image" | "tts";

export type GenerationJobStatus = "pending" | "running" | "failed" | "completed";

export type StoryCharacter = {
  id: string;
  name: string;
  role?: string | null;
  appearance?: string | null;
  notes?: string | null;
  voice_id?: string | null;
  voice_label?: string | null;
};

export type StoryScene = {
  id: string;
  name: string;
  description: string;
  visual_prompt?: string | null;
};

export type StoryBeat = {
  id: string;
  title: string;
  summary: string;
  emotion?: string | null;
};

export type StoryDialogue = {
  speaker: string;
  speaker_id?: string | null;
  content: string;
};

export type StoryShot = {
  id: string;
  title: string;
  scene_id?: string | null;
  beat_id?: string | null;
  summary: string;
  narration?: string | null;
  dialogues: StoryDialogue[];
  character_ids: string[];
  camera?: string | null;
  emotion?: string | null;
  expected_duration?: number | null;
};

export type StoryboardDraft = {
  version: number;
  characters: StoryCharacter[];
  scenes: StoryScene[];
  beats: StoryBeat[];
  shots: StoryShot[];
  suggested_duration?: number | null;
  notes: string[];
};

export type ProjectStoragePaths = {
  project_dir: string;
  project_file: string;
  storyboard_file: string;
  assets_dir: string;
  exports_dir: string;
};

export type ProjectAssetPayload = {
  provider?: string | null;
  model?: string | null;
  prompt?: string | null;
  remote_url?: string | null;
  script?: string | null;
  voice_style?: string | null;
  voice_id?: string | null;
  audio_format?: string | null;
  target_id?: string | null;
  asset_path?: string | null;
  image_local_path?: string | null;
  audio_local_path?: string | null;
  manual_override?: boolean;
  content?: string | null;
  label?: string | null;
  segments?: Record<string, unknown>[];
  target_kind?: string | null;
};

export type ProjectAssets = Partial<Record<ProjectAssetType, Record<string, ProjectAssetPayload>>>;

export type GenerationJob = {
  id: string;
  project_id: string;
  job_type: ProjectAssetType;
  target_id: string;
  provider_key: string;
  status: GenerationJobStatus;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error_message?: string | null;
  celery_task_id?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

export type PreviewTimelineAudioTrack = {
  track_type: "tts" | "bgm";
  segment_type: "narration" | "dialogue" | "gap";
  target_id: string;
  shot_id: string;
  source_path?: string | null;
  label: string;
  speaker?: string | null;
  voice_id?: string | null;
  start_offset_seconds: number;
  duration_seconds: number;
};

export type PreviewTimelineShot = {
  order: number;
  shot_id: string;
  title: string;
  duration_seconds: number;
  subtitle: string;
  narration?: string | null;
  scene_asset_path?: string | null;
  character_asset_paths: string[];
  audio_segments: PreviewTimelineAudioTrack[];
};

export type PreviewTimeline = {
  project_id: string;
  status: "ready";
  preview_file: string;
  total_duration: number;
  shot_count: number;
  render_mode: "placeholder" | "mixed" | "real_assets";
  scene_asset_count: number;
  audio_asset_count: number;
  updated_at: string;
  shots: PreviewTimelineShot[];
  audio_tracks: PreviewTimelineAudioTrack[];
};

export type ExportStatus = {
  project_id: string;
  status: "idle" | "running" | "completed" | "failed";
  preview_file?: string | null;
  export_file?: string | null;
  total_duration?: number | null;
  shot_count: number;
  render_mode: "placeholder" | "mixed" | "real_assets";
  scene_asset_count: number;
  audio_asset_count: number;
  error_message?: string | null;
  updated_at: string;
};

export type ProjectDetail = {
  id: string;
  title: string;
  source_text: string;
  genre?: string | null;
  style_template?: string | null;
  target_duration: number;
  voice_style?: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  storage: ProjectStoragePaths;
  storyboard?: StoryboardDraft | null;
  assets: ProjectAssets;
};

export type ProjectListItem = {
  id: string;
  title: string;
  genre?: string | null;
  style_template?: string | null;
  target_duration: number;
  voice_style?: string | null;
  status: ProjectStatus;
  updated_at: string;
  created_at: string;
  storyboard_ready: boolean;
  shot_count: number;
  asset_count: number;
};

export type CreateProjectPayload = {
  title: string;
  source_text: string;
  genre?: string;
  style_template?: string;
  target_duration: number;
  voice_style?: string;
};

export type ReplaceProjectAssetPayload = {
  content: string;
  label?: string;
};
