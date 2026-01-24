import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, FolderOpen, Trash2, Clock, ArrowRight } from 'lucide-react';
import { projectsApi, Project } from '../lib/api';

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    createMutation.mutate({
      name: newProjectName.trim(),
      description: newProjectDescription.trim(),
    });
  };

  const openCreateModal = () => {
    const projectCount = projects?.length ?? 0;
    const defaultName = projectCount === 0
      ? 'My Project'
      : `My Project ${projectCount + 1}`;
    setNewProjectName(defaultName);
    setNewProjectDescription('');
    setShowCreateModal(true);
  };

  const handleDelete = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Delete project "${project.name}"?`)) {
      deleteMutation.mutate(project.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPipelineSummary = (project: Project) => {
    const summary = project.pipeline_summary;
    const keys = Object.keys(summary);
    if (keys.length === 0) return null;

    const counts: number[] = [];
    if (summary.sources?.outputs?.merged) {
      counts.push(summary.sources.outputs.merged);
    }
    keys.forEach(key => {
      if (key !== 'sources' && summary[key]?.outputs?.passed) {
        counts.push(summary[key].outputs.passed);
      }
    });

    if (counts.length === 0) return null;
    return counts.join(' → ');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Projects</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1">
            Manage your screening projects
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          Loading...
        </div>
      ) : projects?.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="w-12 h-12 mx-auto text-[hsl(var(--muted-foreground))] mb-4" />
          <p className="text-[hsl(var(--muted-foreground))]">No projects yet</p>
          <button
            onClick={openCreateModal}
            className="mt-4 text-[hsl(var(--primary))] hover:underline"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects?.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block p-4 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg hover:border-[hsl(var(--ring))] transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-medium text-[hsl(var(--card-foreground))] truncate">
                    {project.name}
                  </h2>
                  {project.description && (
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(project.updated_at)}
                    </span>
                    {getPipelineSummary(project) && (
                      <span className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" />
                        {getPipelineSummary(project)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, project)}
                  className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))] mb-4">
              Create New Project
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My Project"
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Brief description of your project"
                  rows={3}
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newProjectName.trim() || createMutation.isPending}
                className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
