import axios from 'axios';

// Override with VITE_API_URL in frontend/.env (e.g. for Docker or a deployed backend).
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({ baseURL: API_URL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired or invalid token -> back to the login page.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthCall = err.config?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.assign('/login?expired=1');
    }
    return Promise.reject(err);
  },
);

/** Human-readable message from any API error (FastAPI 422s return a list of issues). */
export const errorMessage = (err, fallback = 'Something went wrong') => {
  if (!err?.response) return 'Cannot reach the API. Is the backend running on port 8000?';
  const detail = err.response.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => `${(d.loc || []).slice(1).join('.') || 'request'}: ${d.msg}`).join('; ');
  }
  return fallback;
};

// ─── Auth ────────────────────────────────────────────────────────────────────
export const login = (username, password) => {
  const form = new URLSearchParams({ username, password });
  return api.post('/auth/login', form, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
};
export const register = (data) => api.post('/auth/register', data);
export const getMe = () => api.get('/auth/me');

export const DEMO_ACCOUNT = { email: 'demo@fraudx.dev', password: 'demo1234' };

// ─── Scoring ─────────────────────────────────────────────────────────────────
/** Score without saving. `features` uses time, v1..v28, amount keys. */
export const predictFraud = (features, explain = true) => api.post('/predict', features, { params: { explain } });
export const getModelInfo = () => api.get('/predict/model-info');
/** A real row from the held-out test set: label = 'fraud' | 'legit'. */
export const getSampleTransaction = (label) => api.get('/predict/sample', { params: { label } });

// ─── Transactions ────────────────────────────────────────────────────────────
export const getTransactions = (skip = 0, limit = 200) => api.get('/transactions/', { params: { skip, limit } });
export const getTransaction = (id) => api.get(`/transactions/${id}`);
export const createTransaction = (features) => api.post('/transactions/', features);
export const simulateTransactions = (count, fraudRatio) =>
  api.post('/transactions/simulate', { count, fraud_ratio: fraudRatio });
export const reviewTransaction = (id, label, notes) => api.post(`/transactions/${id}/review`, { label, notes });
export const clearTransactions = () => api.delete('/transactions/', { params: { confirm: true } });

// ─── Analytics ───────────────────────────────────────────────────────────────
export const getAnalytics = () => api.get('/analytics/');
export const getTimeseries = (bucket = 'hour', points = 24) => api.get('/analytics/timeseries', { params: { bucket, points } });
export const getDrivers = (limit = 8) => api.get('/analytics/drivers', { params: { limit } });
export const getMetrics = () => api.get('/analytics/metrics');
export const getThresholdCurve = () => api.get('/analytics/threshold-curve');
export const getValidationReport = () => api.get('/analytics/validation');
export const getHealth = () => api.get('/health');

/** Server-Sent Events URL for the live feed (EventSource can't send headers). */
export const streamUrl = () => `${API_URL}/stream?token=${encodeURIComponent(localStorage.getItem('token') || '')}`;

export default api;
