# DATA — Kinetic Integration (ClickHouse Sync)

> **Status:** Active — Tables published, queries live, end-to-end verified
> **Kinetic API:** `https://kinetic-yvwajp6mzq-el.a.run.app`
> **Project:** `homepage`
> **Auth:** Bearer token `spectra` (user: `invictus` / Satyam)
> **Phone:** `8987725306` (required for write ops via `X-User-Phone` header)
> **Mirror tables:** `Homepage Widget Submissions`, `Homepage User Roles` (at mirror.apnamart.in → KINETIC schema)

---

## Overview

Optimus syncs widget submission data to **ClickHouse** via the **Kinetic** platform. This runs alongside the primary **BigQuery** (`apna-mart-data.optimus`) database — Kinetic/ClickHouse is the secondary analytics store used for WidgetHistory, analytics, and audit trail.

Only **PROD** environment data is synced to Kinetic.

```
┌─────────────┐     /api/local/*      ┌──────────────────┐     fire-and-forget
│  React App  │ ──────────────────────▶│  Express :3001   │ ─────────────────────▶ Kinetic (Cloud Run)
│  (Vite)     │                        │  BigQuery        │                        │
│  :8888      │                        │  (apna-mart-data │                        ▼
│             │◀─── dual-source ───────│   .optimus)      │─────────────── ClickHouse
└─────────────┘  (BigQuery + Kinetic)  └──────────────────┘                │
                                                                           ▼
                                                              mirror.apnamart.in
                                                              (Homepage Widget Submissions)
```

### Key Principles

1. **Non-blocking** — Kinetic sync is fire-and-forget. If it fails, Prisma flow is unaffected.
2. **PROD only** — Only production submissions are synced (`env !== 'PROD'` is skipped).
3. **Dual-source reads** — History UI fetches from both Prisma and Kinetic via `Promise.allSettled`.
4. **3-stage sync** — Data is written/updated at Submit → Approve/Reject → Deploy.

---

## Architecture

### Files

| File | Role |
|------|------|
| `server/services/KineticService.js` | Low-level HTTP client (retry, auth, `X-User-Phone`, all Kinetic API methods) |
| `server/services/KineticSyncService.js` | Business logic: widget → row transform, sync at 3 stages, history/analytics fetch |
| `server/routes/kinetic.js` | Express routes: `/health`, `/history`, `/analytics`, `/deploy-sync` |
| `server/scripts/kinetic-setup.js` | One-time script to create ClickHouse table + saved queries |
| `server/routes/users.js` | Checker add/remove routes — auto-sync to `user_roles` via KineticSync |
| `server/.env` | `KINETIC_API_BASE`, `KINETIC_BEARER_TOKEN`, `KINETIC_USER_PHONE` |
| `src/services/LocalApiService.js` | Frontend methods: `getKineticHealth`, `getKineticHistory`, `getKineticAnalytics`, `syncDeployToKinetic` |
| `src/Backend/services/DeploymentService.js` | Returns `widgetId` + full `slugs` in deploy results |
| `src/components/Dashboard/RequestQueue.jsx` | Calls `syncDeployToKinetic` after successful deploy |

### Data Flow — 3-Stage Sync

```
  Stage 1: SUBMIT                    Stage 2: APPROVE/REJECT           Stage 3: DEPLOY
  ──────────────                     ───────────────────────           ────────────────

  Maker submits widget               Checker approves/rejects          Deploy to backend
         │                                    │                               │
         ▼                                    ▼                               ▼
  POST /api/local/requests           POST /requests/:id/approve   DeploymentService.deployRequest()
         │                           POST /requests/:id/reject           │
         ├──▶ Prisma (primary)                │                          ├──▶ Builders deploy to
         │                                    │                          │    external API
         └──▶ syncSubmission()                └──▶ syncStatusChange()    │
              (fire-and-forget)                    (fire-and-forget)      └──▶ POST /kinetic/deploy-sync
              │                                    │                          (fire-and-forget)
              ▼                                    ▼                          │
         INSERT rows                          UPDATE status                   ▼
         status = PENDING                     → APPROVED / REJECTED      syncDeploy()
         + title_hi, hierarchy                + edited_by, edited_at     status → DEPLOYED
         + page_slug, item_titles_hi                                     + actual slugs/hierarchy
                                                                         + edited_by, edited_at
```

### Read Path

```
  WidgetHistory.jsx
         │
         ▼
  Promise.allSettled([
    Prisma: getRequestsByDate(d),
    Kinetic: getKineticHistory({...})
  ])
         │
         ▼
  Merge + dedupe by request_id
  (Prisma wins if both have same request_id)
         │
         ▼
  Unified history list (Kinetic rows show "Kinetic" badge)
```

---

## Setup

### 1. Set Environment Variables

Edit `server/.env`:

```bash
KINETIC_API_BASE=https://kinetic-yvwajp6mzq-el.a.run.app
KINETIC_BEARER_TOKEN=spectra
KINETIC_USER_PHONE=8987725306
```

### 2. Create Table + Queries

```bash
node server/scripts/kinetic-setup.js
```

This creates:
- **Table:** `widget_submissions` (ClickHouse: `kinetic.homepage__widget_submissions`)
- **Table:** `user_roles` (ClickHouse: `kinetic.homepage__user_roles`)
- **Query:** `homepage/submissions-by-date` — widget submissions by date range
- **Query:** `homepage/analytics` — aggregated submission analytics
- **Query:** `homepage/user-roles` — checker/admin registry
- **Query:** `homepage/product-catalog` — (unused: smpublic not in Kinetic's CH, catalog uses Metabase instead)

### 3. Restart Server

```bash
# The server will log on startup:
# [KineticService] Configured → https://kinetic-yvwajp6mzq-el.a.run.app (project: homepage) ✓
```

That's it. Widget submissions will now auto-sync to ClickHouse.

---

## Managed Table Schema

**Table:** `widget_submissions`
**ClickHouse name:** `kinetic.homepage__widget_submissions`
**Mirror name:** `Homepage Widget Submissions`
**Engine:** `ReplacingMergeTree(_version)` (auto-set by upsert_key)
**Order by:** `(dt, widget_id)`
**Partition by:** `toYYYYMM(dt)`
**Upsert key:** `(dt, widget_id)` — re-submissions on same day update the row.

| Column | Type | Description |
|--------|------|-------------|
| `dt` | Date | Submission date (YYYY-MM-DD) |
| `widget_id` | String | Widget UUID |
| `widget_type` | String | e.g. `single_product_row_v2`, `category_grid` |
| `slug` | String | Widget base slug identifier |
| `title` | String | Display title (English) |
| `title_hi` | String | Widget Hindi title (`titleHi` from canvas) |
| `item_titles_hi` | String | Widget items Hindi titles (JSON array of `{name, nameHi}`) |
| `status` | String | `PENDING` → `APPROVED`/`REJECTED` → `DEPLOYED` |
| `submitted_by` | String | Maker email |
| `edited_by` | String | Last editor email (set on approve/reject/deploy) |
| `edited_at` | String | Last edit timestamp ISO (set on approve/reject/deploy) |
| `env` | String | Always `PROD` (staging is filtered out) |
| `products_count` | UInt32 | Number of products in widget |
| `pnc` | String | PNC config as JSON string |
| `page_slug` | String | Derived page layout slug (e.g. `{base}_page_p`) |
| `hierarchy` | String | Full slug mapping JSON — page → widget → items |
| `snapshot` | String | Full widget config snapshot as JSON |
| `request_id` | String | Associated request UUID |

### Status Lifecycle

```
PENDING ──approve──▶ APPROVED ──deploy──▶ DEPLOYED
   │
   └────reject───▶ REJECTED
```

### When Data is Written

| Event | Trigger | What happens in Kinetic |
|-------|---------|------------------------|
| **Submit** | POST /requests | INSERT rows: all columns populated, `status = PENDING`, derived `page_slug` + `hierarchy` |
| **Approve** | POST /requests/:id/approve | UPDATE: `status → APPROVED`, `edited_by`, `edited_at` |
| **Reject** | POST /requests/:id/reject | UPDATE: `status → REJECTED`, `edited_by`, `edited_at` |
| **Deploy** | POST /kinetic/deploy-sync | UPDATE: `status → DEPLOYED`, actual `hierarchy` slugs, `edited_by`, `edited_at` |

### Hierarchy JSON Structure

The `hierarchy` column stores the full slug mapping for the widget's deploy tree. At submit time, these are derived from the base slug. At deploy time, they are overwritten with actual slugs from the builders.

**SPR / DPR:**
```json
{
  "page": "milk_spr_v2_page_p",
  "plpWidget": "milk_spr_v2_plp_w",
  "homeWidget": "milk_spr_v2_spr_opt",
  "scItems": ["milk_spr_v2_sc_wi_global", "milk_spr_v2_sc_wi_jh"],
  "rowItems": ["milk_spr_v2_pr_wi_global", "milk_spr_v2_pr_wi_jh"]
}
```

**Collection Banner / Carousel:**
```json
{
  "page": "summer_sale_page_p",
  "items": [
    { "item": "summer_sale_item_1_cl_wi", "page": "summer_sale_item_1_plp_page", "plp": "summer_sale_item_1_plp" },
    { "item": "summer_sale_item_2_cl_wi", "page": "summer_sale_item_2_plp_page", "plp": "summer_sale_item_2_plp" }
  ]
}
```

**Secondary Masthead:**
```json
{
  "items": [
    { "carousel": "banner_item_1_carousel" },
    { "carousel": "banner_item_2_carousel" }
  ]
}
```

---

## User Roles Table

**Table:** `user_roles`
**ClickHouse name:** `kinetic.homepage__user_roles`
**Mirror name:** `Homepage User Roles`
**Engine:** `ReplacingMergeTree(_version)` (auto-set by upsert_key)
**Order by:** `(email, env)`
**Upsert key:** `(email, env)` — same user re-added updates the row.

| Column | Type | Description |
|--------|------|-------------|
| `email` | String | User email (primary identifier) |
| `name` | String | Display name |
| `role` | String | `CHECKER` or `SUPER_ADMIN` |
| `env` | String | `PROD` or `STAGING` |
| `added_at` | String | When user was added (ISO timestamp) |
| `added_by` | String | Who added this user (email) |
| `is_active` | UInt8 | `1` = active, `0` = removed (soft-delete) |
| `updated_at` | String | Last update timestamp (ISO) |

### Auto-Sync

User role changes are automatically synced to Kinetic from `server/routes/users.js`:

| Event | Trigger | Kinetic Action |
|-------|---------|---------------|
| **Add Checker** | `POST /users/checkers` | `syncUserRoleAdd()` — inserts row with `is_active = 1` |
| **Remove Checker** | `DELETE /users/checkers` | `syncUserRoleRemove()` — updates `is_active = 0` (soft-delete) |

Both are fire-and-forget with `.catch(() => {})`.

---

## Saved Queries

> **Important:** Kinetic lowercases all string template variables. Use `lower(column) = {{var}}` pattern.
> See [Kinetic API Gotchas](#kinetic-api-gotchas) for details.

### `homepage/submissions-by-date`

Fetch widget submissions within a date range. Used by WidgetHistory.jsx.

```sql
SELECT dt, widget_id, widget_type, slug, title, title_hi, item_titles_hi,
       status, submitted_by, edited_by, edited_at, env,
       products_count, pnc, page_slug, hierarchy, request_id, snapshot
FROM kinetic.homepage__widget_submissions FINAL
WHERE dt >= {{start_date}} AND dt <= {{end_date}}
{{#if filter_status}} AND lower(status) = {{filter_status}} {{/if}}
{{#if filter_env}} AND lower(env) = {{filter_env}} {{/if}}
ORDER BY dt DESC
```

**Variables:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `start_date` | date | Yes | Start date |
| `end_date` | date | Yes | End date |
| `filter_status` | string | No | Filter: PENDING, APPROVED, REJECTED, DEPLOYED |
| `filter_env` | string | No | Filter: PROD |

### `homepage/analytics`

Aggregated submission analytics. Used by the analytics endpoint.

```sql
SELECT dt, status, widget_type, submitted_by, edited_by, env,
       count() as submission_count, sum(products_count) as total_products
FROM kinetic.homepage__widget_submissions FINAL
WHERE dt >= {{start_date}} AND dt <= {{end_date}}
{{#if filter_env}} AND lower(env) = {{filter_env}} {{/if}}
GROUP BY dt, status, widget_type, submitted_by, edited_by, env
ORDER BY dt DESC
```

### `homepage/user-roles`

List active checkers and super admins. Used for user role registry.

```sql
SELECT email, name, role, env, added_at, added_by, is_active, updated_at
FROM kinetic.homepage__user_roles FINAL
WHERE is_active = 1
{{#if filter_role}} AND lower(role) = {{filter_role}} {{/if}}
{{#if filter_env}} AND lower(env) = {{filter_env}} {{/if}}
ORDER BY role, email
```

**Variables:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filter_role` | string | No | Filter: CHECKER, SUPER_ADMIN |
| `filter_env` | string | No | Filter: PROD, STAGING |

### `homepage/product-catalog`

Full product catalog from Mirror (reads existing `smpublic` tables). No variables — returns all active products.

```sql
SELECT
  source.id AS id,
  source.item_code AS item_code,
  source.display_name AS display_name,
  source.brand AS brand,
  source.product_image AS product_image,
  source.mrp AS mrp,
  source.selling_price AS selling_price
FROM
(
  SELECT a.*,
    CONCAT('https://gs.apnamart.in/', LTRIM(a.main_image, '/')) AS product_image
  FROM smpublic.smpcm_product a
  WHERE a.active = TRUE
) AS source
WHERE (source.channels <> 'OFF' OR source.channels IS NULL)
```

**Variables:** None

**Used by:** `GET /api/local/kinetic/catalog` (server-side 30-min cache)

---

## API Endpoints

All under `/api/local/kinetic` (requires auth via `X-Optimus-User` header).

### Health Check

```bash
GET /api/local/kinetic/health
```

```json
{ "available": true, "timestamp": "2026-03-18T10:00:00.000Z" }
```

### Product Catalog

```bash
GET /api/local/kinetic/catalog
```

```json
{
  "products": [
    { "id": 2, "item_code": "746", "display_name": "Moong Dal Dhuli 1 Kg", "brand": "ASM", "product_image": "https://gs.apnamart.in/...", "mrp": 159, "selling_price": 140 }
  ],
  "count": 10000,
  "cached": true,
  "source": "kinetic"
}
```

Server-side in-memory cache with 30-min TTL (~10k rows, ~2MB).

### Widget History

```bash
GET /api/local/kinetic/history?startDate=2026-03-18&endDate=2026-03-18&status=APPROVED&env=PROD
```

```json
{
  "rows": [
    {
      "dt": "2026-03-18",
      "widget_id": "abc-123",
      "widget_type": "single_product_row_v2",
      "slug": "milk_spr_v2_260318",
      "title": "Milk Products",
      "title_hi": "दूध उत्पाद",
      "status": "DEPLOYED",
      "submitted_by": "maker@company.com",
      "edited_by": "checker@company.com",
      "page_slug": "milk_spr_v2_260318_page_p",
      "hierarchy": "{...}",
      "env": "PROD",
      "products_count": 5,
      "request_id": "req-456"
    }
  ],
  "count": 1,
  "source": "kinetic"
}
```

### Analytics

```bash
GET /api/local/kinetic/analytics?startDate=2026-03-01&endDate=2026-03-18&env=PROD
```

```json
{
  "rows": [
    {
      "dt": "2026-03-18",
      "status": "DEPLOYED",
      "widget_type": "single_product_row_v2",
      "submitted_by": "maker@company.com",
      "edited_by": "checker@company.com",
      "env": "PROD",
      "submission_count": 5,
      "total_products": 23
    }
  ],
  "count": 1,
  "source": "kinetic"
}
```

### Deploy Sync

Called by frontend after successful deploy to sync actual slugs to Kinetic.

```bash
POST /api/local/kinetic/deploy-sync
Content-Type: application/json

{
  "widgets": [
    {
      "widgetId": "abc-123",
      "dt": "2026-03-18",
      "slugs": {
        "widget": "milk_spr_v2_spr_opt",
        "page": "milk_spr_v2_page_p",
        "plpWidget": "milk_spr_v2_plp_w",
        "scItems": {},
        "rowItems": {}
      }
    }
  ]
}
```

```json
{ "synced": 1, "source": "kinetic" }
```

---

## Service Layer Details

### KineticService.js — HTTP Client

Low-level client for all Kinetic API communication.

```
KineticService
  ├── isAvailable()                    → bool (checks if token is set)
  ├── insertRows(table, rows)          → POST /tables/{table}/rows
  ├── readRows(table, params)          → GET  /tables/{table}/rows?where=...
  ├── updateRows(table, {set, where})  → POST /tables/{table}/update
  ├── runQuery(slug, variables)        → POST /queries/{slug}/run
  ├── putTable(slug, definition)       → PUT  /tables/{slug}
  ├── publishTable(slug)               → POST /tables/{slug}/publish
  └── putQuery(slug, definition)       → PUT  /queries/{slug}
```

**Config:** `KINETIC_API_BASE`, `KINETIC_BEARER_TOKEN`, `KINETIC_USER_PHONE` from `server/.env`
**Headers:** `Authorization: Bearer <token>` + `X-User-Phone: <phone>` on every request.
**Retry:** 3 attempts with exponential backoff (200ms, 400ms, 800ms). 4xx errors are not retried.
**Safety:** All methods return `null` on failure — they never throw.

### KineticSyncService.js — Business Logic

Transforms Optimus widget data into Kinetic table rows.

```
KineticSyncService
  ├── syncSubmission(request, widgets, user, env)    → Stage 1: insert rows (PENDING)
  ├── syncStatusChange(requestId, newStatus, user)   → Stage 2: update status (APPROVED/REJECTED)
  ├── syncDeploy(widgetId, dt, slugs, user)          → Stage 3: update status (DEPLOYED) + actual slugs
  ├── syncUserRoleAdd(user, env, addedBy)             → Insert user role row
  ├── syncUserRoleRemove(email, env)                  → Soft-delete user role (is_active = 0)
  ├── fetchHistory(startDate, endDate, filters)      → Read: saved query
  └── fetchAnalytics(startDate, endDate, filters)    → Read: saved query
```

**PROD-only guard:** `syncSubmission` skips if `env !== 'PROD'`.

**Helper functions:**
- `extractItemTitlesHi(w)` — extracts Hindi titles from carousel/scroll items + sub-categories
- `deriveHierarchy(w)` — builds expected slug tree from base slug + widget type at submit time
- `derivePageSlug(w)` — derives page layout slug from base slug + page type

**Widget → Row transformation:**

```javascript
// Input: canvas widget object
{
  id: "abc-123",
  type: "Single Product Row Optimize",
  slug_name: "milk_spr",
  title: "Milk Products",
  titleHi: "दूध उत्पाद",
  pnc: { rows: 1, is_optimized: true },
  stateProducts: { global: "746,5005", jh: "840" },
  pageType: "product_listing_page",
  ...
}

// Output: Kinetic table row
{
  dt: "2026-03-18",
  widget_id: "abc-123",
  widget_type: "Single Product Row Optimize",
  slug: "milk_spr",
  title: "Milk Products",
  title_hi: "दूध उत्पाद",
  item_titles_hi: "[]",
  status: "PENDING",
  submitted_by: "maker@company.com",
  edited_by: "",
  edited_at: "",
  env: "PROD",
  products_count: 2,
  pnc: '{"rows":1,"is_optimized":true}',
  page_slug: "milk_spr_page_p",
  hierarchy: '{"page":"milk_spr_page_p","plpWidget":"milk_spr_plp_w","homeWidget":"milk_spr_spr_opt","scItems":["milk_spr_sc_wi_global","milk_spr_sc_wi_jh"],"rowItems":["milk_spr_pr_wi_global","milk_spr_pr_wi_jh"]}',
  snapshot: '{...full widget config...}',
  request_id: "req-456"
}
```

File/Blob values are stripped from the snapshot (can't serialize to JSON).

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `KINETIC_BEARER_TOKEN` not set | All sync silently skipped. Log: `[KineticService] No KINETIC_BEARER_TOKEN — Kinetic sync disabled.` |
| `env !== 'PROD'` | `syncSubmission` returns immediately. Staging data never reaches Kinetic. |
| Kinetic API unreachable (write) | 3 retries, then `console.warn`. Prisma write already succeeded. |
| Kinetic API returns 4xx (write) | No retry. Logged and ignored. |
| Kinetic API unreachable (read) | `Promise.allSettled` ensures Prisma data still loads. Kinetic portion shows empty. |
| Duplicate submission same day | Upsert key `(dt, widget_id)` updates existing row. No duplicates. |
| Deploy sync fails | Non-blocking `.catch()` in RequestQueue. Deploy itself already succeeded. |

**Rule:** Kinetic failure NEVER blocks the Prisma flow or the deploy flow. Every call site uses `.catch()`.

---

## Frontend Integration

### WidgetHistory.jsx — Dual-Source Fetch

The history panel fetches from both sources in parallel:

```javascript
const [bqResult, kineticResult] = await Promise.allSettled([
  LocalApiService.getRequestsByDate(d),          // BigQuery (primary)
  LocalApiService.getKineticHistory({ ... }),     // Kinetic (secondary)
]);
```

**Merge strategy:**
1. BigQuery requests are tagged with `_source: 'bigquery'`
2. Kinetic rows are grouped by `request_id` into pseudo-request objects tagged `_source: 'kinetic'`
3. If a `request_id` exists in both, BigQuery wins (it has richer relational data)
4. Kinetic-only requests show a small "Kinetic" badge in the UI

### RequestQueue.jsx — Deploy Sync

After successful deploy, the frontend fires a deploy-sync call to Kinetic:

```javascript
// After DeploymentService.deployRequest() succeeds
const kineticWidgets = result.results
  .filter(r => r.status === 'ok' && r.slug)
  .map(r => ({ widgetId: r.widgetId, slugs: r.slugs }));

LocalApiService.syncDeployToKinetic(kineticWidgets)
  .catch(e => console.warn('[Kinetic] Deploy sync failed:', e.message));
```

### LocalApiService.js — Kinetic Methods

```javascript
LocalApiService.getKineticHealth()                                          // GET /kinetic/health
LocalApiService.getKineticHistory({ startDate, endDate, status, env })      // GET /kinetic/history
LocalApiService.getKineticAnalytics({ startDate, endDate, env })            // GET /kinetic/analytics
LocalApiService.syncDeployToKinetic(widgets)                                // POST /kinetic/deploy-sync
```

---

## How to Use

### For Makers (daily use)

Nothing changes. Submit widgets as usual. Data automatically syncs to ClickHouse in the background.

### For Checkers (daily use)

Approve or reject as usual. Status updates are automatically synced. After deploy, the actual slug hierarchy is stored.

### For Data / Analytics

Query the mirror at `mirror.apnamart.in` → KINETIC schema → **Homepage Widget Submissions**.

Or query ClickHouse directly:

```sql
-- All deployed widgets this month
SELECT dt, widget_type, slug, title, title_hi, submitted_by, edited_by, products_count, page_slug
FROM kinetic.homepage__widget_submissions FINAL
WHERE dt >= '2026-03-01' AND status = 'DEPLOYED'
ORDER BY dt DESC;

-- Submission count by type
SELECT widget_type, count() as cnt
FROM kinetic.homepage__widget_submissions FINAL
WHERE dt >= '2026-03-01'
GROUP BY widget_type
ORDER BY cnt DESC;

-- Who submitted the most?
SELECT submitted_by, count() as submissions
FROM kinetic.homepage__widget_submissions FINAL
WHERE dt >= '2026-03-01'
GROUP BY submitted_by
ORDER BY submissions DESC;

-- Full hierarchy for a widget
SELECT slug, page_slug, hierarchy
FROM kinetic.homepage__widget_submissions FINAL
WHERE slug = 'milk_spr_v2_180326';
```

> **Note:** Always use `FINAL` with `ReplacingMergeTree` tables to get deduplicated results.

### For Developers

#### Add new columns to the table

1. Edit the table definition in `kinetic-setup.js` (add to `columns` array)
2. Run `node server/scripts/kinetic-setup.js` again (it re-publishes, adding new columns)
3. Update `KineticSyncService.js` to populate the new column in `syncSubmission()`

#### Add a new saved query

1. Add a `Kinetic.putQuery(...)` call in `kinetic-setup.js`
2. Run the setup script
3. Add a method in `KineticSyncService.js` to call `Kinetic.runQuery('your-query', vars)`
4. Add an Express route in `kinetic.js` to expose it
5. Add a `LocalApiService` method for the frontend

---

## Kinetic API Reference

**Base URL:** `https://kinetic-yvwajp6mzq-el.a.run.app`
**Auth:** `Authorization: Bearer spectra` + `X-User-Phone: 8987725306`
**Docs:** `GET /api/help` (10 domains) | `GET /api/help?domain=tables` | `GET /api/handover`

```bash
# Health check (no auth)
curl https://kinetic-yvwajp6mzq-el.a.run.app/api/health

# List tables
curl -H "Authorization: Bearer spectra" \
  "https://kinetic-yvwajp6mzq-el.a.run.app/api/projects/homepage/tables"

# Read rows
curl -H "Authorization: Bearer spectra" \
  "https://kinetic-yvwajp6mzq-el.a.run.app/api/projects/homepage/tables/widget_submissions/rows?limit=10"

# Run saved query
curl -X POST -H "Authorization: Bearer spectra" -H "Content-Type: application/json" \
  "https://kinetic-yvwajp6mzq-el.a.run.app/api/projects/homepage/queries/homepage/submissions-by-date/run" \
  -d '{ "start_date": "2026-03-01", "end_date": "2026-03-18" }'
```

---

## Kinetic API Gotchas

These are hard-won lessons from building this integration. **Read before starting any new Kinetic project.**

### 1. String Variables are Lowercased

Kinetic's Handlebars template engine **lowercases all string variable values** before injecting into SQL.

```
You pass:     { filter_env: "PROD" }
Kinetic renders: AND env = 'prod'     ← lowercased!
Data has:        env = 'PROD'         ← uppercase in ClickHouse
Result:          0 rows               ← case mismatch!
```

**Fix:** Always use `lower(column)` on the column side:
```sql
-- ✅ Correct
{{#if filter_env}} AND lower(env) = {{filter_env}} {{/if}}

-- ❌ Wrong (case mismatch, returns 0 rows)
{{#if filter_env}} AND env = {{filter_env}} {{/if}}
```

### 2. String Variables are Auto-Quoted

Kinetic automatically wraps string variables in single quotes. Don't add your own.

```sql
-- ✅ Correct — Kinetic renders: AND env = 'prod'
AND lower(env) = {{filter_env}}

-- ❌ Wrong — Kinetic renders: AND env = ''prod'' → 502 error
AND lower(env) = '{{filter_env}}'
```

### 3. Table Slugs: No Hyphens

ClickHouse identifiers don't support hyphens. Table slugs with hyphens will publish but fail on query.

```
✅ widget_submissions     (underscores)
❌ optimus-widget-submissions     (hyphens → ClickHouse syntax error)
```

### 4. upsert_key Must Be Array, order_by Must Be String

```javascript
// ✅ Correct
{
  order_by: '(dt, widget_id)',        // STRING with parentheses
  upsert_key: ['dt', 'widget_id'],   // ARRAY
}

// ❌ Wrong — upsert_key as string iterates characters
{
  order_by: ['dt', 'widget_id'],      // Array → 500 error
  upsert_key: '(dt, widget_id)',      // String → iterates chars 'd', 't', etc.
}
```

### 5. upsert_key Order Must Match order_by

The columns in `upsert_key` must be in the same order as `order_by`. Mismatched order causes silent data issues.

### 6. Always Use FINAL in Saved Queries

Kinetic creates `ReplacingMergeTree` tables when `upsert_key` is set. Without `FINAL`, you get duplicate rows.

```sql
-- ✅ Correct — deduplicated results
SELECT * FROM kinetic.homepage__widget_submissions FINAL

-- ❌ Wrong — may return duplicate rows before merge
SELECT * FROM kinetic.homepage__widget_submissions
```

> Note: The `readRows()` API method handles this internally. Only saved queries need explicit `FINAL`.

### 7. Required Fields for Saved Queries

Both `tags` and `sample_questions` arrays are **mandatory**. Missing either causes creation failure.

```javascript
// ✅ Correct
{
  tags: ['optimus', 'widget'],
  sample_questions: ['What widgets were submitted today?'],
  sql: '...',
}

// ❌ Wrong — missing required fields
{
  sql: '...',
}
```

### 8. X-User-Phone Header Required for Writes

All write operations (insert, update, putTable, publishTable, putQuery) require `X-User-Phone` header with a registered phone number. Read operations work without it.

### 9. ClickHouse Table Name Pattern

The full ClickHouse table name is: `kinetic.{PROJECT}__{table_slug}` (double underscore).

```
Project: homepage
Table slug: widget_submissions
CH table: kinetic.homepage__widget_submissions
```

### 10. Variable Naming Convention

Use `filter_` prefix for query variables to avoid conflicts with Kinetic internals.

```javascript
// ✅ Recommended
variables: { filter_env: ..., filter_status: ..., filter_role: ... }

// ⚠️  May conflict with Kinetic internals
variables: { env: ..., status: ..., role: ... }
```

---

## Replication Guide: Using Kinetic in Another Project

Step-by-step guide to replicate this integration in any Node.js/Express project.

### Prerequisites

- Kinetic API access (bearer token + registered phone number)
- Node.js with ES modules (`"type": "module"` in package.json)
- Express server (or any HTTP server)

### Step 1: Copy KineticService.js

Copy `server/services/KineticService.js` as-is. Change only the `PROJECT` constant:

```javascript
const PROJECT = 'your_project_name';  // e.g. 'catalog', 'orders', 'inventory'
```

This gives you 7 methods: `isAvailable()`, `insertRows()`, `readRows()`, `updateRows()`, `runQuery()`, `putTable()`, `publishTable()`, `putQuery()`.

### Step 2: Set Environment Variables

```bash
# your-project/server/.env
KINETIC_API_BASE=https://kinetic-yvwajp6mzq-el.a.run.app
KINETIC_BEARER_TOKEN=spectra
KINETIC_USER_PHONE=8987725306
```

### Step 3: Create Setup Script

```javascript
// your-project/scripts/kinetic-setup.js
import * as Kinetic from '../services/KineticService.js';

async function setup() {
  if (!Kinetic.isAvailable()) {
    console.error('❌ KINETIC_BEARER_TOKEN not set');
    process.exit(1);
  }

  // 1. Define table
  const table = await Kinetic.putTable('your_table_slug', {
    description: 'What this table stores',
    columns: [
      { name: 'dt', type: 'Date' },
      { name: 'id', type: 'String' },
      { name: 'status', type: 'String' },
      // ... your columns (String, UInt32, Date, Float64, etc.)
    ],
    engine: 'MergeTree()',
    order_by: '(dt, id)',               // STRING, not array!
    partition_by: 'toYYYYMM(dt)',       // optional
    upsert_key: ['dt', 'id'],           // ARRAY, same order as order_by!
  });

  // 2. Publish to ClickHouse
  await Kinetic.publishTable('your_table_slug');

  // 3. Create saved query
  await Kinetic.putQuery('your-project/your-query', {
    description: 'What this query does',
    tags: ['your-project'],                     // REQUIRED
    sample_questions: ['Example question?'],    // REQUIRED
    sql: [
      'SELECT *',
      'FROM kinetic.PROJECT__your_table_slug FINAL',  // Use FINAL!
      'WHERE dt >= {{start_date}} AND dt <= {{end_date}}',
      '{{#if filter_status}} AND lower(status) = {{filter_status}} {{/if}}',  // lower()!
    ].join('\n'),
    engine: 'clickhouse',
    variables: {
      start_date: { type: 'date', required: true, default: null, description: 'Start' },
      end_date: { type: 'date', required: true, default: null, description: 'End' },
      filter_status: { type: 'string', required: false, default: null, description: 'Status' },
    },
  });

  console.log('✅ Done!');
}

setup().catch(err => { console.error(err); process.exit(1); });
```

Run once: `node your-project/scripts/kinetic-setup.js`

### Step 4: Create Sync Service

```javascript
// your-project/services/YourSyncService.js
import * as Kinetic from './KineticService.js';

const TABLE = 'your_table_slug';

export async function syncCreate(data, env) {
  if (!Kinetic.isAvailable()) return;
  if (env !== 'PROD') return;               // PROD-only gate (optional)

  const rows = data.map(item => ({
    dt: new Date().toISOString().split('T')[0],
    id: item.id,
    status: 'ACTIVE',
    // ... map your data to table columns
  }));

  await Kinetic.insertRows(TABLE, rows);
}

export async function syncStatusChange(id, newStatus) {
  if (!Kinetic.isAvailable()) return;

  await Kinetic.updateRows(TABLE, {
    set: { status: `'${newStatus}'` },
    where: `id = '${id}'`,
  });
}

export async function fetchData(startDate, endDate, filters = {}) {
  if (!Kinetic.isAvailable()) return null;

  const variables = { start_date: startDate, end_date: endDate };
  if (filters.status) variables.filter_status = filters.status;

  const result = await Kinetic.runQuery('your-project/your-query', variables);
  return result?.data?.rows || null;
}
```

### Step 5: Wire into Routes

```javascript
// In your existing route handlers:
import * as YourSync from '../services/YourSyncService.js';

// After primary DB write succeeds:
YourSync.syncCreate(data, env).catch(() => {});     // fire-and-forget
YourSync.syncStatusChange(id, status).catch(() => {}); // fire-and-forget
```

### Step 6: Verify

```bash
# Run setup
node your-project/scripts/kinetic-setup.js

# Check table exists
curl -H "Authorization: Bearer spectra" \
  "https://kinetic-yvwajp6mzq-el.a.run.app/api/projects/YOUR_PROJECT/tables/your_table_slug/rows?limit=5"

# Check on mirror
# Go to mirror.apnamart.in → KINETIC schema → Your Table Name
```

### Architecture Pattern

```
Your App (Primary DB) ──── primary write ────→ Postgres/SQLite/MySQL
         │
         └── fire-and-forget (.catch) ──→ YourSyncService
                                              │
                                              ├── insertRows()   (on create)
                                              ├── updateRows()   (on status change)
                                              └── runQuery()     (on read/analytics)
                                              │
                                              ▼
                                         ClickHouse (via Kinetic API)
                                              │
                                              ▼
                                         mirror.apnamart.in (Metabase)
```

**Golden Rule:** Kinetic failure should NEVER block your primary database flow. Always use `.catch(() => {})`.

---

## Migration Status

BigQuery (`apna-mart-data.optimus`) is now the primary data store. SQLite/Prisma has been replaced.

- **History UI** fetches from both BigQuery and Kinetic via `Promise.allSettled`
- **Widget History date filter** now works correctly (date filter is live)
- Kinetic/ClickHouse remains as the secondary analytics store for PROD submissions
- **Widget search** uses LIKE partial match — not exact slug match

The dual-source architecture (BigQuery primary + Kinetic secondary) is production-stable.
