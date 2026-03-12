import axios from 'axios';

// Buat instance axios untuk Publishing Service (port 8080)
export const publishingApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_PUBLISHING_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Buat instance axios untuk Evaluation Service (port 8081)
export const evaluationApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_EVALUATION_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor: otomatis tambah token JWT ke setiap request
const addAuthToken = (api: typeof publishingApi) => {
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
};

addAuthToken(publishingApi);
addAuthToken(evaluationApi);

// ─── AUTH ─────────────────────────────────────────────
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

// ─── RULES ────────────────────────────────────────────
export const getRules = (params?: Record<string, string>) =>
  publishingApi.get('/rules', { params });

export const getRuleById = (id: number) =>
  publishingApi.get(`/rules/${id}`);

export const createRules = (rules: unknown[]) =>
  publishingApi.post('/rules', rules);

export const updateRules = (rules: unknown[]) =>
  publishingApi.put('/rules', rules);

export const deleteRule = (id: number) =>
  publishingApi.delete(`/rules/${id}`);

export const publishRules = (ids: number[]) =>
  publishingApi.post('/rules/publish', ids.map(id => ({ id })));

export const unpublishRules = (ids: number[]) =>
  publishingApi.post('/rules/unpublish', ids.map(id => ({ id })));

// ─── EVALUATION ───────────────────────────────────────
export const checkRules = (payload: unknown) =>
  evaluationApi.post('/rules/check', payload);

export const reloadRules = () =>
  evaluationApi.post('/rules/reload');
