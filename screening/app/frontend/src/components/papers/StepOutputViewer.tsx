/**
 * Step output viewer - displays papers from step inputs/outputs with tabs.
 */
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileInput, FileOutput } from 'lucide-react';
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
  icon?: React.ReactNode;
  tone?: OutputTone;
};
type TabGroup = {
  id: string;
  label: string;
  tabs: TabConfig[];
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

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(defaultOutputTab);
    }
  }, [activeTab, availableTabs, defaultOutputTab, stepId]);

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
  const inputColumns = useMemo(() => {
    if (!columns || !hasSourceInfo) return columns;
    return [
      ...columns,
      {
        id: 'source',
        header: 'Source',
        width: 'w-40',
        render: (entry: BibEntry) => {
          const filename = (entry as BibEntry & { _source_file?: string })._source_file;
          return (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {filename || '-'}
            </span>
          );
        },
      },
    ] as ColumnDefinition<BibEntry>[];
  }, [columns, hasSourceInfo]);

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

      {/* Search and filters */}
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        placeholder="Search by title, author, key, or DOI..."
      />

      {/* Loading state */}
      {isLoadingTab && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      )}

      {/* Input tab placeholder */}
      {activeTab === 'input' && !isLoadingTab && entries.length === 0 && (
        <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
          Input not available for this step.
          <br />
          <span className="text-sm">
            Input: {stepMeta.input?.from} ({stepMeta.input?.count} entries)
          </span>
        </div>
      )}

      {/* Paper table */}
      {!isLoadingTab && (activeTab !== 'input' || entries.length > 0) && (
        <>
          <PaperTable
            entries={paginatedEntries}
            changes={changes}
            columns={activeTab === 'input' ? inputColumns : columns}
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
