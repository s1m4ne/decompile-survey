import { useState } from 'react';
import { Paper, PaperReview, UpdatePaperRequest } from '../lib/api';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { cn } from '../lib/utils';
import { ChevronDown, ChevronUp, ExternalLink, Check } from 'lucide-react';

interface PaperCardProps {
  paper: Paper;
  review?: PaperReview;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onUpdate?: (data: UpdatePaperRequest) => void;
  showReviewControls?: boolean;
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
}: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);

  const finalDecision = review?.manual_decision || review?.ai_decision || paper.ai_decision;

  const handleDecisionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onUpdate?.({ manual_decision: value === '' ? null : value });
  };

  const handleCheckedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate?.({ checked: e.target.checked });
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate?.({ note: e.target.value });
  };

  const paperUrl =
    paper.url?.replace('\\url{', '').replace('}', '') ||
    (paper.doi ? `https://doi.org/${paper.doi}` : null);

  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-lg p-4 transition-colors',
        selected && 'ring-2 ring-gray-900',
        review?.checked && 'bg-gray-50'
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
            <h3 className="font-medium text-gray-900 flex-1">{paper.title}</h3>
            {showReviewControls && review?.checked && (
              <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
            )}
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
            {review?.manual_decision && (
              <>
                <span className="text-xs text-gray-500">→</span>
                {getDecisionBadge(review.manual_decision)}
                <span className="text-xs text-gray-400">(manual)</span>
              </>
            )}
          </div>

          {/* Expand button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 -ml-2"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" /> Hide details
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" /> Show details
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
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Decision:</label>
                  <Select
                    value={review?.manual_decision || ''}
                    onChange={handleDecisionChange}
                    className="w-32"
                  >
                    <option value="">AI default</option>
                    <option value="include">Include</option>
                    <option value="exclude">Exclude</option>
                    <option value="uncertain">Uncertain</option>
                  </Select>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <Checkbox
                    checked={review?.checked || false}
                    onChange={handleCheckedChange}
                  />
                  Checked
                </label>
              </div>

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
