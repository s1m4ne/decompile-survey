import { useState, useEffect } from 'react';
import { Paper, PaperReview, UpdatePaperRequest } from '../lib/api';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Textarea } from './ui/Textarea';
import { cn } from '../lib/utils';
import { Check, ChevronDown, ChevronUp, ExternalLink, Undo2 } from 'lucide-react';

interface PaperCardProps {
  paper: Paper;
  review?: PaperReview;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onUpdate?: (data: UpdatePaperRequest) => void;
  showReviewControls?: boolean;
  forceExpanded?: boolean;
  onExpandChange?: () => void;
}

function getDecisionBadge(decision: string | undefined | null) {
  switch (decision) {
    case 'include':
      return <Badge variant="success">Include</Badge>;
    case 'exclude':
      return <Badge variant="destructive">Exclude</Badge>;
    case 'uncertain':
      return <Badge variant="warning">Uncertain</Badge>;
    default:
      return <Badge variant="secondary">-</Badge>;
  }
}

export function PaperCard({
  paper,
  review,
  selected,
  onSelect,
  onUpdate,
  showReviewControls = false,
  forceExpanded,
  onExpandChange,
}: PaperCardProps) {
  const [localExpanded, setLocalExpanded] = useState(false);

  // forceExpandedが変わったらlocalExpandedを同期
  useEffect(() => {
    if (forceExpanded !== undefined) {
      setLocalExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  // forceExpandedがundefinedならlocalExpandedを使う
  const expanded = forceExpanded !== undefined ? forceExpanded : localExpanded;

  const finalDecision = review?.manual_decision || review?.ai_decision || paper.ai_decision;
  const isReviewed = review?.manual_decision !== null && review?.manual_decision !== undefined;

  const handleDecisionClick = (decision: string) => {
    onUpdate?.({ manual_decision: decision });
  };

  const handleApproveAI = () => {
    // AI判定を承認
    onUpdate?.({ manual_decision: 'ai' });
  };

  const handleReset = () => {
    // 人間のレビューをリセットしてAI判定だけの状態に戻す
    onUpdate?.({ reset: true });
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate?.({ note: e.target.value });
  };

  const handleToggleExpand = () => {
    const newState = !expanded;
    setLocalExpanded(newState);
    if (forceExpanded !== undefined) {
      // forceExpandedがセットされている場合、親に通知してリセットしてもらう
      onExpandChange?.();
    }
  };

  const paperUrl =
    paper.url?.replace('\\url{', '').replace('}', '') ||
    (paper.doi ? `https://doi.org/${paper.doi}` : null);

  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-lg p-4 transition-colors',
        selected && 'ring-2 ring-gray-900'
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {onSelect && (
          <Checkbox
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="mt-1"
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Title and badges */}
          <div className="flex items-start gap-2 mb-1">
            <h3
              className={cn(
                'font-medium flex-1',
                isReviewed ? 'text-gray-500 line-through' : 'text-gray-900'
              )}
            >
              {paper.title}
            </h3>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span>{paper.author?.split(' AND ')[0]}{paper.author?.includes(' AND ') && ' et al.'}</span>
            <span>·</span>
            <span>{paper.year}</span>
            {paperUrl && (
              <>
                <span>·</span>
                <a
                  href={paperUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Link <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>

          {/* Decision badges */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">AI:</span>
            {getDecisionBadge(review?.ai_decision || paper.ai_decision)}
            {review?.manual_decision && review.manual_decision !== 'ai' && (
              <>
                <span className="text-xs text-gray-500">→</span>
                {getDecisionBadge(review.manual_decision)}
              </>
            )}
            {review?.manual_decision === 'ai' && (
              <Badge variant="secondary">✓ OK</Badge>
            )}
            {showReviewControls && isReviewed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReset();
                }}
                className="h-5 px-1.5 text-gray-400 hover:text-gray-600"
                title="レビューをリセット"
              >
                <Undo2 className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Expand button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleExpand}
            className="text-gray-500 -ml-2 h-6"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" /> Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" /> Details
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {/* Abstract */}
          {paper.abstract && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Abstract</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{paper.abstract}</p>
            </div>
          )}

          {/* AI Reason */}
          {(review?.ai_reason || paper.ai_reason) && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-1">AI Judgment</h4>
              <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                {review?.ai_reason || paper.ai_reason}
              </p>
              {(review?.ai_confidence || paper.ai_confidence) && (
                <p className="text-xs text-gray-400 mt-1">
                  Confidence: {((review?.ai_confidence || paper.ai_confidence || 0) * 100).toFixed(0)}%
                </p>
              )}
            </div>
          )}

          {/* Review controls */}
          {showReviewControls && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              {isReviewed ? (
                /* レビュー済みの場合 */
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    完了
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-7 px-2 text-xs text-gray-400 hover:text-gray-600"
                  >
                    <Undo2 className="h-3 w-3 mr-1" />
                    取り消し
                  </Button>
                </div>
              ) : (
                /* 未レビューの場合 */
                <div className="flex items-center gap-2 flex-wrap">
                  {/* AI判定を承認 */}
                  <button
                    onClick={handleApproveAI}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    <Check className="h-3.5 w-3.5" />
                    AI判定を承認
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-xs',
                      (review?.ai_decision || paper.ai_decision) === 'include' ? 'bg-green-100 text-green-700' :
                      (review?.ai_decision || paper.ai_decision) === 'exclude' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    )}>
                      {review?.ai_decision || paper.ai_decision}
                    </span>
                  </button>

                  <span className="text-gray-300">|</span>

                  {/* 判定を変更 */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDecisionClick('include')}
                      className="rounded px-2 py-1 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                    >
                      Include
                    </button>
                    <button
                      onClick={() => handleDecisionClick('exclude')}
                      className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                    >
                      Exclude
                    </button>
                    <button
                      onClick={() => handleDecisionClick('uncertain')}
                      className="rounded px-2 py-1 text-xs font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors"
                    >
                      Uncertain
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm text-gray-600 block mb-1">Note:</label>
                <Textarea
                  value={review?.note || ''}
                  onChange={handleNoteChange}
                  placeholder="Add a note..."
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
