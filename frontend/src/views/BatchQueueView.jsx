import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import {
  ListOrdered,
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  Upload,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  GripVertical,
  FileText,
  Table,
  Archive,
  X,
} from 'lucide-react';

function BatchQueueView() {
  const { backendPort, predefinedVoices } = useStore();

  const [queue, setQueue] = useState({ items: [], is_running: false, is_paused: false });
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const apiUrl = `http://127.0.0.1:${backendPort || 8000}`;
  const pollIntervalRef = useRef(null);

  // Fetch queue status
  const fetchQueue = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/queue`);
      if (res.ok) {
        setQueue(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll when queue is running
  useEffect(() => {
    fetchQueue();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [backendPort]);

  useEffect(() => {
    if (queue.is_running) {
      pollIntervalRef.current = setInterval(fetchQueue, 2000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [queue.is_running]);

  // Start queue processing
  const handleStart = async () => {
    try {
      await fetch(`${apiUrl}/api/queue/start`, { method: 'POST' });
      fetchQueue();
    } catch (error) {
      console.error('Failed to start queue:', error);
    }
  };

  // Pause queue
  const handlePause = async () => {
    try {
      await fetch(`${apiUrl}/api/queue/pause`, { method: 'POST' });
      fetchQueue();
    } catch (error) {
      console.error('Failed to pause queue:', error);
    }
  };

  // Cancel queue
  const handleCancel = async () => {
    if (!confirm('Cancel all pending items in the queue?')) return;
    try {
      await fetch(`${apiUrl}/api/queue/cancel`, { method: 'POST' });
      fetchQueue();
    } catch (error) {
      console.error('Failed to cancel queue:', error);
    }
  };

  // Remove item
  const handleRemoveItem = async (itemId) => {
    try {
      await fetch(`${apiUrl}/api/queue/${itemId}`, { method: 'DELETE' });
      fetchQueue();
    } catch (error) {
      console.error('Failed to remove item:', error);
    }
  };

  // Clear completed
  const handleClearCompleted = async () => {
    try {
      await fetch(`${apiUrl}/api/queue/clear-completed`, { method: 'POST' });
      fetchQueue();
    } catch (error) {
      console.error('Failed to clear completed:', error);
    }
  };

  // Export ZIP
  const handleExportZip = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/queue/export-zip`, { method: 'POST' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_export_${Date.now()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  // Get status icon and color
  const getStatusDisplay = (status) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/20' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/20' };
      case 'processing':
        return { icon: Loader2, color: 'text-yellow-500', bg: 'bg-yellow-500/20', spin: true };
      case 'cancelled':
        return { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/20' };
      default:
        return { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/20' };
    }
  };

  // Calculate progress
  const completedCount = queue.items?.filter((i) => i.status === 'completed').length || 0;
  const totalCount = queue.items?.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <ListOrdered className="w-7 h-7 text-[var(--color-accent)]" />
            Batch Queue
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Process multiple text items in sequence
          </p>
        </div>

        <div className="flex items-center gap-2">
          {queue.is_running ? (
            <>
              <button
                onClick={queue.is_paused ? handleStart : handlePause}
                className="btn-secondary flex items-center gap-2"
              >
                {queue.is_paused ? (
                  <>
                    <Play className="w-4 h-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                )}
              </button>
              <button
                onClick={handleCancel}
                className="btn-secondary flex items-center gap-2 hover:border-red-500/50 hover:text-red-500"
              >
                <Square className="w-4 h-4" />
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleStart}
              disabled={totalCount === 0 || completedCount === totalCount}
              className="btn-primary flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start Queue
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--color-text-secondary)]">
              Progress: {completedCount} / {totalCount} completed
            </span>
            <span className="text-sm text-[var(--color-text-muted)]">
              {progressPercent.toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Import
        </button>

        <div className="flex-1" />

        {completedCount > 0 && (
          <>
            <button
              onClick={handleExportZip}
              className="btn-secondary flex items-center gap-2"
            >
              <Archive className="w-4 h-4" />
              Export ZIP
            </button>
            <button
              onClick={handleClearCompleted}
              className="btn-secondary flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear Completed
            </button>
          </>
        )}
      </div>

      {/* Queue Items */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-12">
          <ListOrdered className="w-16 h-16 mx-auto text-[var(--color-text-muted)] mb-4" />
          <h3 className="text-lg font-medium mb-2">Queue is empty</h3>
          <p className="text-[var(--color-text-muted)] mb-4">
            Add items to start batch processing
          </p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            Add First Item
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.items.map((item, index) => {
            const statusDisplay = getStatusDisplay(item.status);
            const StatusIcon = statusDisplay.icon;

            return (
              <div
                key={item.id}
                className={`card flex items-center gap-4 ${
                  item.status === 'processing' ? 'border-yellow-500/50' : ''
                }`}
              >
                {/* Order number */}
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span className="text-sm text-[var(--color-text-muted)] w-6">
                    {index + 1}.
                  </span>
                </div>

                {/* Status icon */}
                <div className={`p-2 rounded-full ${statusDisplay.bg}`}>
                  <StatusIcon
                    className={`w-4 h-4 ${statusDisplay.color} ${
                      statusDisplay.spin ? 'animate-spin' : ''
                    }`}
                  />
                </div>

                {/* Text preview */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{item.text}</p>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {item.voice_name || 'Default voice'}
                  </span>
                </div>

                {/* Duration (if completed) */}
                {item.duration_seconds && (
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {Math.floor(item.duration_seconds / 60)}:
                    {Math.floor(item.duration_seconds % 60)
                      .toString()
                      .padStart(2, '0')}
                  </span>
                )}

                {/* Error message */}
                {item.error && (
                  <span className="text-xs text-red-500 max-w-[200px] truncate">
                    {item.error}
                  </span>
                )}

                {/* Remove button */}
                {item.status !== 'processing' && (
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <AddItemModal
          apiUrl={apiUrl}
          voices={predefinedVoices}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            fetchQueue();
          }}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          apiUrl={apiUrl}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            fetchQueue();
          }}
        />
      )}
    </div>
  );
}

/**
 * Add single item modal
 */
function AddItemModal({ apiUrl, voices, onClose, onAdded }) {
  const [text, setText] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_mode: 'predefined',
          voice_name: voiceName || voices[0]?.filename || '',
        }),
      });

      if (res.ok) {
        onAdded();
      }
    } catch (error) {
      console.error('Failed to add item:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">Add to Queue</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Text *</label>
            <textarea
              className="input resize-none"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text to generate..."
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Voice</label>
            <select
              className="select"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
            >
              {voices.map((v) => (
                <option key={v.filename} value={v.filename}>
                  {v.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Import modal for TXT/CSV
 */
function ImportModal({ apiUrl, onClose, onImported }) {
  const [importType, setImportType] = useState('txt');
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const endpoint = importType === 'txt' ? '/api/queue/import-txt' : '/api/queue/import-csv';
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        onImported();
      }
    } catch (error) {
      console.error('Failed to import:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">Import Items</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setImportType('txt')}
              className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                importType === 'txt'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
              }`}
            >
              <FileText className="w-4 h-4" />
              TXT (one per line)
            </button>
            <button
              type="button"
              onClick={() => setImportType('csv')}
              className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                importType === 'csv'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
              }`}
            >
              <Table className="w-4 h-4" />
              CSV
            </button>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={importType === 'txt' ? '.txt' : '.csv'}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Choose File'}
            </button>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              {importType === 'txt'
                ? 'One text item per line. Empty lines are skipped.'
                : 'CSV with columns: text, voice_name, exaggeration, cfg_weight, temperature'}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isSubmitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BatchQueueView;
