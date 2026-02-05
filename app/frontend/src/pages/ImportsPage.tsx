import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Database, Clock, X, ChevronRight, Lock, Copy } from 'lucide-react';
import { importsApi, ImportSummary } from '../lib/api';

export function ImportsPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('My Import');
  const [newDescription, setNewDescription] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ImportSummary | null>(null);

  const { data: imports, isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: importsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: importsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: importsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: importsApi.duplicate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({
      name: newName.trim(),
      description: newDescription.trim(),
    });
  };

  const openCreateModal = () => {
    const count = imports?.length ?? 0;
    setNewName(count === 0 ? 'My Import' : `My Import ${count + 1}`);
    setNewDescription('');
    setShowCreateModal(true);
  };

  const handleDelete = (e: React.MouseEvent, imp: ImportSummary) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingDelete(imp);
  };

  const handleDuplicate = (e: React.MouseEvent, imp: ImportSummary) => {
    e.preventDefault();
    e.stopPropagation();
    duplicateMutation.mutate(imp.id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Imports</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1">
            Manage search result collections. Each import groups BibTeX files from database searches.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Import
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          Loading...
        </div>
      ) : imports?.length === 0 ? (
        <div className="text-center py-12">
          <Database className="w-12 h-12 mx-auto text-[hsl(var(--muted-foreground))] mb-4" />
          <p className="text-[hsl(var(--muted-foreground))]">No imports yet</p>
          <button
            onClick={openCreateModal}
            className="mt-4 text-[hsl(var(--primary))] hover:underline"
          >
            Create your first import
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {imports?.map((imp) => (
            <Link
              key={imp.id}
              to={`/imports/${imp.id}`}
              className="relative block p-4 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg hover:border-[hsl(var(--ring))] transition-colors group"
            >
              {/* Action buttons */}
              <div className="absolute -top-3 -right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleDuplicate(e, imp)}
                  disabled={duplicateMutation.isPending}
                  className="p-2 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] shadow-sm hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]"
                  title="Duplicate"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {!imp.is_locked && (
                  <button
                    onClick={(e) => handleDelete(e, imp)}
                    className="p-2 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] shadow-sm hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]"
                    title="Delete"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium text-[hsl(var(--card-foreground))] truncate">
                      {imp.name}
                    </h2>
                    {imp.is_locked && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] border border-[hsl(var(--status-warning-border))]">
                        <Lock className="w-3 h-3" />
                        In use
                      </span>
                    )}
                  </div>
                  {imp.description && (
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">
                      {imp.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(imp.updated_at)}
                    </span>
                    <span>
                      {imp.file_count} {imp.file_count === 1 ? 'file' : 'files'}
                    </span>
                    <span>{imp.total_entry_count} entries</span>
                    {imp.databases.length > 0 && (
                      <span>{imp.databases.join(', ')}</span>
                    )}
                    {imp.referencing_project_count > 0 && (
                      <span>
                        {imp.referencing_project_count} {imp.referencing_project_count === 1 ? 'project' : 'projects'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors"
                title="View details"
              >
                <ChevronRight className="w-4 h-4" />
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
              Create New Import
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Import"
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brief description of this import collection"
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
                disabled={!newName.trim() || createMutation.isPending}
                className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">
                Delete import
              </h2>
              <button
                onClick={() => setPendingDelete(null)}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Delete "{pendingDelete.name}"? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPendingDelete(null)}
                  className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    deleteMutation.mutate(pendingDelete.id);
                    setPendingDelete(null);
                  }}
                  className="px-3 py-2 text-sm bg-[hsl(var(--status-danger-solid))] text-[hsl(var(--status-danger-solid-foreground))] rounded-md hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
