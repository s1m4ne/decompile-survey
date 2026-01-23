/**
 * Common paper table component for displaying BibTeX entries.
 * Used across all step types with customizable columns.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';

// Column definition for step-specific columns
export interface ColumnDefinition<T = Record<string, unknown>> {
  id: string;
  header: string;
  width?: string;
  render: (entry: T, change?: ChangeRecord) => React.ReactNode;
}

// Change record from changes.jsonl
export interface ChangeRecord {
  key: string;
  action: 'keep' | 'remove' | 'modify';
  reason: string;
  details: Record<string, unknown>;
}

// BibTeX entry type
export interface BibEntry {
  ID: string;
  ENTRYTYPE: string;
  title?: string;
  author?: string;
  year?: string;
  doi?: string;
  abstract?: string;
  booktitle?: string;
  journal?: string;
  [key: string]: unknown;
}

export interface PaperTableProps<T extends BibEntry = BibEntry> {
  entries: T[];
  changes?: ChangeRecord[];
  columns?: ColumnDefinition<T>[];
  showRowNumbers?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  onRowClick?: (entry: T) => void;
  emptyMessage?: string;
}

// Default columns for paper display
const defaultColumns: ColumnDefinition<BibEntry>[] = [
  {
    id: 'title',
    header: 'Title',
    width: 'flex-1 min-w-0',
    render: (entry) => (
      <span className="line-clamp-2" title={entry.title}>
        {entry.title || '(No title)'}
      </span>
    ),
  },
  {
    id: 'author',
    header: 'Authors',
    width: 'w-48',
    render: (entry) => (
      <span className="line-clamp-1 text-sm text-[hsl(var(--muted-foreground))]" title={entry.author}>
        {entry.author ? formatAuthors(entry.author) : '-'}
      </span>
    ),
  },
  {
    id: 'year',
    header: 'Year',
    width: 'w-16 text-center',
    render: (entry) => entry.year || '-',
  },
  {
    id: 'venue',
    header: 'Venue',
    width: 'w-32',
    render: (entry) => (
      <span className="line-clamp-1 text-sm" title={entry.booktitle || entry.journal}>
        {entry.booktitle || entry.journal || '-'}
      </span>
    ),
  },
];

function formatAuthors(authors: string): string {
  const parts = authors.split(' and ');
  if (parts.length <= 2) {
    return authors;
  }
  return `${parts[0]} et al.`;
}

function getActionBadge(action: string) {
  switch (action) {
    case 'keep':
      return <Badge variant="success">Keep</Badge>;
    case 'remove':
      return <Badge variant="destructive">Remove</Badge>;
    case 'modify':
      return <Badge variant="warning">Modify</Badge>;
    default:
      return <Badge variant="outline">{action}</Badge>;
  }
}

export function PaperTable<T extends BibEntry = BibEntry>({
  entries,
  changes = [],
  columns,
  showRowNumbers = true,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  emptyMessage = 'No papers to display',
}: PaperTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Create a map of changes by key for quick lookup
  const changeMap = useMemo(() => {
    const map = new Map<string, ChangeRecord>();
    for (const change of changes) {
      map.set(change.key, change);
    }
    return map;
  }, [changes]);

  // Use provided columns or default
  const displayColumns = (columns || defaultColumns) as ColumnDefinition<T>[];

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

  const toggleSelection = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  const toggleSelectAll = () => {
    if (!onSelectionChange || !selectedKeys) return;
    if (selectedKeys.size === entries.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(entries.map((e) => e.ID)));
    }
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-[hsl(var(--border))]">
          <tr className="text-left text-[hsl(var(--muted-foreground))]">
            {/* Expand toggle */}
            <th className="w-8 p-2"></th>

            {/* Checkbox */}
            {onSelectionChange && (
              <th className="w-8 p-2">
                <input
                  type="checkbox"
                  checked={selectedKeys?.size === entries.length}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
            )}

            {/* Row number */}
            {showRowNumbers && <th className="w-12 p-2 text-center">#</th>}

            {/* Key/ID */}
            <th className="w-32 p-2">Key</th>

            {/* Custom columns */}
            {displayColumns.map((col) => (
              <th key={col.id} className={cn('p-2', col.width)}>
                {col.header}
              </th>
            ))}

            {/* Action badge if changes exist */}
            {changes.length > 0 && <th className="w-24 p-2 text-center">Action</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const change = changeMap.get(entry.ID);
            const isExpanded = expandedRows.has(entry.ID);
            const isSelected = selectedKeys?.has(entry.ID);

            return (
              <>
                <tr
                  key={entry.ID}
                  className={cn(
                    'border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
                    isSelected && 'bg-[hsl(var(--accent))]',
                    onRowClick && 'cursor-pointer'
                  )}
                  onClick={() => onRowClick?.(entry)}
                >
                  {/* Expand toggle */}
                  <td className="p-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(entry.ID);
                      }}
                      className="p-1 hover:bg-[hsl(var(--muted))] rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </td>

                  {/* Checkbox */}
                  {onSelectionChange && (
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(entry.ID)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded"
                      />
                    </td>
                  )}

                  {/* Row number */}
                  {showRowNumbers && (
                    <td className="p-2 text-center text-[hsl(var(--muted-foreground))]">
                      {index + 1}
                    </td>
                  )}

                  {/* Key/ID */}
                  <td className="p-2">
                    <code className="text-xs bg-[hsl(var(--muted))] px-1 py-0.5 rounded">
                      {entry.ID}
                    </code>
                  </td>

                  {/* Custom columns */}
                  {displayColumns.map((col) => (
                    <td key={col.id} className={cn('p-2', col.width)}>
                      {col.render(entry, change)}
                    </td>
                  ))}

                  {/* Action badge */}
                  {changes.length > 0 && (
                    <td className="p-2 text-center">
                      {change ? getActionBadge(change.action) : '-'}
                    </td>
                  )}
                </tr>

                {/* Expanded details row */}
                {isExpanded && (
                  <tr key={`${entry.ID}-details`} className="bg-[hsl(var(--muted))]">
                    <td colSpan={100} className="p-4">
                      <PaperDetails entry={entry} change={change} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Paper details panel (shown when expanded)
function PaperDetails({
  entry,
  change,
}: {
  entry: BibEntry;
  change?: ChangeRecord;
}) {
  return (
    <div className="space-y-4">
      {/* Title and basic info */}
      <div>
        <h4 className="font-medium text-lg">{entry.title}</h4>
        <p className="text-[hsl(var(--muted-foreground))]">{entry.author}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {entry.year}
          {(entry.booktitle || entry.journal) && ` • ${entry.booktitle || entry.journal}`}
        </p>
      </div>

      {/* DOI link */}
      {entry.doi && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">DOI:</span>
          <a
            href={`https://doi.org/${entry.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[hsl(var(--status-info))] hover:underline flex items-center gap-1"
          >
            {entry.doi}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Abstract */}
      {entry.abstract && (
        <div>
          <h5 className="font-medium text-sm mb-1">Abstract</h5>
          <p className="text-sm text-[hsl(var(--muted-foreground))] whitespace-pre-wrap">
            {entry.abstract}
          </p>
        </div>
      )}

      {/* Change details */}
      {change && (
        <div className="border-t border-[hsl(var(--border))] pt-4">
          <h5 className="font-medium text-sm mb-2">Step Result</h5>
          <div className="flex items-center gap-4">
            {getActionBadge(change.action)}
            <span className="text-sm">
              Reason: <code className="bg-[hsl(var(--background))] px-1 rounded">{change.reason}</code>
            </span>
          </div>
          {change.details && Object.keys(change.details).length > 0 && (
            <pre className="mt-2 text-xs bg-[hsl(var(--background))] p-2 rounded overflow-x-auto">
              {JSON.stringify(change.details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
