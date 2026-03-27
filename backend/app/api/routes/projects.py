from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db_session
from app.schemas.project import (
    CreateProjectRequest,
    ExportStatusResponse,
    PreviewTimelineResponse,
    ProjectDetailResponse,
    ProjectListItemResponse,
    ReplaceProjectAssetRequest,
    SelectSegmentVariantRequest,
    UpdateScriptDraftRequest,
)
from app.services.project_service import create_project_service
from app.services.provider_registry import ProviderRegistry
from app.services.render_service import create_render_service
from app.services.script_draft_service import ScriptDraftService
from app.services.storyboard_generation_service import create_storyboard_generation_service
from app.services.video_generation_service import create_video_generation_service


router = APIRouter(prefix="/api/projects", tags=["projects"])


def _resolve_asset_file_path(
    project_service,
    project_id: str,
    asset_type: str,
    target_id: str,
) -> Path:
    project_service._require_project(project_id)
    payload = project_service.file_store.load_generated_asset(project_id, asset_type, target_id)
    if payload is None and asset_type == "tts":
        asset_dir = project_service.file_store.get_assets_dir(project_id) / asset_type
        for file_path in asset_dir.glob(f"{target_id}.*"):
            if file_path.suffix != ".json" and file_path.is_file():
                return file_path
    if payload is None:
        raise ValueError(f"素材不存在: {asset_type}/{target_id}")

    candidate_path = (
        payload.get("image_local_path")
        or payload.get("audio_local_path")
        or payload.get("video_local_path")
        or payload.get("asset_path")
    )
    if not isinstance(candidate_path, str) or not candidate_path.strip():
        raise ValueError(f"素材文件尚未生成: {asset_type}/{target_id}")

    asset_path = Path(candidate_path)
    if not asset_path.exists() or not asset_path.is_file():
        raise ValueError(f"素材文件不存在: {asset_type}/{target_id}")
    return asset_path


@router.post("", response_model=ProjectDetailResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: CreateProjectRequest,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    service = create_project_service(session)
    project = service.create_project(payload)
    return service.build_project_detail(project.id)


@router.get("", response_model=list[ProjectListItemResponse])
def list_projects(
    limit: int = 12,
    session: Session = Depends(get_db_session),
) -> list[ProjectListItemResponse]:
    service = create_project_service(session)
    return service.list_projects(limit=limit)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project_detail(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    service = create_project_service(session)
    video_generation_service = create_video_generation_service(service.file_store)
    provider_registry = ProviderRegistry()
    try:
        project = service.get_project(project_id)
        if project is None:
            raise ValueError(f"项目不存在: {project_id}")
        if project.status.value == "generating":
            provider = provider_registry.get_provider(get_settings().default_provider)
            plan = video_generation_service.refresh_generation_plan(project, provider)
            if video_generation_service.has_ready_selected_variants(plan):
                service.update_project_metadata(project_id, status="preview_ready")
            elif not video_generation_service.has_pending_variants(plan):
                service.update_project_metadata(project_id, status="failed")
        return service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{project_id}/generate", response_model=ProjectDetailResponse)
def generate_video_project(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    project_service = create_project_service(session)
    video_generation_service = create_video_generation_service(project_service.file_store)
    provider_registry = ProviderRegistry()
    try:
        project = project_service.get_project(project_id)
        if project is None:
            raise ValueError(f"项目不存在: {project_id}")
        provider = provider_registry.get_provider(get_settings().default_provider)
        video_generation_service.submit_generation_plan(project, provider)
        project_service.update_project_metadata(project_id, status="generating")
        return project_service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{project_id}/segments/{segment_id}/select", response_model=ProjectDetailResponse)
def select_segment_variant(
    project_id: str,
    segment_id: str,
    payload: SelectSegmentVariantRequest,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    project_service = create_project_service(session)
    video_generation_service = create_video_generation_service(project_service.file_store)
    try:
        project_service._require_project(project_id)
        video_generation_service.select_segment_variant(
            project_id=project_id,
            segment_id=segment_id,
            variant_id=payload.variant_id,
        )
        return project_service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{project_id}/segments/{segment_id}/regenerate", response_model=ProjectDetailResponse)
def regenerate_segment(
    project_id: str,
    segment_id: str,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    project_service = create_project_service(session)
    video_generation_service = create_video_generation_service(project_service.file_store)
    provider_registry = ProviderRegistry()
    try:
        project = project_service.get_project(project_id)
        if project is None:
            raise ValueError(f"项目不存在: {project_id}")
        video_generation_service.regenerate_segment(project_id, segment_id)
        provider = provider_registry.get_provider(get_settings().default_provider)
        video_generation_service.submit_generation_plan(project, provider)
        project_service.update_project_metadata(project_id, status="generating")
        return project_service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{project_id}/script-draft", response_model=ProjectDetailResponse)
def generate_script_draft(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    service = create_project_service(session)
    draft_service = ScriptDraftService()
    try:
        project = service.get_project(project_id)
        if project is None:
            raise ValueError(f"项目不存在: {project_id}")
        storyboard = draft_service.generate_draft(project)
        service.save_storyboard(project_id, storyboard)
        service.update_project_metadata(project_id, status="script_ready")
        return service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/{project_id}/script-draft", response_model=ProjectDetailResponse)
def update_script_draft(
    project_id: str,
    payload: UpdateScriptDraftRequest,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    service = create_project_service(session)
    try:
        service.save_storyboard(project_id, payload.storyboard)
        service.update_project_metadata(project_id, status="script_ready")
        return service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{project_id}/assets/{asset_type}/{target_id}/regenerate", response_model=ProjectDetailResponse)
def regenerate_project_asset(
    project_id: str,
    asset_type: str,
    target_id: str,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    project_service = create_project_service(session)
    generation_service = create_storyboard_generation_service(session)
    try:
        generation_service.regenerate_asset(project_id, asset_type, target_id)
        return project_service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/{project_id}/assets/{asset_type}/{target_id}", response_model=ProjectDetailResponse)
def replace_project_asset(
    project_id: str,
    asset_type: str,
    target_id: str,
    payload: ReplaceProjectAssetRequest,
    session: Session = Depends(get_db_session),
) -> ProjectDetailResponse:
    project_service = create_project_service(session)
    generation_service = create_storyboard_generation_service(session)
    try:
        generation_service.replace_asset(
            project_id=project_id,
            asset_type=asset_type,
            target_id=target_id,
            content=payload.content,
            label=payload.label,
        )
        return project_service.build_project_detail(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{project_id}/assets/{asset_type}/{target_id}/file")
def get_project_asset_file(
    project_id: str,
    asset_type: str,
    target_id: str,
    session: Session = Depends(get_db_session),
):
    project_service = create_project_service(session)
    try:
        asset_path = _resolve_asset_file_path(
            project_service=project_service,
            project_id=project_id,
            asset_type=asset_type,
            target_id=target_id,
        )
        return FileResponse(asset_path)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{project_id}/preview", response_model=PreviewTimelineResponse)
def get_project_preview(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> PreviewTimelineResponse:
    project_service = create_project_service(session)
    render_service = create_render_service(project_service)
    video_generation_service = create_video_generation_service(project_service.file_store)
    provider_registry = ProviderRegistry()
    try:
        project = project_service.get_project(project_id)
        if project and project.status.value == "generating":
            provider = provider_registry.get_provider(get_settings().default_provider)
            plan = video_generation_service.refresh_generation_plan(project, provider)
            if video_generation_service.has_ready_selected_variants(plan):
                project_service.update_project_metadata(project_id, status="preview_ready")
            elif not video_generation_service.has_pending_variants(plan):
                project_service.update_project_metadata(project_id, status="failed")
        return render_service.build_preview_timeline(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{project_id}/export", response_model=ExportStatusResponse)
def export_project(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> ExportStatusResponse:
    project_service = create_project_service(session)
    render_service = create_render_service(project_service)
    video_generation_service = create_video_generation_service(project_service.file_store)
    provider_registry = ProviderRegistry()
    try:
        project = project_service.get_project(project_id)
        if project and project.status.value == "generating":
            provider = provider_registry.get_provider(get_settings().default_provider)
            plan = video_generation_service.refresh_generation_plan(project, provider)
            if video_generation_service.has_ready_selected_variants(plan):
                project_service.update_project_metadata(project_id, status="preview_ready")
            elif not video_generation_service.has_pending_variants(plan):
                project_service.update_project_metadata(project_id, status="failed")
        return render_service.export_project(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{project_id}/export-status", response_model=ExportStatusResponse)
def get_project_export_status(
    project_id: str,
    session: Session = Depends(get_db_session),
) -> ExportStatusResponse:
    project_service = create_project_service(session)
    render_service = create_render_service(project_service)
    try:
        return render_service.get_export_status(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{project_id}/export/file")
def get_project_export_file(
    project_id: str,
    session: Session = Depends(get_db_session),
):
    project_service = create_project_service(session)
    render_service = create_render_service(project_service)
    try:
        project_service._require_project(project_id)
        export_status = render_service.get_export_status(project_id)
        if export_status.status != "completed" or not export_status.export_file:
            raise ValueError("导出文件尚未生成完成")
        export_file = Path(export_status.export_file)
        if not export_file.exists() or not export_file.is_file():
            raise ValueError("导出文件不存在")
        return FileResponse(export_file, media_type="video/mp4", filename=export_file.name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
