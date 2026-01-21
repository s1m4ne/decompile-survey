import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runsApi, reviewsApi, Paper, PaperReview, UpdatePaperRequest } from '../lib/api';
import { PaperCard } from '../components/PaperCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Search, Filter, FileText, Download, CheckSquare } from 'lucide-react';

type FilterDecision = 'all' | 'include' | 'exclude' | 'uncertain';
type FilterChecked = 'all' | 'checked' | 'unchecked';

export function ReviewDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState<FilterDecision>('all');
  const [filterChecked, setFilterChecked] = useState<FilterChecked>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showRules, setShowRules] = useState(false);

  // Queries
  const { data: runData, isLoading: runLoading } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => runsApi.get(runId!),
    enabled: !!runId,
  });

  const { data: reviewData, isLoading: reviewLoading } = useQuery({
    queryKey: ['review', runId],
    queryFn: () => reviewsApi.get(runId!),
    enabled: !!runId,
  });

  // Mutations
  const updatePaperMutation = useMutation({
    mutationFn: ({ citationKey, data }: { citationKey: string; data: UpdatePaperRequest }) =>
      reviewsApi.updatePaper(runId!, citationKey, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review', runId] });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (data: { citation_keys: string[]; manual_decision?: string | null; checked?: boolean }) =>
      reviewsApi.bulkUpdate(runId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review', runId] });
      setSelectedKeys(new Set());
    },
  });

  // Filtered papers
  const filteredPapers = useMemo(() => {
    if (!runData?.papers) return [];

    return runData.papers.filter((paper) => {
      const review = reviewData?.papers[paper.citation_key];
      const finalDecision = review?.manual_decision || review?.ai_decision || paper.ai_decision;

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          paper.title.toLowerCase().includes(searchLower) ||
          paper.author?.toLowerCase().includes(searchLower) ||
          paper.abstract?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Decision filter
      if (filterDecision !== 'all' && finalDecision !== filterDecision) {
        return false;
      }

      // Checked filter
      if (filterChecked === 'checked' && !review?.checked) return false;
      if (filterChecked === 'unchecked' && review?.checked) return false;

      return true;
    });
  }, [runData?.papers, reviewData?.papers, search, filterDecision, filterChecked]);

  // Stats
  const stats = useMemo(() => {
    if (!reviewData?.papers) return { total: 0, checked: 0, modified: 0 };
    const papers = Object.values(reviewData.papers);
    return {
      total: papers.length,
      checked: papers.filter((p) => p.checked).length,
      modified: papers.filter((p) => p.manual_decision).length,
    };
  }, [reviewData?.papers]);

  const handleSelectAll = () => {
    if (selectedKeys.size === filteredPapers.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredPapers.map((p) => p.citation_key)));
    }
  };

  const handleBulkDecision = (decision: string | null) => {
    bulkUpdateMutation.mutate({
      citation_keys: Array.from(selectedKeys),
      manual_decision: decision,
    });
  };

  const handleBulkCheck = () => {
    bulkUpdateMutation.mutate({
      citation_keys: Array.from(selectedKeys),
      checked: true,
    });
  };

  if (runLoading || reviewLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!runData) {
    return <div className="text-gray-500">Run not found</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{runId}</h2>
            <p className="text-gray-500 mt-1">
              {stats.checked} / {stats.total} checked
              {stats.modified > 0 && ` · ${stats.modified} modified`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRules(!showRules)}
            >
              <FileText className="h-4 w-4 mr-2" />
              {showRules ? 'Hide' : 'Show'} Rules
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="bg-green-500 h-full transition-all"
            style={{ width: `${(stats.checked / stats.total) * 100}%` }}
          />
        </div>
      </div>

      {/* Rules panel */}
      {showRules && runData.rules && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Screening Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans">
              {runData.rules}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search title, author, abstract..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Decision filter */}
          <Select
            value={filterDecision}
            onChange={(e) => setFilterDecision(e.target.value as FilterDecision)}
            className="w-36"
          >
            <option value="all">All decisions</option>
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
            <option value="uncertain">Uncertain</option>
          </Select>

          {/* Checked filter */}
          <Select
            value={filterChecked}
            onChange={(e) => setFilterChecked(e.target.value as FilterChecked)}
            className="w-36"
          >
            <option value="all">All status</option>
            <option value="checked">Checked</option>
            <option value="unchecked">Unchecked</option>
          </Select>

          <div className="text-sm text-gray-500">
            {filteredPapers.length} papers
          </div>
        </div>

        {/* Bulk actions */}
        {selectedKeys.size > 0 && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">
              {selectedKeys.size} selected
            </span>
            <Button size="sm" variant="outline" onClick={() => handleBulkDecision('include')}>
              → Include
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkDecision('exclude')}>
              → Exclude
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkDecision(null)}>
              Reset to AI
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkCheck}>
              <CheckSquare className="h-4 w-4 mr-1" />
              Mark checked
            </Button>
          </div>
        )}
      </div>

      {/* Select all */}
      <div className="flex items-center gap-2 mb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSelectAll}
        >
          {selectedKeys.size === filteredPapers.length && filteredPapers.length > 0
            ? 'Deselect all'
            : 'Select all'}
        </Button>
      </div>

      {/* Paper list */}
      <div className="space-y-3">
        {filteredPapers.map((paper) => (
          <PaperCard
            key={paper.citation_key}
            paper={paper}
            review={reviewData?.papers[paper.citation_key]}
            selected={selectedKeys.has(paper.citation_key)}
            onSelect={(selected) => {
              const newSet = new Set(selectedKeys);
              if (selected) {
                newSet.add(paper.citation_key);
              } else {
                newSet.delete(paper.citation_key);
              }
              setSelectedKeys(newSet);
            }}
            onUpdate={(data) =>
              updatePaperMutation.mutate({ citationKey: paper.citation_key, data })
            }
            showReviewControls
          />
        ))}
      </div>

      {filteredPapers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No papers match the current filters
        </div>
      )}
    </div>
  );
}
