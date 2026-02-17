"""
Project Manager Backend Module
Manages projects with SQLite storage for VoiceCraft desktop app.
Projects contain ordered lists of text items for sequential generation.
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


def get_projects_dir(data_dir: str) -> str:
    """Get the path to the projects audio directory."""
    projects_dir = os.path.join(data_dir, 'projects')
    os.makedirs(projects_dir, exist_ok=True)
    return projects_dir


def init_db(data_dir: str) -> None:
    """Initialize the database with projects tables."""
    db_path = get_db_path(data_dir)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Projects table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            default_voice_profile_id TEXT,
            default_engine TEXT DEFAULT 'turbo',
            default_settings_json TEXT DEFAULT '{}',
            silence_gap_ms INTEGER DEFAULT 500,
            export_format TEXT DEFAULT 'wav',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    ''')

    # Project items table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS project_items (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            text TEXT NOT NULL,
            voice_profile_id TEXT,
            settings_json TEXT DEFAULT '{}',
            audio_path TEXT,
            duration_seconds REAL,
            sort_order INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_pi_project ON project_items(project_id, sort_order)
    ''')

    conn.commit()
    conn.close()


def create_project(
    data_dir: str,
    name: str,
    description: str = '',
    default_voice_profile_id: Optional[str] = None,
    default_engine: str = 'turbo',
    default_settings: Optional[Dict] = None,
    silence_gap_ms: int = 500,
    export_format: str = 'wav'
) -> Dict[str, Any]:
    """Create a new project."""
    project_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    settings_json = json.dumps(default_settings or {})

    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO projects (
            id, name, description, default_voice_profile_id, default_engine,
            default_settings_json, silence_gap_ms, export_format, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        project_id, name, description, default_voice_profile_id, default_engine,
        settings_json, silence_gap_ms, export_format, created_at, created_at
    ))

    conn.commit()
    conn.close()

    # Create project directory
    project_dir = os.path.join(get_projects_dir(data_dir), project_id)
    os.makedirs(project_dir, exist_ok=True)

    return {
        'id': project_id,
        'name': name,
        'description': description,
        'default_voice_profile_id': default_voice_profile_id,
        'default_engine': default_engine,
        'default_settings': default_settings or {},
        'silence_gap_ms': silence_gap_ms,
        'export_format': export_format,
        'created_at': created_at,
        'updated_at': created_at,
        'items': [],
        'item_count': 0,
        'completed_count': 0
    }


def list_projects(data_dir: str) -> List[Dict[str, Any]]:
    """List all projects with item counts."""
    db_path = get_db_path(data_dir)

    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('''
        SELECT p.*,
            (SELECT COUNT(*) FROM project_items WHERE project_id = p.id) as item_count,
            (SELECT COUNT(*) FROM project_items WHERE project_id = p.id AND status = 'completed') as completed_count
        FROM projects p
        ORDER BY p.updated_at DESC
    ''')

    rows = cursor.fetchall()
    conn.close()

    projects = []
    for row in rows:
        projects.append({
            'id': row['id'],
            'name': row['name'],
            'description': row['description'],
            'default_voice_profile_id': row['default_voice_profile_id'],
            'default_engine': row['default_engine'],
            'default_settings': json.loads(row['default_settings_json'] or '{}'),
            'silence_gap_ms': row['silence_gap_ms'],
            'export_format': row['export_format'],
            'created_at': row['created_at'],
            'updated_at': row['updated_at'],
            'item_count': row['item_count'],
            'completed_count': row['completed_count']
        })

    return projects


def get_project(data_dir: str, project_id: str) -> Optional[Dict[str, Any]]:
    """Get a project with all its items."""
    db_path = get_db_path(data_dir)

    if not os.path.exists(db_path):
        return None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get project
    cursor.execute('SELECT * FROM projects WHERE id = ?', (project_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return None

    project = {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'default_voice_profile_id': row['default_voice_profile_id'],
        'default_engine': row['default_engine'],
        'default_settings': json.loads(row['default_settings_json'] or '{}'),
        'silence_gap_ms': row['silence_gap_ms'],
        'export_format': row['export_format'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
    }

    # Get items
    cursor.execute('''
        SELECT * FROM project_items WHERE project_id = ? ORDER BY sort_order
    ''', (project_id,))

    items = []
    for item_row in cursor.fetchall():
        items.append({
            'id': item_row['id'],
            'project_id': item_row['project_id'],
            'text': item_row['text'],
            'voice_profile_id': item_row['voice_profile_id'],
            'settings': json.loads(item_row['settings_json'] or '{}'),
            'audio_path': item_row['audio_path'],
            'duration_seconds': item_row['duration_seconds'],
            'sort_order': item_row['sort_order'],
            'status': item_row['status'],
            'created_at': item_row['created_at'],
        })

    project['items'] = items
    project['item_count'] = len(items)
    project['completed_count'] = sum(1 for i in items if i['status'] == 'completed')

    conn.close()
    return project


def update_project(data_dir: str, project_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    """Update project metadata."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    updates = ['updated_at = datetime("now")']
    params = []

    field_mapping = {
        'name': 'name',
        'description': 'description',
        'default_voice_profile_id': 'default_voice_profile_id',
        'default_engine': 'default_engine',
        'silence_gap_ms': 'silence_gap_ms',
        'export_format': 'export_format',
    }

    for key, db_field in field_mapping.items():
        if key in kwargs:
            updates.append(f'{db_field} = ?')
            params.append(kwargs[key])

    if 'default_settings' in kwargs:
        updates.append('default_settings_json = ?')
        params.append(json.dumps(kwargs['default_settings']))

    query = f"UPDATE projects SET {', '.join(updates)} WHERE id = ?"
    params.append(project_id)

    cursor.execute(query, params)
    conn.commit()
    conn.close()

    return get_project(data_dir, project_id)


def delete_project(data_dir: str, project_id: str) -> bool:
    """Delete a project and all its items and audio files."""
    # Delete audio files
    project_dir = os.path.join(get_projects_dir(data_dir), project_id)
    if os.path.exists(project_dir):
        import shutil
        shutil.rmtree(project_dir)

    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Delete items first (foreign key constraint)
    cursor.execute('DELETE FROM project_items WHERE project_id = ?', (project_id,))
    cursor.execute('DELETE FROM projects WHERE id = ?', (project_id,))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def add_project_item(
    data_dir: str,
    project_id: str,
    text: str,
    voice_profile_id: Optional[str] = None,
    settings: Optional[Dict] = None
) -> Dict[str, Any]:
    """Add an item to a project."""
    item_id = str(uuid.uuid4())
    settings_json = json.dumps(settings or {})
    created_at = datetime.utcnow().isoformat()

    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get next sort order
    cursor.execute(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 FROM project_items WHERE project_id = ?',
        (project_id,)
    )
    sort_order = cursor.fetchone()[0]

    cursor.execute('''
        INSERT INTO project_items (id, project_id, text, voice_profile_id, settings_json, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (item_id, project_id, text, voice_profile_id, settings_json, sort_order, created_at))

    # Update project timestamp
    cursor.execute('UPDATE projects SET updated_at = datetime("now") WHERE id = ?', (project_id,))

    conn.commit()
    conn.close()

    return {
        'id': item_id,
        'project_id': project_id,
        'text': text,
        'voice_profile_id': voice_profile_id,
        'settings': settings or {},
        'audio_path': None,
        'duration_seconds': None,
        'sort_order': sort_order,
        'status': 'pending',
        'created_at': created_at,
    }


def update_project_item(data_dir: str, project_id: str, item_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    """Update a project item."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    updates = []
    params = []

    if 'text' in kwargs:
        updates.append('text = ?')
        params.append(kwargs['text'])

    if 'voice_profile_id' in kwargs:
        updates.append('voice_profile_id = ?')
        params.append(kwargs['voice_profile_id'])

    if 'settings' in kwargs:
        updates.append('settings_json = ?')
        params.append(json.dumps(kwargs['settings']))

    if 'status' in kwargs:
        updates.append('status = ?')
        params.append(kwargs['status'])

    if 'audio_path' in kwargs:
        updates.append('audio_path = ?')
        params.append(kwargs['audio_path'])

    if 'duration_seconds' in kwargs:
        updates.append('duration_seconds = ?')
        params.append(kwargs['duration_seconds'])

    if not updates:
        conn.close()
        return None

    query = f"UPDATE project_items SET {', '.join(updates)} WHERE id = ? AND project_id = ?"
    params.extend([item_id, project_id])

    cursor.execute(query, params)

    # Update project timestamp
    cursor.execute('UPDATE projects SET updated_at = datetime("now") WHERE id = ?', (project_id,))

    conn.commit()

    # Return updated item
    cursor.execute('SELECT * FROM project_items WHERE id = ?', (item_id,))
    row = cursor.fetchone()
    conn.close()

    if row:
        return {
            'id': row[0],
            'project_id': row[1],
            'text': row[2],
            'voice_profile_id': row[3],
            'settings': json.loads(row[4] or '{}'),
            'audio_path': row[5],
            'duration_seconds': row[6],
            'sort_order': row[7],
            'status': row[8],
            'created_at': row[9],
        }
    return None


def delete_project_item(data_dir: str, project_id: str, item_id: str) -> bool:
    """Delete a project item."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get audio path to delete
    cursor.execute('SELECT audio_path FROM project_items WHERE id = ?', (item_id,))
    row = cursor.fetchone()
    if row and row[0] and os.path.exists(row[0]):
        os.remove(row[0])

    cursor.execute('DELETE FROM project_items WHERE id = ? AND project_id = ?', (item_id, project_id))

    # Update project timestamp
    cursor.execute('UPDATE projects SET updated_at = datetime("now") WHERE id = ?', (project_id,))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return affected > 0


def reorder_project_items(data_dir: str, project_id: str, item_ids: List[str]) -> bool:
    """Reorder project items based on the provided list of IDs."""
    db_path = get_db_path(data_dir)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for i, item_id in enumerate(item_ids):
        cursor.execute(
            'UPDATE project_items SET sort_order = ? WHERE id = ? AND project_id = ?',
            (i, item_id, project_id)
        )

    cursor.execute('UPDATE projects SET updated_at = datetime("now") WHERE id = ?', (project_id,))

    conn.commit()
    conn.close()

    return True
