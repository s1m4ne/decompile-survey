import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, FileDown, Trash2, Link2, HardDrive, AlertTriangle, X, Loader2 } from 'lucide-react';
import { pdfLibraryApi, PdfLibraryRecord } from '../lib/api';

export function PdfLibraryPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'found' | 'missing'>('all');
  const [deleteTarget, setDeleteTarget] = useState<PdfLibraryRecord | null>(null);
  const [deleteFile, setDeleteFile] = useState(true);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['pdf-library-stats'],
    queryFn: () => pdfLibraryApi.stats(),
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['pdf-library', query, status],
    queryFn: () => pdfLibraryApi.list({ q: query, status }),
  });

  const deleteMutation = useMutation({
    mutationFn: (payload: { recordId: string; deleteFile: boolean }) =>
      pdfLibraryApi.remove(payload.recordId, payload.deleteFile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdf-library'] });
      queryClient.invalidateQueries({ queryKey: ['pdf-library-stats'] });
      setDeleteTarget(null);
      setDeleteFile(true);
    },
  });

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const aTime = new Date(a.updated_at || 0).getTime();
      const bTime = new Date(b.updated_at || 0).getTime();
      return bTime - aTime;
    });
  }, [records]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">PDF Library</h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          Globally managed PDF cache shared across projects (DOI-first).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Records" value={stats?.total ?? 0} loading={statsLoading} />
        <StatCard label="PDF Found" value={stats?.found ?? 0} loading={statsLoading} tone="success" />
        <StatCard label="Missing" value={stats?.missing ?? 0} loading={statsLoading} tone="danger" />
        <StatCard label="Managed Files" value={stats?.managed_files ?? 0} loading={statsLoading} />
      </div>

      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search DOI, title, source URL, path..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | 'found' | 'missing')}
            className="px-3 py-2 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
          >
            <option value="all">All</option>
            <option value="found">Found</option>
            <option value="missing">Missing</option>
          </select>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--muted-foreground))]" />
          </div>
        ) : sortedRecords.length === 0 ? (
          <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No PDF records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[hsl(var(--border))]">
                <tr className="text-left text-[hsl(var(--muted-foreground))]">
                  <th className="p-2">Status</th>
                  <th className="p-2">DOI / Key</th>
                  <th className="p-2">Title</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Size</th>
                  <th className="p-2">Refs</th>
                  <th className="p-2">Updated</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((record) => (
                  <tr key={record.id} className="border-b border-[hsl(var(--border))] align-top">
                    <td className="p-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${
                          record.status === 'found'
                            ? 'bg-[hsl(var(--status-success-bg))] border-[hsl(var(--status-success-border))] text-[hsl(var(--status-success-fg))]'
                            : 'bg-[hsl(var(--status-danger-bg))] border-[hsl(var(--status-danger-border))] text-[hsl(var(--status-danger-fg))]'
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td className="p-2 min-w-[240px]">
                      <div className="font-mono text-xs break-all">{record.doi || record.key}</div>
                      {record.pdf_path && (
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 break-all">
                          {record.pdf_path}
                        </div>
                      )}
                      {record.missing_reason && (
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          reason: {record.missing_reason}
                        </div>
                      )}
                    </td>
                    <td className="p-2 min-w-[280px]">
                      <div className="line-clamp-2">{record.title || '-'}</div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1 text-xs">
                        {record.managed_file ? <HardDrive className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                        <span>{record.source || '-'}</span>
                      </div>
                      {record.provider && (
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          via {record.provider}
                        </div>
                      )}
                    </td>
                    <td className="p-2">{formatFileSize(record.size_bytes)}</td>
                    <td className="p-2">{record.project_ref_count}</td>
                    <td className="p-2 whitespace-nowrap">
                      {record.updated_at ? formatDateTime(record.updated_at) : '-'}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-2">
                        {record.status === 'found' && record.pdf_path && (
                          <>
                            <a
                              href={pdfLibraryApi.viewUrl(record.id)}
                              target="pdf-viewer"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </a>
                            <a
                              href={pdfLibraryApi.downloadUrl(record.id)}
                              download
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              Download
                            </a>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteTarget(record)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-[hsl(var(--status-danger-border))] text-[hsl(var(--status-danger-fg))] rounded-md hover:bg-[hsl(var(--status-danger-bg))]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-lg mx-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[hsl(var(--status-warning-fg))]" />
                <h2 className="text-lg font-semibold">Delete PDF Record</h2>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="p-1 rounded hover:bg-[hsl(var(--muted))]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[hsl(var(--muted-foreground))] break-all">
              {deleteTarget.doi || deleteTarget.key}
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deleteFile}
                onChange={(e) => setDeleteFile(e.target.checked)}
              />
              Delete file from disk (managed files only)
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  deleteMutation.mutate({ recordId: deleteTarget.id, deleteFile })
                }
                disabled={deleteMutation.isPending}
                className="px-3 py-2 text-sm bg-[hsl(var(--status-danger-solid))] text-[hsl(var(--status-danger-solid-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(sizeBytes: number | null): string {
  if (!sizeBytes || sizeBytes <= 0) return '-';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number;
  loading: boolean;
  tone?: 'success' | 'danger';
}) {
  const colorClass =
    tone === 'success'
      ? 'text-[hsl(var(--status-success-fg))]'
      : tone === 'danger'
        ? 'text-[hsl(var(--status-danger-fg))]'
        : 'text-[hsl(var(--foreground))]';

  return (
    <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${colorClass}`}>
        {loading ? '-' : value}
      </div>
    </div>
  );
}
