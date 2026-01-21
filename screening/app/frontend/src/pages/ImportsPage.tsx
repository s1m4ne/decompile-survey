import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { importsApi, Database, Paper } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { PaperCard } from '../components/PaperCard';
import { ChevronRight, ChevronDown, FolderOpen, FileText, Search, ArrowLeft } from 'lucide-react';

export function ImportsPage() {
  const [selectedFile, setSelectedFile] = useState<{ database: string; filename: string } | null>(null);
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const { data: databases, isLoading: dbLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: importsApi.list,
  });

  const { data: fileData, isLoading: fileLoading } = useQuery({
    queryKey: ['import', selectedFile?.database, selectedFile?.filename],
    queryFn: () => importsApi.get(selectedFile!.database, selectedFile!.filename),
    enabled: !!selectedFile,
  });

  const toggleDatabase = (name: string) => {
    const newSet = new Set(expandedDatabases);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setExpandedDatabases(newSet);
  };

  const filteredPapers = fileData?.papers.filter((paper) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      paper.title.toLowerCase().includes(searchLower) ||
      paper.author?.toLowerCase().includes(searchLower) ||
      paper.abstract?.toLowerCase().includes(searchLower)
    );
  });

  if (dbLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  // File detail view
  if (selectedFile && fileData) {
    return (
      <div>
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setSelectedFile(null)}
            className="-ml-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to imports
          </Button>
          <h2 className="text-2xl font-semibold text-gray-900">
            {selectedFile.filename}
          </h2>
          <p className="text-gray-500 mt-1">
            {selectedFile.database} · {fileData.count} papers
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search title, author, abstract..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="text-sm text-gray-500 mb-3">
          {filteredPapers?.length} papers
        </div>

        {/* Paper list */}
        <div className="space-y-3">
          {filteredPapers?.map((paper) => (
            <PaperCard key={paper.citation_key} paper={paper} />
          ))}
        </div>

        {filteredPapers?.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No papers match the search
          </div>
        )}
      </div>
    );
  }

  // Database list view
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Imports</h2>
        <p className="text-gray-500 mt-1">Browse BibTeX files from each database</p>
      </div>

      {databases?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No imports found. Add BibTeX files to the imports/ directory.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {databases?.map((db) => (
            <DatabaseCard
              key={db.name}
              database={db}
              expanded={expandedDatabases.has(db.name)}
              onToggle={() => toggleDatabase(db.name)}
              onSelectFile={(filename) => setSelectedFile({ database: db.name, filename })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DatabaseCard({
  database,
  expanded,
  onToggle,
  onSelectFile,
}: {
  database: Database;
  expanded: boolean;
  onToggle: () => void;
  onSelectFile: (filename: string) => void;
}) {
  const totalPapers = database.files.reduce((sum, f) => sum + f.count, 0);

  return (
    <Card>
      <CardContent className="py-0">
        {/* Header */}
        <button
          className="w-full flex items-center justify-between py-4 text-left"
          onClick={onToggle}
        >
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-gray-400" />
            <div>
              <h3 className="font-medium text-gray-900">{database.name}</h3>
              <p className="text-sm text-gray-500">
                {database.total_files} files · {totalPapers} papers
              </p>
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
        </button>

        {/* File list */}
        {expanded && (
          <div className="border-t border-gray-100 py-2">
            {database.files.map((file) => (
              <button
                key={file.filename}
                className="w-full flex items-center justify-between px-2 py-2 hover:bg-gray-50 rounded-md text-left"
                onClick={() => onSelectFile(file.filename)}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{file.filename}</span>
                </div>
                <Badge variant="secondary">{file.count} papers</Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
