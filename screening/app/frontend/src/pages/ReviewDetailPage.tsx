import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runsApi, reviewsApi, UpdatePaperRequest } from '../lib/api';
import { PaperCard } from '../components/PaperCard';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Search, FileText, Download, CheckSquare, ChevronDown, ChevronUp, FileInput } from 'lucide-react';

type FilterDecision = 'all' | 'include' | 'exclude' | 'uncertain';
type FilterReviewed = 'all' | 'reviewed' | 'unreviewed';

export function ReviewDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState<FilterDecision>('all');
  const [filterReviewed, setFilterReviewed] = useState<FilterReviewed>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showRules, setShowRules] = useState(false);
  const [expandAll, setExpandAll] = useState<boolean | undefined>(undefined);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Check URL params for showRules
  useEffect(() => {
    if (searchParams.get('showRules') === 'true') {
      setShowRules(true);
      // Remove the param from URL
      searchParams.delete('showRules');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
    mutationFn: (data: { citation_keys: string[]; manual_decision?: string | null; reset?: boolean }) =>
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

      // Reviewed filter
      const isReviewed = review?.manual_decision !== null && review?.manual_decision !== undefined;
      if (filterReviewed === 'reviewed' && !isReviewed) return false;
      if (filterReviewed === 'unreviewed' && isReviewed) return false;

      return true;
    });
  }, [runData?.papers, reviewData?.papers, search, filterDecision, filterReviewed]);

  // Stats
  const stats = useMemo(() => {
    if (!reviewData?.papers) return { total: 0, reviewed: 0, modified: 0, include: 0, exclude: 0, uncertain: 0 };
    const papers = Object.values(reviewData.papers);

    // 最終判定（manual_decision優先、なければai_decision）を計算
    const getFinalDecision = (p: { ai_decision?: string; manual_decision?: string | null }) => {
      if (p.manual_decision === 'ai') return p.ai_decision;
      return p.manual_decision || p.ai_decision;
    };

    return {
      total: papers.length,
      reviewed: papers.filter((p) => p.manual_decision !== null && p.manual_decision !== undefined).length,
      modified: papers.filter((p) => p.manual_decision && p.manual_decision !== 'ai').length,
      include: papers.filter((p) => getFinalDecision(p) === 'include').length,
      exclude: papers.filter((p) => getFinalDecision(p) === 'exclude').length,
      uncertain: papers.filter((p) => getFinalDecision(p) === 'uncertain').length,
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

  const handleBulkApproveAI = () => {
    bulkUpdateMutation.mutate({
      citation_keys: Array.from(selectedKeys),
      manual_decision: 'ai',
    });
  };

  const handleBulkReset = () => {
    bulkUpdateMutation.mutate({
      citation_keys: Array.from(selectedKeys),
      reset: true,
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

            {/* Input file */}
            {runData.meta?.input_file && (
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                <FileInput className="h-3.5 w-3.5" />
                <span>{runData.meta.input_file}</span>
              </div>
            )}

            <div className="flex items-center gap-4 mt-2">
              {/* Decision stats */}
              <div className="flex items-center gap-2">
                <Badge variant="success" className="font-normal">
                  {stats.include} included
                </Badge>
                <Badge variant="destructive" className="font-normal">
                  {stats.exclude} excluded
                </Badge>
                {stats.uncertain > 0 && (
                  <Badge variant="warning" className="font-normal">
                    {stats.uncertain} uncertain
                  </Badge>
                )}
              </div>
              <span className="text-gray-300">|</span>
              <span className="text-sm text-gray-500">
                {stats.reviewed} / {stats.total} reviewed
                {stats.modified > 0 && ` · ${stats.modified} modified`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRules(!showRules)}
            >
              <FileText className="h-4 w-4 mr-2" />
              {showRules ? 'Hide' : 'Show'} Rules
            </Button>

            {/* Export dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setShowExportMenu(!showExportMenu)}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>

              {showExportMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowExportMenu(false)}
                  />

                  {/* Menu */}
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    <div className="p-2">
                      <div className="text-xs font-medium text-gray-500 px-2 py-1">
                        BibTeX (AI判定)
                      </div>
                      <button
                        onClick={() => {
                          window.open(`/api/runs/${runId}/export/included`, '_blank');
                          setShowExportMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2"
                      >
                        <span className="w-3 h-3 rounded-full bg-green-100 border border-green-200" />
                        Included ({runData.stats.included})
                      </button>
                      <button
                        onClick={() => {
                          window.open(`/api/runs/${runId}/export/excluded`, '_blank');
                          setShowExportMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2"
                      >
                        <span className="w-3 h-3 rounded-full bg-red-100 border border-red-200" />
                        Excluded ({runData.stats.excluded})
                      </button>
                      <button
                        onClick={() => {
                          window.open(`/api/runs/${runId}/export/uncertain`, '_blank');
                          setShowExportMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2"
                      >
                        <span className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-200" />
                        Uncertain ({runData.stats.uncertain})
                      </button>
                      <button
                        onClick={() => {
                          window.open(`/api/runs/${runId}/export/all`, '_blank');
                          setShowExportMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2"
                      >
                        <span className="w-3 h-3 rounded-full bg-gray-100 border border-gray-200" />
                        All ({runData.stats.total})
                      </button>

                      <div className="border-t border-gray-100 my-2" />

                      <div className="text-xs font-medium text-gray-500 px-2 py-1">
                        その他
                      </div>
                      <button
                        onClick={() => {
                          alert('Coming soon: レビュー結果を含むCSVエクスポート');
                          setShowExportMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-100 rounded"
                      >
                        CSV (レビュー結果) - 準備中
                      </button>
                      <button
                        onClick={() => {
                          alert('Coming soon: 最終判定に基づくBibTeXエクスポート');
                          setShowExportMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-100 rounded"
                      >
                        BibTeX (最終判定) - 準備中
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar - decision breakdown */}
        <div className="mt-4">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
            <div
              className="bg-green-200 h-full transition-all"
              style={{ width: `${stats.total > 0 ? (stats.include / stats.total) * 100 : 0}%` }}
            />
            <div
              className="bg-red-200 h-full transition-all"
              style={{ width: `${stats.total > 0 ? (stats.exclude / stats.total) * 100 : 0}%` }}
            />
            <div
              className="bg-yellow-200 h-full transition-all"
              style={{ width: `${stats.total > 0 ? (stats.uncertain / stats.total) * 100 : 0}%` }}
            />
          </div>
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

          {/* Reviewed filter */}
          <Select
            value={filterReviewed}
            onChange={(e) => setFilterReviewed(e.target.value as FilterReviewed)}
            className="w-36"
          >
            <option value="all">All status</option>
            <option value="reviewed">Reviewed</option>
            <option value="unreviewed">Unreviewed</option>
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
            <Button size="sm" variant="outline" onClick={handleBulkApproveAI}>
              <CheckSquare className="h-4 w-4 mr-1" />
              OK (AI)
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkReset}>
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Select all / Expand all */}
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
        <span className="text-gray-300">|</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandAll(true)}
        >
          <ChevronDown className="h-4 w-4 mr-1" />
          Expand all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandAll(false)}
        >
          <ChevronUp className="h-4 w-4 mr-1" />
          Collapse all
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
            forceExpanded={expandAll}
            onExpandChange={() => setExpandAll(undefined)}
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
