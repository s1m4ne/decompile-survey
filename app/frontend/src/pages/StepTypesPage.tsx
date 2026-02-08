import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Box, Circle } from 'lucide-react';
import { stepTypesApi } from '../lib/api';

export function StepTypesPage() {
  const { data: stepTypes, isLoading } = useQuery({
    queryKey: ['step-types'],
    queryFn: stepTypesApi.list,
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to projects
        </Link>
        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
          Step Types
        </h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          Available pipeline step types
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          Loading...
        </div>
      ) : stepTypes?.length === 0 ? (
        <div className="text-center py-12">
          <Box className="w-12 h-12 mx-auto text-[hsl(var(--muted-foreground))] mb-4" />
          <p className="text-[hsl(var(--muted-foreground))]">No step types registered</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
            Implement step handlers in the backend to add them here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {[...(stepTypes ?? [])]
            .sort((a, b) => {
              const order: Record<string, number> = {
                'dedup-doi': 10,
                'dedup-title': 11,
                'dedup-author': 12,
                'pdf-fetch': 20,
                'ai-screening': 30,
              };
              const aRank = order[a.id] ?? 100;
              const bRank = order[b.id] ?? 100;
              if (aRank !== bRank) return aRank - bRank;
              return a.name.localeCompare(b.name);
            })
            .map((type) => (
            <div
              key={type.id}
              className="p-4 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[hsl(var(--secondary))] rounded-lg flex items-center justify-center flex-shrink-0">
                  <Circle className="w-5 h-5 text-[hsl(var(--secondary-foreground))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium text-[hsl(var(--card-foreground))]">
                      {type.name}
                    </h2>
                    <span className="px-2 py-0.5 bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-xs rounded font-mono">
                      {type.id}
                    </span>
                  </div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                    {type.description}
                  </p>

                  {type.outputs.length > 0 && (
                    <div className="mt-3">
                      <h3 className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2">
                        Outputs
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {type.outputs.map((output) => (
                          <div
                            key={output.name}
                            className="px-2 py-1 bg-[hsl(var(--muted))] rounded text-xs"
                            title={output.description}
                          >
                            <span className="text-[hsl(var(--foreground))]">{output.name}</span>
                            {!output.required && (
                              <span className="text-[hsl(var(--muted-foreground))] ml-1">(optional)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-[hsl(var(--muted))] rounded-lg">
        <h3 className="font-medium text-[hsl(var(--foreground))] mb-2">
          Adding New Step Types
        </h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          To add a new step type, create a handler in{' '}
          <code className="px-1 py-0.5 bg-[hsl(var(--background))] rounded text-xs">
            backend/step_handlers/
          </code>{' '}
          and register it with the{' '}
          <code className="px-1 py-0.5 bg-[hsl(var(--background))] rounded text-xs">
            @register_step_type
          </code>{' '}
          decorator.
        </p>
      </div>
    </div>
  );
}
