import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE}/api/v1/auth/refresh`, {
            refresh_token: refresh,
          });
          localStorage.setItem("access_token", data.access_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = "/login";
        }
      }
    }

    if (error.response?.status !== 401) {
      const status = error.response?.status;
      const detail =
        error.response?.data?.detail ??
        error.response?.data?.message ??
        error.message ??
        "An unexpected error occurred";

      import("@/store/toast").then(({ toast }) => {
        toast.error(
          status ? `Error ${status}` : "Request failed",
          typeof detail === "string" ? detail : JSON.stringify(detail),
        );
      });
    }

    return Promise.reject(error);
  },
);

async function resolvePlanDraftRevision(planId: string, draftRevision?: number) {
  if (typeof draftRevision === "number") {
    return draftRevision;
  }

  const { data } = await api.get(`/plans/${planId}`);
  return data.draft_revision as number;
}

type PublishPayload =
  | string
  | {
      draft_revision?: number;
      summary?: string;
      allow_breaking?: boolean;
    };

type BranchPayload =
  | string
  | {
      branch_name: string;
      draft_revision?: number;
    };

export type ValidationMode = "warn" | "block" | "quarantine";

export type ValidatePayload = {
  event: string;
  properties?: Record<string, unknown>;
  mode?: ValidationMode;
  source?: string | null;
  request_id?: string | null;
  timestamp?: string | null;
};

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string; org_name: string }) =>
    api.post("/auth/register", data),
  login: (email: string, password: string) => api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
};

// Plans
export const plansApi = {
  list: () => api.get("/plans"),
  create: (data: { name: string; description?: string }) => api.post("/plans", data),
  get: (id: string) => api.get(`/plans/${id}`),
  update: (id: string, data: object) => api.patch(`/plans/${id}`, data),
  publish: async (id: string, payload: PublishPayload) => {
    if (typeof payload === "string") {
      return api.post(`/plans/${id}/publish`, {
        draft_revision: await resolvePlanDraftRevision(id),
        summary: payload,
      });
    }

    return api.post(`/plans/${id}/publish`, {
      ...payload,
      draft_revision: await resolvePlanDraftRevision(id, payload.draft_revision),
    });
  },
  createBranch: async (id: string, payload: BranchPayload) => {
    if (typeof payload === "string") {
      return api.post(`/plans/${id}/branch`, {
        branch_name: payload,
        draft_revision: await resolvePlanDraftRevision(id),
      });
    }

    return api.post(`/plans/${id}/branch`, {
      ...payload,
      draft_revision: await resolvePlanDraftRevision(id, payload.draft_revision),
    });
  },
  branches: (id: string) => api.get(`/plans/${id}/branches`),
  export: (id: string) => api.get(`/plans/${id}/export`),
  import: async (
    id: string,
    payload:
      | {
          draft_revision?: number;
          format?: "structured" | "json" | "yaml" | "template";
          data?: unknown;
          events?: unknown[];
          global_properties?: unknown[];
          template?: string | null;
        }
      | unknown,
  ) => {
    if (
      payload &&
      typeof payload === "object" &&
      ("draft_revision" in payload || "format" in payload || "events" in payload)
    ) {
      const draftRevision = await resolvePlanDraftRevision(
        id,
        (payload as { draft_revision?: number }).draft_revision,
      );
      return api.post(`/plans/${id}/import`, {
        ...payload,
        draft_revision: draftRevision,
      });
    }

    return api.post(`/plans/${id}/import`, {
      format: "json",
      data: payload,
      draft_revision: await resolvePlanDraftRevision(id),
    });
  },
};

// Events
export const eventsApi = {
  list: (planId: string, q?: string) =>
    api.get(`/plans/${planId}/events${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  create: async (planId: string, data: Record<string, unknown>) =>
    api.post(`/plans/${planId}/events`, {
      ...data,
      draft_revision: await resolvePlanDraftRevision(
        planId,
        data.draft_revision as number | undefined,
      ),
    }),
  update: (id: string, data: object) => api.patch(`/events/${id}`, data),
  delete: (id: string, draftRevision?: number) =>
    api.delete(`/events/${id}`, { params: { draft_revision: draftRevision } }),
};

// Properties
export const propertiesApi = {
  create: (eventId: string, data: object) => api.post(`/events/${eventId}/properties`, data),
  update: (id: string, data: object) => api.patch(`/properties/${id}`, data),
  delete: (id: string, draftRevision?: number) =>
    api.delete(`/properties/${id}`, { params: { draft_revision: draftRevision } }),
};

// Global properties
export const globalPropertiesApi = {
  list: (planId: string) => api.get(`/plans/${planId}/global-properties`),
  create: async (planId: string, data: Record<string, unknown>) =>
    api.post(`/plans/${planId}/global-properties`, {
      ...data,
      draft_revision: await resolvePlanDraftRevision(
        planId,
        data.draft_revision as number | undefined,
      ),
    }),
  update: (id: string, data: object) => api.patch(`/global-properties/${id}`, data),
  delete: (id: string, draftRevision?: number) =>
    api.delete(`/global-properties/${id}`, { params: { draft_revision: draftRevision } }),
  link: (eventId: string, propId: string, draftRevision?: number) =>
    api.post(`/events/${eventId}/global-properties/${propId}`, null, {
      params: { draft_revision: draftRevision },
    }),
  unlink: (eventId: string, propId: string, draftRevision?: number) =>
    api.delete(`/events/${eventId}/global-properties/${propId}`, {
      params: { draft_revision: draftRevision },
    }),
};

// Validation
export const validationApi = {
  validate: (apiKey: string, data: ValidatePayload) =>
    api.post("/validate", data, { headers: { "X-API-Key": apiKey } }),
  batch: (apiKey: string, events: ValidatePayload[]) =>
    api.post("/validate/batch", { events }, { headers: { "X-API-Key": apiKey } }),
  stats: (planId: string, period = "24h") =>
    api.get(`/plans/${planId}/validate/stats?period=${period}`),
};

export const dlqApi = {
  list: (planId: string) => api.get(`/plans/${planId}/dlq`),
};

// Versions
export const versionsApi = {
  list: (planId: string) => api.get(`/plans/${planId}/versions`),
  diff: (versionAId: string, versionBId: string) =>
    api.get(`/versions/${versionAId}/diff/${versionBId}`),
  restore: (versionId: string) => api.post(`/versions/${versionId}/restore`),
};

// Codegen
export const codegenApi = {
  typescript: (planId: string) => api.get(`/plans/${planId}/generate/typescript`),
  jsonSchema: (planId: string) => api.get(`/plans/${planId}/generate/json-schema`),
};

// AI
export const aiApi = {
  generate: (planId: string, jsonPayload: string) =>
    api.post(`/plans/${planId}/ai/generate`, { json_payload: jsonPayload }),
  analyze: (planId: string) => api.get(`/plans/${planId}/ai/analyze`),
};

// API keys
export const apiKeysApi = {
  list: (planId: string) => api.get(`/plans/${planId}/keys`),
  create: (planId: string, label: string) => api.post(`/plans/${planId}/keys`, { label }),
  rotate: (keyId: string) => api.post(`/keys/${keyId}/rotate`),
  revoke: (keyId: string) => api.delete(`/keys/${keyId}`),
};

// Merge requests
export const mergeRequestsApi = {
  create: (planId: string, data: { branch_plan_id: string; title: string; description?: string }) =>
    api.post(`/plans/${planId}/merge-requests`, data),
  list: (planId: string) => api.get(`/plans/${planId}/merge-requests`),
  get: (mrId: string) => api.get(`/merge-requests/${mrId}`),
  merge: (mrId: string) => api.post(`/merge-requests/${mrId}/merge`),
};

// Comments
export const commentsApi = {
  list: (eventId: string) => api.get(`/events/${eventId}/comments`),
  create: (eventId: string, body: string) => api.post(`/events/${eventId}/comments`, { body }),
  delete: (commentId: string) => api.delete(`/comments/${commentId}`),
};

// Organization
export const orgApi = {
  update: (data: { name: string }) => api.patch("/org", data),
  getAiProvider: () => api.get("/org/ai-provider"),
  updateAiProvider: (data: {
    enabled?: boolean;
    provider?: string;
    base_url?: string | null;
    model?: string;
    api_key?: string;
    clear_api_key?: boolean;
  }) => api.patch("/org/ai-provider", data),
};

// Health
export const healthApi = {
  live: () => api.get("/health/live"),
  ready: () => api.get("/health/ready"),
  version: () => api.get("/health/version"),
};
