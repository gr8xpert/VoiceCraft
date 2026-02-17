"""
History Database Backend Module
Tracks generation history with SQLite storage for VoiceCraft desktop app.
"""

import os
import json
import uuid
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


def get_db_path(data_dir: str) -> str:
    """Get the path to the SQLite database."""
    return os.path.join(data_dir, 'voicecraft.db')


def get_history_dir(data_dir: str) -> str:
    """Get the path to the history audio directory."""
    history_dir = os.path.join(data_dir, 'history')
    os.makedirs(history_dir, exist_ok=True)
    return history_dir


def init_db(data_dir: str) -> None:
    """Initialize the database with the generations table."""
    db_path = get_db_path(data_dir)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS generations (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            text_preview TEXT,
            voice_profile_id TEXT,
            voice_name TEXT,
            voice_mode TEXT,
            engine TEXT,
            settings_json TEXT,
            audio_path TEXT,
            audio_format TEXT,
            duration_seconds REAL,
            sample_rate INTEGER,
            file_size_bytes INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            project_id TEXT,
            is_favorite INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_gen_created ON generations(created_at DESC)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_gen_project ON generations(project_id)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_gen_favorite ON generations(is_favorite)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_gen_deleted ON generations(is_deleted)
    ''')

    conn.commit()
    conn.close()


def save_generation(
    data_dir: str,
    text: str,
    voice_name: str,
    voice_mode: str,
    engine: str,
    settings: Dict,
    audio_bytes: bytes,
    audio_format: str,
    duration: float,
    sample_rate: int,
    project_id: Optional[str] = None,
    voice_profile_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Save a generation to history.

    Args:
        data_dir: VoiceCraft data directory
        text: Generated text
        voice_name: Voice used for generation
        voice_mode: 'predefined' or 'clone'
        engine: TTS engine used
        settings: Generation settings dict
        audio_bytes: Generated audio data
        audio_format: Audio format (wav, mp3, opus)
        duration: Audio duration in seconds
        sample_rate: Audio sample rate
        project_id: Optional project association
        voice_profile_id: Optional voice profile ID

    Returns:
        Saved generation dict
    """
    generation_id = str(uuid.uuid4())
    history_dir = get_history_dir(data_dir)

    # Save audio file
    audio_filename = f"{generation_id}.{audio_format}"
    audio_path = os.path.join(history_dir, audio_filename)
    with open(audio_path, 'wb') as f:
        f.write(audio_bytes)

    file_size = len(audio_bytes)

    # Create preview text (first 100 chars)
    text_preview = text[:100] + '...' if len(text) > 100 else text

    # Prepare data
    settings_json = json.dumps(settings)
    created_at = datetime.utcnow().isoformat()

    # Insert into database
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO generations (
            id, text, text_preview, voice_profile_id, voice_name, voice_mode,
            engine, settings_json, audio_path, audio_format, duration_seconds,
            sample_rate, file_size_bytes, created_at, project_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        generation_id, text, text_preview, voice_profile_id, voice_name, voice_mode,
        engine, settings_json, audio_path, audio_format, duration,
        sample_rate, file_size, created_at, project_id
    ))

    conn.commit()
    conn.close()

    return {
        'id': generation_id,
        'text': text,
        'text_preview': text_preview,
        'voice_profile_id': voice_profile_id,
        'voice_name': voice_name,
        'voice_mode': voice_mode,
        'engine': engine,
        'settings': settings,
        'audio_path': audio_path,
        'audio_format': audio_format,
        'duration_seconds': duration,
        'sample_rate': sample_rate,
        'file_size_bytes': file_size,
        'created_at': created_at,
        'project_id': project_id,
        'is_favorite': False,
        'is_deleted': False
    }


def list_generations(
    data_dir: str,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    voice: Optional[str] = None,
    engine: Optional[str] = None,
    favorites_only: bool = False,
    include_deleted: bool = False
) -> Dict[str, Any]:
    """
    List generations with pagination and filtering.

    Returns:
        Dict with 'items', 'total', 'page', 'limit', 'has_more'
    """
    db_path = get_db_path(data_dir)

    if not os.path.exists(db_path):
        return {'items': [], 'total': 0, 'page': page, 'limit': limit, 'has_more': False}

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Build WHERE clause
    conditions = []
    params = []

    if not include_deleted:
        conditions.append('is_deleted = 0')

    if favorites_only:
        conditions.append('is_favorite = 1')

    if search:
        conditions.append('(text LIKE ? OR voice_name LIKE ?)')
        search_pattern = f'%{search}%'
        params.extend([search_pattern, search_pattern])

    if voice:
        conditions.append('voice_name = ?')
        params.append(voice)

    if engine:
        conditions.append('engine = ?')
        params.append(engine)

    where_clause = ' AND '.join(conditions) if conditions else '1=1'

    # Get total count
    cursor.execute(f'SELECT COUNT(*) FROM generations WHERE {where_clause}', params)
    total = cursor.fetchone()[0]

    # Get paginated results
    offset = (page - 1) * limit
    query = f'''
        SELECT * FROM generations
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    '''
    cursor.execute(query, params + [limit, offset])
    rows = cursor.fetchall()
    conn.close()

    items = []
    for row in rows:
        items.append({
            'id': row['id'],
            'text': row['text'],
            'text_preview': row['text_preview'],
            'voice_profile_id': row['voice_profile_id'],
            'voice_name': row['voice_name'],
            'voice_mode': row['voice_mode'],
            'engine': row['engine'],
            'settings': json.loads(row['settings_json'] or '{}'),
            'audio_path': row['audio_path'],
            'audio_format': row['audio_format'],
            'duration_seconds': row['duration_seconds'],
            'sample_rate': row['sample_rate'],
            'file_size_bytes': row['file_size_bytes'],
            'created_at': row['created_at'],
            'project_id': row['project_id'],
            'is_favorite': bool(row['is_favorite']),
            'is_deleted': bool(row['is_deleted'])
        })

    return {
        'items': items,
        'total': total,
        'page': page,
        'limit': limit,
        'has_more': offset + limit < total
    }


def get_generation(data_dir: str, generation_id: str) -> Optional[Dict[str, Any]]:
    """Get a single generation by ID."""
    db_path = get_db_path(data_dir)

    if not os.path.exists(db_path):
        return None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM generations WHERE id = ?', (generation_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    return {
        'id': row['id'],
        'text': row['text'],
        'text_preview': row['text_preview'],
        'voice_profile_id': row['voice_profile_id'],
        'voice_name': row['voice_name'],
        'voice_mode': row['voice_mode'],
        'engine': row['engine'],
        'settings': json.loads(row['settings_json'] or '{}'),
        'audio_path': row['audio_path'],
        'audio_format': row['audio_format'],
        'duration_seconds': row['duration_seconds'],
        'sample_rate': row['sample_rate'],
        'file_size_bytes': row['file_size_bytes'],
        'created_at': row['created_at'],
        'project_id': row['project_id'],
        'is_favorite': bool(row['is_favorite']),
        'is_deleted': bool(row['is_deleted'])
    }


def delete_generation(data_dir: str, generation_id: str, hard_delete: bool = False) -> bool:
    """Soft or hard delete a generation."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    if hard_delete:
        # Get audio path first
        cursor.execute('SELECT audio_path FROM generations WHERE id = ?', (generation_id,))
        row = cursor.fetchone()
        if row and row[0] and os.path.exists(row[0]):
            os.remove(row[0])

        cursor.execute('DELETE FROM generations WHERE id = ?', (generation_id,))
    else:
        cursor.execute('UPDATE generations SET is_deleted = 1 WHERE id = ?', (generation_id,))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def toggle_favorite(data_dir: str, generation_id: str) -> bool:
    """Toggle favorite status. Returns new favorite state."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('SELECT is_favorite FROM generations WHERE id = ?', (generation_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return False

    new_value = 0 if row[0] else 1
    cursor.execute('UPDATE generations SET is_favorite = ? WHERE id = ?', (new_value, generation_id))

    conn.commit()
    conn.close()

    return bool(new_value)


def bulk_delete(data_dir: str, generation_ids: List[str], hard_delete: bool = False) -> int:
    """Delete multiple generations. Returns count of deleted items."""
    count = 0
    for gen_id in generation_ids:
        if delete_generation(data_dir, gen_id, hard_delete):
            count += 1
    return count


def get_history_stats(data_dir: str) -> Dict[str, Any]:
    """Get aggregate statistics for history."""
    db_path = get_db_path(data_dir)

    if not os.path.exists(db_path):
        return {'total': 0, 'total_duration': 0, 'favorites': 0, 'total_size': 0}

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            COUNT(*) as total,
            COALESCE(SUM(duration_seconds), 0) as total_duration,
            COALESCE(SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END), 0) as favorites,
            COALESCE(SUM(file_size_bytes), 0) as total_size
        FROM generations
        WHERE is_deleted = 0
    ''')

    row = cursor.fetchone()
    conn.close()

    return {
        'total': row[0],
        'total_duration': row[1],
        'favorites': row[2],
        'total_size': row[3]
    }


def clear_history(data_dir: str, keep_favorites: bool = True) -> int:
    """Clear all history. Returns count of deleted items."""
    db_path = get_db_path(data_dir)
    history_dir = get_history_dir(data_dir)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    if keep_favorites:
        # Get files to delete
        cursor.execute('SELECT audio_path FROM generations WHERE is_deleted = 0 AND is_favorite = 0')
    else:
        cursor.execute('SELECT audio_path FROM generations WHERE is_deleted = 0')

    rows = cursor.fetchall()

    # Delete audio files
    for row in rows:
        if row[0] and os.path.exists(row[0]):
            os.remove(row[0])

    # Delete from database
    if keep_favorites:
        cursor.execute('DELETE FROM generations WHERE is_favorite = 0')
    else:
        cursor.execute('DELETE FROM generations')

    count = cursor.rowcount
    conn.commit()
    conn.close()

    return count
