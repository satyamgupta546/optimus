# SAM MCP Server — AI Scope Definition

## What is this?
SAM MCP is a remote MCP (Model Context Protocol) server for Homepage Pod operations. It runs on Docker, connects to Claude Desktop/Code via SSE, and provides tools for widget creation, bulk uploads, and catalog operations.

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
All SAM MCP code lives in this folder (`sam-mcp/`):
- `main.py` — MCP SSE server entry point
- `configs/` — project, user, API configs
- `tools/` — MCP tool handlers (sam_widget, sam_bulk, sam_catalog, sam_page, sam_help)
- `clients/` — Samaan + Optimus API clients
- `auth/` — browser login, token management
- `queue/` — global widget creation queue
- `logger/` — BigQuery audit trail

### Admin UI (separate folder)
- `../sam-mcp-admin/` — React + Vite + Tailwind admin dashboard

## Tech Stack
- Python 3.12+ with `mcp` SDK (official MCP package)
- SSE transport (remote server)
- BigQuery for storage (project: SAM_mcp)
- Docker single container deployment

## Key Rules
1. No shared imports with SAM bot
2. All configs in `configs/` folder
3. Grouped tool pattern: 5 parent tools with `action` discriminator
4. Global queue: 1 widget at a time
5. 200ms gap between API calls
6. Auth: browser-based, 7-day token expiry
7. All actions logged to BigQuery
