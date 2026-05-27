/**
 * LocalApiService — Frontend client for the local Express + BigQuery backend.
 *
 * All requests go to /api/local/* (proxied to localhost:3001 via Vite).
 * Auth is sent via X-Optimus-User and X-Optimus-Role headers from localStorage.
 */

const BASE = '/api/local';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const stored = localStorage.getItem('optimus_user');
    if (stored) {
      const user = JSON.parse(stored);
      headers['X-Optimus-User'] = user.email || '';
      headers['X-Optimus-Role'] = user.role || 'MAKER';
    }
    headers['X-Optimus-Env'] = localStorage.getItem('optimus_env') || 'PROD';
  } catch { /* ignore */ }
  return headers;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: getHeaders(),
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.details = body.details;
    throw err;
  }

  return res.json();
}

export const LocalApiService = {
  // ── Health ──
  health: () => request('/health'),

  // ── Widgets ──
  getWidgets: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/widgets${qs ? '?' + qs : ''}`);
  },
  getWidget: (id) => request(`/widgets/${id}`),
  createWidget: (data) => request('/widgets', { method: 'POST', body: JSON.stringify(data) }),
  updateWidget: (id, data) => request(`/widgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  patchWidget: (id, data) => request(`/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWidget: (id) => request(`/widgets/${id}`, { method: 'DELETE' }),
  duplicateWidget: (id) => request(`/widgets/${id}/duplicate`, { method: 'POST' }),
  reorderWidgets: (order) => request('/widgets', { method: 'PATCH', body: JSON.stringify({ order }) }),
  getWidgetVersions: (id, { limit, cursor } = {}) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit);
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    return request(`/widgets/${id}/versions${qs ? '?' + qs : ''}`);
  },

  // ── Requests ──
  getRequests: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/requests${qs ? '?' + qs : ''}`);
  },
  createRequest: (data) => request('/requests', { method: 'POST', body: JSON.stringify(data) }),
  submitRequest: (id) => request(`/requests/${id}/submit`, { method: 'POST' }),
  approveRequest: (id, selectedWidgetIds) =>
    request(`/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ selectedWidgetIds }),
    }),
  rejectRequest: (id, reason) =>
    request(`/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  reopenRequest: (id) => request(`/requests/${id}/reopen`, { method: 'POST' }),

  // ── Users ──
  getMe: () => request('/users/me'),
  getCheckers: () => request('/users/checkers'),
  addChecker: (email, name) =>
    request('/users/checkers', { method: 'POST', body: JSON.stringify({ email, name }) }),
  removeChecker: (email) =>
    request('/users/checkers', { method: 'DELETE', body: JSON.stringify({ email }) }),

  // ── Catalog ──
  getCatalog: () => request('/kinetic/catalog'),
  getCatalogBatch: (codes) => request(`/kinetic/catalog/batch?codes=${codes.join(',')}`),

  // ── Widget Search (from Mirror/BigQuery) ──
  searchWidgets: (q) => request(`/kinetic/search-widgets?q=${encodeURIComponent(q)}`),

  // ── Activity ──
  getActivity: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/activity${qs ? '?' + qs : ''}`);
  },
  appendActivity: (data) =>
    request('/activity', { method: 'POST', body: JSON.stringify(data) }),

  // ── Media ──
  uploadMedia: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    try {
      const stored = localStorage.getItem('optimus_user');
      if (stored) {
        const user = JSON.parse(stored);
        headers['X-Optimus-User'] = user.email || '';
        headers['X-Optimus-Role'] = user.role || 'MAKER';
      }
      headers['X-Optimus-Env'] = localStorage.getItem('optimus_env') || 'PROD';
    } catch { /* ignore */ }
    const res = await fetch(`${BASE}/media/upload`, { method: 'POST', headers, body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // ── Locations ──
  getLocations: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/locations${qs ? '?' + qs : ''}`);
  },
  createLocation: (data) => request('/locations', { method: 'POST', body: JSON.stringify(data) }),
  toggleLocation: (key) => request(`/locations/${key}/toggle`, { method: 'PATCH' }),
  deleteLocation: (key) => request(`/locations/${key}`, { method: 'DELETE' }),

  // ── Widgets by Date ──
  getWidgetsByDate: (date) => request(`/widgets?date=${date}`),
  getRequestsByDate: (date) => request(`/requests?date=${date}`),

  // ── Comments ──
  getComments: (widgetId) => request(`/comments/widget/${widgetId}`),
  addComment: (widgetId, text) =>
    request('/comments', { method: 'POST', body: JSON.stringify({ widgetId, text }) }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),

  // ── Header Widgets ──
  getHeaderWidgets: () => request('/header-widgets'),
  updateHeaderWidgets: (data) =>
    request('/header-widgets', { method: 'PUT', body: JSON.stringify(data) }),

  // ── Kinetic (BigQuery) ──
  getKineticHealth: () => request('/kinetic/health'),
  getKineticHistory: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/kinetic/history${qs ? '?' + qs : ''}`);
  },
  getKineticAnalytics: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/kinetic/analytics${qs ? '?' + qs : ''}`);
  },
  syncDeployToKinetic: (widgets) =>
    request('/kinetic/deploy-sync', {
      method: 'POST',
      body: JSON.stringify({ widgets }),
    }),
};
