/**
 * Step output viewer - displays papers from step inputs/outputs with tabs.
 */
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileInput, FileOutput, PieChart, List } from 'lucide-react';
import { cn } from '../../lib/utils';
import { stepsApi, StepMeta } from '../../lib/api';
import { PaperTable, BibEntry, ChangeRecord, ColumnDefinition } from './PaperTable';
import { SearchFilter } from './SearchFilter';
import { Pagination } from './Pagination';

export interface StepOutputViewerProps {
  projectId: string;
  stepId: string;
  stepMeta: StepMeta;
  changes: ChangeRecord[];
  actionCounts: { keep: number; remove: number; modify: number };
  decisionCounts?: { include: number; exclude: number; uncertain: number };
  countSource?: 'action' | 'decision' | 'output';
  outputNameResolver?: (outputName: string) => string;
  tabs?: TabConfig[];
  tabGroups?: TabGroup[];
  includeInputTab?: boolean;
  columns?: ColumnDefinition<BibEntry>[];
}

type TabType = 'input' | string; // 'input' or output name
type OutputTone = 'success' | 'warning' | 'danger';
type TabConfig = {
  id: TabType;
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

export function StepOutputViewer({
  projectId,
  stepId,
  stepMeta,
  changes,
  actionCounts,
  decisionCounts,
  countSource = 'action',
  outputNameResolver,
  tabs,
  tabGroups,
  includeInputTab = true,
  columns,
}: StepOutputViewerProps) {
  const outputNames = useMemo(() => Object.keys(stepMeta.outputs), [stepMeta.outputs]);

  const defaultTabs = useMemo(() => {
    const nextTabs: TabConfig[] = [];
    if (includeInputTab && stepMeta.input) {
      nextTabs.push({
        id: 'input',
        label: 'Input',
        count: stepMeta.input.count,
        icon: <FileInput className="w-4 h-4" />,
      });
    }

    Object.entries(stepMeta.outputs).forEach(([name, output]) => {
      const actionCount = countSource === 'action' ? getOutputActionCount(name, actionCounts) : null;
      const decisionCount = countSource === 'decision'
        ? getDecisionCount(name, decisionCounts)
        : null;
      nextTabs.push({
        id: name,
        label: formatOutputName(name),
        count: decisionCount ?? actionCount ?? output.count,
        icon: <FileOutput className="w-4 h-4" />,
      });
    });

    return nextTabs;
  }, [actionCounts, countSource, decisionCounts, includeInputTab, outputNames, stepMeta.input, stepMeta.outputs]);

  const availableTabs = useMemo(() => {
    if (tabGroups) {
      return tabGroups.flatMap((group) => group.tabs);
    }
    if (tabs) {
      return tabs;
    }
    return defaultTabs;
  }, [defaultTabs, tabGroups, tabs]);

  const defaultOutputTab = availableTabs[0]?.id ?? (outputNames.includes('passed') ? 'passed' : outputNames[0] || 'input');

  // Active tab (input or output name)
  const [activeTab, setActiveTab] = useState<TabType>(defaultOutputTab);
  const [viewMode, setViewMode] = useState<'papers' | 'stats'>('papers');
  const supportsStatsView = true;

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(defaultOutputTab);
    }
  }, [activeTab, availableTabs, defaultOutputTab, stepId]);
  useEffect(() => {
    setViewMode('papers');
  }, [stepId]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');

  const resolvedOutputName = useMemo(() => {
    if (activeTab === 'input') return 'input';
    return outputNameResolver ? outputNameResolver(String(activeTab)) : String(activeTab);
  }, [activeTab, outputNameResolver]);

  // Fetch output entries for active tab
  const { data: outputData, isLoading } = useQuery({
    queryKey: ['step-output', projectId, stepId, resolvedOutputName],
    queryFn: async () => {
      try {
        const result = await stepsApi.getOutput(projectId, stepId, resolvedOutputName);
        return result as { entries: BibEntry[]; count: number };
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('Output not found')) {
          return { entries: [], count: 0 };
        }
        throw error;
      }
    },
    enabled: activeTab !== 'input' && stepMeta.execution.status === 'completed',
  });
  const { data: inputData, isLoading: isInputLoading } = useQuery({
    queryKey: ['step-input', projectId, stepId],
    queryFn: async () => {
      const result = await stepsApi.getInput(projectId, stepId);
      return result as { entries: BibEntry[]; count: number };
    },
    enabled: activeTab === 'input' && stepMeta.execution.status === 'completed',
  });

  const entries = (activeTab === 'input'
    ? inputData?.entries || []
    : outputData?.entries || []) as BibEntry[];
  const isLoadingTab = activeTab === 'input' ? isInputLoading : isLoading;

  // Filter changes to match current entries (handles duplicate keys in changes)
  // When multiple changes exist for the same key, prefer the one matching the current output
  const filteredChanges = useMemo(() => {
    const entryIds = new Set(entries.map((e) => e.ID));
    const changesByKey = new Map<string, ChangeRecord[]>();

    // Group changes by key
    for (const change of changes) {
      const existing = changesByKey.get(change.key) ?? [];
      existing.push(change);
      changesByKey.set(change.key, existing);
    }

    // For each key in entries, pick the best matching change
    const result: ChangeRecord[] = [];
    for (const [key, keyChanges] of changesByKey) {
      if (!entryIds.has(key)) {
        // Include non-matching changes as-is
        result.push(keyChanges[0]);
        continue;
      }
      // If entry is in this output, prefer action matching the output type
      const tabLower = String(activeTab).toLowerCase();
      const preferKeep = tabLower === 'passed' || tabLower === 'uncertain';
      const preferRemove = tabLower === 'removed' || tabLower === 'excluded';

      const keepChange = keyChanges.find((c) => c.action === 'keep');
      const removeChange = keyChanges.find((c) => c.action === 'remove');

      if (preferKeep && keepChange) {
        result.push(keepChange);
      } else if (preferRemove && removeChange) {
        result.push(removeChange);
      } else {
        // Fallback to first change
        result.push(keyChanges[0]);
      }
    }
    return result;
  }, [changes, entries, activeTab]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (entry) =>
          entry.title?.toLowerCase().includes(query) ||
          entry.author?.toLowerCase().includes(query) ||
          entry.ID?.toLowerCase().includes(query) ||
          entry.doi?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [entries, searchQuery]);

  // Paginate entries
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const hasSourceInfo = useMemo(
    () => entries.some((entry) => Boolean(entry._source_file)),
    [entries]
  );
  const tabInfo = availableTabs.find((tab) => tab.id === activeTab);
  const databaseStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const label = inferDatabaseLabel(entry);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const total = entries.length || 1;
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, ratio: count / total }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [entries]);
  const topDatabaseStats = useMemo(() => {
    const maxSlices = 6;
    if (databaseStats.length <= maxSlices) return databaseStats;
    const top = databaseStats.slice(0, maxSlices - 1);
    const otherCount = databaseStats.slice(maxSlices - 1).reduce((sum, item) => sum + item.count, 0);
    const total = entries.length || 1;
    return [...top, { label: 'Other', count: otherCount, ratio: otherCount / total }];
  }, [databaseStats, entries.length]);
  const doiStats = useMemo(() => {
    const doiValues = entries
      .map((entry) => String(entry.doi || '').trim().toLowerCase())
      .filter((value) => value.length > 0);
    const uniqueDoiCount = new Set(doiValues).size;
    const withDoiCount = doiValues.length;
    return {
      withDoiCount,
      withoutDoiCount: entries.length - withDoiCount,
      uniqueDoiCount,
      duplicateDoiEntryCount: Math.max(0, withDoiCount - uniqueDoiCount),
    };
  }, [entries]);
  const yearStats = useMemo(() => {
    const years = entries
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
  }, [entries]);
  const tableColumns = useMemo(() => {
    if (!columns) return columns;

    if (!supportsStatsView) {
      if (!hasSourceInfo || activeTab !== 'input' || columns.some((col) => col.id === 'source')) {
        return columns;
      }
      return [
        ...columns,
        {
          id: 'source',
          header: 'Source',
          width: 'w-40',
          render: (entry: BibEntry) => (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {String((entry as BibEntry & { _source_file?: string })._source_file || '-')}
            </span>
          ),
        },
      ] as ColumnDefinition<BibEntry>[];
    }

    const nextColumns: ColumnDefinition<BibEntry>[] = [...columns];
    if (supportsStatsView && !nextColumns.some((col) => col.id === 'database')) {
      nextColumns.push({
        id: 'database',
        header: 'Database',
        width: 'w-28',
        render: (entry: BibEntry) => {
          const db = inferDatabaseLabel(entry);
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
              {db}
            </span>
          );
        },
      });
    }

    if (hasSourceInfo && !nextColumns.some((col) => col.id === 'source')) {
      nextColumns.push({
        id: 'source',
        header: 'Source',
        width: 'w-40',
        render: (entry: BibEntry) => (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {String((entry as BibEntry & { _source_file?: string })._source_file || '-')}
          </span>
        ),
      });
    }
    return nextColumns;
  }, [columns, hasSourceInfo, supportsStatsView, activeTab]);

  // Reset page when filters change
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      {tabGroups ? (
        <div className="flex items-end gap-6 border-b border-[hsl(var(--border))]">
          {tabGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase px-1">
                {group.label}
              </div>
              <div className="flex items-center gap-1">
                {group.tabs.map((tab) => {
                  const tone = tab.tone ?? getOutputTone(String(tab.id));
                  const toneClasses = getToneClasses(tone);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setCurrentPage(1);
                      }}
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
                          tone
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
      ) : (
        <div className="flex items-center gap-1 border-b border-[hsl(var(--border))]">
          {availableTabs.map((tab) => {
            const tone = tab.tone ?? getOutputTone(String(tab.id));
            const toneClasses = getToneClasses(tone);
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
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
                    tone
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
      )}

      {supportsStatsView && (
        <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-gradient-to-r from-[hsl(var(--card))] to-[hsl(var(--muted))] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-medium tracking-wide uppercase text-[hsl(var(--muted-foreground))]">
              Display Mode
            </div>
            <div className="text-sm">
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {tabInfo?.label ?? String(activeTab)}
              </span>
              <span className="ml-2 text-[hsl(var(--muted-foreground))]">
                {entries.length} papers
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
      )}

      {/* Search and filters */}
      {(viewMode === 'papers' || !supportsStatsView) && (
        <SearchFilter
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          placeholder="Search by title, author, key, or DOI..."
        />
      )}

      {/* Loading state */}
      {isLoadingTab && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      )}

      {/* Stats view */}
      {!isLoadingTab && supportsStatsView && viewMode === 'stats' && (
        entries.length === 0 ? (
          <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
            No statistics available for this tab.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total Papers" value={entries.length} />
              <StatCard label="With DOI" value={doiStats.withDoiCount} />
              <StatCard label="Unique DOI" value={doiStats.uniqueDoiCount} />
              <StatCard label="Duplicate DOI Entries" value={doiStats.duplicateDoiEntryCount} />
              <StatCard label="Without DOI" value={doiStats.withoutDoiCount} />
              <StatCard label="Databases" value={databaseStats.length} />
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
                  <DatabaseDonutChart stats={topDatabaseStats} total={entries.length} />
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

      {/* Input tab placeholder */}
      {viewMode === 'papers' && activeTab === 'input' && !isLoadingTab && entries.length === 0 && (
        <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
          Input not available for this step.
          <br />
          <span className="text-sm">
            Input: {stepMeta.input?.from} ({stepMeta.input?.count} entries)
          </span>
        </div>
      )}

      {/* Paper table */}
      {!isLoadingTab && (viewMode === 'papers' || !supportsStatsView) && (activeTab !== 'input' || entries.length > 0) && (
        <>
          <PaperTable
            entries={paginatedEntries}
            changes={filteredChanges}
            columns={tableColumns}
            emptyMessage={
              searchQuery
                ? 'No papers match your search criteria'
                : 'No papers in this output'
            }
          />

          {/* Pagination */}
          {filteredEntries.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredEntries.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </>
      )}
    </div>
  );
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

function inferDatabaseLabel(entry: BibEntry): string {
  const metadataCandidates = [
    entry._source_database,
    entry._database,
    entry.database,
  ];
  for (const candidate of metadataCandidates) {
    const normalized = normalizeDatabaseToken(String(candidate || ''));
    if (normalized) return formatDatabaseToken(normalized);
  }

  const doi = String(entry.doi || '').trim().toLowerCase();
  if (doi.startsWith('10.1145/')) return 'ACM';
  if (doi.startsWith('10.1109/')) return 'IEEE';
  if (doi.startsWith('10.48550/arxiv.')) return 'arXiv';

  const sourceUrl = String(entry.url || entry.URL || '').trim().toLowerCase();
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

  const publisherText = String(entry.publisher || entry.journal || entry.booktitle || '').trim();
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

function formatOutputName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getOutputActionCount(
  name: string,
  actionCounts: { keep: number; remove: number; modify: number }
): number | null {
  switch (name.toLowerCase()) {
    case 'passed':
      return actionCounts.keep;
    case 'removed':
    case 'excluded':
    case 'exclude':
      return actionCounts.remove;
    case 'modified':
      return actionCounts.modify;
    default:
      return null;
  }
}

function getDecisionCount(
  name: string,
  decisionCounts?: { include: number; exclude: number; uncertain: number }
): number | null {
  if (!decisionCounts) return null;
  switch (name.toLowerCase()) {
    case 'passed':
    case 'include':
      return decisionCounts.include;
    case 'excluded':
    case 'exclude':
      return decisionCounts.exclude;
    case 'uncertain':
      return decisionCounts.uncertain;
    default:
      return null;
  }
}

function getOutputTone(name: string): OutputTone | null {
  switch (name.toLowerCase()) {
    case 'passed':
      return 'success';
    case 'removed':
    case 'excluded':
    case 'exclude':
      return 'danger';
    case 'warning':
    case 'uncertain':
      return 'warning';
    default:
      return null;
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
