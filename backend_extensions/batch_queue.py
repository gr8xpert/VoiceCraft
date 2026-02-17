"""
Batch Queue Backend Module
Manages batch processing queue for VoiceCraft desktop app.
This is an in-memory queue (not persisted) for batch TTS generation.
"""

import asyncio
import uuid
import os
import zipfile
import io
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Callable
from datetime import datetime
from enum import Enum


class QueueItemStatus(str, Enum):
    PENDING = 'pending'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


@dataclass
class QueueItem:
    """Represents a single item in the batch queue."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    text: str = ''
    voice_mode: str = 'predefined'
    voice_name: str = ''
    voice_profile_id: Optional[str] = None
    reference_audio: Optional[str] = None
    engine: str = 'turbo'
    settings: Dict[str, Any] = field(default_factory=dict)
    status: QueueItemStatus = QueueItemStatus.PENDING
    audio_path: Optional[str] = None
    duration_seconds: Optional[float] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'text': self.text,
            'voice_mode': self.voice_mode,
            'voice_name': self.voice_name,
            'voice_profile_id': self.voice_profile_id,
            'reference_audio': self.reference_audio,
            'engine': self.engine,
            'settings': self.settings,
            'status': self.status.value,
            'audio_path': self.audio_path,
            'duration_seconds': self.duration_seconds,
            'error': self.error,
            'created_at': self.created_at,
            'completed_at': self.completed_at,
        }


class BatchQueue:
    """
    Manages a queue of TTS generation items for batch processing.
    This class is designed to be used as a singleton.
    """

    def __init__(self):
        self.items: List[QueueItem] = []
        self.is_running = False
        self.is_paused = False
        self.current_index = 0
        self._cancel_requested = False
        self._lock = asyncio.Lock()

    def add_item(self, item: QueueItem) -> QueueItem:
        """Add a single item to the queue."""
        self.items.append(item)
        return item

    def add_item_from_dict(self, data: Dict[str, Any]) -> QueueItem:
        """Create and add an item from a dictionary."""
        item = QueueItem(
            text=data.get('text', ''),
            voice_mode=data.get('voice_mode', 'predefined'),
            voice_name=data.get('voice_name', ''),
            voice_profile_id=data.get('voice_profile_id'),
            reference_audio=data.get('reference_audio'),
            engine=data.get('engine', 'turbo'),
            settings=data.get('settings', {}),
        )
        return self.add_item(item)

    def add_items_from_text(
        self,
        text_content: str,
        default_voice: str = '',
        default_settings: Optional[Dict] = None
    ) -> List[QueueItem]:
        """
        Parse a text file content (one line per item) and add to queue.
        Empty lines are skipped.
        """
        items = []
        for line in text_content.strip().split('\n'):
            line = line.strip()
            if line:
                item = QueueItem(
                    text=line,
                    voice_mode='predefined',
                    voice_name=default_voice,
                    settings=default_settings or {},
                )
                self.items.append(item)
                items.append(item)
        return items

    def add_items_from_csv(self, csv_content: str) -> List[QueueItem]:
        """
        Parse CSV content with columns: text, voice_name, exaggeration, cfg_weight, temperature
        First row is treated as header if it contains 'text'.
        """
        import csv
        from io import StringIO

        items = []
        reader = csv.DictReader(StringIO(csv_content))

        for row in reader:
            settings = {}
            if 'exaggeration' in row and row['exaggeration']:
                settings['exaggeration'] = float(row['exaggeration'])
            if 'cfg_weight' in row and row['cfg_weight']:
                settings['cfg_weight'] = float(row['cfg_weight'])
            if 'temperature' in row and row['temperature']:
                settings['temperature'] = float(row['temperature'])
            if 'speed_factor' in row and row['speed_factor']:
                settings['speed_factor'] = float(row['speed_factor'])

            item = QueueItem(
                text=row.get('text', ''),
                voice_mode='predefined',
                voice_name=row.get('voice_name', row.get('voice', '')),
                settings=settings,
            )
            if item.text:
                self.items.append(item)
                items.append(item)

        return items

    def remove_item(self, item_id: str) -> bool:
        """Remove an item from the queue by ID."""
        for i, item in enumerate(self.items):
            if item.id == item_id:
                # Don't allow removing currently processing item
                if item.status != QueueItemStatus.PROCESSING:
                    self.items.pop(i)
                    return True
        return False

    def reorder(self, item_ids: List[str]) -> bool:
        """
        Reorder items based on the provided list of IDs.
        Only pending items can be reordered.
        """
        # Get pending items
        pending = [item for item in self.items if item.status == QueueItemStatus.PENDING]
        others = [item for item in self.items if item.status != QueueItemStatus.PENDING]

        # Create new order for pending items
        pending_by_id = {item.id: item for item in pending}
        new_pending = []

        for item_id in item_ids:
            if item_id in pending_by_id:
                new_pending.append(pending_by_id.pop(item_id))

        # Add any remaining pending items not in the list
        new_pending.extend(pending_by_id.values())

        # Reconstruct the queue: processing/completed first, then reordered pending
        self.items = others + new_pending
        return True

    async def start(self, generate_fn: Callable) -> None:
        """
        Start processing the queue.
        generate_fn should be an async function that takes a QueueItem and returns (audio_path, duration).
        """
        if self.is_running:
            return

        async with self._lock:
            self.is_running = True
            self.is_paused = False
            self._cancel_requested = False

        try:
            for item in self.items:
                if self._cancel_requested:
                    break

                if item.status != QueueItemStatus.PENDING:
                    continue

                while self.is_paused and not self._cancel_requested:
                    await asyncio.sleep(0.5)

                if self._cancel_requested:
                    break

                item.status = QueueItemStatus.PROCESSING
                self.current_index = self.items.index(item)

                try:
                    audio_path, duration = await generate_fn(item)
                    item.audio_path = audio_path
                    item.duration_seconds = duration
                    item.status = QueueItemStatus.COMPLETED
                    item.completed_at = datetime.utcnow().isoformat()
                except Exception as e:
                    item.status = QueueItemStatus.FAILED
                    item.error = str(e)

        finally:
            async with self._lock:
                self.is_running = False

    def pause(self) -> None:
        """Pause processing after the current item completes."""
        self.is_paused = True

    def resume(self) -> None:
        """Resume paused processing."""
        self.is_paused = False

    def cancel(self) -> None:
        """Cancel remaining items in the queue."""
        self._cancel_requested = True
        self.is_paused = False

        for item in self.items:
            if item.status == QueueItemStatus.PENDING:
                item.status = QueueItemStatus.CANCELLED

    def clear(self) -> None:
        """Clear all items from the queue."""
        self.items = []
        self.current_index = 0
        self.is_running = False
        self.is_paused = False
        self._cancel_requested = False

    def clear_completed(self) -> int:
        """Remove completed and failed items. Returns count removed."""
        before = len(self.items)
        self.items = [
            item for item in self.items
            if item.status in (QueueItemStatus.PENDING, QueueItemStatus.PROCESSING)
        ]
        return before - len(self.items)

    def get_status(self) -> Dict[str, Any]:
        """Get current queue status."""
        total = len(self.items)
        completed = sum(1 for item in self.items if item.status == QueueItemStatus.COMPLETED)
        failed = sum(1 for item in self.items if item.status == QueueItemStatus.FAILED)
        pending = sum(1 for item in self.items if item.status == QueueItemStatus.PENDING)
        processing = sum(1 for item in self.items if item.status == QueueItemStatus.PROCESSING)

        return {
            'is_running': self.is_running,
            'is_paused': self.is_paused,
            'current_index': self.current_index,
            'total': total,
            'completed': completed,
            'failed': failed,
            'pending': pending,
            'processing': processing,
            'items': [item.to_dict() for item in self.items],
        }

    def get_progress(self) -> Dict[str, Any]:
        """Get progress info for status display."""
        total = len(self.items)
        completed = sum(1 for item in self.items if item.status == QueueItemStatus.COMPLETED)

        # Calculate estimated remaining time based on completed items
        completed_items = [item for item in self.items if item.status == QueueItemStatus.COMPLETED]
        if completed_items:
            avg_duration = sum(item.duration_seconds or 0 for item in completed_items) / len(completed_items)
            remaining_items = total - completed
            eta_seconds = avg_duration * remaining_items * 2  # Rough estimate (generation takes ~2x duration)
        else:
            eta_seconds = None

        return {
            'current': completed,
            'total': total,
            'percentage': (completed / total * 100) if total > 0 else 0,
            'eta_seconds': eta_seconds,
        }

    def export_zip(self, output_path: str) -> str:
        """Export all completed audio files as a numbered ZIP archive."""
        completed = [item for item in self.items if item.status == QueueItemStatus.COMPLETED and item.audio_path]

        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for i, item in enumerate(completed, 1):
                if item.audio_path and os.path.exists(item.audio_path):
                    ext = os.path.splitext(item.audio_path)[1]
                    # Create filename from first 30 chars of text
                    text_part = ''.join(c for c in item.text[:30] if c.isalnum() or c in ' -_')
                    filename = f"{i:03d}_{text_part}{ext}"
                    zf.write(item.audio_path, filename)

        return output_path


# Global singleton instance
_queue_instance: Optional[BatchQueue] = None


def get_queue() -> BatchQueue:
    """Get the global batch queue instance."""
    global _queue_instance
    if _queue_instance is None:
        _queue_instance = BatchQueue()
    return _queue_instance
