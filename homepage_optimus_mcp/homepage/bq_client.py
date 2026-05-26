"""
BigQuery Client — reads/writes to apna-mart-data.optimus.* tables.
Replaces Optimus Supabase endpoints for widget operations.
"""

from google.cloud import bigquery
import uuid
import time

PROJECT = "apna-mart-data"
DATASET = "optimus"

# Tables
WIDGETS_TABLE = f"{PROJECT}.{DATASET}.canvas_widgets"
SUBMISSIONS_TABLE = f"{PROJECT}.{DATASET}.submissions"
VERSIONS_TABLE = f"{PROJECT}.{DATASET}.widget_versions"
USER_ROLES_TABLE = f"{PROJECT}.{DATASET}.user_roles"
LOCATIONS_TABLE = f"{PROJECT}.{DATASET}.locations"


class BQClient:
    def __init__(self):
        self.client = bigquery.Client(project=PROJECT)

    def _query(self, sql: str, params: list = None) -> list:
        """Run a query and return rows as list of dicts."""
        job_config = None
        if params:
            job_config = bigquery.QueryJobConfig(query_parameters=params)

        result = self.client.query(sql, job_config=job_config)
        rows = []
        for row in result:
            rows.append(dict(row))
        return rows

    # ── Widgets ──

    def list_widgets(self, env: str, filters: dict = None) -> list:
        """List widgets from canvas_widgets."""
        sql = f"SELECT * FROM `{WIDGETS_TABLE}` WHERE env = @env AND is_deleted = false"
        params = [bigquery.ScalarQueryParameter("env", "STRING", env)]

        if filters:
            if filters.get("type"):
                sql += " AND type = @type"
                params.append(bigquery.ScalarQueryParameter("type", "STRING", filters["type"]))
            if filters.get("status"):
                sql += " AND status = @status"
                params.append(bigquery.ScalarQueryParameter("status", "STRING", filters["status"]))
            if filters.get("slug"):
                sql += " AND slug LIKE @slug"
                params.append(bigquery.ScalarQueryParameter("slug", "STRING", f"%{filters['slug']}%"))

        sql += " ORDER BY created_at DESC LIMIT 50"
        return self._query(sql, params)

    def get_widget(self, slug_or_id: str, env: str) -> dict:
        """Get widget by slug or widget_id."""
        sql = f"SELECT * FROM `{WIDGETS_TABLE}` WHERE env = @env AND (slug = @val OR widget_id = @val) AND is_deleted = false LIMIT 1"
        params = [
            bigquery.ScalarQueryParameter("env", "STRING", env),
            bigquery.ScalarQueryParameter("val", "STRING", slug_or_id),
        ]
        rows = self._query(sql, params)
        return rows[0] if rows else {"error": f"Widget '{slug_or_id}' not found in {env}"}

    def create_widget(self, data: dict) -> dict:
        """Insert new widget into canvas_widgets."""
        widget_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())

        row = {
            "widget_id": widget_id,
            "type": data.get("type", ""),
            "slug": data.get("slug", ""),
            "env": data.get("env", "UAT"),
            "title": data.get("title", ""),
            "title_hi": data.get("titleHi", ""),
            "status": "DRAFT",
            "sort_order": data.get("sortOrder", 0),
            "pnc": str(data.get("pnc", {})),
            "config": str(data.get("config", {})),
            "products": str(data.get("products", [])),
            "author": data.get("author", "sam_mcp"),
            "is_deleted": False,
            "created_at": now,
            "updated_at": now,
        }

        errors = self.client.insert_rows_json(WIDGETS_TABLE, [row])
        if errors:
            return {"error": f"BQ insert failed: {errors}"}

        # Create version 1
        self._create_version(widget_id, data.get("slug", ""), data.get("env", "UAT"), data, "sam_mcp")

        return {"status": "created", "widget_id": widget_id, "slug": data.get("slug", "")}

    def slug_exists(self, slug: str, env: str) -> bool:
        """Check if slug already exists."""
        sql = f"SELECT COUNT(*) as cnt FROM `{WIDGETS_TABLE}` WHERE slug = @slug AND env = @env AND is_deleted = false"
        params = [
            bigquery.ScalarQueryParameter("slug", "STRING", slug),
            bigquery.ScalarQueryParameter("env", "STRING", env),
        ]
        rows = self._query(sql, params)
        return rows[0]["cnt"] > 0 if rows else False

    # ── Versions ──

    def _create_version(self, widget_id: str, slug: str, env: str, snapshot: dict, changed_by: str):
        """Insert version record."""
        now = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
        row = {
            "widget_id": widget_id,
            "widget_slug": slug,
            "env": env,
            "version": 1,
            "snapshot": str(snapshot),
            "changed_by": changed_by,
            "change_log": "Created via SAM MCP",
            "created_at": now,
        }
        self.client.insert_rows_json(VERSIONS_TABLE, [row])

    def get_versions(self, slug: str, env: str) -> list:
        """Get version history for a widget."""
        sql = f"SELECT * FROM `{VERSIONS_TABLE}` WHERE widget_slug = @slug AND env = @env ORDER BY version DESC LIMIT 20"
        params = [
            bigquery.ScalarQueryParameter("slug", "STRING", slug),
            bigquery.ScalarQueryParameter("env", "STRING", env),
        ]
        return self._query(sql, params)

    # ── Locations ──

    def list_locations(self, env: str) -> list:
        """List all locations/states."""
        sql = f"SELECT * FROM `{LOCATIONS_TABLE}` WHERE env = @env AND is_enabled = true ORDER BY is_default DESC, label ASC"
        params = [bigquery.ScalarQueryParameter("env", "STRING", env)]
        return self._query(sql, params)

    # ── User Roles ──

    def get_user(self, email: str, env: str) -> dict:
        """Get user role."""
        sql = f"SELECT * FROM `{USER_ROLES_TABLE}` WHERE email = @email AND env = @env AND is_active = true LIMIT 1"
        params = [
            bigquery.ScalarQueryParameter("email", "STRING", email),
            bigquery.ScalarQueryParameter("env", "STRING", env),
        ]
        rows = self._query(sql, params)
        return rows[0] if rows else {"error": f"User '{email}' not found in {env}"}

    # ── Submissions ──

    def list_submissions(self, env: str, status: str = None) -> list:
        """List submissions."""
        sql = f"SELECT * FROM `{SUBMISSIONS_TABLE}` WHERE env = @env"
        params = [bigquery.ScalarQueryParameter("env", "STRING", env)]

        if status:
            sql += " AND request_status = @status"
            params.append(bigquery.ScalarQueryParameter("status", "STRING", status))

        sql += " ORDER BY created_at DESC LIMIT 50"
        return self._query(sql, params)
