import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Settings,
  ChevronRight,
  Database,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import {
  projectsApi,
  pipelineApi,
  stepTypesApi,
  StepMeta,
  PipelineStep,
  StepTypeInfo,
  SourcesMeta,
} from '../lib/api';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [showAddStepModal, setShowAddStepModal] = useState(false);

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
  });

  const { data: sources } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => sourcesApi.get(projectId!),
    enabled: !!projectId,
  });

  const { data: stepTypes } = useQuery({
    queryKey: ['step-types'],
    queryFn: stepTypesApi.list,
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
          <button className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="space-y-4">
        {/* Sources */}
        <SourcesCard
          projectId={projectId!}
          sources={sources}
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
    </div>
  );
}

// Sources Card Component
function SourcesCard({
  projectId,
  sources,
}: {
  projectId: string;
  sources: SourcesMeta | undefined;
}) {
  const totalCount = sources?.totals.combined || 0;
  const databaseCount = sources?.totals.databases || 0;
  const otherCount = sources?.totals.other || 0;

  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
      <div className="w-full p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-[hsl(var(--secondary-foreground))]" />
          </div>
          <div className="text-left">
            <div className="font-medium text-[hsl(var(--card-foreground))]">Sources</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              {totalCount} records
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] text-xs rounded">
            {totalCount}
          </span>
          <Link
            to={`/projects/${projectId}/sources`}
            className="px-3 py-2 text-xs border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            Manage sources
          </Link>
        </div>
      </div>
      <div className="border-t border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-3">
        <span>Databases {databaseCount}</span>
        <span>Other {otherCount}</span>
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

  const deleteMutation = useMutation({
    mutationFn: () => pipelineApi.removeStep(projectId, step.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
      queryClient.invalidateQueries({ queryKey: ['steps', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete step "${step.name}"?`)) {
      deleteMutation.mutate();
    }
  };

  const status = meta?.execution.status || 'pending';
  const inputCount = meta?.input?.count || meta?.stats.input_count || 0;
  const outputCount = meta?.stats.passed_count || 0;
  const diff = meta?.stats.removed_count || 0;

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-[hsl(var(--status-success))]" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-[hsl(var(--status-info))] animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-[hsl(var(--status-danger))]" />;
      default:
        return <Clock className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'running':
        return <Badge variant="warning">Running</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

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
              {getStatusIcon()}
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
                {inputCount} → {outputCount}
                {diff > 0 && (
                  <span className="text-[hsl(var(--status-danger))] ml-1">(-{diff})</span>
                )}
              </div>
            )}
            {getStatusBadge()}

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
                stepTypes.map(type => (
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
