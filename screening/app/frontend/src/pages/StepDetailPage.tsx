/**
 * Step detail page - shows step info and paper list.
 * Routes to specific step type viewers based on step type.
 */
import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Loader2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { stepsApi, pipelineApi, StepMeta, PipelineStep } from '../lib/api';
import { StepOutputViewer, ChangeRecord } from '../components/papers';
import { StepConfigModal } from '../components/StepConfigModal';
import { StepStatusBadge } from '../components/StepStatus';
import { stepTypeConfigs } from '../steps/stepTypeConfigs';

export function StepDetailPage() {
  const { projectId, stepId } = useParams<{ projectId: string; stepId: string }>();
  const queryClient = useQueryClient();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // Fetch step meta
  const {
    data: stepMeta,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['step', projectId, stepId],
    queryFn: () => stepsApi.get(projectId!, stepId!),
    enabled: !!projectId && !!stepId,
  });

  // Fetch pipeline to get step config
  const { data: pipeline } = useQuery({
    queryKey: ['pipeline', projectId],
    queryFn: () => pipelineApi.get(projectId!),
    enabled: !!projectId,
  });

  const { data: changes = [] } = useQuery({
    queryKey: ['step-changes', projectId, stepId],
    queryFn: async () => {
      const result = await stepsApi.getChanges(projectId!, stepId!);
      return result as unknown as ChangeRecord[];
    },
    enabled: !!projectId && !!stepId && stepMeta?.execution.status === 'completed',
  });

  // Get current step from pipeline
  const pipelineStep = pipeline?.steps.find((s) => s.id === stepId);

  // Update step config mutation
  const updateStepMutation = useMutation({
    mutationFn: (updatedStep: PipelineStep) =>
      pipelineApi.updateStep(projectId!, stepId!, updatedStep),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
    },
  });

  // Run step mutation
  const runMutation = useMutation({
    mutationFn: () => stepsApi.run(projectId!, stepId!),
    onSuccess: () => {
      setIsConfigModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['step', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-output', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-changes', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['steps', projectId] });
    },
  });

  // Reset step mutation
  const resetMutation = useMutation({
    mutationFn: () => stepsApi.reset(projectId!, stepId!),
    onSuccess: () => {
      setIsResetDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['step', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-output', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-changes', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['steps', projectId] });
    },
  });

  const actionCounts = useMemo(() => {
    return changes.reduce(
      (acc, change) => {
        if (change.action === 'keep') acc.keep += 1;
        if (change.action === 'remove') acc.remove += 1;
        if (change.action === 'modify') acc.modify += 1;
        return acc;
      },
      { keep: 0, remove: 0, modify: 0 }
    );
  }, [changes]);
  const decisionCounts = useMemo(() => {
    return changes.reduce(
      (acc, change) => {
        const decision = change.details?.decision as string | undefined;
        if (decision === 'include') acc.include += 1;
        else if (decision === 'exclude') acc.exclude += 1;
        else if (decision === 'uncertain') acc.uncertain += 1;
        return acc;
      },
      { include: 0, exclude: 0, uncertain: 0 }
    );
  }, [changes]);
  const apiLatency = useMemo(() => {
    if (stepMeta?.step_type !== 'ai-screening') return null;
    let totalMs = 0;
    let count = 0;
    for (const change of changes) {
      const latency = change.details?.latency_ms as number | undefined;
      if (typeof latency === 'number') {
        totalMs += latency;
        count += 1;
      }
    }
    if (count === 0) return null;
    return {
      totalMs,
      avgMs: totalMs / count,
      count,
    };
  }, [changes, stepMeta?.step_type]);
  const apiCompletedAt = useMemo(() => {
    if (stepMeta?.step_type !== 'ai-screening') return null;
    if (!stepMeta.execution.completed_at) return null;
    return new Date(stepMeta.execution.completed_at).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [stepMeta?.execution.completed_at, stepMeta?.step_type]);

  // Handle run with config
  const handleRunWithConfig = async (config: Record<string, unknown>) => {
    if (!pipelineStep) return;

    // Update step config first
    await updateStepMutation.mutateAsync({
      ...pipelineStep,
      config,
    });

    // Then run the step
    runMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !stepMeta) {
    return (
      <div className="text-center py-12">
        <p className="text-[hsl(var(--status-danger))]">
          Failed to load step: {(error as Error)?.message}
        </p>
      </div>
    );
  }

  const config = stepTypeConfigs[stepMeta.step_type] || { icon: null };
  const isCompleted = stepMeta.execution.status === 'completed';
  const isPending = stepMeta.execution.status === 'pending';
  const isFailed = stepMeta.execution.status === 'failed';
  const canRun = isPending || isFailed;
  const isLatest = stepMeta.is_latest;
  const passedCount = stepMeta.stats.passed_count;
  const removedCount = stepMeta.stats.removed_count;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={`/projects/${projectId}`}
            className="p-2 hover:bg-[hsl(var(--muted))] rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            {config.icon}
            <div>
              <h1 className="text-2xl font-bold">{stepMeta.name}</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Step type: {stepMeta.step_type}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StepStatusBadge status={stepMeta.execution.status} />

          {canRun && (
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg hover:opacity-90"
            >
              <Play className="w-4 h-4" />
              {isFailed ? 'Retry' : 'Run Step'}
            </button>
          )}

          {(isCompleted || isFailed) && isLatest && (
            <button
              onClick={() => setIsResetDialogOpen(true)}
              disabled={resetMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              {resetMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Reset
            </button>
          )}

        </div>
      </div>

      {/* Non-latest step notice */}
      {!isLatest && (isCompleted || isFailed) && (
        <div className="p-4 rounded-lg bg-[hsl(var(--status-info-bg))] border border-[hsl(var(--status-info-border))]">
          <p className="text-[hsl(var(--status-info-fg))] text-sm">
            This is an intermediate step. Reset and Delete are only available for the latest step
            because subsequent steps depend on this step's output.
          </p>
        </div>
      )}

      {/* Stats cards */}
      {isCompleted && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="text-2xl font-bold">{stepMeta.stats.input_count}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Input</div>
          </div>
          <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="text-2xl font-bold text-[hsl(var(--status-success))]">
              {passedCount}
            </div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Passed</div>
          </div>
          <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="text-2xl font-bold text-[hsl(var(--status-danger))]">
              {removedCount}
            </div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Removed</div>
          </div>
          <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="text-2xl font-bold">
              {stepMeta.execution.duration_sec?.toFixed(2)}s
            </div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Duration</div>
            {apiLatency && (
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                API avg {Math.round(apiLatency.avgMs)}ms · total {(apiLatency.totalMs / 1000).toFixed(2)}s
              </div>
            )}
            {apiCompletedAt && (
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                API at {apiCompletedAt}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {stepMeta.execution.status === 'failed' && stepMeta.execution.error && (
        <div className="p-4 rounded-lg bg-[hsl(var(--status-danger-bg))] border border-[hsl(var(--status-danger-border))]">
          <p className="text-[hsl(var(--status-danger-fg))]">{stepMeta.execution.error}</p>
        </div>
      )}

      {/* Pending state */}
      {isPending && (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>This step has not been run yet.</p>
          <p className="text-sm">Click "Run Step" to execute.</p>
        </div>
      )}

      {/* Paper list */}
      {isCompleted && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <StepOutputViewer
            projectId={projectId!}
            stepId={stepId!}
            stepMeta={stepMeta}
            changes={changes}
            actionCounts={actionCounts}
            decisionCounts={decisionCounts}
            countSource="output"
            columns={config.columns}
            buildFilters={config.buildFilters}
            filterEntry={config.filterEntry}
          />
        </div>
      )}

      {/* Config modal */}
      {pipelineStep && (
        <StepConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          onRun={handleRunWithConfig}
          step={pipelineStep}
          isRunning={runMutation.isPending || updateStepMutation.isPending}
        />
      )}

      {/* Reset confirmation dialog */}
      {isResetDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsResetDialogOpen(false)}
          />
          <div className="relative bg-[hsl(var(--background))] rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-[hsl(var(--status-warning-bg))]">
                <AlertTriangle className="w-6 h-6 text-[hsl(var(--status-warning))]" />
              </div>
              <h2 className="text-lg font-semibold">Reset Step</h2>
            </div>
            <p className="text-[hsl(var(--muted-foreground))] mb-6">
              This will delete all output files and execution history for this step.
              The step will return to its initial pending state.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsResetDialogOpen(false)}
                className="px-4 py-2 border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--muted))]"
              >
                Cancel
              </button>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="px-4 py-2 bg-[hsl(var(--status-warning-solid))] text-[hsl(var(--status-warning-solid-foreground))] rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
