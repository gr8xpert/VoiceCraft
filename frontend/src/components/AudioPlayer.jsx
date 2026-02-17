import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
  Play,
  Pause,
  Square,
  Download,
  Volume2,
  VolumeX,
  SkipBack,
  ChevronDown,
} from 'lucide-react';

/**
 * Audio player with waveform visualization using wavesurfer.js
 */
function AudioPlayer({
  audioUrl,
  onDownload,
  downloadFormats = ['wav', 'mp3', 'opus'],
  defaultFormat = 'wav',
}) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    // Cleanup previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#606070',
      progressColor: '#8b5cf6',
      cursorColor: '#8b5cf6',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 60,
      normalize: true,
      backend: 'WebAudio',
    });

    wavesurfer.load(audioUrl);

    wavesurfer.on('ready', () => {
      setIsReady(true);
      setDuration(wavesurfer.getDuration());
      wavesurfer.setVolume(volume);
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => setIsPlaying(false));

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('seeking', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  // Update volume
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted, isReady]);

  // Update playback rate
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate, isReady]);

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const stop = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.stop();
      setCurrentTime(0);
    }
  };

  const skipToStart = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.seekTo(0);
      setCurrentTime(0);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = (format) => {
    setShowDownloadMenu(false);
    if (onDownload) {
      onDownload(format);
    } else {
      // Default download behavior
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `voicecraft_${Date.now()}.${format}`;
      a.click();
    }
  };

  return (
    <div className="card">
      {/* Waveform */}
      <div
        ref={containerRef}
        className="mb-4 rounded-lg overflow-hidden bg-[var(--color-bg-tertiary)]"
        style={{ minHeight: '60px' }}
      />

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={skipToStart}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Skip to start"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className="p-3 rounded-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors"
            disabled={!isReady}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <button
            onClick={stop}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Stop"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>

        {/* Time display */}
        <div className="text-sm text-[var(--color-text-muted)] font-mono min-w-[100px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              setIsMuted(false);
            }}
            className="w-20"
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Speed selector */}
        <div className="relative">
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-sm transition-colors"
          >
            {playbackRate}x
            <ChevronDown className="w-4 h-4" />
          </button>

          {showSpeedMenu && (
            <div className="absolute bottom-full mb-2 right-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 min-w-[80px] z-10">
              {speedOptions.map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    setPlaybackRate(speed);
                    setShowSpeedMenu(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-tertiary)] ${
                    playbackRate === speed
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Download button */}
        <div className="relative">
          <button
            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
            <ChevronDown className="w-4 h-4" />
          </button>

          {showDownloadMenu && (
            <div className="absolute bottom-full mb-2 right-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 min-w-[100px] z-10">
              {downloadFormats.map((format) => (
                <button
                  key={format}
                  onClick={() => handleDownload(format)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] uppercase"
                >
                  {format}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AudioPlayer;
