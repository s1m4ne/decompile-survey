import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Settings,
  ChevronRight,
  Database,
  Loader2,
  X,
  Link2,
  Unlink,
  Copy,
  Check,
} from 'lucide-react';
import { StepStatusBadge, StepStatusIcon } from '../components/StepStatus';
import {
  projectsApi,
  pipelineApi,
  stepsApi,
  stepTypesApi,
  sourcesApi,
  projectImportSourcesApi,
  importsApi,
  StepMeta,
  PipelineStep,
  StepTypeInfo,
  SourcesMeta,
  ImportSourceSummary,
  ImportSummary,
} from '../lib/api';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [showAddStepModal, setShowAddStepModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  const { data: pipeline } = useQuery({
    queryKey: ['pipeline', projectId],
    queryFn: () => pipelineApi.get(projectId!),
    enabled: !!projectId,
  });

  const { data: steps } = useQuery({
    queryKey: ['steps', projectId],
    queryFn: () => stepsApi.list(projectId!),
    enabled: !!projectId,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: sources } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => sourcesApi.get(projectId!),
    enabled: !!projectId,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: stepTypes } = useQuery({
    queryKey: ['step-types'],
    queryFn: stepTypesApi.list,
  });

  const { data: importSources } = useQuery({
    queryKey: ['project-import-sources', projectId],
    queryFn: () => projectImportSourcesApi.get(projectId!),
    enabled: !!projectId,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });


  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--muted-foreground))]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-[hsl(var(--muted-foreground))]">Project not found</p>
        <Link to="/" className="text-[hsl(var(--primary))] hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to projects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-[hsl(var(--muted-foreground))] mt-1">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowDuplicateModal(true)}
              className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors"
              title="Duplicate project"
            >
              <Copy className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors"
              title="Project settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="space-y-4">
        {/* Sources */}
        <SourcesCard
          projectId={projectId!}
          sources={sources}
          importSources={importSources}
          hasSteps={!!steps && steps.length > 0}
        />

      {/* Steps */}
      {pipeline?.steps.map((step, index) => {
        const stepMeta = steps?.find(s => s.step_id === step.id);
        return (
          <StepCard
            key={step.id}
            projectId={projectId!}
            step={step}
            meta={stepMeta}
            isFirst={index === 0}
            isLast={index === pipeline.steps.length - 1}
          />
        );
      })}

        {/* Add Step Button */}
        <button
          onClick={() => setShowAddStepModal(true)}
          className="w-full p-4 border-2 border-dashed border-[hsl(var(--border))] rounded-lg text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--ring))] hover:text-[hsl(var(--foreground))] transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Step
        </button>
      </div>

      {/* Add Step Modal */}
      {showAddStepModal && (
        <AddStepModal
          projectId={projectId!}
          stepTypes={stepTypes || []}
          existingSteps={pipeline?.steps || []}
          onClose={() => setShowAddStepModal(false)}
        />
      )}

      {showSettingsModal && (
        <ProjectSettingsModal
          projectId={projectId!}
          projectName={project.name}
          projectDescription={project.description}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {showDuplicateModal && (
        <DuplicateProjectModal
          projectId={projectId!}
          projectName={project.name}
          pipelineSteps={pipeline?.steps || []}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}
    </div>
  );
}

// Sources Card Component
function SourcesCard({
  projectId,
  sources,
  importSources,
  hasSteps,
}: {
  projectId: string;
  sources: SourcesMeta | undefined;
  importSources: ImportSourceSummary[] | undefined;
  hasSteps: boolean;
}) {
  const queryClient = useQueryClient();
  const [showImportSelector, setShowImportSelector] = useState(false);

  const addImportMutation = useMutation({
    mutationFn: (importId: string) => projectImportSourcesApi.add(projectId, importId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-import-sources', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      setShowImportSelector(false);
    },
  });

  const removeImportMutation = useMutation({
    mutationFn: (importId: string) => projectImportSourcesApi.remove(projectId, importId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-import-sources', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (error: Error) => {
      window.alert(error.message || 'Failed to unlink import');
    },
  });

  const hasImportSources = importSources && importSources.length > 0;
  const legacyCount = sources?.totals.combined || 0;
  const importTotalEntries = importSources?.reduce((sum, s) => sum + s.total_entry_count, 0) ?? 0;
  const importTotalFiles = importSources?.reduce((sum, s) => sum + s.file_count, 0) ?? 0;

  return (
    <>
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
        <div className="w-full p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-[hsl(var(--secondary-foreground))]" />
            </div>
            <div className="text-left">
              <div className="font-medium text-[hsl(var(--card-foreground))]">Sources</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                {hasImportSources
                  ? `${importSources.length} import${importSources.length !== 1 ? 's' : ''} · ${importTotalEntries} entries`
                  : `${legacyCount} records`
                }
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] text-xs rounded">
              {hasImportSources ? importTotalEntries : legacyCount}
            </span>
            <button
              onClick={() => setShowImportSelector(true)}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
            >
              <Link2 className="w-3 h-3" />
              Link import
            </button>
            {legacyCount > 0 && (
              <Link
                to={`/projects/${projectId}/sources`}
                className="px-3 py-2 text-xs border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
              >
                Legacy sources
              </Link>
            )}
          </div>
        </div>

        {hasImportSources && (
          <div className="border-t border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
            {importSources.map((imp) => (
              <div key={imp.id} className="px-4 py-3 flex items-center justify-between">
                <Link
                  to={`/imports/${imp.id}`}
                  className="flex-1 min-w-0 hover:underline"
                >
                  <div className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                    {imp.name}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {imp.file_count} {imp.file_count === 1 ? 'file' : 'files'} · {imp.total_entry_count} entries
                    {imp.databases.length > 0 && ` · ${imp.databases.join(', ')}`}
                  </div>
                </Link>
                {!hasSteps && (
                  <button
                    onClick={() => removeImportMutation.mutate(imp.id)}
                    disabled={removeImportMutation.isPending}
                    className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md ml-2"
                    title="Unlink import"
                  >
                    <Unlink className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!hasImportSources && legacyCount > 0 && (
          <div className="border-t border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-3">
            <span>Databases {sources?.totals.databases || 0}</span>
            <span>Other {sources?.totals.other || 0}</span>
          </div>
        )}

        {!hasImportSources && legacyCount === 0 && (
          <div className="border-t border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
            No sources linked. Click "Link import" to add an import collection.
          </div>
        )}
      </div>

      {showImportSelector && (
        <ImportSelectorModal
          projectId={projectId}
          linkedIds={importSources?.map((s) => s.id) ?? []}
          onSelect={(importId) => addImportMutation.mutate(importId)}
          onClose={() => setShowImportSelector(false)}
        />
      )}
    </>
  );
}

// Import Selector Modal
function ImportSelectorModal({
  projectId,
  linkedIds,
  onSelect,
  onClose,
}: {
  projectId: string;
  linkedIds: string[];
  onSelect: (importId: string) => void;
  onClose: () => void;
}) {
  const { data: allImports, isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: importsApi.list,
  });

  const available = allImports?.filter((imp) => !linkedIds.includes(imp.id)) ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">
            Link Import
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-4 text-sm text-[hsl(var(--muted-foreground))]">Loading...</div>
          ) : available.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {allImports?.length === 0
                  ? 'No imports available. Create one first.'
                  : 'All imports are already linked.'}
              </p>
              {allImports?.length === 0 && (
                <Link
                  to="/imports"
                  className="text-sm text-[hsl(var(--primary))] hover:underline mt-2 inline-block"
                  onClick={onClose}
                >
                  Go to Imports
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {available.map((imp) => (
                <button
                  key={imp.id}
                  onClick={() => onSelect(imp.id)}
                  className="w-full text-left p-3 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition-colors"
                >
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {imp.name}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    {imp.file_count} {imp.file_count === 1 ? 'file' : 'files'} · {imp.total_entry_count} entries
                    {imp.databases.length > 0 && ` · ${imp.databases.join(', ')}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Step Card Component
function StepCard({
  projectId,
  step,
  meta,
  isFirst,
  isLast,
}: {
  projectId: string;
  step: PipelineStep;
  meta: StepMeta | undefined;
  isFirst: boolean;
  isLast: boolean;
}) {
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => pipelineApi.removeStep(projectId, step.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
      queryClient.invalidateQueries({ queryKey: ['steps', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowDeleteConfirm(false);
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const status = meta?.execution.status || 'pending';
  const inputCount = meta?.input?.count || meta?.stats.input_count || 0;
  const outputCount = meta?.stats.passed_count || 0;
  const removedCount = meta?.stats.removed_count || 0;
  const uncertainCount = Math.max(0, inputCount - outputCount - removedCount);
  const outputCountDisplay = outputCount + uncertainCount;

  return (
    <div className={`relative group ${!step.enabled ? 'opacity-50' : ''}`}>
      {/* Connection line */}
      {!isFirst && (
        <div className="absolute left-7 -top-4 w-0.5 h-4 bg-[hsl(var(--border))]" />
      )}

      {isLast && (
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="absolute -top-3 -right-3 p-2 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] shadow-sm hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))] disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete step"
        >
          {deleteMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      )}

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-center">
              <StepStatusIcon status={status} />
            </div>
            <div>
              <div className="font-medium text-[hsl(var(--card-foreground))]">
                {step.name}
              </div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                {step.type}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {status === 'completed' && (
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                {inputCount} → {outputCountDisplay}
                <span
                  className={`ml-1 ${
                    removedCount > 0
                      ? 'text-[hsl(var(--status-danger-fg))]'
                      : 'text-[hsl(var(--foreground))]'
                  }`}
                >
                  {removedCount > 0 ? `(-${removedCount})` : '(+0)'}
                </span>
              </div>
            )}
            <StepStatusBadge status={status} />

            <Link
              to={`/projects/${projectId}/steps/${step.id}`}
              className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors"
              title="View details"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete step"
          description={`Delete "${step.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </div>
  );
}

// Add Step Modal
function AddStepModal({
  projectId,
  stepTypes,
  existingSteps,
  onClose,
}: {
  projectId: string;
  stepTypes: StepTypeInfo[];
  existingSteps: PipelineStep[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [stepName, setStepName] = useState('');
  const [stepId, setStepId] = useState('');

  const addMutation = useMutation({
    mutationFn: (step: PipelineStep) => pipelineApi.addStep(projectId, step),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
      queryClient.invalidateQueries({ queryKey: ['steps', projectId] });
      onClose();
    },
  });

  const handleSelectType = (type: StepTypeInfo) => {
    setSelectedType(type.id);
    setStepName(type.name);
    // Generate unique step ID
    const baseId = type.id.replace(/-/g, '_');
    let id = baseId;
    let counter = 1;
    while (existingSteps.some(s => s.id === id)) {
      id = `${baseId}_${counter}`;
      counter++;
    }
    setStepId(id);
  };

  const handleAdd = () => {
    if (!selectedType || !stepId || !stepName) return;

    const inputFrom = existingSteps.length > 0
      ? existingSteps[existingSteps.length - 1].id
      : 'sources';

    addMutation.mutate({
      id: stepId,
      type: selectedType,
      name: stepName,
      enabled: true,
      input_from: inputFrom,
      config: {},
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">
            Add Step
          </h2>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!selectedType ? (
            <div className="space-y-2">
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
                Select a step type:
              </p>
              {stepTypes.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-8">
                  No step types available. Implement step handlers to add them.
                </p>
              ) : (
                [...stepTypes]
                  .sort((a, b) => {
                    const dedupTypes = new Set(['dedup-doi', 'dedup-title', 'dedup-author']);
                    const aIsDedup = dedupTypes.has(a.id);
                    const bIsDedup = dedupTypes.has(b.id);
                    if (aIsDedup && bIsDedup) return 0;
                    if (aIsDedup) return -1;
                    if (bIsDedup) return 1;
                    if (a.id === 'ai-screening') return 1;
                    if (b.id === 'ai-screening') return -1;
                    return 0;
                  })
                  .map(type => (
                  <button
                    key={type.id}
                    onClick={() => handleSelectType(type)}
                    className="w-full p-4 text-left bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg hover:border-[hsl(var(--ring))] transition-colors"
                  >
                    <div className="font-medium text-[hsl(var(--foreground))]">
                      {type.name}
                    </div>
                    <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                      {type.description}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedType(null)}
                className="text-sm text-[hsl(var(--primary))] hover:underline"
              >
                ← Back to step types
              </button>

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Step ID
                </label>
                <input
                  type="text"
                  value={stepId}
                  onChange={(e) => setStepId(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  Unique identifier (lowercase, underscores only)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Step Name
                </label>
                <input
                  type="text"
                  value={stepName}
                  onChange={(e) => setStepName(e.target.value)}
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[hsl(var(--border))] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors"
          >
            Cancel
          </button>
          {selectedType && (
            <button
              onClick={handleAdd}
              disabled={!stepId || !stepName || addMutation.isPending}
              className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding...' : 'Add Step'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">
            {title}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-3 py-2 text-sm bg-[hsl(var(--status-danger-solid))] text-[hsl(var(--status-danger-solid-foreground))] rounded-md hover:opacity-90"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsModal({
  projectId,
  projectName,
  projectDescription,
  onClose,
}: {
  projectId: string;
  projectName: string;
  projectDescription: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState(projectDescription);

  useEffect(() => {
    setName(projectName);
    setDescription(projectDescription);
  }, [projectName, projectDescription]);

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  const clearStepsMutation = useMutation({
    mutationFn: () => pipelineApi.clearSteps(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
      queryClient.invalidateQueries({ queryKey: ['steps', projectId] });
    },
  });

  const handleSave = () => {
    const nextName = name.trim();
    const nextDescription = description.trim();
    const nameChanged = nextName && nextName !== projectName;
    const descChanged = nextDescription !== projectDescription;

    if (!nameChanged && !descChanged) {
      onClose();
      return;
    }

    const updates: { name?: string; description?: string } = {};
    if (nameChanged) updates.name = nextName;
    if (descChanged) updates.description = nextDescription;

    updateMutation.mutate(updates);
  };

  const handleClearSteps = () => {
    if (!window.confirm('Delete all steps and their outputs? This cannot be undone.')) {
      return;
    }
    clearStepsMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">
            Project Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Project name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Description
                <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-2">
                  (optional)
                </span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Add a description for this project..."
                className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-2 text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="border-t border-[hsl(var(--border))] pt-4 space-y-2">
            <div className="text-sm font-medium text-[hsl(var(--foreground))]">Danger zone</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Removes all steps and their outputs from this project.
            </p>
            <button
              onClick={handleClearSteps}
              className="px-3 py-2 text-sm bg-[hsl(var(--status-danger-solid))] text-[hsl(var(--status-danger-solid-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
              disabled={clearStepsMutation.isPending}
            >
              {clearStepsMutation.isPending ? 'Deleting...' : 'Delete all steps'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DuplicateProjectModal({
  projectId,
  projectName,
  pipelineSteps,
  onClose,
}: {
  projectId: string;
  projectName: string;
  pipelineSteps: PipelineStep[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Generate default name with (N) suffix
  const generateDefaultName = () => {
    // Check if name already has a (N) suffix
    const match = projectName.match(/^(.+?)\s*\((\d+)\)$/);
    if (match) {
      return `${match[1].trim()} (${parseInt(match[2]) + 1})`;
    }
    return `${projectName} (1)`;
  };

  const [name, setName] = useState(generateDefaultName);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(pipelineSteps.length - 1);

  const duplicateMutation = useMutation({
    mutationFn: () =>
      projectsApi.duplicate(projectId, {
        name: name.trim(),
        include_steps_until:
          selectedStepIndex >= 0 && selectedStepIndex < pipelineSteps.length
            ? pipelineSteps[selectedStepIndex].id
            : undefined,
      }),
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
      navigate(`/projects/${newProject.id}`);
    },
  });

  const handleStepClick = (index: number) => {
    // Clicking a step selects all steps from 0 to that index
    setSelectedStepIndex(index);
  };

  const isStepSelected = (index: number) => index <= selectedStepIndex;

  const handleDuplicate = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    duplicateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">
            Duplicate Project
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              New project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Enter project name"
            />
          </div>

          {/* Steps selection */}
          {pipelineSteps.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Include steps
              </label>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Click a step to include all steps up to that point. All steps are selected by default.
              </p>
              <div className="border border-[hsl(var(--border))] rounded-md overflow-hidden max-h-60 overflow-y-auto">
                {pipelineSteps.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => handleStepClick(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      isStepSelected(index)
                        ? 'bg-[hsl(var(--primary)/0.1)]'
                        : 'hover:bg-[hsl(var(--muted))]'
                    } ${index > 0 ? 'border-t border-[hsl(var(--border))]' : ''}`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isStepSelected(index)
                          ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
                          : 'border-[hsl(var(--border))]'
                      }`}
                    >
                      {isStepSelected(index) && (
                        <Check className="w-3 h-3 text-[hsl(var(--primary-foreground))]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                        {step.name}
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        {step.type}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {selectedStepIndex >= 0
                  ? `${selectedStepIndex + 1} of ${pipelineSteps.length} steps will be copied`
                  : 'No steps will be copied'}
              </div>
            </div>
          )}

          {/* No steps message */}
          {pipelineSteps.length === 0 && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              This project has no pipeline steps to copy.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[hsl(var(--border))]">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            >
              Cancel
            </button>
            <button
              onClick={handleDuplicate}
              className="px-3 py-2 text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
              disabled={duplicateMutation.isPending || !name.trim()}
            >
              {duplicateMutation.isPending ? 'Duplicating...' : 'Duplicate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
