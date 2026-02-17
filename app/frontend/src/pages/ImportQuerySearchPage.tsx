import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, Search } from 'lucide-react';
import {
  ImportQuerySearchResponse,
  importsApi,
  QueryPreset,
} from '../lib/api';

const PREVIEW_LIMIT = 200;

function cleanTitle(value: unknown): string {
  const raw = String(value ?? '');
  return raw.replace(/[{}]/g, '').trim() || '(no title)';
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

export function ImportQuerySearchPage() {
  const { importId } = useParams<{ importId: string }>();
  const [queryText, setQueryText] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [maxResultsInput, setMaxResultsInput] = useState('');
  const [result, setResult] = useState<ImportQuerySearchResponse | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);

  const { data: importDetail, isLoading: importLoading } = useQuery({
    queryKey: ['import', importId],
    queryFn: () => importsApi.get(importId!),
    enabled: !!importId,
  });

  const { data: presetData, isLoading: presetsLoading } = useQuery({
    queryKey: ['import-query-presets', importId],
    queryFn: () => importsApi.getQueryPresets(importId!),
    enabled: !!importId,
  });

  useEffect(() => {
    if (!importDetail) return;
    if (selectedFiles.size > 0) return;
    setSelectedFiles(new Set(importDetail.files.map((file) => file.filename)));
  }, [importDetail, selectedFiles.size]);

  const presets = presetData?.presets ?? [];

  const selectedPresetData = useMemo<QueryPreset | null>(() => {
    if (!selectedPreset) return null;
    return presets.find((preset) => `${preset.database}:${preset.filename}` === selectedPreset) ?? null;
  }, [presets, selectedPreset]);

  const runSearchMutation = useMutation({
    mutationFn: () =>
      importsApi.querySearch(importId!, {
        query: queryText,
        selected_files: Array.from(selectedFiles),
        max_results: maxResultsInput.trim() ? Number(maxResultsInput) : undefined,
        exclude_without_abstract: true,
        normalize_external_syntax: true,
      }),
    onSuccess: (data) => {
      setResult(data);
      setShowAllResults(false);
    },
  });

  const handlePresetApply = () => {
    if (!selectedPresetData) return;
    setQueryText(selectedPresetData.search_query);
  };

  const toggleFile = (filename: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const selectAllFiles = () => {
    if (!importDetail) return;
    setSelectedFiles(new Set(importDetail.files.map((file) => file.filename)));
  };

  const clearAllFiles = () => {
    setSelectedFiles(new Set());
  };

  const downloadBibtex = () => {
    if (!result?.bibtex) return;
    const blob = new Blob([result.bibtex], { type: 'text/x-bibtex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `import_${importId}_query_results.bib`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (importLoading || presetsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--muted-foreground))]" />
      </div>
    );
  }

  if (!importDetail) {
    return (
      <div className="text-center py-12">
        <p className="text-[hsl(var(--muted-foreground))]">Import not found</p>
        <Link to="/imports" className="text-[hsl(var(--primary))] hover:underline mt-2 inline-block">
          Back to imports
        </Link>
      </div>
    );
  }

  const entries = result?.entries ?? [];
  const previewEntries = showAllResults ? entries : entries.slice(0, PREVIEW_LIMIT);
  const canRun = queryText.trim().length > 0 && selectedFiles.size > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          to={`/imports/${importId}`}
          className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to import
        </Link>
        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Query Search</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Run local title/abstract search against this import. Entries without abstract are excluded.
        </p>
      </div>

      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              Query Preset (from import meta.json)
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-sm"
            >
              <option value="">Select preset...</option>
              {presets.map((preset) => (
                <option
                  key={`${preset.database}:${preset.filename}`}
                  value={`${preset.database}:${preset.filename}`}
                >
                  [{preset.database}] {preset.filename}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handlePresetApply}
              disabled={!selectedPresetData}
              className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              Apply Preset
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
            Query
          </label>
          <textarea
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            rows={8}
            placeholder='Example: (title:decompil* OR abstract:decompil*) AND (abstract:"machine learning" OR title:LLM)'
            className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-sm font-mono"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Supports boolean operators and parentheses. External DB syntax (TI/AB, Document Title, etc.) is normalized automatically.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Target Files ({selectedFiles.size} selected)
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllFiles}
                  className="text-xs text-[hsl(var(--primary))] hover:underline"
                >
                  Select all
                </button>
                <button
                  onClick={clearAllFiles}
                  className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-44 overflow-auto border border-[hsl(var(--border))] rounded-md p-2 space-y-1">
              {importDetail.files.map((file) => (
                <label
                  key={file.filename}
                  className="flex items-start gap-2 px-2 py-1 rounded hover:bg-[hsl(var(--muted))]"
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.filename)}
                    onChange={() => toggleFile(file.filename)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-medium">[{file.database}]</span> {file.filename}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              Max Results (optional)
            </label>
            <input
              type="number"
              min={1}
              value={maxResultsInput}
              onChange={(e) => setMaxResultsInput(e.target.value)}
              placeholder="No limit"
              className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => runSearchMutation.mutate()}
            disabled={!canRun || runSearchMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {runSearchMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Run Search
              </>
            )}
          </button>

          {result && (
            <button
              onClick={downloadBibtex}
              className="inline-flex items-center gap-2 px-3 py-2 border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
            >
              <Download className="w-4 h-4" />
              Download Matched BibTeX
            </button>
          )}
        </div>

        {runSearchMutation.error && (
          <div className="text-sm text-[hsl(var(--status-danger-fg))] bg-[hsl(var(--status-danger-bg))] border border-[hsl(var(--status-danger-border))] rounded-md px-3 py-2">
            {(runSearchMutation.error as Error).message}
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">Search Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
              <div className="rounded-md bg-[hsl(var(--muted))] p-2">
                <div className="text-[hsl(var(--muted-foreground))]">Files</div>
                <div className="font-semibold">{result.stats.selected_file_count}</div>
              </div>
              <div className="rounded-md bg-[hsl(var(--muted))] p-2">
                <div className="text-[hsl(var(--muted-foreground))]">Total entries</div>
                <div className="font-semibold">{result.stats.total_entries}</div>
              </div>
              <div className="rounded-md bg-[hsl(var(--muted))] p-2">
                <div className="text-[hsl(var(--muted-foreground))]">With abstract</div>
                <div className="font-semibold">{result.stats.entries_with_abstract}</div>
              </div>
              <div className="rounded-md bg-[hsl(var(--muted))] p-2">
                <div className="text-[hsl(var(--muted-foreground))]">Excluded (no abs)</div>
                <div className="font-semibold">{result.stats.excluded_without_abstract}</div>
              </div>
              <div className="rounded-md bg-[hsl(var(--muted))] p-2">
                <div className="text-[hsl(var(--muted-foreground))]">Matched</div>
                <div className="font-semibold">{result.stats.matched_entries}</div>
              </div>
              <div className="rounded-md bg-[hsl(var(--muted))] p-2">
                <div className="text-[hsl(var(--muted-foreground))]">Returned</div>
                <div className="font-semibold">{result.stats.returned_entries}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Normalized query</div>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-[hsl(var(--muted))] rounded-md p-2 border border-[hsl(var(--border))]">
                {result.normalized_query}
              </pre>
            </div>
          </div>

          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-sm font-semibold">Matched Entries ({entries.length})</h2>
              {entries.length > PREVIEW_LIMIT && (
                <button
                  onClick={() => setShowAllResults((v) => !v)}
                  className="text-xs text-[hsl(var(--primary))] hover:underline"
                >
                  {showAllResults ? `Show first ${PREVIEW_LIMIT}` : 'Show all'}
                </button>
              )}
            </div>
            <div className="overflow-auto max-h-[560px]">
              <table className="min-w-full text-sm">
                <thead className="bg-[hsl(var(--muted))] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Title</th>
                    <th className="text-left px-3 py-2 font-medium">Year</th>
                    <th className="text-left px-3 py-2 font-medium">Source</th>
                    <th className="text-left px-3 py-2 font-medium">DOI</th>
                  </tr>
                </thead>
                <tbody>
                  {previewEntries.map((entry, index) => {
                    const title = cleanTitle(entry.title);
                    const year = asText(entry.year);
                    const source = asText(entry._source_file);
                    const doi = asText(entry.doi);
                    return (
                      <tr
                        key={`${source}:${asText(entry.ID)}:${index}`}
                        className="border-t border-[hsl(var(--border))]"
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">{title}</div>
                          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">
                            {asText(entry.author)}
                          </div>
                        </td>
                        <td className="px-3 py-2">{year || '-'}</td>
                        <td className="px-3 py-2 text-xs">{source || '-'}</td>
                        <td className="px-3 py-2 text-xs">
                          {doi ? (
                            <a
                              href={`https://doi.org/${doi}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[hsl(var(--primary))] hover:underline"
                            >
                              {doi}
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
