import type {
  CreateProjectPayload,
  ExportStatus,
  GenerationJob,
  PreviewTimeline,
  ProjectDetail,
  ProjectListItem,
  ProjectAssetType,
  ReplaceProjectAssetPayload,
  StoryboardDraft,
} from "@/types/project";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8000";

export function buildProjectAssetFileUrl(
  projectId: string,
  assetType: ProjectAssetType,
  targetId: string
) {
  return `${API_BASE_URL}/api/projects/${projectId}/assets/${assetType}/${targetId}/file`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "请求失败");
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getProjects(limit = 12) {
    return request<ProjectListItem[]>(`/api/projects?limit=${limit}`);
  },
  createProject(payload: CreateProjectPayload) {
    return request<ProjectDetail>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  getProject(projectId: string) {
    return request<ProjectDetail>(`/api/projects/${projectId}`);
  },
  generateScriptDraft(projectId: string) {
    return request<ProjectDetail>(`/api/projects/${projectId}/script-draft`, {
      method: "POST"
    });
  },
  updateScriptDraft(projectId: string, storyboard: StoryboardDraft) {
    return request<ProjectDetail>(`/api/projects/${projectId}/script-draft`, {
      method: "PATCH",
      body: JSON.stringify({ storyboard })
    });
  },
  generateDraft(projectId: string) {
    return request<{ project_id: string; status: string; job_count: number }>(
      `/api/projects/${projectId}/generate-draft`,
      {
        method: "POST"
      }
    );
  },
  getJobs(projectId: string) {
    return request<GenerationJob[]>(`/api/projects/${projectId}/jobs`);
  },
  retryJob(projectId: string, jobId: string) {
    return request<GenerationJob>(`/api/projects/${projectId}/jobs/${jobId}/retry`, {
      method: "POST"
    });
  },
  regenerateAsset(projectId: string, assetType: ProjectAssetType, targetId: string) {
    return request<ProjectDetail>(
      `/api/projects/${projectId}/assets/${assetType}/${targetId}/regenerate`,
      {
        method: "POST"
      }
    );
  },
  replaceAsset(
    projectId: string,
    assetType: ProjectAssetType,
    targetId: string,
    payload: ReplaceProjectAssetPayload
  ) {
    return request<ProjectDetail>(`/api/projects/${projectId}/assets/${assetType}/${targetId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  getPreview(projectId: string) {
    return request<PreviewTimeline>(`/api/projects/${projectId}/preview`);
  },
  exportProject(projectId: string) {
    return request<ExportStatus>(`/api/projects/${projectId}/export`, {
      method: "POST"
    });
  },
  getExportStatus(projectId: string) {
    return request<ExportStatus>(`/api/projects/${projectId}/export-status`);
  }
};
