"""
Audio Post-Processing Backend Module
Provides audio manipulation utilities for VoiceCraft desktop app.
"""

import os
import uuid
from typing import Optional, List, Dict, Any


def normalize_loudness(audio_path: str, target_lufs: float = -16.0) -> str:
    """
    Normalize audio to target LUFS using pyloudnorm.
    Returns path to normalized file.
    """
    try:
        import soundfile as sf
        import numpy as np
        import pyloudnorm as pyln

        data, rate = sf.read(audio_path)

        # Ensure mono for loudness measurement
        if len(data.shape) > 1:
            data_mono = np.mean(data, axis=1)
        else:
            data_mono = data

        meter = pyln.Meter(rate)
        loudness = meter.integrated_loudness(data_mono)

        if loudness == float('-inf'):
            # Silent audio, return as-is
            return audio_path

        normalized = pyln.normalize.loudness(data, loudness, target_lufs)

        out_path = _temp_path(audio_path, '_normalized')
        sf.write(out_path, normalized, rate)
        return out_path

    except ImportError:
        # pyloudnorm not available, return original
        return audio_path
    except Exception as e:
        print(f"Loudness normalization failed: {e}")
        return audio_path


def trim_silence(
    audio_path: str,
    threshold_db: float = -40.0,
    min_silence_ms: int = 200
) -> str:
    """
    Remove leading and trailing silence from audio.
    Returns path to trimmed file.
    """
    try:
        from pydub import AudioSegment
        from pydub.silence import detect_leading_silence

        audio = AudioSegment.from_file(audio_path)

        # Detect and trim leading silence
        start_trim = detect_leading_silence(audio, silence_threshold=threshold_db)

        # Detect and trim trailing silence (reverse, detect, reverse)
        end_trim = detect_leading_silence(audio.reverse(), silence_threshold=threshold_db)

        trimmed = audio[start_trim:len(audio) - end_trim]

        out_path = _temp_path(audio_path, '_trimmed')
        trimmed.export(out_path, format='wav')
        return out_path

    except ImportError:
        return audio_path
    except Exception as e:
        print(f"Silence trimming failed: {e}")
        return audio_path


def add_fade(
    audio_path: str,
    fade_in_ms: int = 100,
    fade_out_ms: int = 200
) -> str:
    """
    Add fade in and/or fade out to audio.
    Returns path to faded file.
    """
    try:
        from pydub import AudioSegment

        audio = AudioSegment.from_file(audio_path)

        if fade_in_ms > 0:
            audio = audio.fade_in(fade_in_ms)
        if fade_out_ms > 0:
            audio = audio.fade_out(fade_out_ms)

        out_path = _temp_path(audio_path, '_faded')
        audio.export(out_path, format='wav')
        return out_path

    except ImportError:
        return audio_path
    except Exception as e:
        print(f"Fade application failed: {e}")
        return audio_path


def convert_format(
    audio_path: str,
    target_format: str = 'mp3',
    bitrate: str = '192k',
    sample_rate: int = 44100
) -> str:
    """
    Convert audio to target format.
    Returns path to converted file.
    """
    try:
        from pydub import AudioSegment

        audio = AudioSegment.from_file(audio_path)
        audio = audio.set_frame_rate(sample_rate)

        base = os.path.splitext(audio_path)[0]
        out_path = f"{base}.{target_format}"

        export_params = {}
        if target_format == 'mp3':
            export_params['bitrate'] = bitrate

        audio.export(out_path, format=target_format, **export_params)
        return out_path

    except ImportError:
        return audio_path
    except Exception as e:
        print(f"Format conversion failed: {e}")
        return audio_path


def concatenate_with_gaps(
    audio_paths: List[str],
    gap_ms: int = 500,
    crossfade_ms: int = 0
) -> str:
    """
    Concatenate multiple audio files with silence gaps between them.
    Returns path to concatenated file.
    """
    try:
        from pydub import AudioSegment

        if not audio_paths:
            raise ValueError("No audio files to concatenate")

        silence = AudioSegment.silent(duration=gap_ms)
        combined = AudioSegment.from_file(audio_paths[0])

        for path in audio_paths[1:]:
            segment = AudioSegment.from_file(path)
            if crossfade_ms > 0:
                combined = combined.append(segment, crossfade=crossfade_ms)
            else:
                combined = combined + silence + segment

        out_path = os.path.join(
            os.path.dirname(audio_paths[0]),
            f'concatenated_{uuid.uuid4().hex[:8]}.wav'
        )
        combined.export(out_path, format='wav')
        return out_path

    except ImportError:
        raise Exception("pydub is required for concatenation")
    except Exception as e:
        raise Exception(f"Concatenation failed: {e}")


def get_audio_info(audio_path: str) -> Dict[str, Any]:
    """
    Get audio file metadata.
    """
    try:
        from pydub import AudioSegment

        audio = AudioSegment.from_file(audio_path)

        return {
            'duration_seconds': len(audio) / 1000.0,
            'sample_rate': audio.frame_rate,
            'channels': audio.channels,
            'sample_width': audio.sample_width,
            'file_size_bytes': os.path.getsize(audio_path),
            'format': os.path.splitext(audio_path)[1].lstrip('.'),
        }

    except ImportError:
        return {
            'file_size_bytes': os.path.getsize(audio_path) if os.path.exists(audio_path) else 0,
            'format': os.path.splitext(audio_path)[1].lstrip('.'),
        }
    except Exception as e:
        return {'error': str(e)}


def apply_effects(
    audio_path: str,
    normalize: bool = False,
    target_lufs: float = -16.0,
    trim: bool = False,
    trim_threshold_db: float = -40.0,
    fade_in_ms: int = 0,
    fade_out_ms: int = 0
) -> str:
    """
    Apply multiple effects to audio in sequence.
    Returns path to processed file.
    """
    current_path = audio_path

    if normalize:
        current_path = normalize_loudness(current_path, target_lufs)

    if trim:
        current_path = trim_silence(current_path, trim_threshold_db)

    if fade_in_ms > 0 or fade_out_ms > 0:
        current_path = add_fade(current_path, fade_in_ms, fade_out_ms)

    return current_path


def _temp_path(original_path: str, suffix: str) -> str:
    """Generate a temporary file path with a suffix."""
    base, ext = os.path.splitext(original_path)
    return f"{base}{suffix}{ext}"
