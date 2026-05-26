"""
Auth handler — browser-based login, token management.
Token valid for 7 days.
"""

import json
import hashlib
import secrets
import time
from pathlib import Path

CONFIGS_DIR = Path(__file__).parent.parent / "configs"
TOKEN_EXPIRY = 7 * 24 * 3600  # 7 days in seconds

# In-memory token store (persisted to file on write)
_tokens = {}
_tokens_file = CONFIGS_DIR / "tokens.json"


def _load_tokens():
    global _tokens
    if _tokens_file.exists():
        _tokens = json.loads(_tokens_file.read_text())
    return _tokens


def _save_tokens():
    _tokens_file.write_text(json.dumps(_tokens, indent=2))


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def authenticate(email: str, password: str) -> dict:
    """Validate email + password. Returns token on success."""
    users_config = json.loads((CONFIGS_DIR / "users.json").read_text())

    # Check super admin
    if email in users_config.get("super_admin", {}):
        user = users_config["super_admin"][email]
        if password == user["password_plain"]:
            return _create_token(email, user["name"], "super_admin", user["projects"])

    # Check regular users
    if email in users_config.get("users", {}):
        user = users_config["users"][email]
        if password == user.get("password_plain", ""):
            return _create_token(email, user["name"], "user", user["projects"])

    return {"error": "Invalid email or password"}


def _create_token(email: str, name: str, role: str, projects: list) -> dict:
    """Create auth token."""
    _load_tokens()
    token = secrets.token_urlsafe(32)
    _tokens[token] = {
        "email": email,
        "name": name,
        "role": role,
        "projects": projects,
        "created_at": time.time(),
        "expires_at": time.time() + TOKEN_EXPIRY,
    }
    _save_tokens()
    return {"token": token, "name": name, "role": role, "expires_in": "7 days"}


def validate_token(token: str) -> dict | None:
    """Validate token. Returns user info or None."""
    _load_tokens()
    if token not in _tokens:
        return None

    info = _tokens[token]
    if time.time() > info["expires_at"]:
        del _tokens[token]
        _save_tokens()
        return None

    return info


def get_user_projects(token: str) -> list:
    """Get projects accessible by this token."""
    info = validate_token(token)
    if not info:
        return []
    if info["projects"] == ["*"]:
        # Super admin — return all projects
        projects_config = json.loads((CONFIGS_DIR / "projects.json").read_text())
        return list(projects_config.get("projects", {}).keys())
    return info["projects"]
