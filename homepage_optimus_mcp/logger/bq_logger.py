"""
BigQuery Logger — audit trail, slug history, deduplication.
Project: SAM_mcp
"""

import json
import time
from pathlib import Path

# Local JSON fallback (always available, even if BQ is down)
LOCAL_LOG_FILE = Path(__file__).parent.parent / "configs" / "audit_log.json"
LOCAL_DEDUP_FILE = Path(__file__).parent.parent / "configs" / "processed_requests.json"


def _load_local(path: Path) -> list:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except:
            return []
    return []


def _save_local(path: Path, data: list):
    # Keep last 1000 entries
    path.write_text(json.dumps(data[-1000:], indent=2, ensure_ascii=False))


def log_action(user_email: str, action: str, slug: str = "", params: dict = None,
               response: dict = None, status: str = "success", error: str = "") -> dict:
    """Log an action to local JSON + BigQuery."""
    entry = {
        "user_email": user_email,
        "action": action,
        "slug": slug,
        "params": params or {},
        "response": response or {},
        "status": status,
        "error": error,
        "timestamp": time.time(),
        "timestamp_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Local JSON log (always)
    logs = _load_local(LOCAL_LOG_FILE)
    logs.append(entry)
    _save_local(LOCAL_LOG_FILE, logs)

    # TODO: BigQuery insert
    # bq_client.insert_rows("SAM_mcp.audit_log", [entry])

    return entry


def log_slug_event(slug: str, event: str, user_email: str, changes: dict = None) -> dict:
    """Log slug lifecycle event."""
    return log_action(
        user_email=user_email,
        action=f"slug.{event}",
        slug=slug,
        params=changes or {},
        status="logged"
    )


def is_duplicate(request_id: str) -> bool:
    """Check if request was already processed."""
    processed = _load_local(LOCAL_DEDUP_FILE)
    return request_id in processed


def mark_processed(request_id: str):
    """Mark request as processed."""
    processed = _load_local(LOCAL_DEDUP_FILE)
    if request_id not in processed:
        processed.append(request_id)
        _save_local(LOCAL_DEDUP_FILE, processed)


def get_slug_history(slug: str) -> list:
    """Get all events for a slug from local log."""
    logs = _load_local(LOCAL_LOG_FILE)
    return [entry for entry in logs if entry.get("slug") == slug]
