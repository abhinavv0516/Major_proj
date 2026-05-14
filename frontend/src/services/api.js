import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 5000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_USERS_KEY = 'fraudx_mock_users';
const MOCK_TRANSACTIONS_KEY = 'fraudx_mock_transactions';

const getMockUsers = () => JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || '[]');
const saveMockUsers = (users) => localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));

const getMockTransactions = () => {
  const stored = localStorage.getItem(MOCK_TRANSACTIONS_KEY);
  if (stored) return JSON.parse(stored);
  // seed with 10 demo transactions
  const seed = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    time: Math.random() * 100000,
    amount: parseFloat((Math.random() * 900 + 10).toFixed(2)),
    is_fraud: Math.random() > 0.8,
    fraud_probability: parseFloat((Math.random()).toFixed(4)),
    created_at: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
  }));
  localStorage.setItem(MOCK_TRANSACTIONS_KEY, JSON.stringify(seed));
  return seed;
};

const saveMockTransactions = (txns) =>
  localStorage.setItem(MOCK_TRANSACTIONS_KEY, JSON.stringify(txns));

// ─── Auth ────────────────────────────────────────────────────────────────────

export const login = async (username, password) => {
  try {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    const res = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return res;
  } catch (err) {
    // fallback to mock
    if (!err.response) {
      const users = getMockUsers();
      const user = users.find((u) => u.email === username && u.password === password);
      if (!user) {
        const e = new Error('Invalid credentials');
        e.response = { data: { detail: 'Invalid email or password.' } };
        throw e;
      }
      return { data: { access_token: `mock_token_${user.email}`, token_type: 'bearer' } };
    }
    throw err;
  }
};

export const register = async (data) => {
  try {
    const res = await api.post('/auth/register', data);
    return res;
  } catch (err) {
    // fallback to mock when backend is down (network error, not a 4xx)
    if (!err.response) {
      const users = getMockUsers();
      if (users.find((u) => u.email === data.email)) {
        const e = new Error('Email already registered');
        e.response = { data: { detail: 'Email already registered.' } };
        throw e;
      }
      users.push({ email: data.email, password: data.password, full_name: data.full_name });
      saveMockUsers(users);
      return { data: { message: 'Registered (demo mode)' } };
    }
    throw err;
  }
};

export const getMe = () => api.get('/auth/me');

// ─── Transactions ─────────────────────────────────────────────────────────────

export const getTransactions = async (skip = 0, limit = 100) => {
  try {
    return await api.get(`/transactions/?skip=${skip}&limit=${limit}`);
  } catch {
    return { data: getMockTransactions() };
  }
};

export const createTransaction = async (data) => {
  try {
    return await api.post('/transactions/', data);
  } catch {
    const txns = getMockTransactions();
    const isFraud = Math.random() > 0.8;
    const newTx = {
      id: txns.length + 1,
      time: data.time,
      amount: parseFloat(data.amount.toFixed(2)),
      is_fraud: isFraud,
      fraud_probability: parseFloat((isFraud ? 0.7 + Math.random() * 0.29 : Math.random() * 0.3).toFixed(4)),
      created_at: new Date().toISOString(),
    };
    txns.unshift(newTx);
    saveMockTransactions(txns);
    return { data: newTx };
  }
};

export const predictFraud = (data) => api.post('/transactions/predict', data);

// ─── Analytics ────────────────────────────────────────────────────────────────

export const getAnalytics = async () => {
  try {
    return await api.get('/analytics/');
  } catch {
    const txns = getMockTransactions();
    const fraud = txns.filter((t) => t.is_fraud).length;
    return {
      data: {
        total_transactions: txns.length,
        fraud_transactions: fraud,
        legitimate_transactions: txns.length - fraud,
        fraud_percentage: txns.length ? (fraud / txns.length) * 100 : 0,
      },
    };
  }
};

export const getMetrics = async () => {
  try {
    return await api.get('/analytics/metrics');
  } catch {
    return {
      data: {
        'Random Forest': {
          accuracy: 0.9934,
          precision: 0.9712,
          recall: 0.8645,
          f1_score: 0.9148,
          roc_auc: 0.9821,
        },
      },
    };
  }
};

export default api;
