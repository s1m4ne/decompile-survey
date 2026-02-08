import type { ReactNode } from 'react';
import type { ColumnDefinition, BibEntry } from '../components/papers';
import { Fingerprint, Brain, Type, Users, FileDown } from 'lucide-react';
import { normalizeBibtexText } from '../components/BibtexText';

// Step type specific configuration
export interface StepTypeConfig {
  icon: ReactNode;
  columns?: ColumnDefinition<BibEntry>[];
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

const PDF_MISSING_REASON_LABELS: Record<string, string> = {
  pdf_not_resolved: 'No downloadable PDF found',
  browser_assist_unresolved: 'Browser assist timed out',
  browser_assist_unavailable: 'Browser assist unavailable',
  browser_assist_error: 'Browser assist failed',
  not_found: 'PDF not resolved',
};

const PDF_MISSING_REASON_HINTS: Record<string, string> = {
  pdf_not_resolved: 'Try Re-run and complete publisher login/challenge first.',
  browser_assist_unresolved: 'Keep browser window open until login/challenge is fully completed.',
  browser_assist_unavailable: 'Install Playwright + Chromium in backend runtime.',
  browser_assist_error: 'Retry once and check backend logs if this repeats.',
  not_found: 'Try Re-run with browser assist enabled.',
};

function formatPdfMissingReason(raw: unknown, labelFromBackend: unknown): string {
  if (typeof labelFromBackend === 'string' && labelFromBackend.trim()) {
    return labelFromBackend;
  }
  const reason = typeof raw === 'string' ? raw : '';
  if (!reason) return 'Unknown';
  return PDF_MISSING_REASON_LABELS[reason] ?? reason;
}

const pdfFetchColumns: ColumnDefinition<BibEntry>[] = [
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
    id: 'pdf_status',
    header: 'PDF Status',
    width: 'w-40',
    render: (_, change) => {
      const status = change?.details?.pdf_status as string | undefined;
      const source = change?.details?.source as string | undefined;
      if (status === 'found') {
        return (
          <span className="text-xs text-[hsl(var(--status-success-fg))]">
            Found{source ? ` (${source})` : ''}
          </span>
        );
      }
      return (
        <span className="text-xs text-[hsl(var(--status-danger-fg))] font-medium">
          Missing
        </span>
      );
    },
  },
  {
    id: 'pdf_missing_reason',
    header: 'Why Missing',
    width: 'w-56',
    render: (_, change) => {
      const status = change?.details?.pdf_status as string | undefined;
      if (status === 'found') {
        return <span className="text-xs text-[hsl(var(--muted-foreground))]">-</span>;
      }
      const reasonRaw = change?.details?.missing_reason;
      const reasonLabel = change?.details?.missing_reason_label;
      const hintRaw = change?.details?.missing_reason_hint;
      const reasonText = formatPdfMissingReason(reasonRaw, reasonLabel);
      const hint = typeof hintRaw === 'string' && hintRaw.trim()
        ? hintRaw
        : (typeof reasonRaw === 'string' ? PDF_MISSING_REASON_HINTS[reasonRaw] : undefined);

      return (
        <div className="space-y-1">
          <div className="text-xs text-[hsl(var(--status-danger-fg))]">{reasonText}</div>
          {hint && (
            <div className="text-[10px] text-[hsl(var(--muted-foreground))] line-clamp-2" title={hint}>
              {hint}
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: 'pdf_file',
    header: 'PDF File',
    width: 'w-28',
    render: (_, change) => {
      const status = change?.details?.pdf_status as string | undefined;
      if (status !== 'found') {
        return <span className="text-xs text-[hsl(var(--muted-foreground))]">-</span>;
      }

      const recordId = change?.details?.pdf_record_id as string | undefined;
      const sourceUrl = change?.details?.source_url as string | undefined;
      const downloadUrl = recordId
        ? `/api/pdf-library/${encodeURIComponent(recordId)}/download`
        : undefined;
      const viewUrl = recordId
        ? `/api/pdf-library/${encodeURIComponent(recordId)}/view`
        : sourceUrl;

      if (!viewUrl) {
        return <span className="text-xs text-[hsl(var(--muted-foreground))]">Found</span>;
      }

      return (
        <div className="flex flex-col gap-1">
          <a
            href={viewUrl}
            target="pdf-viewer"
            rel="noopener noreferrer"
            className="text-xs text-[hsl(var(--status-info))] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
          )}
        </div>
      );
    },
  },
];

// Reason code display labels
const REASON_CODE_LABELS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' }> = {
  // Include codes
  in_core: { label: 'Core', tone: 'success' },
  in_decompiler_enhancement: { label: 'Enhancement', tone: 'success' },
  in_type_recovery: { label: 'Type', tone: 'success' },
  in_variable_naming: { label: 'Naming', tone: 'success' },
  in_control_structure: { label: 'Control', tone: 'success' },
  // Exclude codes
  ex_no_ml: { label: 'No ML', tone: 'danger' },
  ex_no_lowlevel_input: { label: 'No LowLevel', tone: 'danger' },
  ex_no_code_generation: { label: 'No CodeGen', tone: 'danger' },
  ex_survey_or_meta: { label: 'Survey', tone: 'danger' },
  ex_out_of_scope: { label: 'Out of Scope', tone: 'danger' },
  // Uncertain codes
  uns_unclear_method: { label: 'Method?', tone: 'warning' },
  uns_unclear_input: { label: 'Input?', tone: 'warning' },
  uns_unclear_output: { label: 'Output?', tone: 'warning' },
  uns_need_fulltext: { label: 'Need Text', tone: 'warning' },
};

interface ReasonCode {
  code: string;
  evidence: string;
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
    width: 'w-32',
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
    id: 'confidence',
    header: 'Conf.',
    width: 'w-14 text-center',
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
    id: 'reason_codes',
    header: 'Codes',
    width: 'w-40',
    render: (_, change) => {
      if (!change?.details) return '-';
      const reasonCodes = (change.details.reason_codes || []) as ReasonCode[];
      if (reasonCodes.length === 0) {
        // Fallback to old format
        const reason = change.reason || '';
        return (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {reason}
          </span>
        );
      }
      return (
        <div className="flex flex-wrap gap-1">
          {reasonCodes.map((rc, i) => {
            const config = REASON_CODE_LABELS[rc.code] || { label: rc.code, tone: 'warning' as const };
            const toneColors = {
              success: 'bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))] border-[hsl(var(--status-success-border))]',
              danger: 'bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))] border-[hsl(var(--status-danger-border))]',
              warning: 'bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] border-[hsl(var(--status-warning-border))]',
            };
            return (
              <span
                key={i}
                className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${toneColors[config.tone]}`}
                title={rc.evidence ? `"${rc.evidence}"` : rc.code}
              >
                {config.label}
              </span>
            );
          })}
        </div>
      );
    },
  },
  {
    id: 'reasoning',
    header: 'Reasoning',
    width: 'w-56',
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

// Step type configurations
export const stepTypeConfigs: Record<string, StepTypeConfig> = {
  'dedup-doi': {
    icon: <Fingerprint className="w-5 h-5" />,
    columns: dedupDoiColumns,
  },
  'ai-screening': {
    icon: <Brain className="w-5 h-5" />,
    columns: aiScreeningColumns,
  },
  'dedup-title': {
    icon: <Type className="w-5 h-5" />,
    columns: dedupTitleColumns,
  },
  'dedup-author': {
    icon: <Users className="w-5 h-5" />,
    columns: dedupAuthorColumns,
  },
  'pdf-fetch': {
    icon: <FileDown className="w-5 h-5" />,
    columns: pdfFetchColumns,
  },
};

function formatAuthors(authors: string): string {
  const parts = authors.split(' and ');
  if (parts.length <= 2) return authors;
  return `${parts[0]} et al.`;
}
