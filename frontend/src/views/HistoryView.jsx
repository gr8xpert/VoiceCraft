import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import AudioPlayer from '../components/AudioPlayer';
import {
  History,
  Search,
  Star,
  Trash2,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Clock,
  Volume2,
  Filter,
  RefreshCw,
  Loader2,
  X,
} from 'lucide-react';

function HistoryView() {
  const { backendPort } = useStore();

  const [generations, setGenerations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVoice, setFilterVoice] = useState('');
  const [filterEngine, setFilterEngine] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);

  const audioRef = useRef(null);
  const apiUrl = `http://127.0.0.1:${backendPort || 8000}`;

  // Fetch generations
  const fetchGenerations = async (reset = false) => {
    try {
      const params = new URLSearchParams();
      params.append('page', reset ? '1' : page.toString());
      params.append('limit', '20');
      if (searchQuery) params.append('search', searchQuery);
      if (filterVoice) params.append('voice', filterVoice);
      if (filterEngine) params.append('engine', filterEngine);
      if (favoritesOnly) params.append('favorites_only', 'true');

      const res = await fetch(`${apiUrl}/api/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (reset) {
          setGenerations(data.items);
          setPage(1);
        } else {
          setGenerations((prev) => [...prev, ...data.items]);
        }
        setHasMore(data.has_more);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/history/stats`);
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    fetchGenerations(true);
    fetchStats();
  }, [searchQuery, filterVoice, filterEngine, favoritesOnly, backendPort]);

  // Play audio
  const handlePlay = (gen) => {
    if (playingId === gen.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = `${apiUrl}/api/history/${gen.id}/audio`;
        audioRef.current.play();
        setPlayingId(gen.id);
      }
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (genId) => {
    try {
      const res = await fetch(`${apiUrl}/api/history/${genId}/favorite`, {
        method: 'PUT',
      });
      if (res.ok) {
        const data = await res.json();
        setGenerations((prev) =>
          prev.map((g) =>
            g.id === genId ? { ...g, is_favorite: data.is_favorite } : g
          )
        );
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  // Delete generation
  const handleDelete = async (genId) => {
    if (!confirm('Delete this generation?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/history/${genId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGenerations((prev) => prev.filter((g) => g.id !== genId));
        setTotal((t) => t - 1);
      }
    } catch (error) {
      console.error('Failed to delete generation:', error);
    }
  };

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format relative time
  const formatRelativeTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Get engine badge color
  const getEngineBadgeColor = (engine) => {
    if (!engine) return 'bg-gray-500/20 text-gray-400';
    const e = engine.toLowerCase();
    if (e.includes('turbo')) return 'bg-green-500/20 text-green-400';
    if (e.includes('multilingual')) return 'bg-blue-500/20 text-blue-400';
    return 'bg-purple-500/20 text-purple-400';
  };

  return (
    <div className="p-6">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onError={() => setPlayingId(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <History className="w-7 h-7 text-[var(--color-accent)]" />
            Generation History
          </h1>
          {stats && (
            <p className="text-[var(--color-text-muted)] mt-1">
              {stats.total} generations, {formatDuration(stats.total_duration)} total,{' '}
              {stats.favorites} favorites
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setIsLoading(true);
            fetchGenerations(true);
            fetchStats();
          }}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>

        <select
          value={filterEngine}
          onChange={(e) => setFilterEngine(e.target.value)}
          className="select w-40"
        >
          <option value="">All Engines</option>
          <option value="original">Original</option>
          <option value="multilingual">Multilingual</option>
          <option value="turbo">Turbo</option>
        </select>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)]"
          />
          <Star className="w-4 h-4 text-yellow-500" />
          <span className="text-sm">Favorites only</span>
        </label>
      </div>

      {/* Generation List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
        </div>
      ) : generations.length === 0 ? (
        <div className="text-center py-12">
          <History className="w-16 h-16 mx-auto text-[var(--color-text-muted)] mb-4" />
          <h3 className="text-lg font-medium mb-2">No generations yet</h3>
          <p className="text-[var(--color-text-muted)]">
            Your generated audio will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {generations.map((gen) => (
            <div
              key={gen.id}
              className="card hover:border-[var(--color-accent)]/30 transition-colors"
            >
              {/* Row */}
              <div className="flex items-center gap-4">
                {/* Play button */}
                <button
                  onClick={() => handlePlay(gen)}
                  className={`p-2.5 rounded-full transition-colors ${
                    playingId === gen.id
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-accent)] hover:text-white text-[var(--color-text-secondary)]'
                  }`}
                >
                  {playingId === gen.id ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </button>

                {/* Text preview */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{gen.text_preview}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {gen.voice_name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getEngineBadgeColor(
                        gen.engine
                      )}`}
                    >
                      {gen.engine || 'unknown'}
                    </span>
                  </div>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
                  <Clock className="w-4 h-4" />
                  {formatDuration(gen.duration_seconds || 0)}
                </div>

                {/* Time ago */}
                <span className="text-sm text-[var(--color-text-muted)] w-20 text-right">
                  {formatRelativeTime(gen.created_at)}
                </span>

                {/* Favorite button */}
                <button
                  onClick={() => handleToggleFavorite(gen.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    gen.is_favorite
                      ? 'text-yellow-500'
                      : 'text-[var(--color-text-muted)] hover:text-yellow-500'
                  }`}
                >
                  <Star
                    className={`w-4 h-4 ${gen.is_favorite ? 'fill-current' : ''}`}
                  />
                </button>

                {/* Expand/Collapse */}
                <button
                  onClick={() =>
                    setExpandedId(expandedId === gen.id ? null : gen.id)
                  }
                  className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {expandedId === gen.id ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(gen.id)}
                  className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Expanded content */}
              {expandedId === gen.id && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                  {/* Full text */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      Full Text
                    </h4>
                    <p className="text-sm bg-[var(--color-bg-tertiary)] rounded-lg p-3 whitespace-pre-wrap">
                      {gen.text}
                    </p>
                  </div>

                  {/* Settings */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      Generation Settings
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {gen.settings?.exaggeration !== undefined && (
                        <div>
                          <span className="text-[var(--color-text-muted)]">Exaggeration:</span>{' '}
                          {gen.settings.exaggeration}
                        </div>
                      )}
                      {gen.settings?.cfg_weight !== undefined && (
                        <div>
                          <span className="text-[var(--color-text-muted)]">CFG:</span>{' '}
                          {gen.settings.cfg_weight}
                        </div>
                      )}
                      {gen.settings?.temperature !== undefined && (
                        <div>
                          <span className="text-[var(--color-text-muted)]">Temperature:</span>{' '}
                          {gen.settings.temperature}
                        </div>
                      )}
                      {gen.settings?.speed_factor !== undefined && (
                        <div>
                          <span className="text-[var(--color-text-muted)]">Speed:</span>{' '}
                          {gen.settings.speed_factor}x
                        </div>
                      )}
                      {gen.settings?.seed !== undefined && (
                        <div>
                          <span className="text-[var(--color-text-muted)]">Seed:</span>{' '}
                          {gen.settings.seed}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Audio Player */}
                  <AudioPlayer audioUrl={`${apiUrl}/api/history/${gen.id}/audio`} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setPage((p) => p + 1);
              fetchGenerations();
            }}
            className="btn-secondary"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

export default HistoryView;
