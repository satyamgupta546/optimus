# SAM MCP Server — AI Scope Definition

## What is this?
SAM MCP is a remote MCP (Model Context Protocol) server for Homepage Pod operations. It runs on Cloud Run, connects to Claude Desktop/Code via **Streamable HTTP** transport (stateless, no connection drops), and provides tools for widget creation, bulk uploads, and catalog operations.

**Cloud Run URL:** `sam-mcp-288854937236.asia-south1.run.app/mcp`
**Transport:** Streamable HTTP (not SSE) — stateless, OAuth 2.1 ready

## Boundaries — READ THIS FIRST

### DO NOT TOUCH (SAM Bot files — parent directory)
These files are the SAM Slack Bot. They are a completely separate system:
- `../sam_agent.py`
- `../brain.py`
- `../server.py`
- `../config.py`
- `../optimus_agent.py`
- `../samaan/`
- `../office.py`
- `../services.py`
- `../smart_home.py`
- `../tasks.py`
- `../templates/`

**NEVER import from these files. NEVER modify these files. NEVER reference these files.**

### BUILD HERE (SAM MCP — this directory)
All SAM MCP code lives in this folder (`homepage_optimus_mcp/`):
- `main.py` — MCP Streamable HTTP server entry point
- `configs/` — project, user, API configs
- `tools/` — MCP tool handlers
- `clients/` — Samaan + Optimus API clients
- `auth/` — browser login, token management
- `widget_queue_mod/` — global widget creation queue
- `logger/` — BigQuery audit trail

### Admin UI (separate folder)
- `admin-ui/` — React + Vite + Tailwind admin dashboard (in this directory)

## Tech Stack
- Python 3.12+ with `mcp` SDK (official MCP package)
- **Streamable HTTP** transport (stateless — no SSE, no session affinity needed)
- BigQuery for storage (`apna-mart-data.optimus`)
- GCS for images (`gs://optimus-widget-media`)
- Cloud Run deployment (`asia-south1`)
- OAuth 2.1 ready

## Tools (5 parent tools with `action` discriminator)

| Tool | Actions | Description |
|------|---------|-------------|
| `sam_widget` | 10 actions | Widget CRUD + granular: `create_page`, `create_item`, `map_item`, `map_widget_to_page`, `update_item` |
| `sam_bulk` | — | Bulk product uploads |
| `sam_catalog` | — | Product catalog search |
| `sam_page` | — | Page layout management |
| `sam_help` | — | Show available commands |

### sam_widget granular actions
- `create_page` — Create page layout only (standalone)
- `create_item` — Create widget item only
- `map_item` — Map widget item → widget (Layer 1)
- `map_widget_to_page` — Map widget → page layout (Layer 2)
- `update_item` — Update item product list / fields

## Key Rules
1. No shared imports with SAM bot
2. All configs in `configs/` folder
3. Grouped tool pattern: 5 parent tools with `action` discriminator
4. Global queue: 1 widget at a time
5. 200ms gap between API calls
6. Auth: browser-based, 7-day token expiry
7. All actions logged to BigQuery
8. Images stored in GCS (`gs://optimus-widget-media`) — never local /tmp
9. Widget search uses LIKE partial match (not exact slug)
10. PROD credentials: `satyam.gupta@apnamart.in` / `Docherry@123`
