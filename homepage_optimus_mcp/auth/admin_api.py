"""
Admin API — User management + project assignment endpoints.
Runs alongside MCP server on same port.
"""

import json
import secrets
import time
from pathlib import Path
from starlette.requests import Request
from starlette.responses import JSONResponse

CONFIGS_DIR = Path(__file__).parent.parent / "configs"
TOKEN_EXPIRY = 7 * 24 * 3600  # 7 days


def _load_users():
    return json.loads((CONFIGS_DIR / "users.json").read_text())


def _save_users(data):
    (CONFIGS_DIR / "users.json").write_text(json.dumps(data, indent=4, ensure_ascii=False))


def _load_projects():
    return json.loads((CONFIGS_DIR / "projects.json").read_text())


def _load_tokens():
    path = CONFIGS_DIR / "tokens.json"
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _save_tokens(data):
    (CONFIGS_DIR / "tokens.json").write_text(json.dumps(data, indent=2))


# ── Auth Endpoints ──

async def login(request: Request):
    """POST /api/auth/login — email + password → token."""
    try:
        body = await request.json()
    except:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        return JSONResponse({"error": "Email and password required"}, status_code=400)

    users_data = _load_users()

    # Check super admin
    user = None
    role = None
    if email in users_data.get("super_admin", {}):
        u = users_data["super_admin"][email]
        if password == u.get("password_plain", ""):
            user = u
            role = "super_admin"

    # Check regular users
    if not user and email in users_data.get("users", {}):
        u = users_data["users"][email]
        if password == u.get("password_plain", ""):
            user = u
            role = u.get("role", "user")

    if not user:
        return JSONResponse({"error": "Invalid email or password"}, status_code=401)

    if user.get("status") == "pending_password":
        return JSONResponse({"error": "Password not set. Contact admin."}, status_code=403)

    # Create token
    tokens = _load_tokens()
    token = secrets.token_urlsafe(32)
    tokens[token] = {
        "email": email,
        "name": user["name"],
        "role": role,
        "projects": user["projects"],
        "created_at": time.time(),
        "expires_at": time.time() + TOKEN_EXPIRY,
    }
    _save_tokens(tokens)

    return JSONResponse({
        "token": token,
        "name": user["name"],
        "role": role,
        "projects": user["projects"],
        "expires_in": "7 days"
    })


async def me(request: Request):
    """GET /api/auth/me — get current user from token."""
    user = _get_user_from_request(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return JSONResponse(user)


# ── User Management (Super Admin only) ──

async def list_users(request: Request):
    """GET /api/admin/users — list all users."""
    admin = _require_admin(request)
    if isinstance(admin, JSONResponse):
        return admin

    users_data = _load_users()
    result = []

    for email, u in users_data.get("super_admin", {}).items():
        result.append({
            "email": email, "name": u["name"], "role": "super_admin",
            "projects": u["projects"], "status": "active"
        })

    for email, u in users_data.get("users", {}).items():
        result.append({
            "email": email, "name": u["name"], "role": u.get("role", "user"),
            "projects": u["projects"], "status": u.get("status", "active")
        })

    return JSONResponse({"users": result, "count": len(result)})


async def add_user(request: Request):
    """POST /api/admin/users — add new user."""
    admin = _require_admin(request)
    if isinstance(admin, JSONResponse):
        return admin

    try:
        body = await request.json()
    except:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    email = body.get("email", "").strip().lower()
    name = body.get("name", "")
    password = body.get("password", "")
    projects = body.get("projects", [])

    if not email or not name:
        return JSONResponse({"error": "Email and name required"}, status_code=400)

    users_data = _load_users()

    # Check if already exists
    if email in users_data.get("super_admin", {}) or email in users_data.get("users", {}):
        return JSONResponse({"error": f"User {email} already exists"}, status_code=409)

    users_data["users"][email] = {
        "name": name,
        "password_plain": password,
        "projects": projects,
        "role": "user",
        "status": "active" if password else "pending_password"
    }
    _save_users(users_data)

    return JSONResponse({"message": f"User {email} added", "projects": projects}, status_code=201)


async def update_user(request: Request):
    """PUT /api/admin/users — update user projects/password/status."""
    admin = _require_admin(request)
    if isinstance(admin, JSONResponse):
        return admin

    try:
        body = await request.json()
    except:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    email = body.get("email", "").strip().lower()
    if not email:
        return JSONResponse({"error": "Email required"}, status_code=400)

    users_data = _load_users()

    if email not in users_data.get("users", {}):
        return JSONResponse({"error": f"User {email} not found"}, status_code=404)

    user = users_data["users"][email]

    if "name" in body:
        user["name"] = body["name"]
    if "password" in body:
        user["password_plain"] = body["password"]
        if body["password"]:
            user["status"] = "active"
    if "projects" in body:
        user["projects"] = body["projects"]
    if "status" in body:
        user["status"] = body["status"]

    _save_users(users_data)
    return JSONResponse({"message": f"User {email} updated", "user": {
        "email": email, "name": user["name"], "projects": user["projects"], "status": user["status"]
    }})


async def remove_user(request: Request):
    """DELETE /api/admin/users — remove user."""
    admin = _require_admin(request)
    if isinstance(admin, JSONResponse):
        return admin

    try:
        body = await request.json()
    except:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    email = body.get("email", "").strip().lower()
    if not email:
        return JSONResponse({"error": "Email required"}, status_code=400)

    users_data = _load_users()

    if email in users_data.get("super_admin", {}):
        return JSONResponse({"error": "Cannot remove super admin"}, status_code=403)

    if email not in users_data.get("users", {}):
        return JSONResponse({"error": f"User {email} not found"}, status_code=404)

    del users_data["users"][email]
    _save_users(users_data)

    return JSONResponse({"message": f"User {email} removed"})


# ── Project Endpoints ──

async def list_projects(request: Request):
    """GET /api/admin/projects — list all projects."""
    user = _get_user_from_request(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    projects_data = _load_projects()
    user_projects = user.get("projects", [])

    result = []
    for pid, p in projects_data.get("projects", {}).items():
        if user_projects == ["*"] or pid in user_projects:
            result.append({"id": pid, **p})

    return JSONResponse({"projects": result, "count": len(result)})


# ── Helpers ──

def _get_user_from_request(request: Request) -> dict | None:
    """Extract user from Authorization header token."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    else:
        token = request.query_params.get("token", "")

    if not token:
        return None

    tokens = _load_tokens()
    if token not in tokens:
        return None

    info = tokens[token]
    if time.time() > info.get("expires_at", 0):
        del tokens[token]
        _save_tokens(tokens)
        return None

    return info


def _require_admin(request: Request):
    """Check if request is from super_admin. Returns user or error response."""
    user = _get_user_from_request(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if user.get("role") != "super_admin":
        return JSONResponse({"error": "Admin access required"}, status_code=403)
    return user
