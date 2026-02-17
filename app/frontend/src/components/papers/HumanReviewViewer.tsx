/**
 * Human review viewer - dedicated UI for AI screening human decisions.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, ChevronDown, ChevronRight, ExternalLink, User, PieChart, List } from 'lucide-react';
import { stepsApi, StepMeta } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { SearchFilter } from './SearchFilter';
import { normalizeBibtexText } from '../BibtexText';

const PAGE_SIZE = 50;

type ReviewDecision = 'include' | 'exclude' | 'uncertain';

type ReviewDraft = Record<string, { decision?: ReviewDecision }>;

type AiChange = {
  key: string;
  action?: string;
  reason?: string;
  details?: {
    decision?: string;
    confidence?: number;
    reasoning?: string;
    model?: string;
    tokens_used?: number;
    latency_ms?: number;
  };
};

type ReviewRecord = {
  key?: string;
  decision?: ReviewDecision;
};

type OutputTone = 'success' | 'warning' | 'danger';
type TabConfig = {
  id: string;
  label: string;
  count: number;
  icon?: ReactNode;
  tone?: OutputTone;
};
type TabGroup = {
  id: string;
  label: string;
  tabs: TabConfig[];
};

type DatabaseStat = {
  label: string;
  count: number;
  ratio: number;
};

export interface HumanReviewViewerProps {
  projectId: string;
  stepId: string;
  stepMeta: StepMeta;
}

export function HumanReviewViewer({ projectId, stepId, stepMeta }: HumanReviewViewerProps) {
  const queryClient = useQueryClient();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const [viewMode, setViewMode] = useState<'papers' | 'stats'>('papers');

  const { data: inputData } = useQuery({
    queryKey: ['step-input', projectId, stepId],
    queryFn: () => stepsApi.getInput(projectId, stepId),
    enabled: stepMeta.execution.status === 'completed',
  });

  const { data: reviewData } = useQuery({
    queryKey: ['step-review', projectId, stepId],
    queryFn: () => stepsApi.getReview(projectId, stepId),
    enabled: stepMeta.execution.status === 'completed',
  });

  const { data: aiChanges = [] } = useQuery({
    queryKey: ['step-changes-ai', projectId, stepId],
    queryFn: () => stepsApi.getAiChanges(projectId, stepId),
    enabled: stepMeta.execution.status === 'completed',
  });

  useEffect(() => {
    const next: ReviewDraft = {};
    (reviewData?.reviews as ReviewRecord[] | undefined)?.forEach((review) => {
      if (!review?.key || !review.decision) return;
      next[review.key] = { decision: review.decision };
    });
    setReviewDraft(next);
  }, [reviewData]);

  const updateReviewMutation = useMutation({
    mutationFn: (nextReviews: ReviewDraft) => {
      const payload = Object.entries(nextReviews).map(([key, value]) => ({
        key,
        decision: value.decision,
      }));
      return stepsApi.updateReview(projectId, stepId, payload);
    },
    onMutate: async (nextReviews) => {
      await queryClient.cancelQueries({ queryKey: ['step-review', projectId, stepId] });
      const previous = queryClient.getQueryData(['step-review', projectId, stepId]);
      queryClient.setQueryData(['step-review', projectId, stepId], {
        reviews: Object.entries(nextReviews).map(([key, value]) => ({
          key,
          decision: value.decision,
        })),
      });
      setReviewDraft(nextReviews);
      return { previous };
    },
    onError: (_error, _nextReviews, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['step-review', projectId, stepId], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['step', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-output', projectId, stepId] });
      queryClient.invalidateQueries({ queryKey: ['step-review', projectId, stepId] });
    },
  });

  const entries = (inputData?.entries ?? []) as {
    ID?: string;
    title?: string;
    author?: string;
    year?: string;
    doi?: string;
    abstract?: string;
    url?: string;
    URL?: string;
    publisher?: string;
    journal?: string;
    booktitle?: string;
    _source_file?: string;
    _source_database?: string;
    _database?: string;
    database?: string;
  }[];

  const aiDecisionMap = useMemo(() => {
    const map = new Map<string, AiChange>();
    (aiChanges as AiChange[]).forEach((change) => {
      if (!change?.key) return;
      map.set(change.key, change);
    });
    return map;
  }, [aiChanges]);

  const aiDecisionCounts = useMemo(() => {
    const counts = { include: 0, exclude: 0, uncertain: 0 };
    for (const entry of entries) {
      const decision = aiDecisionMap.get(entry.ID ?? '')?.details?.decision ?? 'uncertain';
      if (decision === 'include') counts.include += 1;
      else if (decision === 'exclude') counts.exclude += 1;
      else counts.uncertain += 1;
    }
    return counts;
  }, [aiDecisionMap, entries]);

  const humanDecisionCounts = useMemo(() => {
    const counts = { include: 0, exclude: 0, uncertain: 0 };
    Object.values(reviewDraft).forEach((review) => {
      if (review.decision === 'include') counts.include += 1;
      else if (review.decision === 'exclude') counts.exclude += 1;
      else if (review.decision === 'uncertain') counts.uncertain += 1;
    });
    return counts;
  }, [reviewDraft]);

  const tabGroups = useMemo<TabGroup[]>(() => ([
    {
      id: 'all',
      label: '',
      tabs: [
        { id: 'all', label: 'All', count: entries.length },
      ],
    },
    {
      id: 'passed',
      label: 'Passed',
      tabs: [
        { id: 'ai_passed', label: 'AI', count: aiDecisionCounts.include, tone: 'success', icon: <Brain className="w-4 h-4" /> },
        { id: 'human_passed', label: 'Human', count: humanDecisionCounts.include, tone: 'success', icon: <User className="w-4 h-4" /> },
      ],
    },
    {
      id: 'excluded',
      label: 'Excluded',
      tabs: [
        { id: 'ai_excluded', label: 'AI', count: aiDecisionCounts.exclude, tone: 'danger', icon: <Brain className="w-4 h-4" /> },
        { id: 'human_excluded', label: 'Human', count: humanDecisionCounts.exclude, tone: 'danger', icon: <User className="w-4 h-4" /> },
      ],
    },
    {
      id: 'uncertain',
      label: 'Uncertain',
      tabs: [
        { id: 'ai_uncertain', label: 'AI', count: aiDecisionCounts.uncertain, tone: 'warning', icon: <Brain className="w-4 h-4" /> },
        { id: 'human_uncertain', label: 'Human', count: humanDecisionCounts.uncertain, tone: 'warning', icon: <User className="w-4 h-4" /> },
      ],
    },
  ]), [aiDecisionCounts, entries.length, humanDecisionCounts]);

  const tabEntries = useMemo(() => {
    let result = entries;
    if (activeTab !== 'all') {
      result = result.filter((entry) => {
        const key = entry.ID ?? '';
        if (activeTab === 'ai_passed') return aiDecisionMap.get(key)?.details?.decision === 'include';
        if (activeTab === 'ai_excluded') return aiDecisionMap.get(key)?.details?.decision === 'exclude';
        if (activeTab === 'ai_uncertain') return (aiDecisionMap.get(key)?.details?.decision ?? 'uncertain') === 'uncertain';
        if (activeTab === 'human_passed') return reviewDraft[key]?.decision === 'include';
        if (activeTab === 'human_excluded') return reviewDraft[key]?.decision === 'exclude';
        if (activeTab === 'human_uncertain') return reviewDraft[key]?.decision === 'uncertain';
        return true;
      });
    }
    return result;
  }, [activeTab, aiDecisionMap, entries, reviewDraft]);

  const filteredEntries = useMemo(() => {
    let result = tabEntries;
    if (!searchQuery) return result;
    const query = searchQuery.toLowerCase();
    return result.filter((entry) =>
      entry.title?.toLowerCase().includes(query)
      || entry.author?.toLowerCase().includes(query)
      || entry.ID?.toLowerCase().includes(query)
      || entry.doi?.toLowerCase().includes(query)
    );
  }, [tabEntries, searchQuery]);

  const databaseStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of tabEntries) {
      const label = inferDatabaseLabel(entry);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const total = tabEntries.length || 1;
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, ratio: count / total }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [tabEntries]);
  const topDatabaseStats = useMemo(() => {
    const maxSlices = 6;
    if (databaseStats.length <= maxSlices) return databaseStats;
    const top = databaseStats.slice(0, maxSlices - 1);
    const otherCount = databaseStats.slice(maxSlices - 1).reduce((sum, item) => sum + item.count, 0);
    const total = tabEntries.length || 1;
    return [...top, { label: 'Other', count: otherCount, ratio: otherCount / total }];
  }, [databaseStats, tabEntries.length]);
  const doiStats = useMemo(() => {
    const doiValues = tabEntries
      .map((entry) => String(entry.doi ?? '').trim().toLowerCase())
      .filter((value) => value.length > 0);
    const uniqueDoiCount = new Set(doiValues).size;
    const withDoiCount = doiValues.length;
    return {
      withDoiCount,
      withoutDoiCount: tabEntries.length - withDoiCount,
      uniqueDoiCount,
      duplicateDoiEntryCount: Math.max(0, withDoiCount - uniqueDoiCount),
    };
  }, [tabEntries]);
  const yearStats = useMemo(() => {
    const years = tabEntries
      .map((entry) => parseYear(entry.year))
      .filter((year): year is number => year !== null);
    if (years.length === 0) {
      return { min: null, max: null, median: null };
    }
    const sorted = [...years].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median,
    };
  }, [tabEntries]);
  const humanJudgedCount = useMemo(
    () => tabEntries.filter((entry) => Boolean(reviewDraft[entry.ID ?? '']?.decision)).length,
    [tabEntries, reviewDraft]
  );
  const aiHumanMatchCount = useMemo(() => {
    let matched = 0;
    for (const entry of tabEntries) {
      const key = entry.ID ?? '';
      if (!key) continue;
      const aiDecision = aiDecisionMap.get(key)?.details?.decision;
      const humanDecision = reviewDraft[key]?.decision;
      if (!aiDecision || !humanDecision) continue;
      if (aiDecision === humanDecision) {
        matched += 1;
      }
    }
    return matched;
  }, [aiDecisionMap, reviewDraft, tabEntries]);
  const tabInfo = useMemo(
    () => tabGroups.flatMap((group) => group.tabs).find((tab) => tab.id === activeTab),
    [tabGroups, activeTab]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, searchQuery, tabEntries.length]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount]
  );
  const filteredKeys = useMemo(
    () => filteredEntries.map((entry) => entry.ID ?? '').filter(Boolean),
    [filteredEntries]
  );
  const selectedFilteredCount = useMemo(
    () => filteredKeys.filter((key) => selectedKeys.has(key)).length,
    [selectedKeys, filteredKeys]
  );

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredEntries.length));
      },
      { rootMargin: '200px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredEntries.length, visibleCount]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [activeTab, searchQuery]);
  useEffect(() => {
    setViewMode('papers');
  }, [stepId]);

  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const key of prev) {
        if (filteredKeys.includes(key)) {
          next.add(key);
        }
      }
      return next;
    });
  }, [filteredKeys]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedFilteredCount > 0 && selectedFilteredCount < filteredKeys.length;
  }, [selectedFilteredCount, filteredKeys.length]);

  const setReviewDecision = (key: string, decision?: ReviewDecision) => {
    setReviewDraft((prev) => {
      const next = { ...prev };
      if (decision) {
        next[key] = { decision };
      } else {
        delete next[key];
      }
      updateReviewMutation.mutate(next);
      return next;
    });
  };

  const applyBulkDecision = (action: 'keep' | 'remove' | 'uncertain' | 'approve_ai' | 'clear') => {
    if (selectedKeys.size === 0) return;
    const next = { ...reviewDraft };
    const applyKeys = [...selectedKeys];
    let hasOverwrite = false;

    for (const key of applyKeys) {
      const existing = next[key]?.decision;
      let decision: ReviewDecision | undefined;
      if (action === 'approve_ai') {
        const aiDecision = aiDecisionMap.get(key)?.details?.decision;
        if (aiDecision === 'include') decision = 'include';
        else if (aiDecision === 'exclude') decision = 'exclude';
        else if (aiDecision === 'uncertain') decision = 'uncertain';
        else continue;
      } else if (action === 'clear') {
        decision = undefined;
      } else if (action === 'keep') {
        decision = 'include';
      } else if (action === 'remove') {
        decision = 'exclude';
      } else {
        decision = 'uncertain';
      }

      if ((existing && decision && existing !== decision) || (existing && decision === undefined)) {
        hasOverwrite = true;
      }
    }

    if (hasOverwrite && !window.confirm('Some papers already have decisions. Overwrite them?')) {
      return;
    }

    for (const key of applyKeys) {
      let decision: ReviewDecision | undefined;
      if (action === 'approve_ai') {
        const aiDecision = aiDecisionMap.get(key)?.details?.decision;
        if (aiDecision === 'include') decision = 'include';
        else if (aiDecision === 'exclude') decision = 'exclude';
        else if (aiDecision === 'uncertain') decision = 'uncertain';
        else continue;
      } else if (action === 'clear') {
        decision = undefined;
      } else if (action === 'keep') {
        decision = 'include';
      } else if (action === 'remove') {
        decision = 'exclude';
      } else {
        decision = 'uncertain';
      }

      if (decision) {
        next[key] = { decision };
      } else {
        delete next[key];
      }
    }

    updateReviewMutation.mutate(next);
    setReviewDraft(next);
  };

  const toggleRowSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const shouldSelectAll = selectedFilteredCount !== filteredKeys.length;
      if (shouldSelectAll) {
        for (const key of filteredKeys) {
          next.add(key);
        }
      } else {
        for (const key of filteredKeys) {
          next.delete(key);
        }
      }
      return next;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAllVisible = () => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      for (const entry of visibleEntries) {
        const key = entry.ID ?? '';
        if (key) next.add(key);
      }
      return next;
    });
  };

  const collapseAll = () => {
    setExpandedRows(new Set());
  };

  const renderDecisionBadge = (decision?: string) => {
    if (!decision) return '-';
    if (decision === 'include') return <Badge variant="success">Keep</Badge>;
    if (decision === 'exclude') return <Badge variant="destructive">Remove</Badge>;
    return <Badge variant="warning">Uncertain</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-6 border-b border-[hsl(var(--border))]">
        {tabGroups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            {group.label && (
              <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase px-1">
                {group.label}
              </div>
            )}
            <div className="flex items-center gap-1">
              {group.tabs.map((tab) => {
                const toneClasses = getToneClasses(tab.tone ?? null);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors rounded-t-md',
                      activeTab === tab.id
                        ? 'border-[hsl(var(--primary))] text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]'
                        : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'
                    )}
                  >
                    {tab.icon}
                    <span className={toneClasses.label}>{tab.label}</span>
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full',
                        tab.tone
                          ? toneClasses.badge
                          : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-gradient-to-r from-[hsl(var(--card))] to-[hsl(var(--muted))] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-wide uppercase text-[hsl(var(--muted-foreground))]">
            Display Mode
          </div>
          <div className="text-sm">
            <span className="font-semibold text-[hsl(var(--foreground))]">
              {tabInfo?.label ?? activeTab}
            </span>
            <span className="ml-2 text-[hsl(var(--muted-foreground))]">
              {tabEntries.length} papers
            </span>
          </div>
        </div>
        <div className="relative grid w-full grid-cols-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-1 shadow-sm sm:w-auto">
          <span
            aria-hidden
            className={cn(
              'absolute left-1 top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm transition-transform duration-200 ease-out',
              viewMode === 'papers' ? 'translate-x-0' : 'translate-x-full'
            )}
          />
          <button
            type="button"
            onClick={() => setViewMode('papers')}
            aria-pressed={viewMode === 'papers'}
            className={cn(
              'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2',
              viewMode === 'papers'
                ? 'text-[hsl(var(--foreground))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            )}
          >
            <List className="w-3.5 h-3.5" />
            Papers
          </button>
          <button
            type="button"
            onClick={() => setViewMode('stats')}
            aria-pressed={viewMode === 'stats'}
            className={cn(
              'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2',
              viewMode === 'stats'
                ? 'text-[hsl(var(--foreground))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            )}
          >
            <PieChart className="w-3.5 h-3.5" />
            Stats
          </button>
        </div>
      </div>

      {viewMode === 'papers' && (
        <SearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder="Search by title, author, key, or DOI..."
        />
      )}

      {viewMode === 'stats' && (
        tabEntries.length === 0 ? (
          <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
            No statistics available for this tab.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total Papers" value={tabEntries.length} />
              <StatCard label="With DOI" value={doiStats.withDoiCount} />
              <StatCard label="Unique DOI" value={doiStats.uniqueDoiCount} />
              <StatCard label="Duplicate DOI Entries" value={doiStats.duplicateDoiEntryCount} />
              <StatCard label="Without DOI" value={doiStats.withoutDoiCount} />
              <StatCard label="Databases" value={databaseStats.length} />
              <StatCard label="Human Judged" value={humanJudgedCount} />
              <StatCard label="AI/Human Match" value={aiHumanMatchCount} />
              <StatCard
                label="Year Range"
                value={yearStats.min !== null && yearStats.max !== null ? `${yearStats.min}-${yearStats.max}` : '-'}
              />
              <StatCard
                label="Median Year"
                value={yearStats.median !== null ? yearStats.median : '-'}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <div className="text-sm font-medium text-[hsl(var(--card-foreground))] mb-3">
                  Database Breakdown
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <DatabaseDonutChart stats={topDatabaseStats} total={tabEntries.length} />
                  <div className="flex-1 space-y-2">
                    {topDatabaseStats.map((item, index) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <span className="text-[hsl(var(--muted-foreground))]">
                          {item.count} ({(item.ratio * 100).toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <div className="text-sm font-medium text-[hsl(var(--card-foreground))] mb-3">
                  Top Databases
                </div>
                <div className="space-y-2">
                  {databaseStats.slice(0, 8).map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{item.label}</span>
                        <span className="text-[hsl(var(--muted-foreground))]">
                          {item.count} papers
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                        <div
                          className="h-full bg-[hsl(var(--primary))]"
                          style={{ width: `${Math.max(4, item.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {viewMode === 'papers' && (
        <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={expandAllVisible}
          className="px-3 py-1.5 text-xs border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
        >
          Expand details
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="px-3 py-1.5 text-xs border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
        >
          Collapse details
        </button>
      </div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border border-[hsl(var(--border))] rounded-md px-3 py-2 bg-[hsl(var(--background))]">
        <div className="flex items-center gap-2 text-sm">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={filteredKeys.length > 0 && selectedFilteredCount === filteredKeys.length}
            onChange={toggleSelectAllVisible}
            className="h-4 w-4"
          />
          <span>
            Selected {selectedFilteredCount} / {filteredKeys.length}
          </span>
        </div>
        <div className="h-4 w-px bg-[hsl(var(--border))]" />
        <button
          type="button"
          onClick={() => applyBulkDecision('keep')}
          className="px-3 py-1.5 text-xs border border-[hsl(var(--status-success-border))] bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))] rounded-md hover:opacity-90"
          disabled={selectedFilteredCount === 0}
        >
          Keep
        </button>
        <button
          type="button"
          onClick={() => applyBulkDecision('remove')}
          className="px-3 py-1.5 text-xs border border-[hsl(var(--status-danger-border))] bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))] rounded-md hover:opacity-90"
          disabled={selectedFilteredCount === 0}
        >
          Remove
        </button>
        <button
          type="button"
          onClick={() => applyBulkDecision('uncertain')}
          className="px-3 py-1.5 text-xs border border-[hsl(var(--status-warning-border))] bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] rounded-md hover:opacity-90"
          disabled={selectedFilteredCount === 0}
        >
          Uncertain
        </button>
        <button
          type="button"
          onClick={() => applyBulkDecision('approve_ai')}
          className="px-3 py-1.5 text-xs border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-md hover:opacity-90"
          disabled={selectedFilteredCount === 0}
        >
          Approve AI decision
        </button>
        <button
          type="button"
          onClick={() => applyBulkDecision('clear')}
          className="px-3 py-1.5 text-xs border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] rounded-md hover:opacity-90"
          disabled={selectedFilteredCount === 0}
        >
          Clear Selection
        </button>
      </div>

      {visibleEntries.length === 0 && (
        <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
          {searchQuery ? 'No papers match your search criteria' : 'No papers to review'}
        </div>
      )}

      {visibleEntries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[hsl(var(--border))]">
              <tr className="text-left text-[hsl(var(--muted-foreground))]">
                <th className="w-8 p-2"></th>
                <th className="w-10 p-2 text-center">
                  <input
                    type="checkbox"
                    checked={filteredKeys.length > 0 && selectedFilteredCount === filteredKeys.length}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4"
                  />
                </th>
                <th className="w-12 p-2 text-center">#</th>
                <th className="w-32 p-2">Key</th>
                <th className="p-2">Title</th>
                <th className="w-40 p-2">Authors</th>
                <th className="w-16 p-2 text-center">Year</th>
                <th className="w-28 p-2 text-center">Database</th>
                <th className="w-32 p-2 text-center">AI Decision</th>
                <th className="w-32 p-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry, index) => {
                const key = entry.ID ?? '';
                const aiChange = aiDecisionMap.get(key);
                const aiDetails = aiChange?.details;
                const aiDecision = aiDetails?.decision;
                const humanDecision = reviewDraft[key]?.decision;
                const isExpanded = expandedRows.has(key);
                return (
                  <Fragment key={key || index}>
                    <tr
                      className={cn(
                        'border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
                        isExpanded && 'bg-[hsl(var(--muted))]'
                      )}
                    >
                      <td className="p-2">
                        <button
                          onClick={() => toggleExpand(key)}
                          className="p-1 hover:bg-[hsl(var(--muted))] rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          onChange={() => toggleRowSelection(key)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="p-2 text-center text-[hsl(var(--muted-foreground))]">
                        {index + 1}
                      </td>
                      <td className="p-2">
                        <code className="text-xs bg-[hsl(var(--muted))] px-1 py-0.5 rounded">
                          {key || '-'}
                        </code>
                      </td>
                      <td className="p-2">
                        <span className="line-clamp-2" title={normalizeBibtexText(entry.title) || ''}>
                          {normalizeBibtexText(entry.title) || '(No title)'}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className="line-clamp-1 text-sm text-[hsl(var(--muted-foreground))]" title={entry.author}>
                          {entry.author ? formatAuthors(entry.author) : '-'}
                        </span>
                      </td>
                      <td className="p-2 text-center">{entry.year || '-'}</td>
                      <td className="p-2 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          {inferDatabaseLabel(entry)}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        {renderDecisionBadge(aiDecision)}
                      </td>
                      <td className="p-2 text-center">
                        {renderDecisionBadge(humanDecision)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-[hsl(var(--muted))]">
                        <td colSpan={100} className="p-4">
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium text-lg">
                                {normalizeBibtexText(entry.title) || '(No title)'}
                              </h4>
                              <p className="text-[hsl(var(--muted-foreground))]">{entry.author}</p>
                              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                                {entry.year}
                              </p>
                            </div>

                            {entry.doi && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">DOI:</span>
                                <a
                                  href={entry.doi.startsWith('http') ? entry.doi : `https://doi.org/${entry.doi}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-[hsl(var(--status-info))] hover:underline flex items-center gap-1"
                                >
                                  {entry.doi.startsWith('http') ? entry.doi : `https://doi.org/${entry.doi}`}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}

                            {entry.abstract && (
                              <div>
                                <h5 className="font-medium text-sm mb-1">Abstract</h5>
                                <p className="text-sm text-[hsl(var(--muted-foreground))] whitespace-pre-wrap">
                                  {normalizeBibtexText(entry.abstract)}
                                </p>
                              </div>
                            )}

                            <div className="border-t border-[hsl(var(--border))] pt-4 space-y-2">
                              {aiChange && (
                                <div className="space-y-2">
                                  <h5 className="font-medium text-sm">AI decision</h5>
                                  <div className="flex items-center gap-4">
                                    {getActionBadge(aiChange.action)}
                                    {aiDecision && (
                                      <button
                                        type="button"
                                        onClick={() => setReviewDecision(key, aiDecision as ReviewDecision)}
                                        className="px-3 py-1 rounded-full border transition-colors border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]"
                                      >
                                        Approve AI decision
                                      </button>
                                    )}
                                  </div>
                                  {aiChange.details && Object.keys(aiChange.details).length > 0 && (
                                    <pre className="mt-2 text-xs bg-[hsl(var(--background))] p-2 rounded overflow-x-auto">
                                      {JSON.stringify(aiChange.details, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              )}
                              <div className="text-sm font-semibold">Select keep/remove/uncertain</div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setReviewDecision(key, 'include')}
                                  className={cn(
                                    'px-3 py-1 rounded-full border transition-colors',
                                    humanDecision === 'include'
                                      ? 'border-[hsl(var(--status-success-border))] bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]'
                                      : 'border-[hsl(var(--status-success-border))] bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))] opacity-60 hover:opacity-100'
                                  )}
                                >
                                  Choose Keep
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReviewDecision(key, 'exclude')}
                                  className={cn(
                                    'px-3 py-1 rounded-full border transition-colors',
                                    humanDecision === 'exclude'
                                      ? 'border-[hsl(var(--status-danger-border))] bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))]'
                                      : 'border-[hsl(var(--status-danger-border))] bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))] opacity-60 hover:opacity-100'
                                  )}
                                >
                                  Choose Remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReviewDecision(key, 'uncertain')}
                                  className={cn(
                                    'px-3 py-1 rounded-full border transition-colors',
                                    humanDecision === 'uncertain'
                                      ? 'border-[hsl(var(--status-warning-border))] bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]'
                                      : 'border-[hsl(var(--status-warning-border))] bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] opacity-60 hover:opacity-100'
                                  )}
                                >
                                  Choose Uncertain
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReviewDecision(key, undefined)}
                                  className={cn(
                                    'px-3 py-1 rounded-full border transition-colors',
                                    !humanDecision
                                      ? 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]'
                                      : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] opacity-70 hover:opacity-100 hover:bg-[hsl(var(--background))]'
                                  )}
                                >
                                  Clear Selection
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {visibleCount < filteredEntries.length && (
            <div ref={sentinelRef} className="h-8" />
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function formatAuthors(authors: string): string {
  const parts = authors.split(' and ');
  if (parts.length <= 2) {
    return authors;
  }
  return `${parts[0]} et al.`;
}

function getActionBadge(action?: string) {
  switch (action) {
    case 'keep':
      return <Badge variant="success">Keep</Badge>;
    case 'remove':
      return <Badge variant="destructive">Remove</Badge>;
    case 'modify':
      return <Badge variant="warning">Modify</Badge>;
    case undefined:
    case '':
      return <Badge variant="outline">-</Badge>;
    default:
      return <Badge variant="outline">{action}</Badge>;
  }
}

function getToneClasses(tone: OutputTone | null): { label: string; badge: string } {
  if (!tone) {
    return { label: '', badge: '' };
  }
  const base = `--status-${tone}`;
  return {
    label: `text-[hsl(var(${base}-fg))]`,
    badge: `border border-[hsl(var(${base}-border))] bg-[hsl(var(${base}-bg))] text-[hsl(var(${base}-fg))]`,
  };
}

const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

function parseYear(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  const matched = text.match(/\b(19|20)\d{2}\b/);
  if (!matched) return null;
  return Number(matched[0]);
}

function normalizeDatabaseToken(raw: string): string {
  const token = raw.trim().toLowerCase();
  if (!token) return '';
  const compact = token.replace(/[^a-z0-9]/g, '');
  if (compact.includes('webofscience') || compact === 'wos') return 'wos';
  if (compact.includes('ieee') || compact.includes('xplore')) return 'ieee';
  if (compact.includes('acm')) return 'acm';
  if (compact.includes('arxiv')) return 'arxiv';
  if (compact.includes('springer')) return 'springer';
  if (compact.includes('scopus')) return 'scopus';
  if (compact.includes('pubmed') || compact.includes('medline')) return 'pubmed';
  if (compact.includes('sciencedirect') || compact.includes('elsevier')) return 'sciencedirect';
  return compact;
}

function formatDatabaseToken(token: string): string {
  switch (token) {
    case 'acm':
      return 'ACM';
    case 'ieee':
      return 'IEEE';
    case 'wos':
      return 'WoS';
    case 'arxiv':
      return 'arXiv';
    case 'springer':
      return 'Springer';
    case 'scopus':
      return 'Scopus';
    case 'pubmed':
      return 'PubMed';
    case 'sciencedirect':
      return 'ScienceDirect';
    default:
      return token ? token.toUpperCase() : 'Unknown';
  }
}

function inferDatabaseLabel(entry: {
  _source_database?: unknown;
  _database?: unknown;
  database?: unknown;
  doi?: unknown;
  url?: unknown;
  URL?: unknown;
  publisher?: unknown;
  journal?: unknown;
  booktitle?: unknown;
}): string {
  const candidates = [
    entry._source_database,
    entry._database,
    entry.database,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeDatabaseToken(String(candidate ?? ''));
    if (normalized) return formatDatabaseToken(normalized);
  }

  const doi = String(entry.doi ?? '').trim().toLowerCase();
  if (doi.startsWith('10.1145/')) return 'ACM';
  if (doi.startsWith('10.1109/')) return 'IEEE';
  if (doi.startsWith('10.48550/arxiv.')) return 'arXiv';

  const sourceUrl = String(entry.url ?? entry.URL ?? '').trim().toLowerCase();
  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).host;
      if (host.includes('dl.acm.org')) return 'ACM';
      if (host.includes('ieeexplore.ieee.org')) return 'IEEE';
      if (host.includes('arxiv.org')) return 'arXiv';
      if (host.includes('webofscience.com')) return 'WoS';
      if (host.includes('link.springer.com')) return 'Springer';
      if (host.includes('sciencedirect.com')) return 'ScienceDirect';
    } catch {
      // Keep fallback flow.
    }
  }

  const publisherText = String(entry.publisher ?? entry.journal ?? entry.booktitle ?? '').trim();
  const normalized = normalizeDatabaseToken(publisherText);
  return normalized ? formatDatabaseToken(normalized) : 'Unknown';
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
      <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="text-lg font-semibold text-[hsl(var(--card-foreground))]">{value}</div>
    </div>
  );
}

function DatabaseDonutChart({ stats, total }: { stats: DatabaseStat[]; total: number }) {
  const radius = 42;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <svg viewBox="0 0 120 120" className="w-36 h-36 shrink-0">
      <g transform="translate(60 60)">
        <circle r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        {stats.map((item, index) => {
          const fraction = total > 0 ? item.count / total : 0;
          const dash = fraction * circumference;
          const offset = -cumulative * circumference;
          cumulative += fraction;
          return (
            <circle
              key={item.label}
              r={radius}
              fill="none"
              stroke={PIE_COLORS[index % PIE_COLORS.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
              strokeDashoffset={offset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            />
          );
        })}
        <circle r={radius - strokeWidth / 2 - 1} fill="hsl(var(--card))" />
        <text x="0" y="-2" textAnchor="middle" className="fill-current text-[9px] text-[hsl(var(--muted-foreground))]">
          Total
        </text>
        <text x="0" y="14" textAnchor="middle" className="fill-current text-sm font-semibold text-[hsl(var(--foreground))]">
          {total}
        </text>
      </g>
    </svg>
  );
}
