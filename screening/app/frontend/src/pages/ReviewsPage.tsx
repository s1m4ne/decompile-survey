import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { runsApi, RunSummary } from '../lib/api';
import { Badge } from '../components/ui/Badge';
import { ChevronRight } from 'lucide-react';

export function ReviewsPage() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: runsApi.list,
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Screening Runs</h2>
        <p className="text-gray-500 mt-1">Select a run to review papers</p>
      </div>

      {runs?.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No screening runs found. Run a screening first.
        </div>
      ) : (
        <div className="space-y-4">
          {runs?.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: RunSummary }) {
  const total = run.stats.total;
  const includedPct = total > 0 ? (run.stats.included / total) * 100 : 0;
  const excludedPct = total > 0 ? (run.stats.excluded / total) * 100 : 0;
  const uncertainPct = total > 0 ? (run.stats.uncertain / total) * 100 : 0;

  return (
    <Link to={`/reviews/${run.id}`} className="block">
      <div className="bg-white border border-gray-200 rounded-lg px-5 py-6 hover:border-gray-300 transition-colors cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-medium text-gray-900">{run.id}</h3>
              {run.rules_name && (
                <Badge variant="outline" className="font-normal">{run.rules_name}</Badge>
              )}
            </div>

            {/* Stats with inline progress bar */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">{total} papers</span>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="font-normal">
                  {run.stats.included} included
                </Badge>
                <Badge variant="destructive" className="font-normal">
                  {run.stats.excluded} excluded
                </Badge>
                {run.stats.uncertain > 0 && (
                  <Badge variant="warning" className="font-normal">
                    {run.stats.uncertain} uncertain
                  </Badge>
                )}
              </div>
              {/* Progress bar */}
              <div className="flex flex-col gap-0.5">
                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                  <div
                    className="bg-green-200 h-full"
                    style={{ width: `${includedPct}%` }}
                  />
                  <div
                    className="bg-red-200 h-full"
                    style={{ width: `${excludedPct}%` }}
                  />
                  <div
                    className="bg-yellow-200 h-full"
                    style={{ width: `${uncertainPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-green-800">{includedPct.toFixed(0)}%</span>
                  <span className="text-red-800">{excludedPct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          <ChevronRight className="h-5 w-5 text-gray-400 ml-4" />
        </div>
      </div>
    </Link>
  );
}
