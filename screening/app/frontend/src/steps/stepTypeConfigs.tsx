import type { ReactNode } from 'react';
import type { ColumnDefinition, BibEntry, ChangeRecord, FilterOption } from '../components/papers';
import { Badge } from '../components/ui/Badge';
import { Fingerprint, Brain, Type, Users } from 'lucide-react';
import { normalizeBibtexText } from '../components/BibtexText';

// Step type specific configuration
export interface StepTypeConfig {
  icon: ReactNode;
  columns?: ColumnDefinition<BibEntry>[];
  buildFilters?: (entries: BibEntry[], changes: ChangeRecord[]) => FilterOption[];
  filterEntry?: (entry: BibEntry, change: ChangeRecord | undefined, activeFilters: string[]) => boolean;
}

function buildDedupColumns(reasonLabels: Record<string, string>): ColumnDefinition<BibEntry>[] {
  return [
    {
      id: 'title',
      header: 'Title',
      width: 'flex-1 min-w-0',
      render: (entry) => (
        <span className="line-clamp-2" title={normalizeBibtexText(entry.title) || ''}>
          {normalizeBibtexText(entry.title) || '(No title)'}
        </span>
      ),
    },
    {
      id: 'author',
      header: 'Authors',
      width: 'w-40',
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
      id: 'doi',
      header: 'DOI',
      width: 'w-48',
      render: (entry) => {
        if (!entry.doi) {
          return <span className="text-[hsl(var(--muted-foreground))] text-xs">No DOI</span>;
        }
        const doiUrl = entry.doi.startsWith('http')
          ? entry.doi
          : `https://doi.org/${entry.doi}`;
        return (
          <a
            href={doiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[hsl(var(--status-info))] hover:underline line-clamp-1"
            onClick={(e) => e.stopPropagation()}
          >
            {doiUrl}
          </a>
        );
      },
    },
    {
      id: 'reason',
      header: 'Reason',
      width: 'w-36',
      render: (_, change) => {
        if (!change) return '-';
        return (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {reasonLabels[change.reason] || change.reason}
          </span>
        );
      },
    },
  ];
}

const dedupDoiColumns = buildDedupColumns({
  unique_doi: 'Unique DOI',
  no_doi: 'No DOI',
  duplicate_doi: 'Duplicate',
  no_doi_removed: 'No DOI (removed)',
});

const dedupTitleColumns = buildDedupColumns({
  unique_title: 'Unique title',
  duplicate_title: 'Duplicate title',
  duplicate_title_representative: 'Representative',
});

const dedupAuthorColumns = buildDedupColumns({
  unique_author: 'Unique author',
  duplicate_author: 'Duplicate author',
  duplicate_author_representative: 'Representative',
});

// DOI Deduplication filter builder
function buildDedupDoiFilters(entries: BibEntry[], changes: ChangeRecord[]): FilterOption[] {
  const stats = {
    unique_doi: 0,
    no_doi: 0,
    duplicate_doi: 0,
    has_doi: 0,
    no_doi_entries: 0,
  };

  for (const change of changes) {
    if (change.reason === 'unique_doi') stats.unique_doi++;
    if (change.reason === 'no_doi') stats.no_doi++;
    if (change.reason === 'duplicate_doi') stats.duplicate_doi++;
  }

  for (const entry of entries) {
    if (entry.doi) stats.has_doi++;
    else stats.no_doi_entries++;
  }

  return [
    { id: 'has_doi', label: 'Has DOI', value: 'has_doi', count: stats.has_doi },
    { id: 'no_doi', label: 'No DOI', value: 'no_doi', count: stats.no_doi_entries },
  ];
}

// DOI Deduplication filter function
function filterDedupDoiEntry(
  entry: BibEntry,
  _change: ChangeRecord | undefined,
  activeFilters: string[]
): boolean {
  if (activeFilters.includes('has_doi') && !entry.doi) return false;
  if (activeFilters.includes('no_doi') && entry.doi) return false;
  return true;
}

// AI Screening specific columns
const aiScreeningColumns: ColumnDefinition<BibEntry>[] = [
  {
    id: 'title',
    header: 'Title',
    width: 'flex-1 min-w-0',
    render: (entry) => (
      <span className="line-clamp-2" title={normalizeBibtexText(entry.title) || ''}>
        {normalizeBibtexText(entry.title) || '(No title)'}
      </span>
    ),
  },
  {
    id: 'author',
    header: 'Authors',
    width: 'w-36',
    render: (entry) => (
      <span className="line-clamp-1 text-sm text-[hsl(var(--muted-foreground))]" title={entry.author}>
        {entry.author ? formatAuthors(entry.author) : '-'}
      </span>
    ),
  },
  {
    id: 'year',
    header: 'Year',
    width: 'w-14 text-center',
    render: (entry) => entry.year || '-',
  },
  {
    id: 'decision',
    header: 'Decision',
    width: 'w-24',
    render: (_, change) => {
      if (!change?.details) return '-';
      const decision = change.details.decision as string;
      const badgeVariant = decision === 'include' ? 'success' : decision === 'exclude' ? 'destructive' : 'warning';
      return <Badge variant={badgeVariant}>{decision}</Badge>;
    },
  },
  {
    id: 'confidence',
    header: 'Conf.',
    width: 'w-16 text-center',
    render: (_, change) => {
      if (!change?.details) return '-';
      const confidence = change.details.confidence as number;
      return (
        <span className="text-xs">
          {(confidence * 100).toFixed(0)}%
        </span>
      );
    },
  },
  {
    id: 'reasoning',
    header: 'Reasoning',
    width: 'w-64',
    render: (_, change) => {
      if (!change?.details) return '-';
      const reasoning = change.details.reasoning as string;
      return (
        <span className="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]" title={reasoning}>
          {reasoning || '-'}
        </span>
      );
    },
  },
];

// AI Screening filter builder
function buildAIScreeningFilters(_entries: BibEntry[], changes: ChangeRecord[]): FilterOption[] {
  const stats = { include: 0, exclude: 0, uncertain: 0 };

  for (const change of changes) {
    const decision = change.details?.decision as string;
    if (decision === 'include') stats.include++;
    else if (decision === 'exclude') stats.exclude++;
    else stats.uncertain++;
  }

  return [
    { id: 'include', label: 'Include', value: 'include', count: stats.include },
    { id: 'exclude', label: 'Exclude', value: 'exclude', count: stats.exclude },
    { id: 'uncertain', label: 'Uncertain', value: 'uncertain', count: stats.uncertain },
  ];
}

// AI Screening filter function
function filterAIScreeningEntry(
  _entry: BibEntry,
  change: ChangeRecord | undefined,
  activeFilters: string[]
): boolean {
  if (!change?.details) return true;
  const decision = change.details.decision as string;
  if (activeFilters.includes('include') && decision !== 'include') return false;
  if (activeFilters.includes('exclude') && decision !== 'exclude') return false;
  if (activeFilters.includes('uncertain') && decision !== 'uncertain') return false;
  return true;
}

// Step type configurations
export const stepTypeConfigs: Record<string, StepTypeConfig> = {
  'dedup-doi': {
    icon: <Fingerprint className="w-5 h-5" />,
    columns: dedupDoiColumns,
    buildFilters: buildDedupDoiFilters,
    filterEntry: filterDedupDoiEntry,
  },
  'ai-screening': {
    icon: <Brain className="w-5 h-5" />,
    columns: aiScreeningColumns,
    buildFilters: buildAIScreeningFilters,
    filterEntry: filterAIScreeningEntry,
  },
  'dedup-title': {
    icon: <Type className="w-5 h-5" />,
    columns: dedupTitleColumns,
  },
  'dedup-author': {
    icon: <Users className="w-5 h-5" />,
    columns: dedupAuthorColumns,
  },
};

function formatAuthors(authors: string): string {
  const parts = authors.split(' and ');
  if (parts.length <= 2) return authors;
  return `${parts[0]} et al.`;
}
