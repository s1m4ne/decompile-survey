/**
 * Modal for configuring and running a step.
 */
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Play, Loader2 } from 'lucide-react';
import { stepTypesApi, rulesApi, llmApi, PipelineStep, StepTypeInfo, LocalLLMCheckResponse } from '../lib/api';

interface StepConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (config: Record<string, unknown>) => void;
  step: PipelineStep;
  isRunning: boolean;
}

export function StepConfigModal({
  isOpen,
  onClose,
  onRun,
  step,
  isRunning,
}: StepConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(step.config || {});
  const [localCheckResult, setLocalCheckResult] = useState<LocalLLMCheckResponse | null>(null);

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

  // Reset config when step changes
  useEffect(() => {
    setConfig(step.config || {});
    setLocalCheckResult(null);
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

    // Special handling for rules field - use fetched rules list
    if (key === 'rules' && step.type === 'ai-screening' && rules.length > 0) {
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
            {rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.filename}
              </option>
            ))}
          </select>
          {description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[hsl(var(--background))] rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
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
