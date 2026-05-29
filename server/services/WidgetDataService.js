/**
 * WidgetDataService — All BigQuery data access.
 *
 * Migrated from Supabase to BigQuery (apna-mart-data.optimus).
 *
 * Data layer for:
 * - Auth (user_roles table, cached)
 * - Widgets + Headers (canvas_widgets table)
 * - Versions (widget_versions table)
 * - Checkers (user_roles table)
 * - Locations (locations table)
 * - Products (Metabase API)
 */
import * as BQ from './BigQueryService.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '..', '.env');

// ── Metabase config ──
let METABASE_URL = process.env.METABASE_URL || '';
let METABASE_API_KEY = process.env.METABASE_API_KEY || '';
try {
  if (fs.existsSync(ENV_PATH)) {
    const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of envContent.split('\n')) {
      let m = line.match(/^METABASE_URL=(.+)$/);
      if (m) METABASE_URL = m[1].trim();
      m = line.match(/^METABASE_API_KEY=(.+)$/);
      if (m) METABASE_API_KEY = m[1].trim();
    }
  }
} catch { /* ignore */ }

if (METABASE_API_KEY) {
  console.log(`[WidgetDataService] Metabase configured → ${METABASE_URL} ✓`);
}

// ── Constants ──
const SUPER_ADMIN_IDENTIFIERS = ['satyam.gupta@apnamart.in', 'satyam'];
const HARDCODED_CHECKERS = { 'manoj.kumar': 'Manoj Kumar' };

// ── Auth cache ──
const userCache = new Map();
const USER_CACHE_TTL = 60_000;

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

export async function resolveUser(email, env) {
  const lowerEmail = email.toLowerCase();

  if (SUPER_ADMIN_IDENTIFIERS.includes(lowerEmail)) {
    return { email: lowerEmail, name: lowerEmail.split('@')[0], role: 'SUPER_ADMIN' };
  }

  if (HARDCODED_CHECKERS[lowerEmail]) {
    return { email: lowerEmail, name: HARDCODED_CHECKERS[lowerEmail], role: 'CHECKER' };
  }

  const cacheKey = `${lowerEmail}:${env}`;
  const cached = userCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL) {
    return cached.user;
  }

  let role = 'MAKER';
  let name = lowerEmail.split('@')[0];
  try {
    const rows = await BQ.selectRows('user_roles', {
      where: `email = '${BQ.esc(lowerEmail)}' AND env = '${BQ.esc(env)}' AND is_active = TRUE`,
      limit: 1,
    });
    if (rows.length > 0 && rows[0].role === 'CHECKER') {
      role = 'CHECKER';
      name = rows[0].name || name;
    }
  } catch {
    // Graceful degradation
  }

  const user = { email: lowerEmail, name, role };
  userCache.set(cacheKey, { user, ts: Date.now() });
  return user;
}

export function bustUserCache(email) {
  const lowerEmail = email.toLowerCase();
  for (const key of userCache.keys()) {
    if (key.startsWith(`${lowerEmail}:`)) userCache.delete(key);
  }
}

// ══════════════════════════════════════════════════════════════
// WIDGETS (canvas_widgets table)
// ══════════════════════════════════════════════════════════════

function safeParse(val, fallback) {
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
  return val || fallback;
}

function parseWidget(row) {
  if (!row) return null;
  return {
    id: row.id,
    widgetId: row.widget_id,
    type: row.type || '',
    slug: row.slug || '',
    env: row.env || 'PROD',
    title: row.title || '',
    titleHi: row.title_hi || '',
    status: row.status || 'DRAFT',
    sortOrder: row.sort_order ?? 0,
    pnc: safeParse(row.pnc, {}),
    config: safeParse(row.config, {}),
    products: safeParse(row.products, []),
    createdBy: row.author || '',
    creator: { email: row.author || '', name: (row.author || '').split('@')[0] },
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

export async function listWidgets(env, { status, type, slug, date } = {}) {
  const conditions = [
    `is_deleted = FALSE`,
    `env = '${BQ.esc(env)}'`,
    `type NOT IN ('primaryMasthead', 'secondaryMasthead')`,
  ];
  if (status) conditions.push(`status = '${BQ.esc(status)}'`);
  if (type) conditions.push(`type = '${BQ.esc(type)}'`);
  if (slug) conditions.push(`slug LIKE '%${BQ.esc(slug)}%'`);
  if (date) {
    conditions.push(`created_at >= '${BQ.esc(date)}T00:00:00'`);
    conditions.push(`created_at < '${BQ.esc(date)}T23:59:59'`);
  }

  const rows = await BQ.selectRows('canvas_widgets', {
    where: conditions.join(' AND '),
    orderBy: 'sort_order ASC',
    limit: 500,
  });
  return rows.map(parseWidget);
}

export async function getWidgetById(widgetId, env) {
  const conditions = [`widget_id = '${BQ.esc(widgetId)}'`, `is_deleted = FALSE`];
  if (env) conditions.push(`env = '${BQ.esc(env)}'`);

  const rows = await BQ.selectRows('canvas_widgets', {
    where: conditions.join(' AND '),
    limit: 1,
  });
  return rows.length > 0 ? parseWidget(rows[0]) : null;
}

export async function createWidget(data) {

  // widget_id priority:
  // 1. Explicitly provided (e.g., from SMApp deploy callback)
  // 2. Lookup from SMApp backend (smapp_widgets) by slug + type + pnc
  //    - Derives full SMApp slug: base_slug + suffix (_spr_opt, _crausel_w, etc.)
  //    - Falls back to CONTAINS search for mastheads (timestamp suffixes)
  // 3. Fallback to UUID (widget not yet on backend)
  // Derive full slug (base + type suffix) for SMApp matching
  const pnc = typeof data.pnc === 'string' ? JSON.parse(data.pnc) : (data.pnc || {});
  const fullSlug = deriveSmappSlug(data.slug, data.type, pnc) || data.slug || '';

  // widget_id: lookup from SMApp using full slug
  let widgetId = data.widgetId || null;
  if (!widgetId && fullSlug) {
    widgetId = await lookupSmappWidgetId(fullSlug);
  }
  if (!widgetId && data.slug) {
    // Fallback: CONTAINS search (mastheads with timestamp suffix)
    widgetId = await resolveSmappWidgetId(data.slug, data.type, pnc);
  }
  if (!widgetId) {
    widgetId = crypto.randomUUID();
  }

  const configObj = typeof data.config === 'string' ? JSON.parse(data.config) : (data.config || {});
  const productsObj = typeof data.products === 'string' ? JSON.parse(data.products) : (data.products || []);

  const row = {
    widget_id: widgetId,
    type: data.type || 'unknown',
    slug: fullSlug,
    env: data.env || 'PROD',
    title: data.title || '',
    title_hi: data.titleHi || '',
    status: data.status || 'DRAFT',
    sort_order: data.sortOrder ?? 0,
    pnc: JSON.stringify(pnc),
    config: JSON.stringify(configObj),
    products: JSON.stringify(productsObj),
    author: data.createdBy || '',
    is_deleted: false,
  };

  await BQ.insertRow('canvas_widgets', row);
  return parseWidget(row);
}

export async function updateWidget(widgetId, data, env) {
  const updates = {};

  if (data.type !== undefined) updates.type = data.type;
  if (data.slug !== undefined) updates.slug = data.slug;
  if (data.title !== undefined) updates.title = data.title;
  if (data.titleHi !== undefined) updates.title_hi = data.titleHi;
  if (data.status !== undefined) updates.status = data.status;
  if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;
  if (data.pnc !== undefined) updates.pnc = typeof data.pnc === 'string' ? JSON.parse(data.pnc) : data.pnc;
  if (data.config !== undefined) updates.config = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
  if (data.products !== undefined) updates.products = typeof data.products === 'string' ? JSON.parse(data.products) : data.products;

  const conditions = [`widget_id = '${BQ.esc(widgetId)}'`, `is_deleted = FALSE`];
  if (env) conditions.push(`env = '${BQ.esc(env)}'`);

  await BQ.updateRows('canvas_widgets', updates, conditions.join(' AND '));
  return getWidgetById(widgetId, env);
}

export async function deleteWidget(widgetId, env) {
  const conditions = [`widget_id = '${BQ.esc(widgetId)}'`];
  if (env) conditions.push(`env = '${BQ.esc(env)}'`);
  await BQ.updateRows('canvas_widgets', { is_deleted: true }, conditions.join(' AND '));
}

export async function reorderWidgets(order) {
  for (const { id: widgetId, sortOrder } of order) {
    await BQ.updateRows('canvas_widgets', { sort_order: sortOrder },
      `widget_id = '${BQ.esc(widgetId)}' AND is_deleted = FALSE`);
  }
}

export async function duplicateWidget(sourceWidgetId, user, env) {
  const source = await getWidgetById(sourceWidgetId, env);
  if (!source) return null;

  const suffix = `_copy_${Date.now().toString(36)}`;
  return createWidget({
    type: source.type,
    slug: source.slug + suffix,
    env,
    title: source.title + ' (Copy)',
    titleHi: source.titleHi,
    status: 'DRAFT',
    sortOrder: source.sortOrder + 1,
    pnc: source.pnc,
    config: source.config,
    products: source.products,
    createdBy: user.email,
  });
}

export async function updateWidgetStatuses(widgetIds, status) {
  if (!widgetIds || widgetIds.length === 0) return;
  const idList = widgetIds.map(id => `'${BQ.esc(id)}'`).join(',');
  await BQ.updateRows('canvas_widgets', { status },
    `widget_id IN (${idList}) AND is_deleted = FALSE`);
}

export async function findWidgetsByIds(widgetIds) {
  if (!widgetIds || widgetIds.length === 0) return [];
  const idList = widgetIds.map(id => `'${BQ.esc(id)}'`).join(',');
  const rows = await BQ.selectRows('canvas_widgets', {
    where: `widget_id IN (${idList}) AND is_deleted = FALSE`,
  });
  return rows.map(parseWidget);
}

// ══════════════════════════════════════════════════════════════
// HEADER WIDGETS (canvas_widgets — global, not per-env)
// ══════════════════════════════════════════════════════════════

export async function getHeaderWidgets() {
  const rows = await BQ.selectRows('canvas_widgets', {
    where: `type IN ('primaryMasthead', 'secondaryMasthead') AND is_deleted = FALSE`,
  });

  const headers = { primaryMasthead: null, secondaryMasthead: null };
  for (const row of rows) {
    headers[row.type] = row.config || null;
  }
  return headers;
}

export async function upsertHeaderWidget(type, config, email) {
  // Check if exists
  const existing = await getWidgetById(type);
  if (existing) {
    await BQ.updateRows('canvas_widgets', { config: JSON.stringify(config), author: email || '' },
      `widget_id = '${BQ.esc(type)}'`);
  } else {
    await BQ.insertRow('canvas_widgets', {
      widget_id: type, type, slug: '', env: 'PROD', title: type, title_hi: '',
      status: 'APPROVED', sort_order: 0, pnc: JSON.stringify({}),
      config: JSON.stringify(config), products: JSON.stringify([]),
      author: email || '', is_deleted: false,
    });
  }
}

// ══════════════════════════════════════════════════════════════
// VERSIONS (widget_versions table)
// ══════════════════════════════════════════════════════════════

function parseVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    widgetId: row.widget_id,
    widgetSlug: row.widget_slug || '',
    env: row.env || 'PROD',
    version: row.version ?? 0,
    snapshot: row.snapshot || {},
    changedBy: row.changed_by || '',
    changeLog: row.change_log || '',
    createdAt: row.created_at || '',
  };
}

export async function listVersions(widgetId, { limit = 20, cursor } = {}) {
  const conditions = [`widget_id = '${BQ.esc(widgetId)}'`];
  if (cursor) conditions.push(`version < ${parseInt(cursor)}`);

  const rows = await BQ.selectRows('widget_versions', {
    where: conditions.join(' AND '),
    orderBy: 'version DESC',
    limit,
  });

  const versions = rows.map(parseVersion);
  const hasMore = versions.length === limit;
  const nextCursor = hasMore ? versions[versions.length - 1].version : null;

  return { versions, hasMore, nextCursor };
}

export async function createVersion(data) {
  const snapshot = typeof data.snapshot === 'string' ? data.snapshot : JSON.stringify(data.snapshot || {});

  const row = {
    widget_id: data.widgetId,
    widget_slug: data.widgetSlug || '',
    env: data.env || 'PROD',
    version: data.version,
    snapshot,
    changed_by: data.changedBy || '',
    change_log: data.changeLog || '',
  };

  await BQ.insertRow('widget_versions', row);
  return parseVersion(row);
}

export async function getLatestVersion(widgetId) {
  const rows = await BQ.selectRows('widget_versions', {
    where: `widget_id = '${BQ.esc(widgetId)}'`,
    orderBy: 'version DESC',
    limit: 1,
  });
  return rows.length > 0 ? parseVersion(rows[0]) : null;
}

// ══════════════════════════════════════════════════════════════
// CHECKERS (user_roles table — SERIAL id)
// ══════════════════════════════════════════════════════════════

export async function listCheckers(env) {
  const rows = await BQ.selectRows('user_roles', {
    where: `env = '${BQ.esc(env)}' AND is_active = TRUE`,
    orderBy: 'role, email',
  });
  return rows.map(row => ({
    id: row.id,
    email: row.email,
    name: row.name || row.email.split('@')[0],
    role: row.role || 'CHECKER',
    addedAt: row.added_at || null,
  }));
}

export async function addChecker(email, name, env, addedBy) {
  const lowerEmail = email.toLowerCase();
  const displayName = name || lowerEmail.split('@')[0];

  // Check if exists
  const existing = await BQ.selectRows('user_roles', {
    where: `email = '${BQ.esc(lowerEmail)}' AND env = '${BQ.esc(env)}'`,
    limit: 1,
  });

  if (existing.length > 0) {
    await BQ.updateRows('user_roles', { is_active: true, name: displayName, added_by: addedBy || '' },
      `email = '${BQ.esc(lowerEmail)}' AND env = '${BQ.esc(env)}'`);
  } else {
    await BQ.insertRow('user_roles', {
      email: lowerEmail, name: displayName, role: 'CHECKER', env,
      is_active: true, added_by: addedBy || '',
    });
  }

  bustUserCache(lowerEmail);
  return { email: lowerEmail, name: displayName, role: 'CHECKER' };
}

export async function removeChecker(email, env) {
  const lowerEmail = email.toLowerCase();
  await BQ.updateRows('user_roles', { is_active: false },
    `email = '${BQ.esc(lowerEmail)}' AND env = '${BQ.esc(env)}'`);
  bustUserCache(lowerEmail);
}

export async function isCheckerAnywhere(email) {
  const lowerEmail = email.toLowerCase();
  const rows = await BQ.selectRows('user_roles', {
    where: `email = '${BQ.esc(lowerEmail)}' AND is_active = TRUE`,
    limit: 1,
  });
  return rows.length > 0;
}

// ══════════════════════════════════════════════════════════════
// LOCATIONS
// ══════════════════════════════════════════════════════════════

function parseLocation(row) {
  if (!row) return null;
  return {
    key: row.key,
    env: row.env || 'PROD',
    levelTag: row.level_tag || '',
    levelProperty: row.level_property || '',
    slugSuffix: row.slug_suffix || '',
    label: row.label || '',
    type: row.type || '',
    isDefault: !!row.is_default,
    isEnabled: !!row.is_enabled,
    isCustom: !!row.is_custom,
    updatedAt: row.updated_at || '',
  };
}

export async function listLocations(env, enabledOnly = false) {
  const conditions = [`env = '${BQ.esc(env)}'`];
  if (enabledOnly) conditions.push(`is_enabled = TRUE`);

  const rows = await BQ.selectRows('locations', {
    where: conditions.join(' AND '),
    orderBy: 'is_default DESC, type, label',
  });
  return rows.map(parseLocation);
}

export async function getLocation(key, env) {
  const rows = await BQ.selectRows('locations', {
    where: `\`key\` = '${BQ.esc(key)}' AND env = '${BQ.esc(env)}'`,
    limit: 1,
  });
  return rows.length > 0 ? parseLocation(rows[0]) : null;
}

export async function createLocation(data) {
  const existing = await getLocation(data.key, data.env || 'PROD');
  if (existing) {
    throw Object.assign(new Error(`Location with key "${data.key}" already exists`), { status: 409 });
  }

  const row = {
    key: data.key,
    env: data.env || 'PROD',
    level_tag: data.levelTag || '',
    level_property: data.levelProperty || '',
    slug_suffix: data.slugSuffix || '',
    label: data.label || '',
    type: data.type || '',
    is_default: false,
    is_enabled: true,
    is_custom: true,
  };
  await BQ.insertRow('locations', row);
  return parseLocation(row);
}

export async function toggleLocation(key, env) {
  const current = await getLocation(key, env);
  if (!current) return null;

  if (current.isDefault) {
    throw Object.assign(new Error('Cannot toggle default locations'), { status: 403 });
  }

  const newEnabled = !current.isEnabled;
  await BQ.updateRows('locations', { is_enabled: newEnabled },
    `\`key\` = '${BQ.esc(key)}' AND env = '${BQ.esc(env)}'`);
  return getLocation(key, env);
}

export async function deleteLocation(key, env) {
  const current = await getLocation(key, env);
  if (!current) return null;

  if (!current.isCustom) {
    throw Object.assign(new Error('Only custom locations can be deleted'), { status: 403 });
  }

  await BQ.updateRows('locations', { is_enabled: false },
    `\`key\` = '${BQ.esc(key)}' AND env = '${BQ.esc(env)}'`);
  return true;
}

// ══════════════════════════════════════════════════════════════
// PRODUCTS (Metabase Structured Query)
// ══════════════════════════════════════════════════════════════

const IMAGE_BASE = 'https://gs.apnamart.in/';

const METABASE_FIELDS = [
  ['field', 2171, { 'base-type': 'type/BigInteger' }],
  ['field', 2157, { 'base-type': 'type/Integer' }],
  ['field', 2144, { 'base-type': 'type/Text' }],
  ['field', 2149, { 'base-type': 'type/Text' }],
  ['field', 2156, { 'base-type': 'type/Text' }],
  ['field', 2146, { 'base-type': 'type/Float' }],
  ['field', 2188, { 'base-type': 'type/Float' }],
];

function mapProductRow(r) {
  const mainImage = r[4] || '';
  return {
    id: r[0],
    itemCode: String(r[1] ?? ''),
    name: r[2] || '',
    brand: r[3] || '',
    image: mainImage ? `${IMAGE_BASE}${mainImage.replace(/^\//, '')}` : '',
    mrp: r[5] || 0,
    price: r[6] || 0,
  };
}

async function metabaseQuery(query) {
  if (!METABASE_API_KEY) return [];
  const res = await fetch(`${METABASE_URL}/api/dataset`, {
    method: 'POST',
    headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data?.rows || [];
}

export async function searchProducts(query, limit = 20) {
  if (!METABASE_API_KEY || !query) return [];

  const take = Math.min(limit, 100);
  const trimmed = query.trim();
  const numericCode = parseInt(trimmed);

  const searchFilter = isNaN(numericCode)
    ? ['contains', ['field', 2144, { 'base-type': 'type/Text' }], trimmed]
    : ['or',
        ['contains', ['field', 2144, { 'base-type': 'type/Text' }], trimmed],
        ['=', ['field', 2157, { 'base-type': 'type/Integer' }], numericCode],
      ];

  const mbQuery = {
    database: 3,
    type: 'query',
    query: {
      'source-table': 154,
      fields: METABASE_FIELDS,
      filter: ['and', searchFilter],
      limit: take,
      'order-by': [['asc', ['field', 2144, { 'base-type': 'type/Text' }]]],
    },
  };

  const rows = await metabaseQuery(mbQuery);
  return rows.map(mapProductRow);
}

export async function batchProducts(codes) {
  if (!METABASE_API_KEY || !codes || codes.length === 0) return {};

  const numericCodes = codes.map(c => parseInt(c)).filter(n => !isNaN(n));
  if (numericCodes.length === 0) return {};

  const mbQuery = {
    database: 3,
    type: 'query',
    query: {
      'source-table': 154,
      fields: METABASE_FIELDS,
      filter: ['=', ['field', 2157, { 'base-type': 'type/Integer' }], ...numericCodes],
    },
  };

  const rows = await metabaseQuery(mbQuery);
  const result = {};
  for (const r of rows) {
    const product = mapProductRow(r);
    if (product.itemCode) result[product.itemCode] = product;
  }
  return result;
}

export function isMetabaseAvailable() {
  return !!METABASE_API_KEY;
}

// ══════════════════════════════════════════════════════════════
// SMAPP WIDGET LOOKUP (smapp_widgets table — Samaan DB id:3, table:236)
// ══════════════════════════════════════════════════════════════
//
// SMApp stores widgets with a SUFFIXED slug (e.g., base_slug + "_spr_opt").
// Our canvas_widgets stores the BASE slug (e.g., "testtt_spr_sc_all_masthead_global").
// This module derives the full SMApp slug from base + type + pnc,
// then looks up the numeric widget ID from Metabase.
//
// Field IDs (smapp_widgets, table 236):
//   2906 = id (int8, PK)
//   2910 = slug_name (varchar)
//   2904 = widget_type (varchar)
//   19578 = heading_en (varchar)

const SMAPP_WIDGET_TABLE = 236;
const SMAPP_WIDGET_FIELDS = {
  id: ['field', 2906, { 'base-type': 'type/BigInteger' }],
  slug_name: ['field', 2910, { 'base-type': 'type/Text' }],
  widget_type: ['field', 2904, { 'base-type': 'type/Text' }],
  heading_en: ['field', 19578, { 'base-type': 'type/Text' }],
};

/**
 * Derive the SMApp widget slug from our base slug + type + pnc.
 *
 * Suffix rules (from wiki/SLUG_NAME.md Section 8):
 *   product_rail standard     → _spr
 *   product_rail optimized    → _spr_opt
 *   collection_banner scroll  → _crausel_w    (carousel)
 *   collection_banner stick   → _cm_hp        (category grid)
 *   masthead primary          → (contains search — timestamp suffix)
 *   masthead secondary        → (contains search — timestamp suffix)
 */
/**
 * Strip widget type suffix from slug to get the base slug.
 * e.g., "test_spr_sc_global_spr_opt" → "test_spr_sc_global"
 */
export function stripSlugSuffix(slug) {
  if (!slug) return '';
  return slug
    .replace(/_spr_opt$/, '')
    .replace(/_spr$/, '')
    .replace(/_crausel_w$/, '')
    .replace(/_cl_w_hp$/, '')
    .replace(/_cm_hp$/, '')
    .replace(/_mm$/, '');
}

/**
 * Derive the full SMApp slug by adding type suffix to base slug.
 * Base slug should NOT have suffix — use stripSlugSuffix() first if unsure.
 */
export function deriveSmappSlug(baseSlug, type, pnc = {}) {
  if (!baseSlug) return null;

  const t = (type || '').toLowerCase();

  // If slug already has a known suffix, return as-is (don't re-derive)
  if (baseSlug.endsWith('_spr_opt') || baseSlug.endsWith('_spr') ||
      baseSlug.endsWith('_crausel_w') || baseSlug.endsWith('_cl_w_hp') ||
      baseSlug.endsWith('_cm_hp') || baseSlug.endsWith('_mm')) {
    return baseSlug;
  }

  // No suffix yet — add based on type + pnc
  const clean = stripSlugSuffix(baseSlug);

  if (t === 'product_rail' || t.includes('product_row')) {
    return clean + (pnc.is_optimized ? '_spr_opt' : '_spr');
  }

  if (t === 'collection_banner' || t === 'carousel') {
    if (pnc.displayMode === 'stick' || t === 'category') {
      return clean + '_cm_hp';
    }
    return clean + '_crausel_w';
  }

  if (t === 'masthead') return null;

  return clean;
}

/**
 * Lookup SMApp widget ID by exact slug_name match.
 * Returns numeric ID (e.g., "9338") or null if not found.
 */
export async function lookupSmappWidgetId(slugName) {
  if (!METABASE_API_KEY || !slugName) return null;

  const rows = await metabaseQuery({
    database: 3,
    type: 'query',
    query: {
      'source-table': SMAPP_WIDGET_TABLE,
      fields: [SMAPP_WIDGET_FIELDS.id, SMAPP_WIDGET_FIELDS.slug_name],
      filter: ['=', SMAPP_WIDGET_FIELDS.slug_name, slugName],
      limit: 1,
    },
  });

  return rows.length > 0 ? String(rows[0][0]) : null;
}

/**
 * Lookup SMApp widget ID using CONTAINS (for mastheads with timestamp suffixes).
 * Returns numeric ID or null.
 */
async function lookupSmappWidgetIdByContains(baseSlug) {
  if (!METABASE_API_KEY || !baseSlug) return null;

  const rows = await metabaseQuery({
    database: 3,
    type: 'query',
    query: {
      'source-table': SMAPP_WIDGET_TABLE,
      fields: [SMAPP_WIDGET_FIELDS.id, SMAPP_WIDGET_FIELDS.slug_name],
      filter: ['contains', SMAPP_WIDGET_FIELDS.slug_name, baseSlug],
      'order-by': [['desc', SMAPP_WIDGET_FIELDS.id]], // latest first
      limit: 1,
    },
  });

  return rows.length > 0 ? String(rows[0][0]) : null;
}

/**
 * Full SMApp widget ID lookup — derives proper slug, then queries Metabase.
 *
 * @param {string} baseSlug — slug from canvas_widgets
 * @param {string} type — widget type (product_rail, collection_banner, masthead)
 * @param {object} pnc — widget properties { is_optimized, displayMode, ... }
 * @returns {string|null} — SMApp widget ID or null
 */
export async function resolveSmappWidgetId(baseSlug, type, pnc = {}) {
  if (!METABASE_API_KEY || !baseSlug) return null;

  const smappSlug = deriveSmappSlug(baseSlug, type, pnc);

  // Exact match for types with deterministic suffixes
  if (smappSlug) {
    const id = await lookupSmappWidgetId(smappSlug);
    if (id) return id;
  }

  // Fallback: contains search (mastheads, or if exact match failed)
  return lookupSmappWidgetIdByContains(baseSlug);
}

/**
 * Batch lookup SMApp widget IDs for multiple slugs.
 * Returns { baseSlug: smappId, ... }
 */
export async function batchLookupSmappWidgetIds(widgets) {
  if (!METABASE_API_KEY || !widgets || widgets.length === 0) return {};

  // Derive all SMApp slugs
  const smappSlugs = [];
  const slugMap = new Map(); // smappSlug → baseSlug

  for (const w of widgets) {
    const smappSlug = deriveSmappSlug(w.slug, w.type, w.pnc || {});
    if (smappSlug) {
      smappSlugs.push(smappSlug);
      slugMap.set(smappSlug, w.slug);
    }
  }

  if (smappSlugs.length === 0) return {};

  const rows = await metabaseQuery({
    database: 3,
    type: 'query',
    query: {
      'source-table': SMAPP_WIDGET_TABLE,
      fields: [SMAPP_WIDGET_FIELDS.id, SMAPP_WIDGET_FIELDS.slug_name],
      filter: ['=', SMAPP_WIDGET_FIELDS.slug_name, ...smappSlugs],
      limit: smappSlugs.length,
    },
  });

  const result = {};
  for (const r of rows) {
    const smappSlug = r[1];
    const baseSlug = slugMap.get(smappSlug) || smappSlug;
    result[baseSlug] = String(r[0]);
  }
  return result;
}
