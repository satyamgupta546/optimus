"""
OAuth 2.1 endpoints for SAM MCP Server.
Implements RFC 9728 (Protected Resource Metadata), RFC 8414 (Authorization Server Metadata),
RFC 7591 (Dynamic Client Registration), and OAuth 2.1 with PKCE (S256).

Token lifetimes:
  Auth codes   — 5 minutes
  Access tokens — 1 hour
  Refresh tokens — 30 days

Storage:
  configs/oauth_clients.json — registered OAuth clients
  configs/oauth_codes.json   — pending authorization codes
  configs/oauth_tokens.json  — issued access/refresh tokens
"""

import hashlib
import base64
import json
import secrets
import time
from pathlib import Path

from starlette.requests import Request
from starlette.responses import JSONResponse, HTMLResponse, RedirectResponse

from auth.admin_api import _load_users

CONFIGS_DIR = Path(__file__).parent.parent / "configs"

CODE_EXPIRY = 5 * 60          # 5 minutes
ACCESS_EXPIRY = 3600          # 1 hour
REFRESH_EXPIRY = 30 * 24 * 3600  # 30 days


# ── Storage helpers ──

def _load_clients() -> dict:
    path = CONFIGS_DIR / "oauth_clients.json"
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _save_clients(data: dict):
    (CONFIGS_DIR / "oauth_clients.json").write_text(json.dumps(data, indent=2))


def _load_codes() -> dict:
    path = CONFIGS_DIR / "oauth_codes.json"
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _save_codes(data: dict):
    (CONFIGS_DIR / "oauth_codes.json").write_text(json.dumps(data, indent=2))


def _load_oauth_tokens() -> dict:
    path = CONFIGS_DIR / "oauth_tokens.json"
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _save_oauth_tokens(data: dict):
    (CONFIGS_DIR / "oauth_tokens.json").write_text(json.dumps(data, indent=2))


# ── PKCE ──

def _verify_pkce(code_verifier: str, code_challenge: str) -> bool:
    """Verify PKCE S256 code_verifier against stored code_challenge."""
    digest = hashlib.sha256(code_verifier.encode()).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return computed == code_challenge


# ── Base URL helper ──

def _get_base_url(request: Request) -> str:
    """Get base URL from request. Handles Cloud Run / reverse proxy forwarded headers."""
    proto = request.headers.get("x-forwarded-proto", "https")
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host", "localhost:8080")
    )
    return f"{proto}://{host}"


# ── Cleanup helpers ──

def _purge_expired_codes(codes: dict) -> dict:
    now = time.time()
    return {k: v for k, v in codes.items() if v.get("expires_at", 0) > now}


def _purge_expired_tokens(tokens: dict) -> dict:
    now = time.time()
    return {k: v for k, v in tokens.items() if v.get("expires_at", 0) > now}


# ── 1. RFC 9728 — Protected Resource Metadata ──

async def oauth_protected_resource(request: Request):
    """GET /.well-known/oauth-protected-resource/mcp"""
    base = _get_base_url(request)
    return JSONResponse({
        "resource": f"{base}/mcp",
        "authorization_servers": [base],
        "resource_name": "SAM"
    })


# ── 2. RFC 8414 — Authorization Server Metadata ──

async def oauth_authorization_server(request: Request):
    """GET /.well-known/oauth-authorization-server"""
    base = _get_base_url(request)
    return JSONResponse({
        "issuer": base,
        "authorization_endpoint": f"{base}/authorize",
        "token_endpoint": f"{base}/token",
        "registration_endpoint": f"{base}/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "none"]
    })


# ── 3. RFC 7591 — Dynamic Client Registration ──

async def register_client(request: Request):
    """POST /register — Claude registers itself as an OAuth client."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid_request", "error_description": "Invalid JSON"}, status_code=400)

    client_id = secrets.token_urlsafe(16)
    client_secret = secrets.token_urlsafe(32)

    clients = _load_clients()
    clients[client_id] = {
        "client_secret": client_secret,
        "redirect_uris": body.get("redirect_uris", []),
        "client_name": body.get("client_name", "unknown"),
        "grant_types": body.get("grant_types", ["authorization_code"]),
        "response_types": body.get("response_types", ["code"]),
        "token_endpoint_auth_method": body.get("token_endpoint_auth_method", "client_secret_post"),
        "created_at": time.time(),
    }
    _save_clients(clients)

    return JSONResponse({
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": body.get("redirect_uris", []),
        "client_name": body.get("client_name", ""),
        "grant_types": clients[client_id]["grant_types"],
        "response_types": clients[client_id]["response_types"],
        "token_endpoint_auth_method": clients[client_id]["token_endpoint_auth_method"],
    }, status_code=201)


# ── 4. Authorization Endpoint ──

def _build_login_page(
    client_id: str,
    redirect_uri: str,
    state: str,
    code_challenge: str,
    code_challenge_method: str,
    error: str = "",
) -> str:
    """Return HTML login form for SAM OAuth."""
    error_html = (
        f'<div class="error">{error}</div>' if error else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>SAM — Login</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0f;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e0e0e0;
    }}

    .card {{
      background: #12121a;
      border: 1px solid #1e1e2e;
      border-radius: 14px;
      padding: 40px 36px;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.6);
    }}

    .logo {{
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 28px;
    }}

    .logo-icon {{
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #4fc3f7, #1e88e5);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16px;
      color: #fff;
    }}

    .logo-text {{
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }}

    .logo-sub {{
      font-size: 11px;
      color: #666;
      margin-top: 1px;
    }}

    h2 {{
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 6px;
    }}

    .subtitle {{
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }}

    label {{
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #999;
      margin-bottom: 6px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}

    input[type="email"],
    input[type="password"] {{
      width: 100%;
      background: #0a0a0f;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      color: #e0e0e0;
      outline: none;
      transition: border-color 0.2s;
      margin-bottom: 16px;
    }}

    input[type="email"]:focus,
    input[type="password"]:focus {{
      border-color: #4fc3f7;
    }}

    button[type="submit"] {{
      width: 100%;
      background: linear-gradient(135deg, #1e88e5, #4fc3f7);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 11px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 4px;
      transition: opacity 0.2s;
    }}

    button[type="submit"]:hover {{ opacity: 0.88; }}

    .error {{
      background: #2a0a0a;
      border: 1px solid #5c1a1a;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #ef9a9a;
      margin-bottom: 16px;
    }}

    .footer {{
      margin-top: 24px;
      font-size: 11px;
      color: #444;
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon">S</div>
      <div>
        <div class="logo-text">SAM</div>
        <div class="logo-sub">Satyam's Automation Machine</div>
      </div>
    </div>

    <h2>Sign in</h2>
    <p class="subtitle">Connect Claude Desktop to SAM MCP</p>

    {error_html}

    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="{client_id}" />
      <input type="hidden" name="redirect_uri" value="{redirect_uri}" />
      <input type="hidden" name="state" value="{state}" />
      <input type="hidden" name="code_challenge" value="{code_challenge}" />
      <input type="hidden" name="code_challenge_method" value="{code_challenge_method}" />

      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="you@apnamart.in" required autofocus />

      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="••••••••" required />

      <button type="submit">Sign in &rarr;</button>
    </form>

    <div class="footer">Apna Mart · Homepage Pod</div>
  </div>
</body>
</html>"""


async def authorize(request: Request):
    """GET /authorize — show login form. POST /authorize — validate and redirect."""

    if request.method == "GET":
        client_id = request.query_params.get("client_id", "")
        redirect_uri = request.query_params.get("redirect_uri", "")
        state = request.query_params.get("state", "")
        code_challenge = request.query_params.get("code_challenge", "")
        code_challenge_method = request.query_params.get("code_challenge_method", "S256")
        response_type = request.query_params.get("response_type", "code")

        # Validate client
        clients = _load_clients()
        if client_id not in clients:
            return JSONResponse(
                {"error": "invalid_client", "error_description": "Unknown client_id"},
                status_code=400
            )

        # Validate redirect_uri if client has stored ones
        client = clients[client_id]
        if client.get("redirect_uris") and redirect_uri not in client["redirect_uris"]:
            return JSONResponse(
                {"error": "invalid_redirect_uri", "error_description": "redirect_uri not registered"},
                status_code=400
            )

        if response_type != "code":
            return JSONResponse(
                {"error": "unsupported_response_type"},
                status_code=400
            )

        return HTMLResponse(_build_login_page(
            client_id, redirect_uri, state, code_challenge, code_challenge_method
        ))

    # POST — process login form
    try:
        form = await request.form()
    except Exception:
        return JSONResponse({"error": "invalid_request"}, status_code=400)

    client_id = form.get("client_id", "")
    redirect_uri = form.get("redirect_uri", "")
    state = form.get("state", "")
    code_challenge = form.get("code_challenge", "")
    code_challenge_method = form.get("code_challenge_method", "S256")
    email = form.get("email", "").strip().lower()
    password = form.get("password", "")

    def _show_error(msg: str):
        return HTMLResponse(
            _build_login_page(client_id, redirect_uri, state, code_challenge, code_challenge_method, error=msg),
            status_code=400
        )

    # Validate client
    clients = _load_clients()
    if client_id not in clients:
        return _show_error("Invalid client. Please try again.")

    # Validate credentials against users.json
    users_data = _load_users()
    user = None
    role = None

    if email in users_data.get("super_admin", {}):
        u = users_data["super_admin"][email]
        if password == u.get("password_plain", ""):
            user = u
            role = "super_admin"

    if not user and email in users_data.get("users", {}):
        u = users_data["users"][email]
        if password == u.get("password_plain", ""):
            if u.get("status") == "pending_password":
                return _show_error("Password not set. Contact admin.")
            user = u
            role = u.get("role", "user")

    if not user:
        return _show_error("Invalid email or password.")

    # Generate authorization code
    code = secrets.token_urlsafe(32)
    now = time.time()

    codes = _purge_expired_codes(_load_codes())
    codes[code] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "email": email,
        "name": user["name"],
        "role": role,
        "projects": user.get("projects", []),
        "created_at": now,
        "expires_at": now + CODE_EXPIRY,
        "used": False,
    }
    _save_codes(codes)

    # Redirect to client with code + state
    separator = "&" if "?" in redirect_uri else "?"
    location = f"{redirect_uri}{separator}code={code}&state={state}"
    return RedirectResponse(location, status_code=302)


# ── 5. Token Endpoint ──

async def token_endpoint(request: Request):
    """POST /token — Exchange auth code or refresh token for access token."""
    try:
        form = await request.form()
    except Exception:
        return JSONResponse({"error": "invalid_request"}, status_code=400)

    grant_type = form.get("grant_type", "")

    if grant_type == "authorization_code":
        return await _handle_authorization_code(form)
    elif grant_type == "refresh_token":
        return await _handle_refresh_token(form)
    else:
        return JSONResponse(
            {"error": "unsupported_grant_type",
             "error_description": f"Unsupported grant_type: {grant_type}"},
            status_code=400
        )


async def _handle_authorization_code(form) -> JSONResponse:
    code = form.get("code", "")
    client_id = form.get("client_id", "")
    client_secret = form.get("client_secret", "")
    redirect_uri = form.get("redirect_uri", "")
    code_verifier = form.get("code_verifier", "")

    if not code or not client_id:
        return JSONResponse(
            {"error": "invalid_request", "error_description": "code and client_id required"},
            status_code=400
        )

    # Validate client
    clients = _load_clients()
    if client_id not in clients:
        return JSONResponse({"error": "invalid_client"}, status_code=401)

    client = clients[client_id]
    # Only check client_secret if it was provided (public clients skip it)
    if client_secret and client_secret != client.get("client_secret", ""):
        return JSONResponse({"error": "invalid_client", "error_description": "Bad client_secret"}, status_code=401)

    # Validate code
    codes = _load_codes()
    if code not in codes:
        return JSONResponse({"error": "invalid_grant", "error_description": "Unknown code"}, status_code=400)

    code_info = codes[code]

    if code_info.get("used"):
        return JSONResponse({"error": "invalid_grant", "error_description": "Code already used"}, status_code=400)

    if time.time() > code_info.get("expires_at", 0):
        del codes[code]
        _save_codes(codes)
        return JSONResponse({"error": "invalid_grant", "error_description": "Code expired"}, status_code=400)

    if code_info.get("client_id") != client_id:
        return JSONResponse({"error": "invalid_grant", "error_description": "client_id mismatch"}, status_code=400)

    if redirect_uri and code_info.get("redirect_uri") != redirect_uri:
        return JSONResponse({"error": "invalid_grant", "error_description": "redirect_uri mismatch"}, status_code=400)

    # PKCE verification
    stored_challenge = code_info.get("code_challenge", "")
    stored_method = code_info.get("code_challenge_method", "S256")

    if stored_challenge:
        if not code_verifier:
            return JSONResponse(
                {"error": "invalid_grant", "error_description": "code_verifier required"},
                status_code=400
            )
        if stored_method == "S256":
            if not _verify_pkce(code_verifier, stored_challenge):
                return JSONResponse(
                    {"error": "invalid_grant", "error_description": "PKCE verification failed"},
                    status_code=400
                )
        else:
            return JSONResponse(
                {"error": "invalid_grant", "error_description": "Only S256 PKCE is supported"},
                status_code=400
            )

    # Mark code as used
    codes[code]["used"] = True
    _save_codes(codes)

    # Issue tokens
    now = time.time()
    access_token = secrets.token_urlsafe(32)
    refresh_token = secrets.token_urlsafe(40)

    oauth_tokens = _purge_expired_tokens(_load_oauth_tokens())
    token_data = {
        "email": code_info["email"],
        "name": code_info["name"],
        "role": code_info["role"],
        "projects": code_info["projects"],
        "client_id": client_id,
        "created_at": now,
        "expires_at": now + ACCESS_EXPIRY,
        "type": "access",
    }
    oauth_tokens[access_token] = token_data

    refresh_data = {
        **token_data,
        "expires_at": now + REFRESH_EXPIRY,
        "type": "refresh",
        "access_token": access_token,
    }
    oauth_tokens[refresh_token] = refresh_data
    _save_oauth_tokens(oauth_tokens)

    return JSONResponse({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": ACCESS_EXPIRY,
        "refresh_token": refresh_token,
        "scope": "",
    })


async def _handle_refresh_token(form) -> JSONResponse:
    refresh_token = form.get("refresh_token", "")
    client_id = form.get("client_id", "")

    if not refresh_token:
        return JSONResponse(
            {"error": "invalid_request", "error_description": "refresh_token required"},
            status_code=400
        )

    oauth_tokens = _load_oauth_tokens()

    if refresh_token not in oauth_tokens:
        return JSONResponse({"error": "invalid_grant", "error_description": "Unknown refresh token"}, status_code=400)

    rt_info = oauth_tokens[refresh_token]

    if rt_info.get("type") != "refresh":
        return JSONResponse({"error": "invalid_grant", "error_description": "Not a refresh token"}, status_code=400)

    if time.time() > rt_info.get("expires_at", 0):
        del oauth_tokens[refresh_token]
        _save_oauth_tokens(oauth_tokens)
        return JSONResponse({"error": "invalid_grant", "error_description": "Refresh token expired"}, status_code=400)

    if client_id and rt_info.get("client_id") != client_id:
        return JSONResponse({"error": "invalid_grant", "error_description": "client_id mismatch"}, status_code=400)

    # Rotate: invalidate old access token, issue new pair
    old_access = rt_info.get("access_token")
    if old_access and old_access in oauth_tokens:
        del oauth_tokens[old_access]

    now = time.time()
    new_access = secrets.token_urlsafe(32)
    new_refresh = secrets.token_urlsafe(40)

    base_data = {
        "email": rt_info["email"],
        "name": rt_info["name"],
        "role": rt_info["role"],
        "projects": rt_info["projects"],
        "client_id": rt_info["client_id"],
        "created_at": now,
    }

    oauth_tokens[new_access] = {
        **base_data,
        "expires_at": now + ACCESS_EXPIRY,
        "type": "access",
    }
    oauth_tokens[new_refresh] = {
        **base_data,
        "expires_at": now + REFRESH_EXPIRY,
        "type": "refresh",
        "access_token": new_access,
    }

    # Invalidate old refresh token
    del oauth_tokens[refresh_token]

    oauth_tokens = _purge_expired_tokens(oauth_tokens)
    _save_oauth_tokens(oauth_tokens)

    return JSONResponse({
        "access_token": new_access,
        "token_type": "Bearer",
        "expires_in": ACCESS_EXPIRY,
        "refresh_token": new_refresh,
        "scope": "",
    })


# ── Token validation (used by /mcp middleware) ──

def validate_oauth_token(token: str) -> dict | None:
    """Validate an OAuth access token. Returns user info or None."""
    oauth_tokens = _load_oauth_tokens()
    if token not in oauth_tokens:
        return None

    info = oauth_tokens[token]
    if info.get("type") != "access":
        return None

    if time.time() > info.get("expires_at", 0):
        del oauth_tokens[token]
        _save_oauth_tokens(oauth_tokens)
        return None

    return info
