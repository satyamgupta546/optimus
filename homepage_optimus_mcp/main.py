"""
SAM MCP Server — Remote MCP server for Homepage Pod operations.
Connects to Claude Desktop/Code via Streamable HTTP (stateless).

Usage:
  python main.py                    # Start server on port 8080
  python main.py --port 9090        # Custom port
"""

import json
import contextlib
import argparse
from pathlib import Path
from mcp.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles
import uvicorn

from homepage.widget import handle_widget
from homepage.bulk import handle_bulk
from homepage.catalog import handle_catalog
from homepage.page import handle_page
from tools.help import handle_help

# ── Load configs ──
BASE_DIR = Path(__file__).parent
CONFIGS_DIR = BASE_DIR / "configs"


def load_config(name: str) -> dict:
    # Check configs/ first, then homepage/ as fallback
    for folder in [CONFIGS_DIR, BASE_DIR / "homepage"]:
        path = folder / name
        if path.exists():
            return json.loads(path.read_text())
    return {}


# Cache configs at startup
_CONFIGS = {
    "samaan": load_config("samaan.json"),
    "optimus": load_config("optimus.json"),
    "projects": load_config("projects.json"),
    "users": load_config("users.json"),
    "gas_scripts": load_config("gas_scripts.json"),
}


# ── MCP Server ──
server = Server("sam")


@server.list_tools()
async def list_tools():
    """Register all SAM MCP tools."""
    from mcp.types import Tool

    return [
        Tool(
            name="sam_widget",
            description="Widget operations: create, edit, list, get, history. Supports: SPR (Single Product Row), DPR (Double Product Row), Banner Carousel (banner_scroll), Category Grid (banner_stick), Primary Masthead, Secondary Masthead.",
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "edit", "list", "get", "history"],
                        "description": "Action to perform"
                    },
                    "type": {
                        "type": "string",
                        "enum": ["spr", "dpr", "banner_scroll", "banner_stick", "primary_masthead", "secondary_masthead"],
                        "description": "Widget type. spr=Single Product Row (SPR), dpr=Double Product Row (DPR), banner_scroll=Banner Carousel, banner_stick=Category Grid, primary_masthead=Primary Masthead, secondary_masthead=Secondary Masthead."
                    },
                    "rows": {
                        "type": "integer",
                        "enum": [1, 2],
                        "description": "Number of product rows. 1=single (SPR), 2=double (DPR). Auto-set from type."
                    },
                    "is_optimized": {
                        "type": "boolean",
                        "description": "Use optimized v2 variant (default: true). false=standard, true=optimized."
                    },
                    "title": {"type": "string", "description": "Widget title"},
                    "slug": {"type": "string", "description": "Widget slug (auto-generated if not provided)"},
                    "states": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "States/cities for the widget (e.g. ['JH', 'CG', 'WB'])"
                    },
                    "products": {"type": "string", "description": "Comma-separated product codes or Sheet URL"},
                    "page_type": {
                        "type": "string",
                        "enum": ["product_listing_page", "category_page"],
                        "description": "Page type for navigation"
                    },
                    "image": {"type": "string", "description": "Image URL for banner/masthead"},
                    "start_time": {"type": "string", "description": "Start datetime (YYYY-MM-DD HH:MM:SS)"},
                    "end_time": {"type": "string", "description": "End datetime (YYYY-MM-DD HH:MM:SS)"},
                    "fields_to_update": {
                        "type": "object",
                        "description": "Fields to update (for edit action)"
                    },
                    "slug_or_id": {"type": "string", "description": "Slug or ID (for get action)"},
                    "status": {"type": "string", "description": "Filter by status (for list action)"},
                    "env": {"type": "string", "enum": ["PROD", "UAT"], "description": "Environment: PROD or UAT (default: UAT)"},
                    "confirm": {"type": "boolean", "description": "Set to true to execute after reviewing summary. First call without confirm shows summary, second call with confirm=true executes."},
                    "prod_ack": {
                        "type": "boolean",
                        "description": "Required for PROD deploys. Set to true to confirm production deployment after reviewing the PROD warning."
                    }
                },
                "required": ["action"]
            }
        ),
        Tool(
            name="sam_bulk",
            description="Bulk update product codes for widget items. Pass items list with slug + products. Use dry_run to preview, upload to execute.",
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["upload", "dry_run"],
                        "description": "upload = execute on Samaan, dry_run = preview CSV only"
                    },
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "slug": {"type": "string", "description": "Widget item slug_name"},
                                "products": {"type": "string", "description": "Comma-separated item codes"}
                            },
                            "required": ["slug", "products"]
                        },
                        "description": "List of widget items with product codes to upload"
                    },
                    "env": {"type": "string", "enum": ["PROD", "UAT"], "description": "Environment: PROD or UAT (default: UAT)"},
                    "confirm": {"type": "boolean", "description": "Set true to execute upload"},
                    "prod_ack": {"type": "boolean", "description": "Required for PROD uploads"}
                },
                "required": ["action"]
            }
        ),
        Tool(
            name="sam_catalog",
            description="Product catalog operations: search products by query or batch fetch by item codes.",
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["search", "batch"],
                        "description": "Action to perform"
                    },
                    "query": {"type": "string", "description": "Search query (for search action)"},
                    "codes": {"type": "string", "description": "Comma-separated item codes (for batch action)"},
                    "limit": {"type": "integer", "description": "Max results (default 20)"},
                    "env": {"type": "string", "enum": ["PROD", "UAT"], "description": "Environment: PROD or UAT (default: UAT)"}
                },
                "required": ["action"]
            }
        ),
        Tool(
            name="sam_page",
            description="Page operations: list locations/states or get current header (masthead) widgets.",
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["locations", "header_widgets"],
                        "description": "Action to perform"
                    },
                    "env": {"type": "string", "enum": ["PROD", "UAT"], "description": "Environment: PROD or UAT (default: UAT)"}
                },
                "required": ["action"]
            }
        ),
        Tool(
            name="sam_help",
            description="SAM help — lists all tools, widget types, required fields, and examples. Use topic for details: 'spr', 'dpr', 'banner_scroll', 'banner_stick', 'primary_masthead', 'secondary_masthead', 'widget', 'bulk', 'catalog', 'page'.",
            inputSchema={
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "enum": ["widget", "spr", "dpr", "banner_scroll", "banner_stick", "primary_masthead", "secondary_masthead", "bulk", "catalog", "page"],
                        "description": "Topic: widget type name for field requirements, or tool name for action details"
                    }
                }
            }
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    """Route tool calls to handlers."""
    from mcp.types import TextContent

    configs = _CONFIGS

    try:
        if name == "sam_widget":
            result = await handle_widget(arguments, configs)
        elif name == "sam_bulk":
            result = await handle_bulk(arguments, configs)
        elif name == "sam_catalog":
            result = await handle_catalog(arguments, configs)
        elif name == "sam_page":
            result = await handle_page(arguments, configs)
        elif name == "sam_help":
            result = await handle_help(arguments)
        else:
            result = {"error": f"Unknown tool: {name}"}

        return [TextContent(type="text", text=json.dumps(result, indent=2, ensure_ascii=False))]

    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": str(e)}, ensure_ascii=False))]


# ── Streamable HTTP Transport + HTTP App ──

async def homepage(request):
    from starlette.responses import HTMLResponse
    return HTMLResponse("""
    <html>
    <head><title>SAM MCP Server</title><style>
        body { font-family: -apple-system, sans-serif; max-width: 700px; margin: 60px auto; padding: 0 20px; background: #0a0a0a; color: #e0e0e0; }
        h1 { color: #4fc3f7; } h2 { color: #81c784; margin-top: 30px; }
        .status { background: #1b5e20; padding: 8px 16px; border-radius: 8px; display: inline-block; }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        td, th { border: 1px solid #333; padding: 8px 12px; text-align: left; }
        th { background: #1a1a2e; }
        code { background: #1a1a2e; padding: 2px 6px; border-radius: 4px; }
        a { color: #4fc3f7; }
    </style></head>
    <body>
        <h1>SAM MCP Server</h1>
        <p class="status">Running</p>
        <p style="margin-top:10px;">
            <span style="background:#e65100;padding:4px 12px;border-radius:6px;font-size:13px;">Default: UAT</span>
            <span style="margin-left:8px;color:#999;font-size:13px;">PROD: samaan.apnamart.in | UAT: smapi-cu.apnamart.in</span>
        </p>

        <h2>Endpoints</h2>
        <table>
            <tr><th>Path</th><th>Purpose</th></tr>
            <tr><td><code>/</code></td><td>This page</td></tr>
            <tr><td><code>/health</code></td><td>Health check (JSON)</td></tr>
            <tr><td><code>/mcp</code></td><td>MCP Streamable HTTP endpoint — add this in Claude Desktop</td></tr>
        </table>

        <h2>MCP Tools (5)</h2>
        <table>
            <tr><th>Tool</th><th>Actions</th></tr>
            <tr><td><code>sam_widget</code></td><td>create, edit, list, get, duplicate, history</td></tr>
            <tr><td><code>sam_bulk</code></td><td>upload, dry_run</td></tr>
            <tr><td><code>sam_catalog</code></td><td>search, batch</td></tr>
            <tr><td><code>sam_page</code></td><td>locations, header_widgets</td></tr>
            <tr><td><code>sam_help</code></td><td>discovery (standalone)</td></tr>
        </table>

        <h2>Connect from Claude Desktop</h2>
        <p>Add this to your Claude Desktop MCP settings:</p>
        <pre><code>{
  "mcpServers": {
    "sam": {
      "url": "http://localhost:8080/mcp"
    }
  }
}</code></pre>
    </body>
    </html>
    """)


async def health(request):
    return JSONResponse({"status": "ok", "server": "SAM MCP", "tools": 5})


def create_app():
    session_manager = StreamableHTTPSessionManager(
        app=server,
        stateless=True,
        json_response=True,
    )

    from auth.admin_api import login, me, list_users, add_user, update_user, remove_user, list_projects, list_audit, list_widgets_admin, list_oauth_clients
    from auth.oauth import (
        oauth_protected_resource,
        oauth_authorization_server,
        register_client,
        authorize,
        token_endpoint,
        validate_oauth_token,
        _get_base_url,
    )
    from starlette.middleware import Middleware
    from starlette.middleware.cors import CORSMiddleware

    @contextlib.asynccontextmanager
    async def lifespan(app):
        async with session_manager.run():
            yield

    starlette_app = Starlette(
        routes=[
            Route("/", homepage),
            Route("/health", health),
            # Auth API
            Route("/api/auth/login", login, methods=["POST"]),
            Route("/api/auth/me", me, methods=["GET"]),
            # Admin API (super admin only)
            Route("/api/admin/users", list_users, methods=["GET"]),
            Route("/api/admin/users", add_user, methods=["POST"]),
            Route("/api/admin/users", update_user, methods=["PUT"]),
            Route("/api/admin/users", remove_user, methods=["DELETE"]),
            Route("/api/admin/projects", list_projects, methods=["GET"]),
            Route("/api/admin/audit", list_audit, methods=["GET"]),
            Route("/api/admin/widgets", list_widgets_admin, methods=["GET"]),
            Route("/api/admin/oauth-clients", list_oauth_clients, methods=["GET"]),
            # Admin UI (static files from admin-ui/dist)
            Mount("/admin", app=StaticFiles(directory=str(BASE_DIR / "admin-ui" / "dist"), html=True)),
            # OAuth 2.1
            Route("/.well-known/oauth-protected-resource/mcp", oauth_protected_resource),
            Route("/.well-known/oauth-authorization-server", oauth_authorization_server),
            Route("/register", register_client, methods=["POST"]),
            Route("/authorize", authorize, methods=["GET", "POST"]),
            Route("/token", token_endpoint, methods=["POST"]),
        ],
        middleware=[
            Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]),
        ],
        lifespan=lifespan,
    )

    # Wrap with ASGI middleware to handle /mcp directly
    # OAuth is optional: if Bearer token present → validate; if absent → allow through
    # This lets Developer config (no OAuth) and Connectors (with OAuth) both work
    async def app(scope, receive, send):
        if scope["type"] == "http" and scope["path"].rstrip("/") == "/mcp":
            raw_headers = dict(scope.get("headers", []))
            auth = raw_headers.get(b"authorization", b"").decode()

            # If Bearer token provided, validate it
            if auth.startswith("Bearer "):
                token = auth[len("Bearer "):]
                user = validate_oauth_token(token)
                if not user:
                    proto = raw_headers.get(b"x-forwarded-proto", b"https").decode()
                    host = (raw_headers.get(b"x-forwarded-host", b"").decode()
                            or raw_headers.get(b"host", b"localhost:8080").decode())
                    base_url = f"{proto}://{host}"
                    response = JSONResponse(
                        {"error": "invalid_token", "error_description": "Token invalid or expired"},
                        status_code=401,
                        headers={"WWW-Authenticate": f'Bearer resource_metadata="{base_url}/.well-known/oauth-protected-resource/mcp", error="invalid_token"'},
                    )
                    await response(scope, receive, send)
                    return

            # Allow through — with or without token
            await session_manager.handle_request(scope, receive, send)
            return

        await starlette_app(scope, receive, send)

    return app


if __name__ == "__main__":
    import os as _os
    parser = argparse.ArgumentParser(description="SAM MCP Server")
    parser.add_argument("--port", type=int, default=int(_os.environ.get("PORT", 8080)), help="Port to run on")
    args = parser.parse_args()

    app = create_app()
    print(f"SAM MCP Server starting on port {args.port}...")
    print(f"MCP endpoint: http://localhost:{args.port}/mcp")
    print(f"Health check: http://localhost:{args.port}/health")
    uvicorn.run(app, host="0.0.0.0", port=args.port)
