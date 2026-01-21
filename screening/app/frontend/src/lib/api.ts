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
  rules_name: string;
  stats: {
    total: number;
    included: number;
    excluded: number;
    uncertain: number;
  };
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
  manual_decision: string | null;
  checked: boolean;
  note: string;
}

export interface Review {
  meta: {
    run_id: string;
    source_rules: string;
    source_input: string;
    created_at: string;
    updated_at: string;
    stats: {
      total: number;
      checked: number;
      modified: number;
    };
  };
  papers: Record<string, PaperReview>;
}

export interface UpdatePaperRequest {
  manual_decision?: string | null;
  checked?: boolean;
  note?: string;
}

export interface BulkUpdateRequest {
  citation_keys: string[];
  manual_decision?: string | null;
  checked?: boolean;
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
  title: string;
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
}

export const screeningApi = {
  listRules: () => fetchApi<RuleFile[]>('/screening/rules'),
  listInputs: () => fetchApi<InputFile[]>('/screening/inputs'),
  run: (data: ScreeningRequest) =>
    fetchApi<{ status: string; run_id: string; output: string }>('/screening/run', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
