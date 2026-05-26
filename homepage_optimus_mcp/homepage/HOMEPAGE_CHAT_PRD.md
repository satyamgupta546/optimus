# SAM MCP Server — PRD

> **Name:** SAM (Remote MCP Server)  
> **Interface:** Claude Desktop / Claude Code via SSE  
> **Deployment:** Docker container (remote server)  
> **Backend:** Samaan API, Optimus API  
> **Storage:** BigQuery  
> **Admin UI:** Web-based user & project management

---

## 1. What

SAM is a remote MCP (Model Context Protocol) server that runs on Docker. Users add SAM MCP in their Claude Desktop/Code app, authenticate via browser, and use SAM tools directly through Claude — widget creation, bulk uploads, item code updates, all executed through Claude's conversation.

---

## 2. Why

- Widget creation requires manually navigating to Optimus and filling forms.
- Bulk uploads take ~2 hours manually — open Sheet, build CSV, upload to Samaan.
- No centralized tool for Homepage Pod operations through a conversational interface.
- SAM MCP gives every authorized user direct access to Homepage Pod operations inside Claude — just type what you want, SAM does it.

---

## 3. Architecture

```
User's Claude Desktop / Claude Code
       │
       │ SSE connection (HTTP)
       ▼
┌──────────────────────────────────────────────────┐
│            SAM MCP Server (Docker)                │
│            Remote, always-on                      │
│                                                   │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐   │
│  │ Auth &    │  │ Samaan Auth │  │ Optimus  │   │
│  │ Access    │  │ + APIs      │  │ APIs     │   │
│  │ Control   │  └──────┬──────┘  └────┬─────┘   │
│  └─────┬────┘         │               │         │
│        │          Bulk Upload     Widget CRUD    │
│   User/Project    Widget Items    SPR/Banner     │
│   Management      Page Layouts    Masthead       │
│                   Mappings (CSV)                  │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│            Admin UI (Web)                         │
│  - Add/remove users (email + password)           │
│  - Create projects (Homepage Pod, etc.)          │
│  - Assign users to projects                      │
│  - View audit logs                               │
└──────────────────────────────────────────────────┘
```

### MCP Connection
- **Protocol:** SSE (Server-Sent Events) over HTTP
- **Deployment:** Docker container on remote server (Google Cloud VM)
- **Users connect:** Add SAM MCP URL in Claude Desktop/Code settings
- **Authentication:** First use → browser opens → email + password login → token stored
- **Always-on:** Docker container runs 24/7

### Migration Path
- Build and test fully on MacBook first
- Then deploy Docker container to cloud
- Test on UAT first, then PROD (both environments already exist in Optimus)

---

## 4. Authentication & Access Control

### User Login Flow
```
1. User adds SAM MCP in Claude Desktop/Code (SSE URL)
2. First tool call → browser opens login page
3. User enters email + password
4. Server validates → returns auth token
5. Token stored in Claude session — valid for 7 days, no re-login needed until expiry
6. All subsequent MCP tool calls include token
7. After 7 days → browser opens again for re-login
```

### Admin UI (Web)
Satyam (super admin) manages everything through a web dashboard:

**User Management:**
- Add user (email + password)
- Remove user
- View all users

**Project Management:**
- Create project (e.g., "Homepage Pod")
- Assign users to projects
- Remove users from projects

**Access Control:**
- User can only see tools for their assigned projects
- Azeem logs in → sees only "Homepage Pod" tools
- Unauthorized user → access denied
- Super admin sees everything

### Roles
| Role | Access |
|------|--------|
| **Super Admin** | All projects, all tools, user management |
| **User** | Only assigned project tools |

No Maker-Checker. User bole, SAM kare. Direct execute.

---

## 5. MCP Tools — Grouped Pattern

SAM MCP uses the **grouped tool pattern** (same as Atlas MCP — `docs`, `metric`, `wiki`). Instead of 14 flat tools, SAM has **5 parent tools** with `action` discriminator. This reduces prompt footprint, keeps consistent UX, and makes adding new actions easy.

### Tool Surface (14 actions → 5 tools)

| Parent Tool | Actions | Covers |
|-------------|---------|--------|
| `sam_widget` | `create` / `edit` / `list` / `get` / `duplicate` / `history` | All widget operations + slug history |
| `sam_bulk` | `upload` / `dry_run` | Bulk item code upload + preview |
| `sam_catalog` | `search` / `batch` | Product catalog lookup |
| `sam_page` | `locations` / `header_widgets` | Page & location data |
| `sam_help` | (standalone, `topic?` param) | Discovery — lists all tools + actions + examples |

### Tool Schemas

**`sam_widget`**
```
sam_widget({ action: "create", type, title, states, products, page_type, image?, start_time, end_time, slug? })
sam_widget({ action: "edit", slug, fields_to_update })
sam_widget({ action: "list", type?, status?, slug? })
sam_widget({ action: "get", slug_or_id })
sam_widget({ action: "duplicate", slug })
sam_widget({ action: "history", slug })  → slug lifecycle: created when, changed what, last update
```

**`sam_bulk`**
```
sam_bulk({ action: "upload", sheet_url, states?, tab? })
sam_bulk({ action: "dry_run", sheet_url, states?, tab? })  → generates CSVs, no upload
```

**`sam_catalog`**
```
sam_catalog({ action: "search", query, limit? })
sam_catalog({ action: "batch", codes })  → fetch products by item codes
```

**`sam_page`**
```
sam_page({ action: "locations" })  → list all states/cities
sam_page({ action: "header_widgets" })  → get current masthead widgets
```

**`sam_help`**
```
sam_help({ topic? })  → no topic = full tool list. topic = "widget" → all widget actions detailed.
```

### Benefits of Grouped Pattern
- **5 tools** in Claude's prompt instead of 14 — saves ~2-3k tokens per session
- **Consistent** with Atlas MCP pattern — users/agents already know `{ action, ...params }`
- **Extensible** — adding a new action = new enum value, no new tool registration
- **Discoverable** — `sam_help(topic="widget")` documents all 6 widget actions in one place
- **Error messages** prefix with action: `"widget.create requires title"`

---

## 6. How It Works — User Flow

### Example: "Create SPR widget Summer Sale"

```
User in Claude: "SAM, create SPR widget Summer Sale for JH and CG"
       │
       ▼
Claude calls: sam_widget({ action: "create", type: "spr", title: "Summer Sale", states: ["JH", "CG"] })
       │
       ▼
SAM checks: widget type ✅, title ✅, states ✅
SAM asks (via Claude): "Product codes do — comma-separated ya Sheet link"
       │
       ▼
User: "1001, 1002, 1003, 1004"
       │
       ▼
SAM validates: products exist ✅, no duplicates ✅
SAM shows summary: "SPR 'Summer Sale' — 4 products, states JH + CG. Start: now, End: 30 days. Create?"
       │
       ▼
User: "yes"
       │
       ▼
SAM executes 7-step flow:
  ⏳ Step 1/7: Creating widget items...
  ⏳ Step 3/7: Creating page layout...
  ⏳ Step 7/7: Mapping to global registry...
       │
       ▼
✅ Done!
  Slug: summer_sale_spr_opt
  Type: Single Product Row (Optimized)
  States: JH, CG
  Items: 4
  Status: LIVE
```

### Example: "Bulk upload from Sheet"

```
User: "SAM, bulk item code update kar do. Sheet: <url>"
       │
       ▼
Claude calls: sam_bulk({ action: "upload", sheet_url: "<url>" })
       │
       ▼
SAM reads Sheet (shared with sonic-bot@widget-474311.iam.gserviceaccount.com)
SAM: "Found 342 items across JH, CG, WB. Upload all 3 states?"
       │
       ▼
User: "yes"
       │
       ▼
SAM uploads state by state (200ms gap):
  ⏳ Uploading JH (120 items)...
  ⏳ Uploading CG (98 items)...
  ⏳ Uploading WB (124 items)...
       │
       ▼
✅ Done! 342 items uploaded across 3 states.
```

### Required Information from User

If anything is missing, SAM asks through Claude:

| Field | Required | SAM asks if missing |
|-------|----------|---------------------|
| **Widget type** | Yes | "Which widget? SPR, Banner (Scroll/Stick), Primary Masthead, Secondary Masthead?" |
| **Title** | Yes | "Title kya hoga?" |
| **State / City** | Yes | "Kaunse states? JH, CG, WB, UP? Ya specific city?" |
| **Product codes** | Yes (for SPR/Banner) | "Product codes do — comma-separated ya Sheet link" |
| **Page type** | Yes | "Product Listing Page ya Category Page?" |
| **Image** | Yes (for Banner/Masthead) | "Image URL do" |
| **Start / End time** | Yes | "Kab se kab tak live rahega?" |
| **Slug** | Auto-generated | SAM generates from title, user can override |

SAM scans the request, identifies missing fields, asks only for what's missing. User provides everything in one message ideally.

---

## 7. Backend API Flow — Samaan + Auto Mapping

All widget creation goes through Samaan backend APIs. Mapping is fully automatic:

```
1. Widget Items created      → POST /api/app/post_widget_item/
2. Widgets created           → POST /api/app/widget/
3. Page Layouts created      → POST /api/app/post_page_layout/
4. Multimedia uploaded       → POST /api/app/multimedia/ (if needed)
5. Item → Widget mapping     → POST /api/app/update_widget_widget_item_mapping/ (CSV, auto)
6. Widget → Page mapping     → POST /api/app/update_layout_widget_mapping/ (CSV, auto)
7. Page → Global mapping     → POST /api/app/update_page_page_layout_mapping/ (CSV, auto)
```

### GAS Automation Scripts

GAS scripts already exist in Optimus (`/Users/satyam/Desktop/code/optimus/scripts/`). SAM reads these scripts from Optimus codebase and uses the same logic. Config-driven — widget type maps to the correct script + Optimus API endpoints.

| Script | Widget Type | Location |
|--------|-------------|----------|
| `SPR_Optimized_Automation.gs` | Product Rail | Optimus scripts/ |
| `CLP_Automation.gs` | Collection Banner (Scroll) | Optimus scripts/ |
| `Category_Grid_Backend.gs` | Collection Banner (Stick) | Optimus scripts/ |
| `Primary_Masthead_Automation.gs` | Primary Masthead | Optimus scripts/ |
| `Secondary_Masthead_Backend.gs` | Secondary Masthead | Optimus scripts/ |

SAM does not duplicate these scripts — reads from Optimus, uses config + automation logic from there. MCP handles the orchestration.

---

## 8. Samaan Integration

### Auth Flow
```
1. GET  https://samaan.apnamart.in/login/ → csrftoken cookie
2. POST https://samaan.apnamart.in/login/ → sessionid cookie
   - username: Automation
   - password: Qwerty@123
3. Use csrftoken + sessionid for all API calls
```

### All Samaan Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/app/bulk_upload_products_for_wi/` | PUT | Bulk item code upload (CSV) |
| `/api/app/post_widget_item/` | POST | Create widget item |
| `/api/app/widget/` | POST | Create widget |
| `/api/app/post_page_layout/` | POST | Create page layout |
| `/api/app/multimedia/` | POST | Upload multimedia background |
| `/api/app/update_widget_widget_item_mapping/` | POST | Map widget items to widget (CSV) |
| `/api/app/update_layout_widget_mapping/` | POST | Map widget to page layout (CSV) |
| `/api/app/update_page_page_layout_mapping/` | POST | Map page layout to global (CSV) |

---

## 9. Optimus Integration

Base URL: `https://optimus-app-hazel.vercel.app/api/local`

### Optimus API Endpoints

**Widgets**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/local/widgets` | List widgets |
| POST | `/api/local/widgets` | Create widget |
| GET | `/api/local/widgets/:id` | Get widget details |
| PUT | `/api/local/widgets/:id` | Update widget (full) |
| PATCH | `/api/local/widgets/:id` | Partial update |
| POST | `/api/local/widgets/:id/duplicate` | Duplicate widget |
| GET | `/api/local/widgets/:id/versions` | Version history |

**Requests/Submissions**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/local/requests` | List requests |
| POST | `/api/local/requests` | Create submission |

**Catalog**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/local/catalog/search?q=...` | Search products |
| GET | `/api/local/catalog/batch?codes=...` | Batch fetch products |

**Header Widgets**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/local/header-widgets` | Get masthead widgets |
| PUT | `/api/local/header-widgets` | Update masthead widgets |

**Locations**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/local/locations` | List locations |

**Kinetic (BigQuery)**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/local/kinetic/history` | Widget history from BQ |
| GET | `/api/local/kinetic/search-widgets?q=...` | Search widgets by slug |

### Auth
- Header: `X-Optimus-User: satyam.gupta@apnamart.in`
- Header: `X-Optimus-Env: PROD` or `UAT`
- Rate limit: 100 req/min per IP

---

## 10. Error Handling

### Slug Conflicts
- SAM checks if slug exists before creating
- If duplicate → informs user "This slug already exists" → auto-increments (`_1`, `_2`, `_3`)

### Image Size Optimization
| Widget Type | Max Size | Action if Oversized |
|-------------|----------|---------------------|
| Carousel widget item | 300KB | Auto-compress |
| Sub-category widget item | 50KB | Auto-compress |
| Masthead background | 1MB | Auto-compress |

Supported formats: JPG, PNG, WEBP, GIF. Output: JPG.

### API-Level Errors
| Error | SAM Action |
|-------|------------|
| Empty `background_multimedia` | Omit field, retry |
| `filter_lst` format wrong | Fix to integer array, retry |
| `page_layout_type` type wrong | Fix to string, retry |
| 403 Session expired | Auto re-login to Samaan, retry |
| 409 Duplicate slug | Increment suffix, retry |
| Mapping CSV failed | Fix FormData format, retry |

### Step Failure = Full Failure
If any step in 7-step flow fails, entire operation fails. No partial creates. SAM reports which step failed and why.

### API Call Spacing
200ms gap between each API call within a widget's 7-step flow.

### Global Widget Queue
All widget creation requests go into a single global queue — **1 widget at a time** regardless of how many users are requesting.

```
User A: 6 widgets ─┐
User B: 6 widgets ─┼──► Global Queue ──► Execute 1 by 1
User C: 6 widgets ─┤                     (7-step flow per widget)
User D: 6 widgets ─┤                     200ms gap between API calls
User E: 6 widgets ─┘                     next widget starts after previous completes
```

- No per-user rate limit needed — sequential execution prevents API overload
- Each user gets queue position update: "Your widget is 3rd in queue, 2 widgets ahead"
- When a widget completes → user gets status in their Claude session
- No Optimus rate limit (100/min) ever hit — 7 calls per widget × 200ms = ~1.4s per widget

---

## 11. Features

### Slug History & Tracking
- SAM maintains history of every slug in BigQuery
- User asks about a slug → SAM shows: when created, what changed, last update
- Every create/edit logged against slug

### Single & Batch Requests
- Single: "Create 1 SPR" → SAM handles
- Batch: "Create 4 widgets" → SAM handles each individually, one-by-one
- Mixed: "Edit this + create that" → SAM handles separately

### Data Validation
- Duplicate product codes auto-removed
- Product codes validated against catalog
- Summary shown before execution: "About to create SPR with 342 items — confirm?"

### Google Sheet / Excel Reading
- Google Sheet shared with `sonic-bot@widget-474311.iam.gserviceaccount.com`
- SAM reads specified sub-sheet/tab
- Excel files (.xlsx) also supported
- Format validation: checks columns, headers

### Progress Updates
```
⏳ Step 1/7: Creating widget items...
⏳ Step 3/7: Creating page layout...
⏳ Step 7/7: Mapping to global registry...
✅ Done!
```

### Execution Model
**V1:** All operations via subprocess + user confirmation before execute.
**V2:** SAM learns patterns, becomes autonomous — "I'll handle this" when confident.

---

## 12. What Needs to Be Built

### SAM MCP Server (Python)
| Component | Purpose |
|-----------|---------|
| MCP SSE server | `mcp` Python SDK (`pip install mcp`) — official SDK, SSE transport built-in |
| Auth module | Browser-based login, token management (7-day expiry) |
| `sam_widget` handler | 6 actions: create, edit, list, get, duplicate, history |
| `sam_bulk` handler | 2 actions: upload, dry_run |
| `sam_catalog` handler | 2 actions: search, batch |
| `sam_page` handler | 2 actions: locations, header_widgets |
| `sam_help` handler | Standalone discovery tool |
| Samaan client | Auth + all 8 Samaan API calls |
| Optimus client | All Optimus API calls |
| GAS trigger client | HTTP calls to GAS Web App triggers |
| BigQuery logger | Audit trail, slug history, message dedup |

### Admin UI (React + Vite + Tailwind)
| Component | Purpose |
|-----------|---------|
| Login page | Admin authentication |
| User management | Add/remove users, set passwords |
| Project management | Create projects, assign users |
| Audit log viewer | Search past actions by user, slug, date |

Same stack as Optimus. Static build served from same Python server.

### AI Isolation — No Confusion

SAM MCP lives inside `/Users/satyam/Desktop/Personal/ai bot/sam-mcp/`. Critical rules to prevent AI confusion:

1. **CLAUDE.md** in `sam-mcp/` folder — clearly defines scope, what to touch, what NOT to touch
2. **NEVER touch existing files** — `sam_agent.py`, `brain.py`, `server.py`, `config.py`, `optimus_agent.py`, `samaan/` are SAM bot files. SAM MCP has zero dependency on them.
3. **Config boundaries** — every config file in `sam-mcp/configs/` is clearly labeled as SAM MCP only
4. **Naming convention** — all SAM MCP code strictly inside `sam-mcp/` folder. Nothing outside.
5. **No shared imports** — SAM MCP does NOT import from SAM bot files. Completely independent codebases in the same parent directory.

```
ai bot/
├── sam_agent.py          ← SAM BOT (DO NOT TOUCH)
├── brain.py              ← SAM BOT (DO NOT TOUCH)
├── server.py             ← SAM BOT (DO NOT TOUCH)
├── config.py             ← SAM BOT (DO NOT TOUCH)
├── optimus_agent.py      ← SAM BOT (DO NOT TOUCH)
├── samaan/               ← SAM BOT (DO NOT TOUCH)
│
├── sam-mcp/              ← SAM MCP SERVER (BUILD HERE)
│   ├── CLAUDE.md         ← scope definition for AI
│   ├── main.py
│   ├── configs/
│   ├── tools/
│   ├── clients/
│   ├── auth/
│   ├── queue/
│   └── logger/
│
└── sam-mcp-admin/        ← ADMIN UI (BUILD HERE)
```

### Docker — Single Container
| Component | Purpose |
|-----------|---------|
| Dockerfile | SAM MCP server (Python) + Admin UI (React static build) in one container |

Single container — MCP server + Admin UI together. BigQuery is external (no DB in container). Simple deploy, kam resources.

---

## 13. Scope

### In Scope (V1)
- SAM MCP server (remote, Docker, SSE)
- Browser-based user authentication
- Admin UI for user + project management
- Widget create/edit (SPR, Banner, Masthead)
- Bulk item code upload
- Samaan + Optimus API integration
- GAS script triggers via HTTP
- BigQuery audit trail
- Error handling + auto-retry
- Image optimization
- Slug history tracking
- UAT + PROD environment support

### Out of Scope (V1)
- Slack bot integration
- Multi-project support beyond Homepage Pod (V2)
- Widget delete operations

---

## 14. Data & APIs Status

| What | Status |
|------|--------|
| Samaan auth + all 8 endpoints | ✅ Ready |
| Optimus full API endpoints | ✅ Ready |
| GAS scripts (5 automation scripts) | ✅ Exist, need HTTP Web App deployment |
| BigQuery project | ✅ Available |
| Admin UI | 🔨 To be built |
| MCP SSE server | 🔨 To be built |
| Docker setup | 🔨 To be built |

---

## 15. Rules

1. **Direct execute** — No Maker-Checker. User requests, SAM executes after confirmation.
2. **Auth required** — Every tool call requires valid auth token. No anonymous access.
3. **Project-scoped** — User can only access tools for assigned projects.
4. **Missing fields** — SAM asks for any missing required field before proceeding.
5. **Samaan auth** — Auto-login, handle session expiry with re-login.
6. **Slug conflicts** — Detect duplicates, inform user, auto-increment.
7. **Image optimization** — Auto-compress oversized images (Carousel: 300KB, Sub-cat: 50KB, Masthead: 1MB).
8. **Error handling** — Retry first, then diagnose exact API + error. Never just "HTTP 403".
9. **Isolation** — Docker container strictly scoped to Homepage Pod. Never touch other projects.
10. **Health monitoring** — Watchdog sends alert email to satyam.gupta@apnamart.in + auto-restart on failure.
11. **Audit trail** — Every action logged in BigQuery: user, timestamp, API calls, responses, errors, slug.
12. **No timeout** — Pending operations stay until completed or cancelled by user.
13. **Step failure = full failure** — Any step fails, entire operation fails. No partial creates. User can also cancel mid-execution — SAM stops and reports which steps completed and which didn't.
14. **Global queue** — All widget creations go through a single queue. 1 widget at a time. 200ms between API calls. No rate limit needed — sequential execution prevents overload.
15. **Only Claude** — No separate AI brain. Claude Desktop/Code IS the brain. SAM provides tools only.
16. **Deduplication** — Track processed requests in local JSON + BigQuery to avoid duplicates.
17. **UAT first** — All changes tested on UAT before PROD.

---

## 16. Decisions (Resolved)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Interface | Remote MCP server (SSE), not Slack bot |
| 2 | Approval flow | No Maker-Checker. Direct execute after user confirmation. |
| 3 | AI brain | Claude Desktop/Code itself. No separate Claude API call. |
| 4 | Auth | Browser-based login (email + password). Admin manages users via web UI. |
| 5 | Deployment | Single Docker container (MCP server + Admin UI) on remote server |
| 6 | GAS integration | Read scripts from Optimus codebase, use config + automation logic |
| 6a | MCP SDK | Official `mcp` Python SDK with SSE transport |
| 6b | Admin UI stack | React + Vite + Tailwind (same as Optimus) |
| 6c | Token expiry | 7 days |
| 6d | Cancel | User can cancel even after "yes" — SAM stops and reports what was done so far |
| 7 | Database | BigQuery for all persistent storage |
| 8 | Deduplication | Dual: local JSON + BigQuery log |
| 9 | Onboarding | `sam_help` tool + project-wise access |
| 10 | Isolation | Docker container scoped to Homepage Pod only |
