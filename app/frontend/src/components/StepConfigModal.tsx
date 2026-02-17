/**
 * Modal for configuring and running a step.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Play, Loader2, Plus, ArrowUp, ArrowDown, GripVertical, RotateCcw } from 'lucide-react';
import {
  stepTypesApi,
  rulesApi,
  llmApi,
  projectImportSourcesApi,
  sourcesApi,
  PipelineStep,
  LocalLLMCheckResponse,
} from '../lib/api';

function normalizeDatabaseKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseDatabasePriority(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(/[,\n>]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function uniqueDatabaseList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const token = String(value ?? '').trim();
    if (!token) continue;
    const key = normalizeDatabaseKey(token);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}

interface StepConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (config: Record<string, unknown>) => void;
  step: PipelineStep;
  projectId: string;
  isRunning: boolean;
}

export function StepConfigModal({
  isOpen,
  onClose,
  onRun,
  step,
  projectId,
  isRunning,
}: StepConfigModalProps) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Record<string, unknown>>(step.config || {});
  const [localCheckResult, setLocalCheckResult] = useState<LocalLLMCheckResponse | null>(null);
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [newRuleFilename, setNewRuleFilename] = useState('');
  const [newRuleContent, setNewRuleContent] = useState('');
  const [draggingDbIndex, setDraggingDbIndex] = useState<number | null>(null);
  const [dragOverDbIndex, setDragOverDbIndex] = useState<number | null>(null);
  const isDatabasePriorityStep = step.type === 'dedup-doi' || step.type === 'dedup-title';

  // Fetch step type info for config schema
  const { data: stepTypeInfo } = useQuery({
    queryKey: ['step-type', step.type],
    queryFn: () => stepTypesApi.get(step.type),
    enabled: isOpen,
  });

  // Fetch rules list for ai-screening
  const { data: rules = [] } = useQuery({
    queryKey: ['rules'],
    queryFn: () => rulesApi.list(),
    enabled: isOpen && step.type === 'ai-screening',
  });

  const { data: importSources = [] } = useQuery({
    queryKey: ['project-import-sources', projectId],
    queryFn: () => projectImportSourcesApi.get(projectId),
    enabled: isOpen && isDatabasePriorityStep && Boolean(projectId),
  });

  const { data: legacySources } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => sourcesApi.get(projectId),
    enabled: isOpen && isDatabasePriorityStep && Boolean(projectId),
  });

  // Fetch suggested next filename for new rules
  const { data: nextFilename } = useQuery({
    queryKey: ['rules-next-filename'],
    queryFn: () => rulesApi.getNextFilename(),
    enabled: isOpen && step.type === 'ai-screening' && showNewRuleForm,
  });

  // Create new rule mutation
  const createRuleMutation = useMutation({
    mutationFn: (data: { filename: string; content: string }) => rulesApi.create(data),
    onSuccess: (newRule) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setConfig((prev) => ({ ...prev, rules: newRule.id }));
      setShowNewRuleForm(false);
      setNewRuleFilename('');
      setNewRuleContent('');
    },
  });

  // Pre-fill new rule filename when form opens
  useEffect(() => {
    if (showNewRuleForm && nextFilename && !newRuleFilename) {
      setNewRuleFilename(nextFilename.suggested_filename);
    }
  }, [showNewRuleForm, nextFilename, newRuleFilename]);

  // Reset config when step changes
  useEffect(() => {
    setConfig(step.config || {});
    setLocalCheckResult(null);
    setShowNewRuleForm(false);
    setNewRuleFilename('');
    setNewRuleContent('');
    setDraggingDbIndex(null);
    setDragOverDbIndex(null);
  }, [step.config]);

  // Apply defaults from schema
  useEffect(() => {
    if (stepTypeInfo?.config_schema) {
      const schema = stepTypeInfo.config_schema as {
        properties?: Record<string, { default?: unknown }>;
      };
      if (schema.properties) {
        const newConfig = { ...config };
        let hasChanges = false;
        for (const [key, prop] of Object.entries(schema.properties)) {
          if (config[key] === undefined && prop.default !== undefined) {
            newConfig[key] = prop.default;
            hasChanges = true;
          }
        }
        if (hasChanges) {
          setConfig(newConfig);
        }
      }
    }
  }, [stepTypeInfo]);

  const availableDatabases = useMemo(() => {
    const fromImportSources = importSources.flatMap((source) => source.databases || []);
    const fromLegacyDatabases = (legacySources?.databases || []).map((source) => source.database);
    const fromLegacyOther = (legacySources?.other || []).map((source) => source.database);
    return uniqueDatabaseList([
      ...fromImportSources,
      ...fromLegacyDatabases,
      ...fromLegacyOther,
    ]);
  }, [importSources, legacySources]);

  const configuredDatabasePriority = useMemo(
    () => parseDatabasePriority(config.database_priority),
    [config.database_priority]
  );

  const databasePriorityOrder = useMemo(
    () => uniqueDatabaseList([...configuredDatabasePriority, ...availableDatabases]),
    [configuredDatabasePriority, availableDatabases]
  );

  useEffect(() => {
    if (!isDatabasePriorityStep || availableDatabases.length === 0) return;
    setConfig((prev) => {
      const current = parseDatabasePriority(prev.database_priority);
      if (current.length > 0) return prev;
      return {
        ...prev,
        database_priority: availableDatabases.join(', '),
      };
    });
  }, [isDatabasePriorityStep, availableDatabases]);

  const previousProviderRef = useRef<string | null>(null);

  // Provider-specific defaults for AI screening (from backend schema)
  useEffect(() => {
    if (step.type !== 'ai-screening') return;
    const schema = stepTypeInfo?.config_schema as {
      properties?: Record<string, { default?: unknown }>;
      'x-provider-defaults'?: Record<string, { model?: string; concurrency?: number }>;
    } | undefined;

    const providerDefaults = schema?.['x-provider-defaults'] ?? {};
    const provider = (config.provider ??
      schema?.properties?.provider?.default ??
      'local') as string;

    const previousProvider = previousProviderRef.current;
    previousProviderRef.current = provider;

    setConfig((prev) => {
      const next = { ...prev };
      let changed = false;

      const defaults = providerDefaults[provider] ?? {};
      const previousDefaults = previousProvider ? providerDefaults[previousProvider] ?? {} : {};

      if (prev.model === undefined || prev.model === previousDefaults.model) {
        if (defaults.model !== undefined) {
          next.model = defaults.model;
          changed = true;
        }
      }
      if (prev.concurrency === undefined || prev.concurrency === previousDefaults.concurrency) {
        if (defaults.concurrency !== undefined) {
          next.concurrency = defaults.concurrency;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [config.provider, step.type, stepTypeInfo]);

  const checkLocalMutation = useMutation({
    mutationFn: (baseUrl: string) => llmApi.checkLocal(baseUrl),
    onSuccess: (data) => {
      setLocalCheckResult(data);
    },
    onError: (error: Error) => {
      setLocalCheckResult({
        connected: false,
        url: (config.local_base_url as string) || '',
        models: [],
        error: error.message,
      });
    },
  });

  if (!isOpen) return null;

  const handleRun = () => {
    onRun(config);
  };

  const updateConfig = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const applyDatabasePriorityOrder = (nextOrder: string[]) => {
    const uniqueOrder = uniqueDatabaseList(nextOrder);
    updateConfig('database_priority', uniqueOrder.join(', '));
  };

  const moveDatabasePriority = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (toIndex < 0 || toIndex >= databasePriorityOrder.length) return;
    const nextOrder = [...databasePriorityOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    applyDatabasePriorityOrder(nextOrder);
  };

  // Render config field based on schema
  const renderConfigField = (key: string, schema: Record<string, unknown>) => {
    const type = schema.type as string;
    const description = schema.description as string | undefined;
    const enumValues = schema.enum as string[] | undefined;
    const defaultValue = schema.default;
    const value = config[key] ?? defaultValue;

    if (key === 'output_mode' && step.type === 'ai-screening') {
      return null;
    }

    if (key === 'database_priority' && isDatabasePriorityStep) {
      const hasDetectedDatabases = availableDatabases.length > 0;
      return (
        <div key={key} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">
              {formatLabel(key)}
            </label>
            <button
              type="button"
              onClick={() => applyDatabasePriorityOrder(availableDatabases)}
              disabled={!hasDetectedDatabases}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            優先度が高い順に上から並べてください。ドラッグまたは上下ボタンで入れ替えできます。
          </p>
          {databasePriorityOrder.length === 0 ? (
            <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
              利用可能な文献DBが見つかりません。先にSources/Importsを設定してください。
            </div>
          ) : (
            <ul className="space-y-2">
              {databasePriorityOrder.map((database, index) => {
                const isDragging = draggingDbIndex === index;
                const isDropTarget = dragOverDbIndex === index && draggingDbIndex !== index;
                return (
                  <li
                    key={`${database}-${index}`}
                    draggable
                    onDragStart={() => setDraggingDbIndex(index)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverDbIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggingDbIndex === null) return;
                      moveDatabasePriority(draggingDbIndex, index);
                      setDraggingDbIndex(null);
                      setDragOverDbIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggingDbIndex(null);
                      setDragOverDbIndex(null);
                    }}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                      isDropTarget
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--muted))]'
                        : 'border-[hsl(var(--border))] bg-[hsl(var(--background))]'
                    } ${isDragging ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                      <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-xs font-semibold text-[hsl(var(--secondary-foreground))] shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium truncate">{database}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveDatabasePriority(index, index - 1)}
                        disabled={index === 0}
                        className="p-1 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-40"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDatabasePriority(index, index + 1)}
                        disabled={index === databasePriorityOrder.length - 1}
                        className="p-1 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-40"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
          )}
        </div>
      );
    }

    // Special handling for rules field - use fetched rules list
    if (key === 'rules' && step.type === 'ai-screening' && rules.length > 0) {
      return (
        <div key={key} className="space-y-2">
          <label className="block text-sm font-medium">
            {formatLabel(key)}
          </label>
          <div className="flex gap-2">
            <select
              value={(value as string) || ''}
              onChange={(e) => updateConfig(key, e.target.value)}
              className="flex-1 px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
            >
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.filename}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewRuleForm(!showNewRuleForm)}
              className={`px-3 py-2 text-sm border rounded-md flex items-center gap-1 ${
                showNewRuleForm
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--muted))]'
                  : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
              }`}
              title="Create new rule"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
          )}

          {/* New Rule Form */}
          {showNewRuleForm && (
            <div className="mt-3 p-3 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--muted))] space-y-3">
              <div className="text-sm font-medium">Create New Rule</div>
              <div className="space-y-1">
                <label className="block text-xs text-[hsl(var(--muted-foreground))]">
                  Filename
                </label>
                <input
                  type="text"
                  value={newRuleFilename}
                  onChange={(e) => setNewRuleFilename(e.target.value)}
                  placeholder="rule_v1.md"
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-[hsl(var(--muted-foreground))]">
                  Content (Markdown)
                </label>
                <textarea
                  value={newRuleContent}
                  onChange={(e) => setNewRuleContent(e.target.value)}
                  placeholder="# Screening Rules&#10;&#10;## Include criteria&#10;..."
                  rows={8}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-mono"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewRuleForm(false);
                    setNewRuleFilename('');
                    setNewRuleContent('');
                  }}
                  className="px-3 py-1.5 text-xs border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--background))]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (newRuleFilename && newRuleContent) {
                      createRuleMutation.mutate({
                        filename: newRuleFilename,
                        content: newRuleContent,
                      });
                    }
                  }}
                  disabled={!newRuleFilename || !newRuleContent || createRuleMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {createRuleMutation.isPending ? 'Creating...' : 'Create & Select'}
                </button>
              </div>
              {createRuleMutation.isError && (
                <p className="text-xs text-[hsl(var(--status-danger-fg))]">
                  {(createRuleMutation.error as Error)?.message || 'Failed to create rule'}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    if (type === 'boolean') {
      return (
        <div key={key} className="flex items-center gap-3">
          <input
            type="checkbox"
            id={key}
            checked={value as boolean}
            onChange={(e) => updateConfig(key, e.target.checked)}
            className="rounded"
          />
          <label htmlFor={key} className="text-sm font-medium">
            {formatLabel(key)}
          </label>
          {description && (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              - {description}
            </span>
          )}
        </div>
      );
    }

    if (key === 'model' && step.type === 'ai-screening') {
      const provider = (config.provider ?? 'local') as string;
      const providerModels = (stepTypeInfo?.config_schema as {
        'x-provider-models'?: Record<string, string[]>;
      })?.['x-provider-models'];
      const modelOptions = providerModels?.[provider] ?? enumValues ?? [];
      return (
        <div key={key} className="space-y-1">
          <label className="block text-sm font-medium">
            {formatLabel(key)}
          </label>
          <select
            value={(value as string) || modelOptions[0] || ''}
            onChange={(e) => updateConfig(key, e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
          >
            {modelOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
          )}
        </div>
      );
    }

    if (key === 'local_base_url' && step.type === 'ai-screening') {
      const provider = (config.provider ?? 'local') as string;
      if (provider !== 'local') {
        return null;
      }
      return (
        <div key={key} className="space-y-2">
          <label className="block text-sm font-medium">
            {formatLabel(key)}
          </label>
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => {
              updateConfig(key, e.target.value);
              setLocalCheckResult(null);
            }}
            className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => checkLocalMutation.mutate((value as string) || '')}
              disabled={checkLocalMutation.isPending || !(value as string)}
              className="px-3 py-1.5 text-xs border border-[hsl(var(--border))] rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              {checkLocalMutation.isPending ? 'Checking...' : '接続確認'}
            </button>
            {localCheckResult && (
              <span
                className={
                  localCheckResult.connected
                    ? 'text-xs text-[hsl(var(--status-success-fg))]'
                    : 'text-xs text-[hsl(var(--status-danger-fg))]'
                }
              >
                {localCheckResult.connected
                  ? '接続OK'
                  : `失敗: ${localCheckResult.error ?? 'unknown error'}`}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
          )}
        </div>
      );
    }

    if (enumValues) {
      return (
        <div key={key} className="space-y-1">
          <label className="block text-sm font-medium">
            {formatLabel(key)}
          </label>
          <select
            value={(value as string) || ''}
            onChange={(e) => updateConfig(key, e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
          >
            {enumValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
          )}
        </div>
      );
    }

    if (type === 'integer' || type === 'number') {
      const min = schema.minimum as number | undefined;
      const max = schema.maximum as number | undefined;
      return (
        <div key={key} className="space-y-1">
          <label className="block text-sm font-medium">
            {formatLabel(key)}
          </label>
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => updateConfig(key, e.target.value ? Number(e.target.value) : undefined)}
            min={min}
            max={max}
            className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
          />
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
          )}
        </div>
      );
    }

    // Default: text input
    return (
      <div key={key} className="space-y-1">
        <label className="block text-sm font-medium">
          {formatLabel(key)}
        </label>
        <input
          type="text"
          value={(value as string) || ''}
          onChange={(e) => updateConfig(key, e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        />
        {description && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
        )}
      </div>
    );
  };

  const schema = stepTypeInfo?.config_schema as {
    properties?: Record<string, Record<string, unknown>>;
  } | undefined;
  const modalWidthClass = isDatabasePriorityStep ? 'max-w-2xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative bg-[hsl(var(--background))] rounded-lg shadow-xl w-full ${modalWidthClass} mx-4 max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold">Run {step.name}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[hsl(var(--muted))] rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {stepTypeInfo?.description && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {stepTypeInfo.description}
            </p>
          )}

          {step.type === 'pdf-fetch' && (
            <div className="rounded-md border border-[hsl(var(--status-info-border))] bg-[hsl(var(--status-info-bg))] p-3 text-xs text-[hsl(var(--status-info-fg))] space-y-1">
              <p className="font-medium">Browser assist behavior</p>
              <p>
                If publisher login/challenge is needed, a browser window opens automatically.
                Complete login/challenge there, then keep the window open until the step completes.
              </p>
            </div>
          )}

          {/* Config fields */}
          {schema?.properties && Object.keys(schema.properties).length > 0 ? (
            <div className="space-y-4">
              <h3 className="font-medium">Configuration</h3>
              {Object.entries(schema.properties).map(([key, propSchema]) =>
                renderConfigField(key, propSchema)
              )}
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No configuration options for this step type.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-[hsl(var(--border))]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--muted))]"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning ? 'Running...' : 'Run Step'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
