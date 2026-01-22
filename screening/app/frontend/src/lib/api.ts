const API_BASE = '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

// Runs API
export interface RunSummary {
  id: string;
  rules_file: string;
  stats: {
    total: number;
    included: number;
    excluded: number;
    uncertain: number;
  };
  input_file?: string | null;
  model?: string | null;
  created_at?: string | null;
}

export interface Paper {
  citation_key: string;
  title: string;
  abstract: string;
  year: string;
  author: string;
  doi: string;
  url: string;
  ai_decision?: string;
  ai_confidence?: number;
  ai_reason?: string;
}

export interface RunMeta {
  run_id: string;
  created_at: string;
  model: string;
  concurrency: number;
  input_file: string;
  input_file_abs: string;
  rules_file: string;
  rules_file_abs: string;
}

export interface RunDetail {
  id: string;
  papers: Paper[];
  rules: string;
  stats: {
    total: number;
    included: number;
    excluded: number;
    uncertain: number;
  };
  meta?: RunMeta | null;
}

export const runsApi = {
  list: () => fetchApi<RunSummary[]>('/runs'),
  get: (id: string) => fetchApi<RunDetail>(`/runs/${id}`),
  getRules: (id: string) => fetchApi<{ content: string }>(`/runs/${id}/rules`),
};

// Imports API
export interface BibFile {
  filename: string;
  path: string;
  count: number;
}

export interface Database {
  name: string;
  files: BibFile[];
  total_files: number;
}

export interface ImportDetail {
  database: string;
  filename: string;
  papers: Paper[];
  count: number;
}

export const importsApi = {
  list: () => fetchApi<Database[]>('/imports'),
  get: (database: string, filename: string) =>
    fetchApi<ImportDetail>(`/imports/${database}/${filename}`),
};

// Reviews API
export interface PaperReview {
  ai_decision: string;
  ai_confidence: number;
  ai_reason: string;
  manual_decision: string | null;  // null = not reviewed, "ai" = approved AI, "include"/"exclude"/"uncertain" = human override
  note: string;
}

export interface Review {
  meta: {
    run_id: string;
    source_input: string;
    created_at: string;
    updated_at: string;
    stats: {
      total: number;
      reviewed: number;
    };
  };
  papers: Record<string, PaperReview>;
}

export interface UpdatePaperRequest {
  manual_decision?: string | null;
  note?: string;
  reset?: boolean;  // true to reset manual_decision to null
}

export interface BulkUpdateRequest {
  citation_keys: string[];
  manual_decision?: string | null;
  reset?: boolean;
}

export const reviewsApi = {
  get: (runId: string) => fetchApi<Review>(`/reviews/${runId}`),
  updatePaper: (runId: string, citationKey: string, data: UpdatePaperRequest) =>
    fetchApi<PaperReview>(`/reviews/${runId}/papers/${citationKey}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  bulkUpdate: (runId: string, data: BulkUpdateRequest) =>
    fetchApi<{ updated: string[]; count: number }>(`/reviews/${runId}/bulk-update`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  export: (runId: string) => fetchApi<unknown>(`/reviews/${runId}/export`),
};

// Screening API
export interface RuleFile {
  filename: string;
}

export interface RuleDetail {
  filename: string;
  content: string;
}

export interface InputFile {
  path: string;
  database: string;
  filename: string;
}

export interface ScreeningRequest {
  input_file: string;
  rules_file: string;
  model?: string;
  concurrency?: number;
  provider?: 'openai' | 'local';
}

export interface CreateRuleRequest {
  filename: string;
  content: string;
}

export interface PickFileResponse {
  path: string | null;
  cancelled: boolean;
}

export interface LocalServerStatus {
  connected: boolean;
  url: string;
  models: { id: string; owned_by: string }[];
  error: string | null;
}

export const screeningApi = {
  listRules: () => fetchApi<RuleFile[]>('/screening/rules'),
  getRule: (filename: string) => fetchApi<RuleDetail>(`/screening/rules/${filename}`),
  createRule: (data: CreateRuleRequest) =>
    fetchApi<RuleDetail>('/screening/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listInputs: () => fetchApi<InputFile[]>('/screening/inputs'),
  pickFile: () =>
    fetchApi<PickFileResponse>('/screening/pick-file', {
      method: 'POST',
    }),
  checkLocalServer: () => fetchApi<LocalServerStatus>('/screening/check-local-server'),
  run: (data: ScreeningRequest) =>
    fetchApi<{ status: string; run_id: string; output: string }>('/screening/run', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
