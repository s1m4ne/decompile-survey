import { useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Upload,
  FolderOpen,
  Trash2,
  FileText,
  X,
  Settings,
  Lock,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import 'react-datepicker/dist/react-datepicker.css';
import { importsApi, ImportFile, ImportFileUpdate, ImportDetail } from '../lib/api';

const TAG_COLORS = [
  { bg: '210 100% 95%', fg: '210 80% 35%', border: '210 70% 80%' },   // blue
  { bg: '150 60% 93%',  fg: '150 60% 30%', border: '150 50% 75%' },   // green
  { bg: '280 60% 95%',  fg: '280 50% 40%', border: '280 50% 80%' },   // purple
  { bg: '30 90% 93%',   fg: '30 70% 35%',  border: '30 70% 78%' },    // orange
  { bg: '340 70% 95%',  fg: '340 60% 40%', border: '340 60% 82%' },   // pink
  { bg: '180 50% 93%',  fg: '180 50% 30%', border: '180 40% 75%' },   // teal
  { bg: '60 60% 93%',   fg: '60 60% 30%',  border: '60 50% 75%' },    // yellow
  { bg: '0 60% 95%',    fg: '0 55% 40%',   border: '0 50% 82%' },     // red
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function ImportDetailPage() {
  const { importId } = useParams<{ importId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [pendingDeleteFile, setPendingDeleteFile] = useState<string | null>(null);
  const [pendingDeleteImport, setPendingDeleteImport] = useState(false);

  // File edit modal state
  const [editingFile, setEditingFile] = useState<ImportFile | null>(null);
  const [editFileDatabase, setEditFileDatabase] = useState('');
  const [editFileSearchQuery, setEditFileSearchQuery] = useState('');
  const [editFileSearchDate, setEditFileSearchDate] = useState('');
  const [editFileSelectedDate, setEditFileSelectedDate] = useState<Date | null>(null);
  const [editFileUrl, setEditFileUrl] = useState('');
  const [editFileTags, setEditFileTags] = useState('');

  // Upload form state
  const [database, setDatabase] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [searchUrl, setSearchUrl] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [stagedPaths, setStagedPaths] = useState<{ path: string; date: Date | null }[]>([]);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter state
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Preview state
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const { data: importDetail, isLoading } = useQuery({
    queryKey: ['import', importId],
    queryFn: () => importsApi.get(importId!),
    enabled: !!importId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      importsApi.update(importId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', importId] });
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      setShowSettingsModal(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => importsApi.delete(importId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      navigate('/imports');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => importsApi.duplicate(importId!),
    onSuccess: (newImport) => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      navigate(`/imports/${newImport.id}`);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      for (const file of stagedFiles) {
        await importsApi.uploadFile(
          importId!,
          file,
          database,
          searchQuery,
          searchDate,
          searchUrl || undefined,
          tagsInput.trim() || undefined
        );
      }
      for (const path of stagedPaths) {
        await importsApi.addFromPath(
          importId!,
          path.path,
          database,
          searchQuery,
          searchDate,
          searchUrl || undefined,
          tagsInput.trim() || undefined
        );
      }
    },
    onSuccess: () => {
      setStagedFiles([]);
      setStagedPaths([]);
      setDatabase('');
      setSearchQuery('');
      setSearchDate('');
      setSelectedDate(null);
      setSearchUrl('');
      setTagsInput('');
      setFileCounts({});
      queryClient.invalidateQueries({ queryKey: ['import', importId] });
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  const pickFileMutation = useMutation({
    mutationFn: async () => {
      const result = await importsApi.pickFile(importId!);
      if (result.cancelled || !result.paths) return null;
      const createdDates = result.created_at ?? [];
      const modifiedDates = result.modified_at ?? [];
      const entryCounts = result.entry_counts ?? [];
      if (entryCounts.length > 0) {
        const newCounts: Record<string, number> = {};
        result.paths.forEach((p, i) => {
          if (entryCounts[i] !== undefined) newCounts[`path::${p}`] = entryCounts[i];
        });
        setFileCounts(prev => ({ ...prev, ...newCounts }));
      }
      return result.paths.map((path, index) => {
        const rawDate = createdDates[index] ?? modifiedDates[index] ?? null;
        return { path, date: rawDate ? new Date(rawDate) : null };
      });
    },
    onSuccess: (paths) => {
      if (paths && paths.length > 0) {
        setStagedPaths((prev) => [...prev, ...paths]);
        if (!searchDate) {
          const firstDate = paths.find((item) => item.date)?.date ?? null;
          if (firstDate) {
            setSelectedDate(firstDate);
            setSearchDate(format(firstDate, 'yyyy-MM-dd'));
          }
        }
      }
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (filename: string) => importsApi.deleteFile(importId!, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', importId] });
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      setPendingDeleteFile(null);
    },
  });

  const updateFileMutation = useMutation({
    mutationFn: (data: { filename: string; update: ImportFileUpdate }) =>
      importsApi.updateFile(importId!, data.filename, data.update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', importId] });
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      setEditingFile(null);
    },
  });

  const openFileEdit = (file: ImportFile) => {
    setEditFileDatabase(file.database);
    setEditFileSearchQuery(file.search_query);
    setEditFileSearchDate(file.search_date);
    setEditFileSelectedDate(file.search_date ? new Date(file.search_date + 'T00:00:00') : null);
    setEditFileUrl(file.url || '');
    setEditFileTags(file.tags?.join(', ') || '');
    setEditingFile(file);
  };

  const handleSaveFileEdit = () => {
    if (!editingFile || !editFileDatabase.trim() || !editFileSearchQuery.trim() || !editFileSearchDate.trim()) return;
    updateFileMutation.mutate({
      filename: editingFile.filename,
      update: {
        database: editFileDatabase.trim(),
        search_query: editFileSearchQuery.trim(),
        search_date: editFileSearchDate.trim(),
        url: editFileUrl.trim(),
        tags: editFileTags.trim(),
      },
    });
  };

  const addFiles = (incoming: File[]) => {
    const next = incoming.filter((f) => f.name.toLowerCase().endsWith('.bib'));
    if (next.length === 0) return;
    setStagedFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...next.filter((f) => !existing.has(`${f.name}:${f.size}`))];
    });
    next.forEach(async (file) => {
      try {
        const text = await file.text();
        const count = (text.match(/@\w+\s*\{/g) || []).length;
        setFileCounts(prev => ({ ...prev, [`upload::${file.name}:${file.size}`]: count }));
      } catch { /* ignore */ }
    });
    if (!searchDate) {
      const firstFile = next[0];
      if (firstFile) {
        const date = new Date(firstFile.lastModified);
        setSelectedDate(date);
        setSearchDate(format(date, 'yyyy-MM-dd'));
      }
    }
  };

  const openSettings = () => {
    if (!importDetail) return;
    setEditName(importDetail.name);
    setEditDescription(importDetail.description);
    setShowSettingsModal(true);
  };

  const handleSaveSettings = () => {
    if (!editName.trim()) return;
    updateMutation.mutate({
      name: editName.trim(),
      description: editDescription.trim(),
    });
  };

  const isLocked = importDetail?.is_locked ?? false;
  const totalEntries = importDetail?.files.reduce((sum, f) => sum + f.count, 0) ?? 0;
  const stagedCount = stagedFiles.length + stagedPaths.length;
  const stagedWithDates = useMemo(() => {
    const items: { key: string; name: string; date: Date | null }[] = [];
    stagedFiles.forEach((file) => {
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
  }, [stagedFiles, stagedPaths]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    importDetail?.files.forEach((f) => f.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [importDetail?.files]);

  const filteredFiles = useMemo(() => {
    if (selectedTags.size === 0) return importDetail?.files ?? [];
    return (importDetail?.files ?? []).filter((f) =>
      f.tags?.some((t) => selectedTags.has(t))
    );
  }, [importDetail?.files, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  if (isLoading) {
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/imports"
          className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to imports
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                {importDetail.name}
              </h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] border border-[hsl(var(--status-warning-border))]">
                  <Lock className="w-3 h-3" />
                  In use
                </span>
              )}
            </div>
            {importDetail.description && (
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                {importDetail.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              <span>{importDetail.files.length} {importDetail.files.length === 1 ? 'file' : 'files'}</span>
              <span>{totalEntries} entries</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => duplicateMutation.mutate()}
              disabled={duplicateMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-50"
              title="Duplicate"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button
              onClick={openSettings}
              className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Lock warning banner */}
      {isLocked && (
        <div className="rounded-lg border border-[hsl(var(--status-warning-border))] bg-[hsl(var(--status-warning-bg))] p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-[hsl(var(--status-warning-fg))] mt-0.5" />
            <div>
              <div className="text-sm font-medium text-[hsl(var(--status-warning-fg))]">
                This import is in use and cannot be edited
              </div>
              <div className="text-xs text-[hsl(var(--status-warning-fg))] mt-1">
                Referenced by: {importDetail.referencing_projects.map((p) => p.name).join(', ')}
              </div>
              <div className="text-xs text-[hsl(var(--status-warning-fg))] mt-1">
                To make changes, duplicate this import and edit the copy.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload form */}
      {!isLocked && (
        <div
          className={`rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-4 ${
            isDragging ? 'ring-2 ring-[hsl(var(--ring))]' : ''
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            addFiles(Array.from(e.dataTransfer.files || []));
          }}
        >
          <div className="flex items-center gap-2 text-[hsl(var(--card-foreground))]">
            <Upload className="w-4 h-4" />
            <h2 className="font-medium">Add BibTeX Files</h2>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Upload BibTeX files with metadata about each search.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Database <span className="text-[hsl(var(--status-danger-solid))]">*</span>
              </label>
              <input
                type="text"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                placeholder="e.g., IEEE, ACM, PubMed"
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Search Date <span className="text-[hsl(var(--status-danger-solid))]">*</span>
              </label>
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
                  onClick={() => setIsDatePickerOpen(true)}
                  className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-50 whitespace-nowrap"
                >
                  Use file date
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2 md:col-span-3">
              <label className="text-sm font-medium">
                Search Query <span className="text-[hsl(var(--status-danger-solid))]">*</span>
              </label>
              <textarea
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                rows={2}
                placeholder="Query used for search"
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-mono resize-y"
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-sm font-medium">Search URL</label>
              <input
                type="url"
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-sm font-medium">Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g., decompile, LLM, survey"
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
              />
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Comma-separated. Applied to all staged files.
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bib"
              multiple
              onChange={(e) => addFiles(e.target.files ? Array.from(e.target.files) : [])}
              className="hidden"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={stagedCount === 0 || !database || !searchQuery || !searchDate || uploadMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
            >
              <Upload className="w-4 h-4" />
              Choose Files
            </button>
            <button
              onClick={() => pickFileMutation.mutate()}
              disabled={pickFileMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              <FolderOpen className="w-4 h-4" />
              {pickFileMutation.isPending ? 'Picking...' : 'Pick from Finder'}
            </button>
          </div>

          {stagedCount > 0 && (
            <div className="border-t border-[hsl(var(--border))] pt-4 space-y-2">
              <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                Staged files ({stagedCount})
              </div>
              <div className="space-y-2">
                {stagedFiles.map((file) => {
                  const count = fileCounts[`upload::${file.name}:${file.size}`];
                  return (
                    <div
                      key={`${file.name}:${file.size}`}
                      className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{file.name}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">
                          {count !== undefined ? `${count} entries` : '...'} · {formatSize(file.size)}
                        </span>
                      </div>
                      <button
                        onClick={() => setStagedFiles((prev) => prev.filter((f) => f !== file))}
                        className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                {stagedPaths.map((item) => {
                  const count = fileCounts[`path::${item.path}`];
                  const filename = item.path.split('/').pop() || item.path;
                  return (
                    <div
                      key={item.path}
                      className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{filename}</span>
                          {count !== undefined && (
                            <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">
                              {count} entries
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                          {item.path}
                        </div>
                      </div>
                      <button
                        onClick={() => setStagedPaths((prev) => prev.filter((p) => p !== item))}
                        className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Database, search query, search date, URL, and tags will be applied to all staged files.
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* Files list */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="border-b border-[hsl(var(--border))] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <h2 className="font-medium">Files ({importDetail.files.length})</h2>
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {totalEntries} total entries
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {allTags.map((tag) => {
                const color = getTagColor(tag);
                const active = selectedTags.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="px-2 py-0.5 text-[11px] rounded-full border transition-opacity"
                    style={{
                      backgroundColor: `hsl(${color.bg})`,
                      color: `hsl(${color.fg})`,
                      borderColor: `hsl(${color.border})`,
                      opacity: selectedTags.size === 0 || active ? 1 : 0.4,
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              {selectedTags.size > 0 && (
                <button
                  onClick={() => setSelectedTags(new Set())}
                  className="px-2 py-0.5 text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {importDetail.files.length === 0 ? (
          <div className="p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No files yet. Upload BibTeX files above.
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No files match the selected tags.
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {filteredFiles.map((file) => (
              <FileRow
                key={file.filename}
                importId={importId!}
                file={file}
                isLocked={isLocked}
                isExpanded={expandedFile === file.filename}
                onToggle={() => setExpandedFile(expandedFile === file.filename ? null : file.filename)}
                onEdit={() => openFileEdit(file)}
                onDelete={() => setPendingDeleteFile(file.filename)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Referencing projects */}
      {importDetail.referencing_projects.length > 0 && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--border))] p-4">
            <h2 className="font-medium flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Referencing Projects ({importDetail.referencing_projects.length})
            </h2>
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {importDetail.referencing_projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="flex items-center justify-between p-4 hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                  {project.name}
                </span>
                <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  disabled={isLocked}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
                  disabled={isLocked}
                />
              </div>

              {!isLocked && (
                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setPendingDeleteImport(true)}
                    className="px-3 py-2 text-sm text-[hsl(var(--status-danger-solid))] hover:bg-[hsl(var(--muted))] rounded-md"
                  >
                    Delete import
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSettingsModal(false)}
                      className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveSettings}
                      disabled={!editName.trim() || updateMutation.isPending}
                      className="px-3 py-2 text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {isLocked && (
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  This import is in use and cannot be edited or deleted. Duplicate it to make changes.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete File Confirm */}
      {pendingDeleteFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">Delete file</h2>
              <button
                onClick={() => setPendingDeleteFile(null)}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Delete "{pendingDeleteFile}"? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPendingDeleteFile(null)}
                  className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteFileMutation.mutate(pendingDeleteFile)}
                  disabled={deleteFileMutation.isPending}
                  className="px-3 py-2 text-sm bg-[hsl(var(--status-danger-solid))] text-[hsl(var(--status-danger-solid-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {deleteFileMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit File Metadata Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">Edit File Metadata</h2>
              <button
                onClick={() => setEditingFile(null)}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-[hsl(var(--muted-foreground))] truncate">
                {editingFile.filename}
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Database <span className="text-[hsl(var(--status-danger-solid))]">*</span>
                </label>
                <input
                  type="text"
                  value={editFileDatabase}
                  onChange={(e) => setEditFileDatabase(e.target.value)}
                  placeholder="e.g., IEEE, ACM, PubMed"
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Search Date <span className="text-[hsl(var(--status-danger-solid))]">*</span>
                </label>
                <DatePicker
                  selected={editFileSelectedDate}
                  onChange={(date: Date | null) => {
                    setEditFileSelectedDate(date);
                    setEditFileSearchDate(date ? format(date, 'yyyy-MM-dd') : '');
                  }}
                  placeholderText="YYYY-MM-DD"
                  dateFormat="yyyy-MM-dd"
                  locale={enUS}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Search Query <span className="text-[hsl(var(--status-danger-solid))]">*</span>
                </label>
                <textarea
                  value={editFileSearchQuery}
                  onChange={(e) => setEditFileSearchQuery(e.target.value)}
                  rows={3}
                  placeholder="Query used for search"
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Search URL
                </label>
                <input
                  type="url"
                  value={editFileUrl}
                  onChange={(e) => setEditFileUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={editFileTags}
                  onChange={(e) => setEditFileTags(e.target.value)}
                  placeholder="e.g., decompile, LLM, survey"
                  className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  Comma-separated.
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingFile(null)}
                  className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFileEdit}
                  disabled={
                    !editFileDatabase.trim() ||
                    !editFileSearchQuery.trim() ||
                    !editFileSearchDate.trim() ||
                    updateFileMutation.isPending
                  }
                  className="px-3 py-2 text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {updateFileMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Import Confirm */}
      {pendingDeleteImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[hsl(var(--card))] rounded-lg w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">Delete import</h2>
              <button
                onClick={() => setPendingDeleteImport(false)}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Delete "{importDetail.name}" and all its files? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPendingDeleteImport(false)}
                  className="px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-2 text-sm bg-[hsl(var(--status-danger-solid))] text-[hsl(var(--status-danger-solid-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function FileRow({
  importId,
  file,
  isLocked,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  importId: string;
  file: ImportFile;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: entries } = useQuery({
    queryKey: ['import-file-entries', importId, file.filename],
    queryFn: () => importsApi.getFileEntries(importId, file.filename),
    enabled: isExpanded,
  });

  const [copied, setCopied] = useState(false);

  const copyQuery = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(file.search_query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="flex items-start justify-between p-4 hover:bg-[hsl(var(--muted))] transition-colors">
        <div
          onClick={onToggle}
          className="flex items-start gap-3 text-left flex-1 min-w-0 cursor-pointer"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))] mt-0.5 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] mt-0.5 shrink-0" />
          )}
          <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))] mt-0.5 shrink-0" />
          <div className="space-y-1 min-w-0">
            <div className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
              {file.filename}
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {file.count} entries · {file.database} · {file.search_date}
            </div>
            {file.search_query && (
              <div onClick={(e) => e.stopPropagation()}>
                {file.search_query.includes('\n') ? (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        Query
                      </span>
                      <button
                        onClick={copyQuery}
                        className="p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        title={copied ? 'Copied!' : 'Copy query'}
                      >
                        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <pre className="text-xs text-[hsl(var(--foreground))] font-mono whitespace-pre-wrap break-all bg-[hsl(var(--muted))] rounded-md px-2.5 py-1.5 max-h-24 overflow-y-auto">
{file.search_query}</pre>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                      Query: {file.search_query}
                    </div>
                    <button
                      onClick={copyQuery}
                      className="p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0"
                      title={copied ? 'Copied!' : 'Copy query'}
                    >
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>
            )}
            {file.url && (
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[hsl(var(--primary))] hover:underline truncate inline-flex items-center gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                URL
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {file.tags && file.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {file.tags.map((tag) => {
                  const color = getTagColor(tag);
                  return (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[10px] rounded-full border"
                      style={{
                        backgroundColor: `hsl(${color.bg})`,
                        color: `hsl(${color.fg})`,
                        borderColor: `hsl(${color.border})`,
                      }}
                    >
                      {tag}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {!isLocked && (
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              title="Edit metadata"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--status-danger-solid))]"
              title="Delete file"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                  <th className="text-left px-3 py-2 font-medium text-[hsl(var(--muted-foreground))]">#</th>
                  <th className="text-left px-3 py-2 font-medium text-[hsl(var(--muted-foreground))]">Title</th>
                  <th className="text-left px-3 py-2 font-medium text-[hsl(var(--muted-foreground))]">Authors</th>
                  <th className="text-left px-3 py-2 font-medium text-[hsl(var(--muted-foreground))]">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {entries?.entries.slice(0, 20).map((entry, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">{i + 1}</td>
                    <td className="px-3 py-2 text-[hsl(var(--foreground))] max-w-md truncate">
                      {String(entry.title || '').replace(/[{}]/g, '')}
                    </td>
                    <td className="px-3 py-2 text-[hsl(var(--muted-foreground))] max-w-xs truncate">
                      {String(entry.author || '')}
                    </td>
                    <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                      {String(entry.year || '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries && entries.count > 20 && (
              <div className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))]">
                Showing 20 of {entries.count} entries
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
