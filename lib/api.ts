import axios from 'axios';

// Buat instance axios untuk Publishing Service (port 8080)
export const publishingApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_PUBLISHING_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Helper untuk memastikan root-path /eval pada evaluation service lokal
const getEvaluationBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_EVALUATION_URL || 'http://localhost:8081/eval';
  const clean = envUrl.replace(/\/+$/, '');
  if (clean.endsWith(':8081') || clean.endsWith('localhost:8081')) {
    return `${clean}/eval`;
  }
  return clean;
};

// Buat instance axios untuk Evaluation Service (port 8081, root-path /eval)
export const evaluationApi = axios.create({
  baseURL: getEvaluationBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Request Interceptor: otomatis tambah token JWT ke setiap request
const addAuthToken = (api: typeof publishingApi) => {
  api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });
};

// Response Interceptor: bersihkan token dan redirect jika session 401 (expired/invalid)
const handleAuthError = (api: typeof publishingApi) => {
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }
  );
};

addAuthToken(publishingApi);
addAuthToken(evaluationApi);
handleAuthError(publishingApi);
handleAuthError(evaluationApi);

// ─── AUTH ──────────────────────────────────────────
export const login = (clientId: string, clientSecret: string) => {
  // Gunakan URLSearchParams untuk kirim sebagai form fields
  const formData = new URLSearchParams();
  formData.append('client_id', clientId);
  formData.append('client_secret', clientSecret);
  formData.append('grant_type', 'client_credentials');

  return publishingApi.post('/auth/token', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
};

// ─── RULES ─────────────────────────────────────────
export interface GetRulesParams {
  page?: number;
  size?: number;
  summary?: boolean;
  object?: string | string[];
  published?: boolean | string;
  hasPendingChanges?: boolean | string;
  [key: string]: unknown;
}

export const getRules = (params?: GetRulesParams) =>
  publishingApi.get('/rules', {
    params,
    paramsSerializer: {
      indexes: null,
    },
  });

export const getRuleById = (id: number) =>
  publishingApi.get(`/rules/${id}`);

// POST /rules accepts a single Rule object
export const createRule = (rule: unknown) => {
  const payload = Array.isArray(rule) ? rule[0] : rule;
  return publishingApi.post('/rules', payload);
};

// Create one or multiple rules
export const createRules = async (rules: unknown | unknown[]) => {
  if (Array.isArray(rules)) {
    if (rules.length === 1) {
      return publishingApi.post('/rules', rules[0]);
    }
    const responses = await Promise.all(
      rules.map((rule) => publishingApi.post('/rules', rule))
    );
    return {
      data: {
        message: 'success',
        data: responses.map((res) => res.data?.data),
      },
    };
  }
  return publishingApi.post('/rules', rules);
};

// PUT /rules accepts a List<Rules> (array)
export const updateRules = (rules: unknown[] | unknown) => {
  const payload = Array.isArray(rules) ? rules : [rules];
  return publishingApi.put('/rules', payload);
};

export const deleteRule = (id: number) =>
  publishingApi.delete(`/rules/${id}`);

export const publishRules = (ids: number[]) =>
  publishingApi.post('/rules/publish', ids.map(id => ({ id })));

export const unpublishRules = (ids: number[]) =>
  publishingApi.post('/rules/unpublish', ids.map(id => ({ id })));

// ─── EVALUATION ────────────────────────────────────
export const checkRules = (payload: unknown) =>
  evaluationApi.post('/rules/check', payload);

export const reloadRules = () =>
  evaluationApi.post('/rules/reload');

// ─── ERROR HANDLING HELPERS ────────────────────────────────
export function getApiErrorMessage(err: unknown, fallback: string = "Terjadi kesalahan pada sistem"): string {
  if (!err || typeof err !== "object") return fallback;
  const axiosErr = err as {
    response?: {
      status?: number;
      data?: {
        message?: string;
        error?: string;
        errors?: Array<{ message?: string; type?: string }>;
      };
      headers?: Record<string, string>;
    };
    message?: string;
  };

  const data = axiosErr.response?.data;
  if (data) {
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const messages = data.errors.map((e) => e.message).filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
    if (data.message && data.message !== "error") return data.message;
    if (data.error) return data.error;
  }
  return axiosErr.message || fallback;
}

export function getRetryAfterSeconds(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const axiosErr = err as {
    response?: {
      status?: number;
      data?: { message?: string; error?: string };
      headers?: Record<string, string>;
    };
  };

  if (axiosErr.response?.status === 429) {
    const headerVal =
      axiosErr.response.headers?.["retry-after"] ||
      axiosErr.response.headers?.["Retry-After"];
    if (headerVal) {
      const sec = parseInt(headerVal, 10);
      if (!isNaN(sec) && sec > 0) return sec;
    }
    const msg = axiosErr.response.data?.message;
    if (msg) {
      const match = msg.match(/retry after (\d+) second/i);
      if (match && match[1]) {
        const sec = parseInt(match[1], 10);
        if (!isNaN(sec) && sec > 0) return sec;
      }
    }
    return 60; // fallback standard rate limit duration
  }
  return null;
}
