import { useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, FolderOpen, Trash2, Database, FileText, X } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import 'react-datepicker/dist/react-datepicker.css';
import { sourcesApi, SourceFile, SourcesMeta } from '../lib/api';

export function SourcesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<'databases' | 'other'>('databases');
  const [database, setDatabase] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [stagedPaths, setStagedPaths] = useState<{ path: string; date: Date | null }[]>([]);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => sourcesApi.get(projectId!),
    enabled: !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      for (const file of files) {
        await sourcesApi.upload(
          projectId!,
          file,
          category,
          database || undefined,
          searchQuery || undefined,
          searchDate || undefined
        );
      }
      for (const item of stagedPaths) {
        await sourcesApi.addFromPath(
          projectId!,
          item.path,
          category,
          database || undefined,
          searchQuery || undefined,
          searchDate || undefined
        );
      }
    },
    onSuccess: () => {
      setFiles([]);
      setStagedPaths([]);
      queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  const pickFileMutation = useMutation({
    mutationFn: async () => {
      const result = await sourcesApi.pickFile(projectId!);
      if (result.cancelled || !result.paths || result.paths.length === 0) return null;
      const createdDates = result.created_at ?? [];
      const modifiedDates = result.modified_at ?? [];
      return result.paths.map((path, index) => {
        const rawDate = createdDates[index] ?? modifiedDates[index] ?? null;
        return { path, date: rawDate ? new Date(rawDate) : null };
      });
    },
    onSuccess: (items) => {
      if (items && items.length > 0) {
        setStagedPaths((prev) => [...prev, ...items]);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ category, filename }: { category: string; filename: string }) =>
      sourcesApi.delete(projectId!, category, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const handleDelete = (file: SourceFile) => {
    if (confirm(`Delete "${file.filename}"?`)) {
      deleteMutation.mutate({ category: file.category, filename: file.filename });
    }
  };

  const totals = useMemo(() => {
    const meta = sources ?? { totals: { databases: 0, other: 0, combined: 0 } };
    return meta.totals;
  }, [sources]);
  const stagedWithDates = useMemo(() => {
    const items: { key: string; name: string; date: Date | null }[] = [];
    files.forEach((file) => {
      items.push({
        key: `upload::${file.name}`,
        name: file.name,
        date: new Date(file.lastModified),
      });
    });
    stagedPaths.forEach((item) => {
      items.push({
        key: `path::${item.path}`,
        name: item.path,
        date: item.date,
      });
    });
    return items;
  }, [files, stagedPaths]);
  const stagedCount = files.length + stagedPaths.length;
  const hasStaged = stagedCount > 0;

  const addFiles = (incoming: File[]) => {
    const next = incoming.filter((file) => file.name.toLowerCase().endsWith('.bib'));
    if (next.length === 0) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}:${file.size}`));
      const unique = next.filter((file) => !existing.has(`${file.name}:${file.size}`));
      return [...prev, ...unique];
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to project
          </Link>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Sources</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Manage imported BibTeX files and metadata
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-1 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            Total {totals.combined}
          </span>
        </div>
      </div>

      {/* Import form */}
      <div
        className={`rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-4 ${
          isDragging ? 'ring-2 ring-[hsl(var(--ring))]' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = Array.from(e.dataTransfer.files || []);
          addFiles(dropped);
        }}
      >
        <div className="flex items-center gap-2 text-[hsl(var(--card-foreground))]">
          <Upload className="w-4 h-4" />
          <h2 className="font-medium">Add BibTeX Files</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'databases' | 'other')}
              className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
            >
              <option value="databases">Databases</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Database</label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="e.g., IEEE, ACM"
              className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Search Date</label>
            <div className="flex items-center gap-2">
              <DatePicker
                selected={selectedDate}
                onChange={(date) => {
                  setSelectedDate(date);
                  setSearchDate(date ? format(date, 'yyyy-MM-dd') : '');
                }}
                placeholderText="YYYY-MM-DD"
                dateFormat="yyyy-MM-dd"
                locale={enUS}
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
                calendarClassName="rounded-md border border-[hsl(var(--border))] shadow-sm"
                popperPlacement="bottom-start"
              />
              <button
                type="button"
                onClick={async () => {
                  setIsDatePickerOpen(true);
                }}
                className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-50 whitespace-nowrap"
              >
                Use file date
              </button>
            </div>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Search Query</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Query used for search"
              className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".bib"
            multiple
            onChange={(e) => {
              const next = e.target.files ? Array.from(e.target.files) : [];
              addFiles(next);
            }}
            className="hidden"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={stagedCount === 0 || uploadMutation.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
          >
            {uploadMutation.isPending ? <Upload className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Apply to imports
          </button>
          <button
            onClick={() => pickFileMutation.mutate()}
            disabled={pickFileMutation.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
          >
            {pickFileMutation.isPending ? (
              <FolderOpen className="w-4 h-4 animate-spin" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
            Add BibTeX File
          </button>
        </div>

        {hasStaged && (
          <div className="border-t border-[hsl(var(--border))] pt-4 space-y-2">
            <div className="text-sm font-medium text-[hsl(var(--foreground))]">
              Staged files ({stagedCount})
            </div>
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={`${file.name}:${file.size}`}
                  className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((prev) => prev.filter((entry) => entry !== file))
                    }
                    className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {stagedPaths.map((path) => (
                <div
                  key={path.path}
                  className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                >
                  <span className="truncate">{path.path}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setStagedPaths((prev) => prev.filter((entry) => entry.path !== path.path))
                    }
                    className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Metadata (category/database/search date/query) will be applied to all staged files.
            </div>
          </div>
        )}
      </div>

      {isDatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsDatePickerOpen(false)}
          />
          <div className="relative bg-[hsl(var(--background))] rounded-lg shadow-xl w-full max-w-md mx-4 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select staged file</h3>
              <button
                onClick={() => setIsDatePickerOpen(false)}
                className="p-1 rounded hover:bg-[hsl(var(--muted))]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {stagedWithDates.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No staged files with available dates.
              </p>
            ) : (
              <div className="space-y-2">
                {stagedWithDates.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (!item.date) return;
                      setSelectedDate(item.date);
                      setSearchDate(format(item.date, 'yyyy-MM-dd'));
                      setIsDatePickerOpen(false);
                    }}
                    disabled={!item.date}
                    className="w-full text-left border border-[hsl(var(--border))] rounded-md px-3 py-2 hover:bg-[hsl(var(--muted))] disabled:opacity-50"
                  >
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {item.date ? format(item.date, 'yyyy-MM-dd') : 'Date unavailable'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {stagedWithDates.some((item) => !item.date) && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
                Some staged files do not have a readable file date.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sources list */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            <h2 className="font-medium">Imported Files</h2>
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Databases {totals.databases} · Other {totals.other}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">Loading...</div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            <SourcesSection
              title="Databases"
              files={sources?.databases || []}
              onDelete={handleDelete}
            />
            <SourcesSection
              title="Other"
              files={sources?.other || []}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SourcesSection({
  title,
  files,
  onDelete,
}: {
  title: string;
  files: SourceFile[];
  onDelete: (file: SourceFile) => void;
}) {
  return (
    <div className="p-4 space-y-2">
      <div className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</div>
      {files.length === 0 ? (
        <div className="text-sm text-[hsl(var(--muted-foreground))]">No files</div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={`${file.category}-${file.filename}`}
              className="flex items-start justify-between rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3"
            >
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))] mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {file.filename}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {file.count} entries
                    {file.database ? ` · Database: ${file.database}` : ''}
                    {file.search_date ? ` · Search date: ${file.search_date}` : ''}
                  </div>
                  {file.search_query && (
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      Search query: {file.search_query}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => onDelete(file)}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                title="Delete file"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
