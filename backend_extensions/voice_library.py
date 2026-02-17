"""
Voice Library Backend Module
Manages voice profiles with SQLite storage for VoiceCraft desktop app.
"""

import os
import json
import uuid
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


def get_db_path(data_dir: str) -> str:
    """Get the path to the SQLite database."""
    return os.path.join(data_dir, 'voicecraft.db')


def get_profiles_dir(data_dir: str) -> str:
    """Get the path to the voice profiles directory."""
    profiles_dir = os.path.join(data_dir, 'voice_profiles')
    os.makedirs(profiles_dir, exist_ok=True)
    return profiles_dir


def init_db(data_dir: str) -> None:
    """Initialize the database with the voice_profiles table."""
    db_path = get_db_path(data_dir)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS voice_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            reference_audio_path TEXT NOT NULL,
            sample_audio_path TEXT,
            engine TEXT DEFAULT 'original',
            default_settings_json TEXT DEFAULT '{}',
            tags_json TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            last_used_at TEXT,
            use_count INTEGER DEFAULT 0
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_vp_name ON voice_profiles(name)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_vp_created ON voice_profiles(created_at DESC)
    ''')

    conn.commit()
    conn.close()


def create_profile(
    data_dir: str,
    name: str,
    description: str,
    reference_audio_src: str,
    engine: str = 'original',
    settings: Optional[Dict] = None,
    tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Create a new voice profile.

    Args:
        data_dir: VoiceCraft data directory
        name: Profile display name
        description: Profile description
        reference_audio_src: Path to source reference audio file
        engine: Default engine for this profile
        settings: Default generation settings
        tags: List of tags for categorization

    Returns:
        Created profile dict
    """
    profile_id = str(uuid.uuid4())
    profiles_dir = get_profiles_dir(data_dir)

    # Copy reference audio to profiles directory
    src_path = Path(reference_audio_src)
    ext = src_path.suffix.lower()
    ref_filename = f"{profile_id}_ref{ext}"
    ref_path = os.path.join(profiles_dir, ref_filename)
    shutil.copy2(reference_audio_src, ref_path)

    # Prepare data
    settings_json = json.dumps(settings or {})
    tags_json = json.dumps(tags or [])
    created_at = datetime.utcnow().isoformat()

    # Insert into database
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO voice_profiles (
            id, name, description, reference_audio_path, engine,
            default_settings_json, tags_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (profile_id, name, description, ref_path, engine, settings_json, tags_json, created_at))

    conn.commit()
    conn.close()

    return {
        'id': profile_id,
        'name': name,
        'description': description,
        'reference_audio_path': ref_path,
        'sample_audio_path': None,
        'engine': engine,
        'default_settings': settings or {},
        'tags': tags or [],
        'created_at': created_at,
        'last_used_at': None,
        'use_count': 0
    }


def list_profiles(
    data_dir: str,
    search: Optional[str] = None,
    sort_by: str = 'created_at',
    order: str = 'desc'
) -> List[Dict[str, Any]]:
    """
    List all voice profiles with optional filtering and sorting.

    Args:
        data_dir: VoiceCraft data directory
        search: Optional search string for name/description/tags
        sort_by: Field to sort by (created_at, name, use_count, last_used_at)
        order: Sort order (asc, desc)

    Returns:
        List of profile dicts
    """
    db_path = get_db_path(data_dir)

    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Build query
    query = 'SELECT * FROM voice_profiles'
    params = []

    if search:
        query += ' WHERE name LIKE ? OR description LIKE ? OR tags_json LIKE ?'
        search_pattern = f'%{search}%'
        params.extend([search_pattern, search_pattern, search_pattern])

    # Validate sort field
    valid_sort_fields = ['created_at', 'name', 'use_count', 'last_used_at']
    if sort_by not in valid_sort_fields:
        sort_by = 'created_at'

    order = 'DESC' if order.lower() == 'desc' else 'ASC'
    query += f' ORDER BY {sort_by} {order}'

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    profiles = []
    for row in rows:
        profiles.append({
            'id': row['id'],
            'name': row['name'],
            'description': row['description'],
            'reference_audio_path': row['reference_audio_path'],
            'sample_audio_path': row['sample_audio_path'],
            'engine': row['engine'],
            'default_settings': json.loads(row['default_settings_json'] or '{}'),
            'tags': json.loads(row['tags_json'] or '[]'),
            'created_at': row['created_at'],
            'last_used_at': row['last_used_at'],
            'use_count': row['use_count']
        })

    return profiles


def get_profile(data_dir: str, profile_id: str) -> Optional[Dict[str, Any]]:
    """Get a single profile by ID."""
    db_path = get_db_path(data_dir)

    if not os.path.exists(db_path):
        return None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM voice_profiles WHERE id = ?', (profile_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'reference_audio_path': row['reference_audio_path'],
        'sample_audio_path': row['sample_audio_path'],
        'engine': row['engine'],
        'default_settings': json.loads(row['default_settings_json'] or '{}'),
        'tags': json.loads(row['tags_json'] or '[]'),
        'created_at': row['created_at'],
        'last_used_at': row['last_used_at'],
        'use_count': row['use_count']
    }


def update_profile(data_dir: str, profile_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    """
    Update a profile's fields.

    Supported kwargs: name, description, engine, default_settings, tags
    """
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    updates = []
    params = []

    if 'name' in kwargs:
        updates.append('name = ?')
        params.append(kwargs['name'])

    if 'description' in kwargs:
        updates.append('description = ?')
        params.append(kwargs['description'])

    if 'engine' in kwargs:
        updates.append('engine = ?')
        params.append(kwargs['engine'])

    if 'default_settings' in kwargs:
        updates.append('default_settings_json = ?')
        params.append(json.dumps(kwargs['default_settings']))

    if 'tags' in kwargs:
        updates.append('tags_json = ?')
        params.append(json.dumps(kwargs['tags']))

    if not updates:
        conn.close()
        return get_profile(data_dir, profile_id)

    query = f"UPDATE voice_profiles SET {', '.join(updates)} WHERE id = ?"
    params.append(profile_id)

    cursor.execute(query, params)
    conn.commit()
    conn.close()

    return get_profile(data_dir, profile_id)


def delete_profile(data_dir: str, profile_id: str) -> bool:
    """Delete a profile and its associated audio files."""
    profile = get_profile(data_dir, profile_id)
    if not profile:
        return False

    # Delete audio files
    if profile['reference_audio_path'] and os.path.exists(profile['reference_audio_path']):
        os.remove(profile['reference_audio_path'])

    if profile['sample_audio_path'] and os.path.exists(profile['sample_audio_path']):
        os.remove(profile['sample_audio_path'])

    # Delete from database
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM voice_profiles WHERE id = ?', (profile_id,))
    conn.commit()
    conn.close()

    return True


def increment_use_count(data_dir: str, profile_id: str) -> None:
    """Increment usage count and update last_used_at timestamp."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE voice_profiles
        SET use_count = use_count + 1,
            last_used_at = datetime('now')
        WHERE id = ?
    ''', (profile_id,))

    conn.commit()
    conn.close()


def set_sample_audio(data_dir: str, profile_id: str, sample_path: str) -> None:
    """Set the sample audio path for a profile."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE voice_profiles SET sample_audio_path = ? WHERE id = ?
    ''', (sample_path, profile_id))

    conn.commit()
    conn.close()
