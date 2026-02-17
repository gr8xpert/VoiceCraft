import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import {
  FolderOpen,
  Plus,
  Play,
  Trash2,
  Edit3,
  ChevronRight,
  FileText,
  Download,
  Loader2,
  X,
  GripVertical,
  CheckCircle,
  Clock,
  ArrowLeft,
} from 'lucide-react';

function ProjectsView() {
  const { backendPort } = useStore();

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const apiUrl = `http://127.0.0.1:${backendPort || 8000}`;

  // Fetch projects
  const fetchProjects = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/projects`);
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch single project with items
  const fetchProject = async (projectId) => {
    try {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}`);
      if (res.ok) {
        setSelectedProject(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [backendPort]);

  // Delete project
  const handleDeleteProject = async (projectId) => {
    if (!confirm('Delete this project and all its items?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProjects(projects.filter((p) => p.id !== projectId));
        if (selectedProject?.id === projectId) {
          setSelectedProject(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  if (selectedProject) {
    return (
      <ProjectDetailView
        apiUrl={apiUrl}
        project={selectedProject}
        onBack={() => {
          setSelectedProject(null);
          fetchProjects();
        }}
        onRefresh={() => fetchProject(selectedProject.id)}
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <FolderOpen className="w-7 h-7 text-[var(--color-accent)]" />
            Projects
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Organize text items into projects for sequential generation
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="w-16 h-16 mx-auto text-[var(--color-text-muted)] mb-4" />
          <h3 className="text-lg font-medium mb-2">No projects yet</h3>
          <p className="text-[var(--color-text-muted)] mb-4">
            Create a project to organize your text-to-speech content
          </p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            Create First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card hover:border-[var(--color-accent)]/50 cursor-pointer transition-colors group"
              onClick={() => fetchProject(project.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-[var(--color-accent)]" />
                    {project.name}
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)] truncate mt-1">
                    {project.description || 'No description'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors" />
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1">
                  <span>{project.completed_count} / {project.item_count} completed</span>
                  <span>
                    {project.item_count > 0
                      ? Math.round((project.completed_count / project.item_count) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-all"
                    style={{
                      width: `${
                        project.item_count > 0
                          ? (project.completed_count / project.item_count) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Meta */}
              <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                <span>{project.item_count} items</span>
                <span>{new Date(project.updated_at).toLocaleDateString()}</span>
              </div>

              {/* Delete button (on hover) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteProject(project.id);
                }}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-[var(--color-bg-tertiary)] opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateProjectModal
          apiUrl={apiUrl}
          onClose={() => setShowCreateModal(false)}
          onCreated={(project) => {
            setProjects([project, ...projects]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Project detail view with items
 */
function ProjectDetailView({ apiUrl, project, onBack, onRefresh }) {
  const [items, setItems] = useState(project.items || []);
  const [newItemText, setNewItemText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState(project.name);

  // Add item
  const handleAddItem = async () => {
    if (!newItemText.trim()) return;

    try {
      const res = await fetch(`${apiUrl}/api/projects/${project.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newItemText.trim() }),
      });

      if (res.ok) {
        const item = await res.json();
        setItems([...items, item]);
        setNewItemText('');
      }
    } catch (error) {
      console.error('Failed to add item:', error);
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId) => {
    try {
      const res = await fetch(`${apiUrl}/api/projects/${project.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItems(items.filter((i) => i.id !== itemId));
      }
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  };

  // Generate all
  const handleGenerateAll = async () => {
    setIsGenerating(true);
    try {
      await fetch(`${apiUrl}/api/projects/${project.id}/generate-all`, {
        method: 'POST',
      });
      onRefresh();
    } catch (error) {
      console.error('Failed to generate:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Export audio
  const handleExport = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/projects/${project.id}/export`, {
        method: 'POST',
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.wav`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  // Update project name
  const handleUpdateName = async () => {
    if (!projectName.trim()) return;
    setEditingName(false);

    try {
      await fetch(`${apiUrl}/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim() }),
      });
    } catch (error) {
      console.error('Failed to update name:', error);
    }
  };

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {editingName ? (
          <input
            type="text"
            className="input text-xl font-semibold flex-1"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleUpdateName}
            onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()}
            autoFocus
          />
        ) : (
          <h1
            className="text-2xl font-semibold flex-1 cursor-pointer hover:text-[var(--color-accent)]"
            onClick={() => setEditingName(true)}
          >
            {projectName}
          </h1>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating || pendingCount === 0}
            className="btn-primary flex items-center gap-2"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Generate All
          </button>
          <button
            onClick={handleExport}
            disabled={completedCount === 0}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--color-text-secondary)]">
            {completedCount} / {items.length} items completed
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">
            {items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0}%
          </span>
        </div>
        <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-accent)] transition-all"
            style={{
              width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-2 mb-6">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`card flex items-center gap-4 ${
              item.status === 'completed' ? 'border-green-500/30' : ''
            }`}
          >
            <GripVertical className="w-4 h-4 text-[var(--color-text-muted)] cursor-grab" />

            <span className="text-sm text-[var(--color-text-muted)] w-6">{index + 1}.</span>

            {item.status === 'completed' ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <Clock className="w-5 h-5 text-[var(--color-text-muted)]" />
            )}

            <p className="flex-1 text-sm truncate">{item.text}</p>

            {item.duration_seconds && (
              <span className="text-xs text-[var(--color-text-muted)]">
                {Math.floor(item.duration_seconds / 60)}:{Math.floor(item.duration_seconds % 60).toString().padStart(2, '0')}
              </span>
            )}

            <button
              onClick={() => handleDeleteItem(item.id)}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add item */}
      <div className="flex gap-2">
        <textarea
          className="input flex-1 resize-none"
          rows={2}
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          placeholder="Add new item text..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAddItem();
            }
          }}
        />
        <button
          onClick={handleAddItem}
          disabled={!newItemText.trim()}
          className="btn-primary px-6"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Create project modal
 */
function CreateProjectModal({ apiUrl, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });

      if (res.ok) {
        onCreated(await res.json());
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">Create Project</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Project Name *
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Podcast Episode 1"
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

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
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

export default ProjectsView;
