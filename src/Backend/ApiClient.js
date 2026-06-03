/**
 * ApiClient — Shared Backend API Client
 *
 * Clean, reusable API utilities for all widget backends.
 * Extracted from WidgetApiService.js — no debug console.logs.
 *
 * Usage:
 *   import { callApi, createMappingCsv, getNowStr } from '@/Backend/ApiClient';
 *   await callApi('/api/app/widget/', payload, { multipart: true });
 */

import { API_BASE, ENDPOINTS } from '../config/apiConfig';

// ── CSRF ──

/** Module-level CSRF token — set by DeploymentService before deployment */
let _csrfToken = null;

/**
 * Store the CSRF token for API calls.
 * Called by DeploymentService with the token from RequestQueue.
 */
export function setCsrfToken(token) {
    _csrfToken = token || null;
}

/**
 * Get the CSRF token — prefers module-level token, falls back to cookie.
 */
export function getCsrfToken() {
    if (_csrfToken) return _csrfToken;
    const value = `; ${document.cookie}`;
    const parts = value.split('; csrftoken=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// ── Core API Caller ──

/**
 * Make an authenticated API call to the backend.
 * @param {string} endpoint - API path (e.g. '/api/app/widget/')
 * @param {Object} payload  - Request body
 * @param {Object} opts
 * @param {boolean} opts.multipart - Send as FormData (default: false → JSON)
 * @returns {Promise<Response>}
 */
export async function callApi(endpoint, payload, { multipart: forceMultipart = false } = {}) {
    const csrfToken = getCsrfToken();
    const url = `${API_BASE}${endpoint}`;

    // Samaan Django rejects JSON POST with 405 — always use multipart for write endpoints
    const multipart = true;

    const options = {
        method: 'POST',
        credentials: 'include',
        headers: {
            'X-CSRFToken': csrfToken || '',
        },
    };

    if (multipart) {
        const formData = new FormData();
        // Include csrfmiddlewaretoken in body (Django checks both header and body)
        if (csrfToken) formData.append('csrfmiddlewaretoken', csrfToken);
        for (const [key, value] of Object.entries(payload)) {
            if (value === undefined || value === null) continue;
            // File/Blob must be appended WITH a filename — Django requires it for file upload fields
            if (value instanceof File) {
                formData.append(key, value, value.name);
            } else if (value instanceof Blob) {
                // Plain Blob (e.g. blankBlob for media_en) — give it a filename
                const ext = value.type.split('/')[1] || 'png';
                formData.append(key, value, `${key}.${ext}`);
            } else {
                formData.append(key, value);
            }
        }
        // DEBUG: log all fields sent
        const _debug = {};
        for (const [k, v] of formData.entries()) _debug[k] = v instanceof Blob ? `[Blob ${v.size}B]` : v;
        console.log(`[callApi] POST ${url}`, _debug);
        options.body = formData;
    } else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const text = await response.text();
        console.error(`[callApi] \u274c ${response.status} ${url}:`, text);
        throw new Error(`API ${response.status}: ${text.substring(0, 500)}`);
    }

    return response;
}

// ── Update API (PUT/PATCH existing resource) ──

/**
 * Update an existing resource by ID.
 * Ported from: SPR_Widget_Optimized.gs → updateApi()
 *
 * @param {string} url - Full URL with ID, e.g. /api/app/widget/123/
 * @param {Object} payload - Fields to update
 * @param {Object} opts
 * @param {boolean} opts.json - Send as JSON (default: true)
 * @returns {Promise<Response>}
 */
export async function updateApi(url, payload, { json = true } = {}) {
    const csrfToken = getCsrfToken();
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

    const options = {
        method: 'PUT',
        credentials: 'include',
        headers: { 'X-CSRFToken': csrfToken || '' },
    };

    if (json) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
    } else {
        const formData = new FormData();
        for (const [key, value] of Object.entries(payload)) {
            if (value !== undefined && value !== null) formData.append(key, value);
        }
        options.body = formData;
    }

    const response = await fetch(fullUrl, options);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`UPDATE ${response.status}: ${text.substring(0, 200)}`);
    }
    return response;
}

// ── Lookup Helpers (check if slug exists on backend) ──

/**
 * Lookup a widget by slug_name. Returns the ID if found, null otherwise.
 * Ported from: SPR_Widget_Optimized.gs → getWidgetId()
 *
 * Uses ENDPOINTS.fetchWidget (GET /api/app/widget/) with query param.
 * Falls back to null on 404/405 (Django may not support GET on this endpoint).
 *
 * @param {string} slugName
 * @returns {Promise<string|null>} Widget ID or null
 */
export async function getWidgetId(slugName) {
    try {
        // Try the fetchWidget endpoint (supports GET with query params)
        const url = `${API_BASE}${ENDPOINTS.fetchWidget}?slug_name=${encodeURIComponent(slugName)}`;
        const res = await fetch(url, {
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() || '' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        // Django REST: { results: [...] } or direct array, or single object
        const results = data.results || (Array.isArray(data) ? data : [data]);
        const match = results.find(r => r.slug_name === slugName);
        return match ? (match.id || match.pk || null) : null;
    } catch {
        return null;
    }
}

/**
 * Lookup a widget item by slug_name. Returns the ID if found, null otherwise.
 * Ported from: SPR_Widget_Optimized.gs → getWidgetItemId()
 *
 * Uses ENDPOINTS.fetchWidgetItem (GET /api/app/widget_item/) with query param.
 * Note: The POST endpoint is /api/app/post_widget_item/ (different path).
 *
 * @param {string} slugName
 * @returns {Promise<string|null>} Widget Item ID or null
 */
export async function getWidgetItemId(slugName) {
    try {
        // Samaan endpoint: GET /api/app/get_widget_item/?widget_item_slug_name=...
        const url = `${API_BASE}/api/app/get_widget_item/?widget_item_slug_name=${encodeURIComponent(slugName)}`;
        const res = await fetch(url, {
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() || '' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.id || data.pk || null;
    } catch {
        return null;
    }
}

/**
 * Lookup a page layout by slug_name. Returns the ID if found, null otherwise.
 * Ported from: SPR_Widget_Optimized.gs → getPageLayoutId()
 *
 * Note: The POST endpoint is /api/app/post_page_layout/ but GET listing
 * may not be supported — returns null on 405, triggering CREATE path.
 *
 * @param {string} slugName
 * @returns {Promise<string|null>} Page Layout ID or null
 */
export async function getPageLayoutId(slugName) {
    try {
        // page_layout doesn't have a separate GET endpoint — try the POST path with GET
        const url = `${API_BASE}${ENDPOINTS.pageLayout}?slug_name=${encodeURIComponent(slugName)}`;
        const res = await fetch(url, {
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() || '' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const results = data.results || (Array.isArray(data) ? data : [data]);
        const match = results.find(r => r.slug_name === slugName);
        return match ? (match.id || match.pk || null) : null;
    } catch {
        return null;
    }
}

// ── CSV Mapping Builder ──

/**
 * Build a CSV Blob for widget/layout mapping APIs.
 * @param {'widget_item'|'layout_widget'|'global_page'} type - Mapping type
 * @param {string} slugName - Slug to map
 * @param {Object} opts - Optional overrides
 * @param {string} opts.levelTag    - default 'global'
 * @param {string} opts.levelProperty - default 'global'
 * @param {number} opts.priority    - default 1
 * @param {string} opts.cohort      - default ''
 * @returns {Blob} CSV blob ready for FormData
 */
export function createMappingCsv(type, slugName, { levelTag = 'global', levelProperty = 'global', priority = 1, cohort = '' } = {}) {
    let content = '';

    if (type === 'widget_item') {
        content = `widget_item_slug_name,level_tag,level_property,priority,cohort\n${slugName},${levelTag},${levelProperty},${priority},${cohort}`;
    } else if (type === 'layout_widget') {
        content = `widget_slug_name,level_tag,level_property,priority,cohort\n${slugName},${levelTag},${levelProperty},${priority},${cohort}`;
    } else if (type === 'global_page') {
        content = 'level_tag,level_property\nglobal,global';
    }

    return new Blob([content], { type: 'text/csv' });
}

// ── Time Utilities ──

/** Current datetime as 'YYYY-MM-DD HH:MM:SS' */
export function getNowStr() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Future datetime (default +365 days) as 'YYYY-MM-DD HH:MM:SS' */
export function getFutureStr(days = 365) {
    const future = new Date();
    future.setDate(future.getDate() + days);
    return future.toISOString().slice(0, 19).replace('T', ' ');
}
