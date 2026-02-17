"""
VoiceCraft API Routes
Additional API endpoints for the desktop app features.
"""

import os
import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

# Import backend extension modules
from . import voice_library, history_db, project_manager, batch_queue, audio_postprocess, srt_export

# Create router
router = APIRouter()


# Get data directory from environment
def get_data_dir():
    data_dir = os.environ.get('VOICECRAFT_DATA_DIR', '')
    if not data_dir:
        data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


# Initialize databases on import
def init_databases():
    data_dir = get_data_dir()
    voice_library.init_db(data_dir)
    history_db.init_db(data_dir)
    project_manager.init_db(data_dir)


# ============ Voice Profile Routes ============

@router.get("/api/voice-profiles")
async def list_voice_profiles(search: Optional[str] = None, sort_by: str = 'created_at'):
    """List all voice profiles."""
    data_dir = get_data_dir()
    return voice_library.list_profiles(data_dir, search=search, sort_by=sort_by)


@router.post("/api/voice-profiles")
async def create_voice_profile(
    name: str = Form(...),
    description: str = Form(''),
    reference_audio: UploadFile = File(...),
    engine: str = Form('original'),
    settings: str = Form('{}'),
    tags: str = Form('[]')
):
    """Create a new voice profile."""
    data_dir = get_data_dir()

    # Save uploaded file temporarily
    temp_path = os.path.join(data_dir, f'temp_{reference_audio.filename}')
    with open(temp_path, 'wb') as f:
        content = await reference_audio.read()
        f.write(content)

    try:
        profile = voice_library.create_profile(
            data_dir,
            name=name,
            description=description,
            reference_audio_src=temp_path,
            engine=engine,
            settings=json.loads(settings),
            tags=json.loads(tags)
        )
        return profile
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.get("/api/voice-profiles/{profile_id}")
async def get_voice_profile(profile_id: str):
    """Get a single voice profile."""
    data_dir = get_data_dir()
    profile = voice_library.get_profile(data_dir, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/api/voice-profiles/{profile_id}")
async def update_voice_profile(profile_id: str, body: dict):
    """Update a voice profile."""
    data_dir = get_data_dir()
    profile = voice_library.update_profile(data_dir, profile_id, **body)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.delete("/api/voice-profiles/{profile_id}")
async def delete_voice_profile(profile_id: str):
    """Delete a voice profile."""
    data_dir = get_data_dir()
    success = voice_library.delete_profile(data_dir, profile_id)
    if not success:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"success": True}


@router.get("/api/voice-profiles/{profile_id}/audio")
async def get_voice_profile_audio(profile_id: str):
    """Get the reference audio for a voice profile."""
    data_dir = get_data_dir()
    profile = voice_library.get_profile(data_dir, profile_id)
    if not profile or not profile.get('reference_audio_path'):
        raise HTTPException(status_code=404, detail="Audio not found")

    audio_path = profile['reference_audio_path']
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(audio_path, media_type="audio/wav")


# ============ History Routes ============

@router.get("/api/history")
async def list_history(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    voice: Optional[str] = None,
    engine: Optional[str] = None,
    favorites_only: bool = False
):
    """List generation history."""
    data_dir = get_data_dir()
    return history_db.list_generations(
        data_dir,
        page=page,
        limit=limit,
        search=search,
        voice=voice,
        engine=engine,
        favorites_only=favorites_only
    )


@router.get("/api/history/stats")
async def get_history_stats():
    """Get history statistics."""
    data_dir = get_data_dir()
    return history_db.get_history_stats(data_dir)


@router.get("/api/history/{generation_id}")
async def get_generation(generation_id: str):
    """Get a single generation."""
    data_dir = get_data_dir()
    gen = history_db.get_generation(data_dir, generation_id)
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")
    return gen


@router.get("/api/history/{generation_id}/audio")
async def get_generation_audio(generation_id: str):
    """Get audio for a generation."""
    data_dir = get_data_dir()
    gen = history_db.get_generation(data_dir, generation_id)
    if not gen or not gen.get('audio_path'):
        raise HTTPException(status_code=404, detail="Audio not found")

    audio_path = gen['audio_path']
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    media_type = f"audio/{gen.get('audio_format', 'wav')}"
    return FileResponse(audio_path, media_type=media_type)


@router.delete("/api/history/{generation_id}")
async def delete_generation(generation_id: str):
    """Delete a generation."""
    data_dir = get_data_dir()
    success = history_db.delete_generation(data_dir, generation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Generation not found")
    return {"success": True}


@router.put("/api/history/{generation_id}/favorite")
async def toggle_favorite(generation_id: str):
    """Toggle favorite status."""
    data_dir = get_data_dir()
    is_favorite = history_db.toggle_favorite(data_dir, generation_id)
    return {"is_favorite": is_favorite}


# ============ Batch Queue Routes ============

@router.get("/api/queue")
async def get_queue():
    """Get current queue status."""
    queue = batch_queue.get_queue()
    return queue.get_status()


class QueueItemCreate(BaseModel):
    text: str
    voice_mode: str = 'predefined'
    voice_name: str = ''
    settings: dict = {}


@router.post("/api/queue")
async def add_queue_item(item: QueueItemCreate):
    """Add item(s) to queue."""
    queue = batch_queue.get_queue()
    new_item = queue.add_item_from_dict(item.dict())
    return new_item.to_dict()


@router.delete("/api/queue/{item_id}")
async def remove_queue_item(item_id: str):
    """Remove item from queue."""
    queue = batch_queue.get_queue()
    success = queue.remove_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found or cannot be removed")
    return {"success": True}


@router.post("/api/queue/start")
async def start_queue():
    """Start processing the queue."""
    # Note: This would need to be implemented with actual TTS generation
    # For now, return a placeholder
    return {"message": "Queue processing started"}


@router.post("/api/queue/pause")
async def pause_queue():
    """Pause queue processing."""
    queue = batch_queue.get_queue()
    queue.pause()
    return {"message": "Queue paused"}


@router.post("/api/queue/cancel")
async def cancel_queue():
    """Cancel queue processing."""
    queue = batch_queue.get_queue()
    queue.cancel()
    return {"message": "Queue cancelled"}


@router.post("/api/queue/clear-completed")
async def clear_completed():
    """Clear completed items from queue."""
    queue = batch_queue.get_queue()
    count = queue.clear_completed()
    return {"cleared": count}


@router.post("/api/queue/import-txt")
async def import_txt(file: UploadFile = File(...)):
    """Import items from TXT file."""
    queue = batch_queue.get_queue()
    content = (await file.read()).decode('utf-8')
    items = queue.add_items_from_text(content)
    return {"imported": len(items)}


@router.post("/api/queue/import-csv")
async def import_csv(file: UploadFile = File(...)):
    """Import items from CSV file."""
    queue = batch_queue.get_queue()
    content = (await file.read()).decode('utf-8')
    items = queue.add_items_from_csv(content)
    return {"imported": len(items)}


# ============ Project Routes ============

@router.get("/api/projects")
async def list_projects():
    """List all projects."""
    data_dir = get_data_dir()
    return project_manager.list_projects(data_dir)


class ProjectCreate(BaseModel):
    name: str
    description: str = ''


@router.post("/api/projects")
async def create_project(body: ProjectCreate):
    """Create a new project."""
    data_dir = get_data_dir()
    return project_manager.create_project(data_dir, name=body.name, description=body.description)


@router.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    """Get a project with its items."""
    data_dir = get_data_dir()
    project = project_manager.get_project(data_dir, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/api/projects/{project_id}")
async def update_project(project_id: str, body: dict):
    """Update a project."""
    data_dir = get_data_dir()
    project = project_manager.update_project(data_dir, project_id, **body)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    data_dir = get_data_dir()
    success = project_manager.delete_project(data_dir, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True}


class ProjectItemCreate(BaseModel):
    text: str
    voice_profile_id: Optional[str] = None
    settings: dict = {}


@router.post("/api/projects/{project_id}/items")
async def add_project_item(project_id: str, body: ProjectItemCreate):
    """Add an item to a project."""
    data_dir = get_data_dir()
    return project_manager.add_project_item(
        data_dir,
        project_id,
        text=body.text,
        voice_profile_id=body.voice_profile_id,
        settings=body.settings
    )


@router.delete("/api/projects/{project_id}/items/{item_id}")
async def delete_project_item(project_id: str, item_id: str):
    """Delete a project item."""
    data_dir = get_data_dir()
    success = project_manager.delete_project_item(data_dir, project_id, item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}


@router.post("/api/projects/{project_id}/generate-all")
async def generate_all_project_items(project_id: str):
    """Generate all pending items in a project."""
    # Note: This would need integration with actual TTS engine
    return {"message": "Generation started"}


@router.post("/api/projects/{project_id}/export")
async def export_project(project_id: str):
    """Export project audio as concatenated file."""
    data_dir = get_data_dir()
    project = project_manager.get_project(data_dir, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get completed items
    completed_items = [i for i in project['items'] if i['status'] == 'completed' and i.get('audio_path')]
    if not completed_items:
        raise HTTPException(status_code=400, detail="No completed items to export")

    audio_paths = [i['audio_path'] for i in completed_items]
    gap_ms = project.get('silence_gap_ms', 500)

    try:
        output_path = audio_postprocess.concatenate_with_gaps(audio_paths, gap_ms)
        return FileResponse(output_path, media_type="audio/wav", filename=f"{project['name']}.wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/projects/{project_id}/export-srt")
async def export_project_srt(project_id: str):
    """Export project as SRT subtitle file."""
    data_dir = get_data_dir()
    project = project_manager.get_project(data_dir, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    srt_content = srt_export.generate_srt_from_project(project)
    return StreamingResponse(
        iter([srt_content]),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{project["name"]}.srt"'}
    )
