"""
SRT Export Backend Module
Generates SRT subtitle files from text and duration data.
"""

from typing import List, Dict, Any


def format_srt_time(seconds: float) -> str:
    """
    Convert seconds to SRT time format: HH:MM:SS,mmm
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def generate_srt(items: List[Dict[str, Any]], gap_ms: int = 0) -> str:
    """
    Generate SRT subtitle content from a list of items.

    Each item should have:
        - 'text': The text content
        - 'duration_seconds': Duration of the audio

    Args:
        items: List of items with text and duration
        gap_ms: Silence gap between items in milliseconds

    Returns:
        SRT formatted string
    """
    srt_lines = []
    current_time = 0.0
    gap_seconds = gap_ms / 1000.0

    for i, item in enumerate(items, 1):
        text = item.get('text', '')
        duration = item.get('duration_seconds', 0)

        if not text or duration <= 0:
            continue

        start = format_srt_time(current_time)
        end = format_srt_time(current_time + duration)

        srt_lines.append(str(i))
        srt_lines.append(f"{start} --> {end}")
        srt_lines.append(text)
        srt_lines.append("")  # Empty line between entries

        current_time += duration + gap_seconds

    return "\n".join(srt_lines)


def generate_srt_from_project(project: Dict[str, Any]) -> str:
    """
    Generate SRT from a project's completed items.

    Args:
        project: Project dict with 'items' list and 'silence_gap_ms'

    Returns:
        SRT formatted string
    """
    items = project.get('items', [])
    gap_ms = project.get('silence_gap_ms', 500)

    # Filter to only completed items with audio
    completed_items = [
        item for item in items
        if item.get('status') == 'completed' and item.get('duration_seconds')
    ]

    # Sort by sort_order
    completed_items.sort(key=lambda x: x.get('sort_order', 0))

    return generate_srt(completed_items, gap_ms)


def save_srt(content: str, output_path: str) -> str:
    """
    Save SRT content to a file.

    Args:
        content: SRT formatted string
        output_path: Path to save the file

    Returns:
        Path to saved file
    """
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)
    return output_path
