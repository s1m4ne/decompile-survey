/**
 * Step output viewer - displays papers from step inputs/outputs with tabs.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileInput, FileOutput } from 'lucide-react';
import { cn } from '../../lib/utils';
import { stepsApi, StepMeta } from '../../lib/api';
import { PaperTable, BibEntry, ChangeRecord, ColumnDefinition } from './PaperTable';
import { SearchFilter, FilterOption } from './SearchFilter';
import { Pagination } from './Pagination';

export interface StepOutputViewerProps {
  projectId: string;
  stepId: string;
  stepMeta: StepMeta;
  changes: ChangeRecord[];
  actionCounts: { keep: number; remove: number; modify: number };
  decisionCounts?: { include: number; exclude: number; uncertain: number };
  countSource?: 'action' | 'decision' | 'output';
  columns?: ColumnDefinition<BibEntry>[];
  buildFilters?: (entries: BibEntry[], changes: ChangeRecord[]) => FilterOption[];
  filterEntry?: (entry: BibEntry, change: ChangeRecord | undefined, activeFilters: string[]) => boolean;
}

type TabType = 'input' | string; // 'input' or output name
type OutputTone = 'success' | 'warning' | 'danger';

export function StepOutputViewer({
  projectId,
  stepId,
  stepMeta,
  changes,
  actionCounts,
  decisionCounts,
  countSource = 'action',
  columns,
  buildFilters,
  filterEntry,
}: StepOutputViewerProps) {
  // Active tab (input or output name)
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const outputNames = Object.keys(stepMeta.outputs);
    return outputNames.includes('passed') ? 'passed' : outputNames[0] || 'input';
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  // Fetch output entries for active tab
  const { data: outputData, isLoading } = useQuery({
    queryKey: ['step-output', projectId, stepId, activeTab],
    queryFn: async () => {
      const result = await stepsApi.getOutput(projectId, stepId, activeTab);
      return result as { entries: BibEntry[]; count: number };
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

  const changesByKey = useMemo(() => {
    return new Map(changes.map((change) => [change.key, change]));
  }, [changes]);

  // Build filter options
  const filterOptions = useMemo(() => {
    if (!buildFilters) return [];
    return buildFilters(entries, changes);
  }, [entries, changes, buildFilters]);

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

    // Apply custom filters
    if (filterEntry && activeFilters.length > 0) {
      result = result.filter((entry) => {
        const change = changesByKey.get(entry.ID || '') as ChangeRecord | undefined;
        return filterEntry(entry, change, activeFilters);
      });
    }

    return result;
  }, [entries, searchQuery, filterEntry, activeFilters, changesByKey]);

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

  const handleFilterChange = (filterId: string) => {
    setActiveFilters((prev) =>
      prev.includes(filterId)
        ? prev.filter((f) => f !== filterId)
        : [...prev, filterId]
    );
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  // Build tabs
  const tabs: { id: TabType; label: string; count: number; icon: React.ReactNode }[] = [];

  // Input tab
  if (stepMeta.input) {
    tabs.push({
      id: 'input',
      label: 'Input',
      count: stepMeta.input.count,
      icon: <FileInput className="w-4 h-4" />,
    });
  }

  // Output tabs
  Object.entries(stepMeta.outputs).forEach(([name, output]) => {
    const actionCount = countSource === 'action' ? getOutputActionCount(name, actionCounts) : null;
    const decisionCount = countSource === 'decision'
      ? getDecisionCount(name, decisionCounts)
      : null;
    tabs.push({
      id: name,
      label: formatOutputName(name),
      count: decisionCount ?? actionCount ?? output.count,
      icon: <FileOutput className="w-4 h-4" />,
    });
  });

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[hsl(var(--border))]">
        {tabs.map((tab) => {
          const tone = getOutputTone(String(tab.id));
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

      {/* Search and filters */}
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        placeholder="Search by title, author, key, or DOI..."
        filters={filterOptions}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
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
              searchQuery || activeFilters.length > 0
                ? 'No papers match your search/filter criteria'
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
