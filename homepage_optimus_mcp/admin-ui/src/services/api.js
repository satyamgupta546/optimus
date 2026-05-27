const BASE = '/api';

function getToken() {
  return localStorage.getItem('sam_token') || '';
}

function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${getToken()}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function authFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...authHeaders(!!opts.body),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { error: err.error || `HTTP ${res.status}`, status: res.status };
  }
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (data.token) localStorage.setItem('sam_token', data.token);
  return data;
}

export async function getMe() {
  const res = await fetch(`${BASE}/auth/me`, { headers: authHeaders(false) });
  if (!res.ok) return null;
  return res.json();
}

export function logout() {
  localStorage.removeItem('sam_token');
}

// ── Users ───────────────────────────────────────────────────────────────────

export const listUsers   = ()        => authFetch('/admin/users');
export const addUser     = (data)    => authFetch('/admin/users', { method: 'POST', body: JSON.stringify(data) });
export const updateUser  = (email, updates) => authFetch('/admin/users', { method: 'PUT',  body: JSON.stringify({ email, ...updates }) });
export const removeUser  = (email)   => authFetch('/admin/users', { method: 'DELETE', body: JSON.stringify({ email }) });

// ── Audit ───────────────────────────────────────────────────────────────────

export const listAudit   = ()        => authFetch('/admin/audit');

// ── Widgets ─────────────────────────────────────────────────────────────────

export const listWidgets = ()        => authFetch('/admin/widgets');

// ── Projects / Settings ─────────────────────────────────────────────────────

export const listProjects  = ()      => authFetch('/admin/projects');
export const getHealth     = ()      => authFetch('/admin/health');
export const getOAuthClients = ()    => authFetch('/admin/oauth-clients');
