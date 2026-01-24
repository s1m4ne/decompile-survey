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
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API Error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Types
// ============================================================================

// Project
export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  pipeline_summary: Record<string, { input?: number; outputs?: Record<string, number> }>;
}

export interface ProjectCreate {
  name: string;
  description?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
}

// Pipeline
export interface PipelineStep {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  input_from: string | { step: string; output: string };
  config: Record<string, unknown>;
}

export interface Pipeline {
  version: string;
  steps: PipelineStep[];
  final_output: { step: string; output: string } | null;
}

// Step
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepOutput {
  file: string;
  count: number;
  description: string;
}

export interface StepExecution {
  status: StepStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_sec: number | null;
  error: string | null;
}

export interface StepMeta {
  step_id: string;
  step_type: string;
  name: string;
  input: {
    from: string;
    output: string;
    file: string;
    count: number;
  } | null;
  outputs: Record<string, StepOutput>;
  stats: {
    input_count: number;
    total_output_count: number;
    passed_count: number;
    removed_count: number;
  };
  execution: StepExecution;
  is_latest: boolean;
}

// Step Type
export interface OutputDefinition {
  name: string;
  description: string;
  required: boolean;
}

export interface StepTypeInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  outputs: OutputDefinition[];
  config_schema: Record<string, unknown>;
}

// Sources
export interface SourceFile {
  filename: string;
  category: string;
  count: number;
  database: string | null;
  search_query: string | null;
  search_date: string | null;
}

export interface SourcesMeta {
  databases: SourceFile[];
  other: SourceFile[];
  totals: {
    databases: number;
    other: number;
    combined: number;
  };
}

// ============================================================================
// API Functions
// ============================================================================

// Projects
export const projectsApi = {
  list: () => fetchApi<Project[]>('/projects'),

  create: (data: ProjectCreate) =>
    fetchApi<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: string) => fetchApi<Project>(`/projects/${id}`),

  update: (id: string, data: ProjectUpdate) =>
    fetchApi<Project>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ status: string }>(`/projects/${id}`, {
      method: 'DELETE',
    }),
};

// Pipeline
export const pipelineApi = {
  get: (projectId: string) =>
    fetchApi<Pipeline>(`/projects/${projectId}/pipeline`),

  update: (projectId: string, pipeline: Pipeline) =>
    fetchApi<Pipeline>(`/projects/${projectId}/pipeline`, {
      method: 'PUT',
      body: JSON.stringify(pipeline),
    }),

  addStep: (projectId: string, step: PipelineStep) =>
    fetchApi<Pipeline>(`/projects/${projectId}/pipeline/steps`, {
      method: 'POST',
      body: JSON.stringify(step),
    }),

  updateStep: (projectId: string, stepId: string, step: PipelineStep) =>
    fetchApi<Pipeline>(`/projects/${projectId}/pipeline/steps/${stepId}`, {
      method: 'PUT',
      body: JSON.stringify(step),
    }),

  removeStep: (projectId: string, stepId: string) =>
    fetchApi<Pipeline>(`/projects/${projectId}/pipeline/steps/${stepId}`, {
      method: 'DELETE',
    }),

  moveStep: (projectId: string, stepId: string, newIndex: number) =>
    fetchApi<Pipeline>(`/projects/${projectId}/pipeline/steps/${stepId}/move?new_index=${newIndex}`, {
      method: 'POST',
    }),
};

// Steps
export const stepsApi = {
  list: (projectId: string) =>
    fetchApi<StepMeta[]>(`/projects/${projectId}/steps`),

  get: (projectId: string, stepId: string) =>
    fetchApi<StepMeta>(`/projects/${projectId}/steps/${stepId}`),

  run: (projectId: string, stepId: string) =>
    fetchApi<StepMeta>(`/projects/${projectId}/steps/${stepId}/run`, {
      method: 'POST',
    }),

  reset: (projectId: string, stepId: string) =>
    fetchApi<StepMeta>(`/projects/${projectId}/steps/${stepId}/reset`, {
      method: 'POST',
    }),

  delete: (projectId: string, stepId: string) =>
    fetchApi<{ success: boolean; deleted_step_id: string }>(`/projects/${projectId}/steps/${stepId}`, {
      method: 'DELETE',
    }),

  getOutput: (projectId: string, stepId: string, outputName: string) =>
    fetchApi<{ entries: Record<string, unknown>[]; count: number }>(
      `/projects/${projectId}/steps/${stepId}/outputs/${outputName}`
    ),

  getInput: (projectId: string, stepId: string) =>
    fetchApi<{ entries: Record<string, unknown>[]; count: number }>(
      `/projects/${projectId}/steps/${stepId}/input`
    ),

  getChanges: (projectId: string, stepId: string) =>
    fetchApi<Record<string, unknown>[]>(`/projects/${projectId}/steps/${stepId}/changes`),

  getClusters: (projectId: string, stepId: string) =>
    fetchApi<{ clusters: Record<string, unknown>[] }>(`/projects/${projectId}/steps/${stepId}/clusters`),

  updateClusters: (projectId: string, stepId: string, clusters: Record<string, unknown>[]) =>
    fetchApi<{ status: string; clusters: number }>(`/projects/${projectId}/steps/${stepId}/clusters`, {
      method: 'POST',
      body: JSON.stringify({ clusters }),
    }),

  getReview: (projectId: string, stepId: string) =>
    fetchApi<{ reviews: Record<string, unknown>[] }>(`/projects/${projectId}/steps/${stepId}/review`),

  updateReview: (projectId: string, stepId: string, reviews: Record<string, unknown>[]) =>
    fetchApi<{ status: string; reviewed: number }>(`/projects/${projectId}/steps/${stepId}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviews }),
    }),

  applyOutputMode: (projectId: string, stepId: string, mode: string) =>
    fetchApi<{ status: string; mode: string }>(`/projects/${projectId}/steps/${stepId}/output-mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
};

// Step Types
export const stepTypesApi = {
  list: () => fetchApi<StepTypeInfo[]>('/step-types'),
  get: (type: string) => fetchApi<StepTypeInfo>(`/step-types/${type}`),
};

// Sources
export interface PickFileResponse {
  paths: string[] | null;
  filenames: string[] | null;
  cancelled: boolean;
  modified_at?: string[] | null;
  created_at?: (string | null)[] | null;
}

export const sourcesApi = {
  get: (projectId: string) =>
    fetchApi<SourcesMeta>(`/projects/${projectId}/sources`),

  pickFile: (projectId: string) =>
    fetchApi<PickFileResponse>(`/projects/${projectId}/sources/pick-file`, {
      method: 'POST',
    }),

  addFromPath: (
    projectId: string,
    path: string,
    category: string,
    database?: string,
    search_query?: string,
    search_date?: string
  ) =>
    fetchApi<SourceFile>(`/projects/${projectId}/sources/add-from-path`, {
      method: 'POST',
      body: JSON.stringify({ path, category, database, search_query, search_date }),
    }),

  upload: async (
    projectId: string,
    file: File,
    category: string,
    database?: string,
    search_query?: string,
    search_date?: string
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    if (database) {
      formData.append('database', database);
    }
    if (search_query) {
      formData.append('search_query', search_query);
    }
    if (search_date) {
      formData.append('search_date', search_date);
    }

    const response = await fetch(`${API_BASE}/projects/${projectId}/sources/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `API Error: ${response.status}`);
    }

    return response.json() as Promise<SourceFile>;
  },

  delete: (projectId: string, category: string, filename: string) =>
    fetchApi<{ status: string }>(`/projects/${projectId}/sources/${category}/${filename}`, {
      method: 'DELETE',
    }),

  getEntries: (projectId: string, category: string, filename: string) =>
    fetchApi<{ entries: Record<string, unknown>[]; count: number }>(
      `/projects/${projectId}/sources/${category}/${filename}/entries`
    ),

  getStat: (projectId: string, category: string, filename: string) =>
    fetchApi<{ filename: string; category: string; modified_at: string; created_at: string | null }>(
      `/projects/${projectId}/sources/${category}/${filename}/stat`
    ),
};

// Rules
export interface RuleInfo {
  id: string;
  filename: string;
  path: string;
}

export interface RuleContent {
  id: string;
  filename: string;
  content: string;
}

export const rulesApi = {
  list: () => fetchApi<RuleInfo[]>('/rules'),
  get: (ruleId: string) => fetchApi<RuleContent>(`/rules/${ruleId}`),
};

// LLM
export interface LocalLLMCheckResponse {
  connected: boolean;
  url: string;
  models: { id: string; owned_by: string }[];
  error: string | null;
}

export const llmApi = {
  checkLocal: (baseUrl: string) =>
    fetchApi<LocalLLMCheckResponse>('/llm/check-local', {
      method: 'POST',
      body: JSON.stringify({ base_url: baseUrl }),
    }),
};

// Health
export const healthApi = {
  check: () => fetchApi<{ status: string; version: string }>('/health'),
};
