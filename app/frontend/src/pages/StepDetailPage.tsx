/**
 * Step detail page - shows step info and paper list.
 * Routes to specific step type viewers based on step type.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Loader2,
  Clock,
  AlertTriangle,
  Info,
  Download,
  FileText,
  ChevronRight,
  ScrollText,
  Copy,
  Check,
} from 'lucide-react';
import { stepsApi, pipelineApi, rulesApi, StepMeta, PipelineStep } from '../lib/api';
import { StepOutputViewer, ChangeRecord, HumanReviewViewer } from '../components/papers';
import { StepConfigModal } from '../components/StepConfigModal';
import { StepStatusBadge } from '../components/StepStatus';
import { stepTypeConfigs } from '../steps/stepTypeConfigs';
import { normalizeBibtexText } from '../components/BibtexText';

export function StepDetailPage() {
  const { projectId, stepId } = useParams<{ projectId: string; stepId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [showRunNotice, setShowRunNotice] = useState(false);
  const [aiOutputMode, setAiOutputMode] = useState<'ai' | 'human'>('ai');
  const [rulesCopied, setRulesCopied] = useState(false);

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

  const isDuplicateGroupStep = stepMeta?.step_type === 'dedup-title'
    || stepMeta?.step_type === 'dedup-author'
    || stepMeta?.step_type === 'dedup-doi';
  const isAiScreening = stepMeta?.step_type === 'ai-screening';
  const { data: clustersData } = useQuery({
    queryKey: ['step-clusters', projectId, stepId],
    queryFn: () => stepsApi.getClusters(projectId!, stepId!),
    enabled: !!projectId && !!stepId && stepMeta?.execution.status === 'completed' && isDuplicateGroupStep,
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const { data: inputData } = useQuery({
    queryKey: ['step-input', projectId, stepId],
    queryFn: () => stepsApi.getInput(projectId!, stepId!),
    enabled: !!projectId && !!stepId && stepMeta?.execution.status === 'completed' && isDuplicateGroupStep,
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const clusters = useMemo(() => {
    const inputEntries = (inputData?.entries ?? []) as {
      ID?: string;
      title?: string;
      author?: string;
      year?: string;
      abstract?: string;
    }[];
    const inputEntryMap = new Map(inputEntries.map((entry) => [entry.ID ?? '', entry]));
    const storedClusters = (clustersData?.clusters ?? []) as {
      id: string;
      size: number;
      representative_id: string;
      representative_title: string;
      average_similarity: number;
      title_average_similarity?: number;
      reviewed?: boolean;
      members: {
        id: string;
        title: string;
        authors: string;
        year: string;
        abstract?: string;
        similarity: number;
        action: string;
      }[];
    }[];
    if (storedClusters.length > 0) {
      const hydrated = storedClusters.map((cluster) => ({
        ...cluster,
        members: cluster.members.map((member) => {
          if (member.abstract) return member;
          const entry = inputEntryMap.get(member.id);
          return {
            ...member,
            abstract: entry?.abstract ?? '',
          };
        }),
      }));
      const filtered = hydrated.filter((cluster) => cluster.size > 1);
      if (stepMeta?.step_type === 'dedup-author') {
        return [...filtered].sort((a, b) => {
          if (a.size !== b.size) return b.size - a.size;
          const aTitleAvg = a.title_average_similarity ?? 0;
          const bTitleAvg = b.title_average_similarity ?? 0;
          if (aTitleAvg !== bTitleAvg) return bTitleAvg - aTitleAvg;
          if (a.average_similarity !== b.average_similarity) {
            return b.average_similarity - a.average_similarity;
          }
          return normalizeBibtexText(a.representative_title)
            .localeCompare(normalizeBibtexText(b.representative_title));
        });
      }
      return filtered;
    }

    if (stepMeta?.step_type !== 'dedup-doi') {
      return storedClusters;
    }

    if (inputEntries.length === 0) {
      return [];
    }

    const entryMap = inputEntryMap;
    const changeMap = new Map(changes.map((change) => [change.key, change]));
    const doiGroups = new Map<string, Set<string>>();
    const doiRepresentatives = new Map<string, string>();

    for (const change of changes) {
      if (change.reason === 'unique_doi' || change.reason === 'duplicate_doi') {
        const doi = (change.details?.doi as string | undefined)?.trim();
        if (!doi) continue;
        const group = doiGroups.get(doi) ?? new Set<string>();
        group.add(change.key);
        const originalKey = change.details?.original_key as string | undefined;
        if (originalKey) {
          doiRepresentatives.set(doi, originalKey);
          group.add(originalKey);
        }
        if (change.reason === 'unique_doi') {
          doiRepresentatives.set(doi, change.key);
        }
        doiGroups.set(doi, group);
      }
    }

    const clustersFromDoi = Array.from(doiGroups.entries())
      .filter(([, members]) => members.size > 1)
      .map(([doi, members], index) => {
      const memberIds = Array.from(members);
      const representativeId = doiRepresentatives.get(doi) ?? memberIds[0];
      const representativeEntry = entryMap.get(representativeId);
      const membersPayload = memberIds.map((id) => {
        const entry = entryMap.get(id);
        const change = changeMap.get(id);
        const action = change?.action ?? (id === representativeId ? 'keep' : 'remove');
        return {
          id,
          title: entry?.title ?? '',
          authors: entry?.author ?? '',
          year: entry?.year ?? '',
          abstract: entry?.abstract ?? '',
          similarity: 1,
          action,
        };
      });

      return {
        id: `doi-group-${index + 1}`,
        size: memberIds.length,
        representative_id: representativeId,
        representative_title: representativeEntry?.title ?? doi,
        average_similarity: 1,
        members: membersPayload,
      };
    });

    return clustersFromDoi;
  }, [clustersData?.clusters, changes, inputData?.entries, stepMeta?.step_type]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [draftClusters, setDraftClusters] = useState(clusters);
  const baselineRef = useRef('');
  const draftClustersRef = useRef(draftClusters);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    clusterId: string;
    memberId: string;
  } | null>(null);
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = clusters;
    const nextKey = JSON.stringify(next);
    if (next.length === 0 && draftClustersRef.current.length > 0) {
      return;
    }
    if (baselineRef.current === nextKey) {
      return;
    }
    setDraftClusters(next);
    setSelectedClusterId((prev) => {
      if (!prev) return next[0]?.id ?? null;
      return next.some((cluster) => cluster.id === prev) ? prev : (next[0]?.id ?? null);
    });
    baselineRef.current = nextKey;
  }, [clusters]);
  useEffect(() => {
    draftClustersRef.current = draftClusters;
  }, [draftClusters]);

  const selectedCluster = draftClusters.find((cluster) => cluster.id === selectedClusterId) ?? draftClusters[0] ?? null;

  const buildClusterChanges = (nextClusters: typeof draftClusters) => {
    const nextChanges: ChangeRecord[] = [];
    let keepCount = 0;
    let removeCount = 0;

    for (const cluster of nextClusters) {
      const members = cluster.members ?? [];
      const representativeId = cluster.representative_id ?? members[0]?.id;
      for (const member of members) {
        const action = (member.action as 'keep' | 'remove' | undefined)
          ?? (member.id === representativeId ? 'keep' : 'remove');
        if (action === 'keep') {
          keepCount += 1;
        } else {
          removeCount += 1;
        }
        nextChanges.push({
          key: member.id,
          action,
          reason: action === 'keep' ? 'manual_cluster_keep' : 'manual_cluster_remove',
          details: {
            cluster_id: cluster.id,
            representative_id: representativeId,
          },
        } as ChangeRecord);
      }
    }

    return { nextChanges, keepCount, removeCount };
  };

  const updateClustersMutation = useMutation({
    mutationFn: ({ clusters: nextClusters }: { clusters: typeof draftClusters; mode: 'reviewed' | 'decision' }) =>
      stepsApi.updateClusters(projectId!, stepId!, nextClusters),
    onMutate: async ({ clusters: nextClusters, mode }) => {
      const previousClusters = queryClient.getQueryData(['step-clusters', projectId, stepId]);

      if (mode === 'reviewed') {
        queryClient.setQueryData(['step-clusters', projectId, stepId], { clusters: nextClusters });
        return { previousClusters, mode };
      }

      await queryClient.cancelQueries({ queryKey: ['step', projectId, stepId] });
      await queryClient.cancelQueries({ queryKey: ['step-changes', projectId, stepId] });
      await queryClient.cancelQueries({ queryKey: ['step-output', projectId, stepId] });

      const previousStep = queryClient.getQueryData(['step', projectId, stepId]);
      const previousChanges = queryClient.getQueryData(['step-changes', projectId, stepId]);

      const { nextChanges, keepCount, removeCount } = buildClusterChanges(nextClusters);

      queryClient.setQueryData(['step-changes', projectId, stepId], nextChanges);
      queryClient.setQueryData(['step', projectId, stepId], (prev: StepMeta | undefined) => {
        if (!prev) return prev;
        const outputs = { ...prev.outputs };
        if (outputs.passed) {
          outputs.passed = { ...outputs.passed, count: keepCount };
        }
        if (outputs.removed) {
          outputs.removed = { ...outputs.removed, count: removeCount };
        }
        return {
          ...prev,
          outputs,
          stats: {
            ...prev.stats,
            passed_count: keepCount,
            removed_count: removeCount,
            total_output_count: keepCount + removeCount,
          },
        };
      });

      queryClient.setQueryData(['step-clusters', projectId, stepId], { clusters: nextClusters });
      return { previousStep, previousChanges, previousClusters, mode };
    },
    onError: (_error, _payload, context) => {
      if (context?.previousClusters) {
        queryClient.setQueryData(['step-clusters', projectId, stepId], context.previousClusters);
      }
      if (context?.mode === 'decision') {
        if (context?.previousStep) {
          queryClient.setQueryData(['step', projectId, stepId], context.previousStep);
        }
        if (context?.previousChanges) {
          queryClient.setQueryData(['step-changes', projectId, stepId], context.previousChanges);
        }
      }
    },
    onSuccess: (_data, payload) => {
      baselineRef.current = JSON.stringify(payload.clusters);
      setDraftClusters(payload.clusters);
      if (payload.mode === 'decision') {
        queryClient.invalidateQueries({ queryKey: ['step-changes', projectId, stepId] });
        queryClient.invalidateQueries({ queryKey: ['step-output', projectId, stepId] });
        queryClient.invalidateQueries({ queryKey: ['step', projectId, stepId] });
        queryClient.invalidateQueries({ queryKey: ['steps', projectId] });
      }
    },
    onSettled: (_data, _error, payload) => {
      if (payload?.mode === 'decision') {
        queryClient.invalidateQueries({ queryKey: ['step-output', projectId, stepId] });
      }
    },
  });
  const changesByKey = useMemo(() => {
    return new Map(changes.map((change) => [change.key, change]));
  }, [changes]);

  const setMemberAction = (clusterId: string, memberId: string, action: 'keep' | 'remove') => {
    setDraftClusters((prev) => {
      const next = prev.map((cluster) =>
        cluster.id === clusterId
          ? {
              ...cluster,
              members: cluster.members.map((member) =>
                member.id === memberId ? { ...member, action } : member
              ),
            }
          : cluster
      );
      const target = next.find((cluster) => cluster.id === clusterId);
      if (target) {
        const hasKeep = target.members.some((member) => (member.action ?? 'keep') === 'keep');
        if (!hasKeep) {
          setConfirmState({ isOpen: true, clusterId, memberId });
          return prev;
        }
      }
      updateClustersMutation.mutate({ clusters: next, mode: 'decision' });
      return next;
    });
  };

  const toggleReviewed = (clusterId: string, nextReviewed: boolean) => {
    setDraftClusters((prev) => {
      const next = prev.map((cluster) =>
        cluster.id === clusterId ? { ...cluster, reviewed: nextReviewed } : cluster
      );
      updateClustersMutation.mutate({ clusters: next, mode: 'reviewed' });
      return next;
    });
  };

  const confirmAllRemove = () => {
    if (!confirmState) return;
    const { clusterId, memberId } = confirmState;
    setConfirmState(null);
    setDraftClusters((prev) => {
      const next = prev.map((cluster) =>
        cluster.id === clusterId
          ? {
              ...cluster,
              members: cluster.members.map((member) =>
                member.id === memberId ? { ...member, action: 'remove' } : member
              ),
            }
          : cluster
      );
      updateClustersMutation.mutate({ clusters: next, mode: 'decision' });
      return next;
    });
  };

  const splitMember = (clusterId: string, memberId: string) => {
    setDraftClusters((prev) => {
      const next: typeof prev = [];
      for (const cluster of prev) {
        if (cluster.id !== clusterId) {
          next.push(cluster);
          continue;
        }
        const remainingMembers = cluster.members.filter((member) => member.id !== memberId);
        if (remainingMembers.length > 0) {
          const representative_id = cluster.representative_id === memberId
            ? remainingMembers[0]?.id
            : cluster.representative_id;
          next.push({
            ...cluster,
            members: remainingMembers,
            size: remainingMembers.length,
            representative_id,
          });
        }

        const splitMemberEntry = cluster.members.find((member) => member.id === memberId);
        if (splitMemberEntry) {
          next.push({
            id: `manual-${Date.now()}-${memberId}`,
            size: 1,
            representative_id: memberId,
            representative_title: splitMemberEntry.title,
            average_similarity: 1,
            members: [
              {
                ...splitMemberEntry,
                similarity: 1,
                action: 'keep',
              },
            ],
          });
        }
      }
      return next;
    });
  };

  const toggleMemberDetails = (memberId: string) => {
    setExpandedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };


  // Get current step from pipeline
  const pipelineStep = pipeline?.steps.find((s) => s.id === stepId);
  useEffect(() => {
    if (!isAiScreening) return;
    const mode = (pipelineStep?.config?.output_mode as 'ai' | 'human' | undefined) ?? 'ai';
    setAiOutputMode(mode);
  }, [pipelineStep?.config, isAiScreening]);

  // Fetch screening rules for AI screening
  const rulesId = pipelineStep?.config?.rules as string | undefined;
  const { data: ruleContent } = useQuery({
    queryKey: ['rule', rulesId],
    queryFn: () => rulesApi.get(rulesId!),
    enabled: isAiScreening && !!rulesId,
  });

  // Update step config mutation
  const updateStepMutation = useMutation({
    mutationFn: (updatedStep: PipelineStep) =>
      pipelineApi.updateStep(projectId!, stepId!, updatedStep),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', projectId] });
    },
  });

  const applyOutputMode = async (mode: 'ai' | 'human') => {
    if (!pipelineStep) return;
    await updateStepMutation.mutateAsync({
      ...pipelineStep,
      config: {
        ...pipelineStep.config,
        output_mode: mode,
      },
    });
    await stepsApi.applyOutputMode(projectId!, stepId!, mode);
    queryClient.invalidateQueries({ queryKey: ['step', projectId, stepId] });
    queryClient.invalidateQueries({ queryKey: ['step-output', projectId, stepId] });
    queryClient.invalidateQueries({ queryKey: ['step-review', projectId, stepId] });
    setAiOutputMode(mode);
  };

  // Run step mutation
  const runMutation = useMutation({
    mutationFn: () => stepsApi.run(projectId!, stepId!),
    onSuccess: () => {
      setIsConfigModalOpen(false);
      if (isDuplicateGroupStep) {
        setShowRunNotice(true);
      }
      queryClient.invalidateQueries({ queryKey: ['step', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-output', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-changes', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-clusters', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-input', projectId, stepId] });
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
      queryClient.invalidateQueries({ queryKey: ['step-clusters', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-input', projectId, stepId] });
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
        <p className="text-[hsl(var(--status-danger-fg))]">
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
  const displayPassedCount = passedCount;
  const displayRemovedCount = removedCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
                return;
              }
              navigate(projectId ? `/projects/${projectId}` : '/');
            }}
            className="p-2 hover:bg-[hsl(var(--muted))] rounded-lg"
            aria-label="Back to project"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
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
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--status-info-bg))] border border-[hsl(var(--status-info-border))]">
              <Info className="h-5 w-5 text-[hsl(var(--status-info-fg))]" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[hsl(var(--status-info-fg))]">
                Intermediate Step
              </div>
              <p className="text-[hsl(var(--status-info-fg))] text-sm">
                Reset and Delete are only available for the latest step because subsequent steps
                depend on this output.
              </p>
            </div>
          </div>
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
            <div className="text-2xl font-bold text-[hsl(var(--status-success-fg))]">
              {displayPassedCount}
            </div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Passed</div>
          </div>
          <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="text-2xl font-bold text-[hsl(var(--status-danger-fg))]">
              {displayRemovedCount}
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

      {isCompleted && isDuplicateGroupStep && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Duplicate Groups</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                {draftClusters.length} clusters
              </span>
              {updateClustersMutation.isPending && (
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Saving...</span>
              )}
            </div>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            All items are set to Keep by default. Change only the ones you want to remove.
          </p>
          {clusters.length === 0 ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              No clusters found.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  Select a group to review
                </div>
                {draftClusters.map((cluster) => {
                  const isActive = cluster.id === (selectedCluster?.id ?? '');
                  const isReviewed = Boolean(cluster.reviewed);
                  return (
                    <button
                      key={cluster.id}
                      onClick={() => setSelectedClusterId(cluster.id)}
                      className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                        isActive
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--muted))]'
                          : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isReviewed}
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleReviewed(cluster.id, event.target.checked);
                            }}
                            className="mt-0.5"
                          />
                          <div className={`text-sm font-medium whitespace-normal break-words ${isReviewed ? 'line-through text-[hsl(var(--muted-foreground))]' : ''}`}>
                          {normalizeBibtexText(cluster.representative_title) || cluster.id}
                        </div>
                        </div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] shrink-0 min-w-[64px] text-right">
                          {cluster.size} items
                        </div>
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        Author similarity {(cluster.average_similarity * 100).toFixed(1)}%
                        {typeof cluster.title_average_similarity === 'number' && (
                          <span className="ml-2">
                            Title similarity {(cluster.title_average_similarity * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {isActive && (
                        <div className="text-[10px] text-[hsl(var(--primary))] mt-1">
                          Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedCluster && (
                <div className="rounded-md border border-[hsl(var(--border))] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium whitespace-normal break-words">
                      Decision Panel
                    </div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {selectedCluster.size} candidates
                    </div>
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    Keep/Remove is already set automatically. Change only if needed.
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedCluster.reviewed)}
                      onChange={(event) => toggleReviewed(selectedCluster.id, event.target.checked)}
                    />
                    Mark this group as reviewed
                  </label>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-[hsl(var(--muted-foreground))]">
                        <tr className="border-b border-[hsl(var(--border))]">
                          <th className="py-2 text-left font-medium">Paper</th>
                          <th className="py-2 text-left font-medium">Similarity</th>
                          <th className="py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--border))]">
                        {selectedCluster.members.map((member) => {
                          const representativeId = selectedCluster.representative_id ?? selectedCluster.members[0]?.id;
                          const memberAction = (member.action as 'keep' | 'remove' | undefined) ?? (member.id === representativeId ? 'keep' : 'remove');
                          const isKeep = memberAction === 'keep';
                          const change = changesByKey.get(member.id);
                          const authorLine = member.authors
                            ? member.authors.replace(/\s+and\s+/g, ', ')
                            : '-';
                          const isExpanded = expandedMemberIds.has(member.id);
                          return (
                            <Fragment key={member.id}>
                              <tr className="align-top">
                                <td className="py-3 pr-3">
                                  <div className="font-semibold whitespace-normal break-words">
                                    {normalizeBibtexText(member.title) || '(No title)'}
                                  </div>
                                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                                    {authorLine} {member.year ? `· ${member.year}` : ''}
                                  </div>
                                  {change?.reason && (
                                    <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                      {change.reason}
                                    </div>
                                  )}
                                  {(change?.details as { representative_id?: string } | undefined)?.representative_id && (
                                    <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                      Representative: {(change?.details as { representative_id?: string }).representative_id}
                                    </div>
                                  )}
                                  {member.id && (
                                    <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                      ID: {member.id}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleMemberDetails(member.id)}
                                    className="mt-2 text-xs text-[hsl(var(--primary))] hover:underline"
                                  >
                                    {isExpanded ? 'Hide details' : 'View details'}
                                  </button>
                                </td>
                                <td className="py-3 pr-3 text-xs text-[hsl(var(--muted-foreground))]">
                                  {(member.similarity * 100).toFixed(1)}%
                                </td>
                                <td className="py-3 pr-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setMemberAction(selectedCluster.id, member.id, 'keep')}
                                      className={
                                        isKeep
                                          ? 'px-2 py-1 rounded-full border border-[hsl(var(--status-success-border))] bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]'
                                          : 'px-2 py-1 rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
                                      }
                                    >
                                      Keep
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setMemberAction(selectedCluster.id, member.id, 'remove')}
                                      className={
                                        !isKeep
                                          ? 'px-2 py-1 rounded-full border border-[hsl(var(--status-danger-border))] bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))]'
                                          : 'px-2 py-1 rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td
                                    colSpan={3}
                                    className="pb-3 pt-0 text-xs text-[hsl(var(--muted-foreground))]"
                                  >
                                    <div className="rounded-md bg-[hsl(var(--muted))] p-3 whitespace-pre-wrap">
                                      {member.abstract ? normalizeBibtexText(member.abstract) : 'No abstract available.'}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {confirmState?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmState(null)}
          />
          <div className="relative bg-[hsl(var(--background))] rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="text-lg font-semibold mb-2">Confirm Remove</div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
              This will set all papers in this group to Remove. Are you sure?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--muted))]"
              >
                Cancel
              </button>
              <button
                onClick={confirmAllRemove}
                className="px-4 py-2 bg-[hsl(var(--status-danger-solid))] text-[hsl(var(--status-danger-solid-foreground))] rounded-lg hover:opacity-90"
              >
                Set all to Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {showRunNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRunNotice(false)}
          />
          <div className="relative bg-[hsl(var(--background))] rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="text-lg font-semibold mb-2">Run completed</div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
              Default decisions are set to Keep. Change them only if needed.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowRunNotice(false)}
                className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90"
              >
                OK
              </button>
            </div>
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

      {/* Screening Rules (collapsible) */}
      {isCompleted && isAiScreening && ruleContent && (
        <details className="group rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
            <ScrollText className="w-4 h-4" />
            Screening Rules
            <span className="text-xs font-normal text-[hsl(var(--muted-foreground))] ml-auto">
              {ruleContent.filename}
            </span>
          </summary>
          <div className="px-4 pb-4 pt-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(ruleContent.content);
                  setRulesCopied(true);
                  setTimeout(() => setRulesCopied(false), 2000);
                }}
                className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-[hsl(var(--background))] transition-colors"
                title="Copy to clipboard"
              >
                {rulesCopied ? (
                  <Check className="w-4 h-4 text-[hsl(var(--status-success-fg))]" />
                ) : (
                  <Copy className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                )}
              </button>
              <pre className="text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap font-mono bg-[hsl(var(--muted))] p-3 pr-10 rounded-md max-h-96 overflow-y-auto">
                {ruleContent.content}
              </pre>
            </div>
          </div>
        </details>
      )}

      {isCompleted && isAiScreening && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3">
            Output Source
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => applyOutputMode('ai')}
              className={`rounded-lg border px-4 py-4 text-left transition-colors ${
                aiOutputMode === 'ai'
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--muted))]'
                  : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              <div className="text-base font-semibold">Use AI Output</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Current AI results are passed to the next step.
              </div>
            </button>
            <button
              type="button"
              onClick={() => applyOutputMode('human')}
              className={`rounded-lg border px-4 py-4 text-left transition-colors ${
                aiOutputMode === 'human'
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--muted))]'
                  : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              <div className="text-base font-semibold">Use Human Review Output</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Human decisions overwrite the output for downstream steps.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* BibTeX Export (collapsible) */}
      {isCompleted && isAiScreening && (
        <details className="group rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
            <Download className="w-4 h-4" />
            Export BibTeX
          </summary>
          <div className="px-4 pb-4 pt-2">
            <div className={`grid gap-4 ${aiOutputMode === 'human' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {/* Input */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                  Input
                </div>
                <a
                  href={stepsApi.downloadInputUrl(projectId!, stepId!)}
                  download
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
                >
                  <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  <span className="flex-1">Input</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {stepMeta.input?.count ?? 0} papers
                  </span>
                  <Download className="w-4 h-4" />
                </a>
              </div>

              {/* AI Output */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                  AI Output
                </div>
                {['passed', 'excluded', 'uncertain'].map((outputName) => {
                  const count = stepMeta.outputs?.[outputName]?.count ?? 0;
                  const colorClass = outputName === 'passed'
                    ? 'text-[hsl(var(--status-success-fg))]'
                    : outputName === 'excluded'
                      ? 'text-[hsl(var(--status-danger-fg))]'
                      : 'text-[hsl(var(--status-warning-fg))]';
                  return (
                    <a
                      key={outputName}
                      href={stepsApi.downloadOutputUrl(projectId!, stepId!, outputName)}
                      download
                      className="flex items-center gap-2 px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
                    >
                      <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      <span className={`flex-1 capitalize ${colorClass}`}>{outputName}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {count} papers
                      </span>
                      <Download className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>

              {/* Human Output (only in human mode) */}
              {aiOutputMode === 'human' && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase">
                    Human Output
                  </div>
                  {['passed', 'excluded', 'uncertain'].map((baseName) => {
                    const outputName = `human_${baseName}`;
                    const count = stepMeta.outputs?.[outputName]?.count ?? 0;
                    const colorClass = baseName === 'passed'
                      ? 'text-[hsl(var(--status-success-fg))]'
                      : baseName === 'excluded'
                        ? 'text-[hsl(var(--status-danger-fg))]'
                        : 'text-[hsl(var(--status-warning-fg))]';
                    return (
                      <a
                        key={outputName}
                        href={stepsApi.downloadOutputUrl(projectId!, stepId!, outputName)}
                        download
                        className="flex items-center gap-2 px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
                      >
                        <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                        <span className={`flex-1 capitalize ${colorClass}`}>{baseName}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {count} papers
                        </span>
                        <Download className="w-4 h-4" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </details>
      )}

      {isCompleted && isAiScreening && aiOutputMode === 'human' && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <HumanReviewViewer
            projectId={projectId!}
            stepId={stepId!}
            stepMeta={stepMeta}
          />
        </div>
      )}

      {/* Paper list */}
      {isCompleted && (!isAiScreening || aiOutputMode === 'ai') && (
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
                <AlertTriangle className="w-6 h-6 text-[hsl(var(--status-warning-fg))]" />
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
