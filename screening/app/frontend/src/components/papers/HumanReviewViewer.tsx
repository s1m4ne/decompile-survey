/**
 * Human review viewer - dedicated UI for AI screening human decisions.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, ChevronDown, ChevronRight, ExternalLink, User } from 'lucide-react';
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

  const filteredEntries = useMemo(() => {
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

    if (!searchQuery) return result;
    const query = searchQuery.toLowerCase();
    return result.filter((entry) =>
      entry.title?.toLowerCase().includes(query)
      || entry.author?.toLowerCase().includes(query)
      || entry.ID?.toLowerCase().includes(query)
      || entry.doi?.toLowerCase().includes(query)
    );
  }, [activeTab, aiDecisionMap, entries, reviewDraft, searchQuery]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, searchQuery, entries.length]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount]
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
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search by title, author, key, or DOI..."
      />
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
                <th className="w-12 p-2 text-center">#</th>
                <th className="w-32 p-2">Key</th>
                <th className="p-2">Title</th>
                <th className="w-40 p-2">Authors</th>
                <th className="w-16 p-2 text-center">Year</th>
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
                                        className="px-3 py-1 rounded-full border border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))] text-xs hover:opacity-90"
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
                                      ? 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                                      : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] opacity-70 hover:opacity-100'
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
