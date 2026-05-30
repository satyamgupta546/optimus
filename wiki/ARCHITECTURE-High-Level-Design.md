# Architecture Overview

Optimus is a full-stack widget management platform with a React frontend and a local Express + BigQuery backend.

## Technology Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite 7, Tailwind CSS 3.4 | Main application framework |
| **State** | React Context API | Global state management (Widgets, Auth, Settings) |
| **Backend** | Express 5 | REST API server (localhost:3001) |
| **Database** | BigQuery (`apna-mart-data.optimus`) | Widget storage, approval workflow, user management |
| **Media** | GCS (`gs://optimus-widget-media`) | Widget image/media uploads |
| **D&D** | `@dnd-kit/core` | Smooth drag-and-drop widget reordering |
| **Catalog** | Google Sheet CSV | Product catalog (fetched & cached via `useCatalog` hook) |
| **Proxy** | Vite Dev Proxy | Routes `/api/local/*` → Express :3001, `/api/app/*` → Django production |
| **Deployment** | Vercel | `optimus-flame-eight.vercel.app` (single URL) |

## Directory Structure

```text
optimus/
├── src/
│   ├── components/
│   │   ├── Dashboard/         # Request Queue & Widget Generator UI
│   │   ├── Editors/           # ScrollItemEditor, CategoryItemEditor, etc.
│   │   ├── Inputs/            # Reusable input components (TextInput, DateRangePicker, etc.)
│   │   ├── Preview/           # Phone Emulator components (PhoneFrame, AppHeader)
│   │   ├── Sidebar/           # Widget Library & Property Editor
│   │   └── Widgets/           # Individual Widget implementations (SPR, Banner, CategoryGrid)
│   ├── config/
│   │   ├── WidgetRegistry.js  # Central type → config lookup
│   │   ├── BackendFlow.js     # Validation rules, approval routing, workflow stages
│   │   ├── Feature/           # Feature-specific config (AuthConfig, ProductCatalogConfig)
│   │   └── widgets/           # Per-widget config files (SPRConfig.js, CollectionBannerConfig.js)
│   ├── context/               # Global State (WidgetContext, AuthContext, AppSettingsContext)
│   ├── hooks/                 # Custom hooks (useCatalog, useClickOutside, useFormValidation)
│   ├── services/
│   │   ├── system/            # Generic config consumers (VariantResolver, PayloadBuilder, ConfigValidator)
│   │   ├── LocalApiService.js # Frontend client for Express backend (/api/local/*)
│   │   ├── ValidationService.js # Pre-submit validation + slug checks
│   │   └── *.js               # Other services (AuthService, CatalogService)
│   └── data/                  # Static assets and mock data
├── server/                    # Express backend
│   ├── index.js               # Express app entry point (port 3001)
│   ├── middleware/
│   │   ├── auth.js            # Email → role resolution + User upsert
│   │   ├── validate.js        # Server-side widget validation
│   │   └── errorHandler.js    # Centralized error responses
│   ├── services/
│   │   ├── BigQueryService.js # BigQuery client (apna-mart-data.optimus)
│   │   ├── WidgetDataService.js
│   │   └── SubmissionService.js
│   ├── routes/
│   │   ├── widgets.js         # Widget CRUD, duplicate, reorder, versions
│   │   ├── requests.js        # Submit, approve, reject, reopen
│   │   ├── users.js           # /me, checker management
│   │   ├── catalog.js         # Product search & batch lookup
│   │   ├── activity.js        # Activity log
│   │   ├── comments.js        # Per-widget comment threads
│   │   ├── headerWidgets.js   # Primary/Secondary Masthead state
│   │   └── media.js           # File upload
│   └── uploads/               # Uploaded media files
├── wiki/                      # Project documentation
└── vite.config.js             # Proxy: /api/local → :3001, /api/app → Django
```

## Data Flow

```
Frontend (React)                    Backend (Express :3001)
┌──────────────┐   /api/local/*    ┌─────────────────────┐
│  Components  │ ───────────────▶  │  auth.js middleware  │
│  Contexts    │                   │  + route handlers    │
│  Services    │ ◀───────────────  │  + BigQueryService  │
└──────────────┘   JSON response   └──────────┬──────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │  BigQuery          │
                                    │  apna-mart-data    │
                                    │  .optimus          │
                                    └───────────────────┘
```

> See also:
> - [DATA-Architecture.md](./DATA-Architecture.md) — Database schema, API routes, and Prisma models
> - [AUTH-Flow.md](./AUTH-Flow.md) — Authentication and role assignment
> - [Backend-work-flow.md](./Backend-work-flow.md) — End-to-end widget lifecycle
> - [ARCH-Config-Driven-System.md](./ARCH-Config-Driven-System.md) — Config-driven architecture details
