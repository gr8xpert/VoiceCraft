import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import {
  Plus,
  Search,
  Mic,
  Play,
  Trash2,
  Edit3,
  X,
  Upload,
  Loader2,
  Volume2,
  SortAsc,
  Clock,
  Hash,
} from 'lucide-react';

/**
 * Voice Library View - Manage voice profiles
 */
function VoiceLibraryView() {
  const { backendPort } = useStore();

  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [playingId, setPlayingId] = useState(null);

  const audioRef = useRef(null);

  const apiUrl = `http://127.0.0.1:${backendPort || 8000}`;

  // Fetch profiles
  const fetchProfiles = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      params.append('sort_by', sortBy);

      const res = await fetch(`${apiUrl}/api/voice-profiles?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProfiles(data);
      }
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [searchQuery, sortBy, backendPort]);

  // Play sample audio
  const handlePlaySample = (profile) => {
    if (playingId === profile.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      const audioPath = profile.sample_audio_path || profile.reference_audio_path;
      if (audioRef.current && audioPath) {
        audioRef.current.src = `${apiUrl}/api/voice-profiles/${profile.id}/audio`;
        audioRef.current.play();
        setPlayingId(profile.id);
      }
    }
  };

  // Delete profile
  const handleDelete = async (profileId) => {
    if (!confirm('Are you sure you want to delete this voice profile?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/voice-profiles/${profileId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProfiles(profiles.filter((p) => p.id !== profileId));
      }
    } catch (error) {
      console.error('Failed to delete profile:', error);
    }
  };

  // Use profile in generation
  const handleUseProfile = (profile) => {
    const store = useStore.getState();
    store.setVoiceMode('clone');
    store.setSelectedReferenceAudio(profile.reference_audio_path);
    // Navigate to generate view would be handled by parent
  };

  return (
    <div className="p-6">
      {/* Hidden audio element for playback */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onError={() => setPlayingId(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <Mic className="w-7 h-7 text-[var(--color-accent)]" />
            Voice Library
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Create and manage voice profiles for quick access
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Voice
        </button>
      </div>

      {/* Search and Sort */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search voices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="select w-40"
          >
            <option value="created_at">Newest</option>
            <option value="name">Name A-Z</option>
            <option value="use_count">Most Used</option>
            <option value="last_used_at">Recently Used</option>
          </select>
        </div>
      </div>

      {/* Profiles Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12">
          <Mic className="w-16 h-16 mx-auto text-[var(--color-text-muted)] mb-4" />
          <h3 className="text-lg font-medium mb-2">No voice profiles yet</h3>
          <p className="text-[var(--color-text-muted)] mb-4">
            Create your first voice profile to get started
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            Create Voice Profile
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((profile) => (
            <VoiceCard
              key={profile.id}
              profile={profile}
              isPlaying={playingId === profile.id}
              onPlay={() => handlePlaySample(profile)}
              onEdit={() => setEditingProfile(profile)}
              onDelete={() => handleDelete(profile.id)}
              onUse={() => handleUseProfile(profile)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateVoiceModal
          apiUrl={apiUrl}
          onClose={() => setShowCreateModal(false)}
          onCreated={(profile) => {
            setProfiles([profile, ...profiles]);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Edit Modal */}
      {editingProfile && (
        <EditVoiceModal
          apiUrl={apiUrl}
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onUpdated={(updated) => {
            setProfiles(profiles.map((p) => (p.id === updated.id ? updated : p)));
            setEditingProfile(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Voice profile card component
 */
function VoiceCard({ profile, isPlaying, onPlay, onEdit, onDelete, onUse }) {
  return (
    <div className="card hover:border-[var(--color-accent)]/50 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{profile.name}</h3>
          <p className="text-sm text-[var(--color-text-muted)] truncate">
            {profile.description || 'No description'}
          </p>
        </div>
        <button
          onClick={onPlay}
          className={`p-2 rounded-full transition-colors ${
            isPlaying
              ? 'bg-[var(--color-accent)] text-white'
              : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-accent)] hover:text-white text-[var(--color-text-secondary)]'
          }`}
        >
          {isPlaying ? (
            <Volume2 className="w-4 h-4 animate-pulse" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Tags */}
      {profile.tags && profile.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {profile.tags.map((tag, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded-full text-[var(--color-text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)] mb-3">
        <span className="flex items-center gap-1">
          <Hash className="w-3 h-3" />
          {profile.use_count} uses
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {profile.last_used_at
            ? new Date(profile.last_used_at).toLocaleDateString()
            : 'Never used'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onUse}
          className="btn-primary text-sm py-1.5 px-3 flex-1"
        >
          Use Voice
        </button>
        <button
          onClick={onEdit}
          className="btn-secondary p-1.5"
          title="Edit"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="btn-secondary p-1.5 hover:bg-[var(--color-error)]/20 hover:text-[var(--color-error)] hover:border-[var(--color-error)]/30"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Create voice profile modal
 */
function CreateVoiceModal({ apiUrl, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !file) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('description', description.trim());
      formData.append('reference_audio', file);
      formData.append('tags', JSON.stringify(tags.split(',').map((t) => t.trim()).filter(Boolean)));

      const res = await fetch(`${apiUrl}/api/voice-profiles`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create profile');
      }

      const profile = await res.json();
      onCreated(profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">Create Voice Profile</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Name *
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Professional Narrator"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Description
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              className="input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., male, deep, professional"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Reference Audio *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Choose Audio File'}
            </button>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              WAV or MP3, 5-30 seconds recommended
            </p>
          </div>

          {error && (
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !file || isSubmitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Edit voice profile modal
 */
function EditVoiceModal({ apiUrl, profile, onClose, onUpdated }) {
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description || '');
  const [tags, setTags] = useState((profile.tags || []).join(', '));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/voice-profiles/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update profile');
      }

      const updated = await res.json();
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">Edit Voice Profile</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Name *
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Description
            </label>
            <textarea
              className="input resize-none"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              className="input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VoiceLibraryView;
