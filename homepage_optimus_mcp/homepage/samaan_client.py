"""
Samaan API Client — handles auth (auto-login) + all 8 Samaan API calls.
Auto re-login on 403 session expiry.
"""

import aiohttp
import asyncio
import json


class SamaanClient:
    def __init__(self, config: dict, env: str = None):
        self.env = env or config.get("default_env", "UAT")
        self.base_url = config.get("environments", {}).get(self.env, config.get("environments", {}).get("UAT", ""))
        creds = config["credentials"].get(self.env, config["credentials"].get("UAT", {}))
        self.username = creds["username"]
        self.password = creds["password"]
        self.endpoints = config["endpoints"]
        self.csrf_token = None
        self.session_id = None
        self._session = None

    async def _ensure_session(self):
        """Create aiohttp session with cookie jar for auto cookie handling."""
        if self._session is None or self._session.closed:
            jar = aiohttp.CookieJar(unsafe=True)
            self._session = aiohttp.ClientSession(cookie_jar=jar)

    async def login(self) -> bool:
        """Auto-login to Samaan. Returns True on success."""
        await self._ensure_session()

        # Step 1: GET /login/ to get csrftoken
        login_url = f"{self.base_url}{self.endpoints['login']}"
        async with self._session.get(login_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            cookies = resp.cookies
            self.csrf_token = None
            for cookie in cookies.values():
                if cookie.key == "csrftoken":
                    self.csrf_token = cookie.value
                    break

        if not self.csrf_token:
            return False

        # Step 2: POST /login/ with credentials
        data = aiohttp.FormData()
        data.add_field("csrfmiddlewaretoken", self.csrf_token)
        data.add_field("username", self.username)
        data.add_field("password", self.password)

        headers = {
            "Cookie": f"csrftoken={self.csrf_token}",
            "Referer": login_url,
        }

        async with self._session.post(
            login_url, data=data, headers=headers,
            allow_redirects=False,
            timeout=aiohttp.ClientTimeout(total=15)
        ) as resp:
            cookies = resp.cookies
            for cookie in cookies.values():
                if cookie.key == "sessionid":
                    self.session_id = cookie.value
                    break

        return self.session_id is not None

    def _auth_headers(self) -> dict:
        """Build auth headers with CSRF + session cookies."""
        return {
            "X-CSRFToken": self.csrf_token or "",
            "Cookie": f"csrftoken={self.csrf_token}; sessionid={self.session_id}",
        }

    async def _request(self, method: str, endpoint_key: str, data=None, json_body=None, is_retry=False) -> dict:
        """Make authenticated request. Auto re-login on 403."""
        await self._ensure_session()

        if not self.session_id:
            success = await self.login()
            if not success:
                return {"error": "Samaan login failed. Check credentials."}

        url = f"{self.base_url}{self.endpoints[endpoint_key]}"
        headers = self._auth_headers()

        try:
            async with self._session.request(
                method, url,
                headers=headers,
                data=data,
                json=json_body,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status == 403 and not is_retry:
                    # Session expired — re-login and retry
                    success = await self.login()
                    if success:
                        return await self._request(method, endpoint_key, data=data, json_body=json_body, is_retry=True)
                    return {"error": "Samaan session expired. Re-login failed."}

                try:
                    result = await resp.json()
                except:
                    result = {"raw": await resp.text()}

                if resp.status >= 400:
                    return {
                        "error": f"Samaan API {method} {endpoint_key} failed: HTTP {resp.status}",
                        "detail": result
                    }
                return result

        except Exception as e:
            return {"error": f"Samaan API {method} {endpoint_key} failed: {str(e)}"}

    # ── Widget Item ──

    async def create_widget_item(self, form_data: aiohttp.FormData) -> dict:
        """POST /api/app/post_widget_item/ — multipart form."""
        return await self._post_form("widget_item", form_data)

    # ── Widget ──

    async def create_widget(self, form_data: aiohttp.FormData) -> dict:
        """POST /api/app/widget/ — multipart form."""
        return await self._post_form("widget", form_data)

    async def _post_form(self, endpoint_key: str, form_data: aiohttp.FormData, is_retry=False) -> dict:
        """Post multipart form with auth. CSRF token in both header AND body."""
        await self._ensure_session()
        if not self.session_id:
            success = await self.login()
            if not success:
                return {"error": "Samaan login failed."}

        # Django needs csrfmiddlewaretoken in form body + X-CSRFToken header + Cookie
        form_data.add_field("csrfmiddlewaretoken", self.csrf_token or "")

        url = f"{self.base_url}{self.endpoints[endpoint_key]}"
        headers = {
            "X-CSRFToken": self.csrf_token or "",
            "Cookie": f"csrftoken={self.csrf_token}; sessionid={self.session_id}",
            "Referer": self.base_url,
        }

        try:
            async with self._session.post(url, data=form_data, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 403 and not is_retry:
                    success = await self.login()
                    if success:
                        return await self._post_form(endpoint_key, form_data, is_retry=True)
                    return {"error": "Session expired. Re-login failed."}
                try:
                    return await resp.json()
                except:
                    text = await resp.text()
                    if resp.status >= 400:
                        return {"error": f"HTTP {resp.status}", "raw": text[:500]}
                    return {"status": resp.status, "raw": text[:500]}
        except Exception as e:
            return {"error": str(e)}

    # ── Page Layout ──

    async def create_page_layout(self, json_body: dict) -> dict:
        """POST /api/app/post_page_layout/ — JSON."""
        return await self._request("POST", "page_layout", json_body=json_body)

    # ── Multimedia ──

    async def upload_multimedia(self, form_data: aiohttp.FormData) -> dict:
        """POST /api/app/multimedia/ — multipart form."""
        return await self._post_form("multimedia", form_data)

    # ── Mapping (CSV upload) ──

    async def map_widget_items(self, csv_blob: bytes, filename: str = "mapping.csv") -> dict:
        """POST /api/app/update_widget_widget_item_mapping/ — CSV file upload."""
        return await self._post_mapping("map_widget_items", csv_blob, filename)

    async def map_widget_items_with_slug(self, widget_slug: str, csv_blob: bytes) -> dict:
        """Map widget items with widget_slug in form body (as GAS script does)."""
        form = aiohttp.FormData()
        form.add_field("widget_slug", widget_slug)
        form.add_field("mapping_file", csv_blob, filename="map.csv", content_type="text/csv")
        return await self._post_form("map_widget_items", form)

    async def map_layout_widget(self, csv_blob: bytes, filename: str = "mapping.csv") -> dict:
        """POST /api/app/update_layout_widget_mapping/ — CSV file upload."""
        return await self._post_mapping("map_layout_widget", csv_blob, filename)

    async def map_layout_widget_with_slug(self, page_layout_slug: str, csv_blob: bytes) -> dict:
        """Map layout widget with page_layout_slug in form body."""
        form = aiohttp.FormData()
        form.add_field("page_layout_slug", page_layout_slug)
        form.add_field("mapping_file", csv_blob, filename="map.csv", content_type="text/csv")
        return await self._post_form("map_layout_widget", form)

    async def map_page_layout(self, csv_blob: bytes, filename: str = "mapping.csv") -> dict:
        """POST /api/app/update_page_page_layout_mapping/ — CSV file upload."""
        return await self._post_mapping("map_page_layout", csv_blob, filename)

    async def map_page_layout_with_slug(self, page_layout_slug: str, page_type: str, csv_blob: bytes) -> dict:
        """Map page layout with page_layout_slug + page_type in form body."""
        form = aiohttp.FormData()
        form.add_field("page_layout_slug", page_layout_slug)
        form.add_field("page_type", page_type)
        form.add_field("mapping_file", csv_blob, filename="map.csv", content_type="text/csv")
        return await self._post_form("map_page_layout", form)

    async def _post_mapping(self, endpoint_key: str, csv_blob: bytes, filename: str) -> dict:
        """Post mapping CSV."""
        form = aiohttp.FormData()
        form.add_field("mapping_file", csv_blob, filename=filename, content_type="text/csv")
        return await self._post_form(endpoint_key, form)

    # ── Bulk Upload ──

    async def bulk_upload(self, csv_blob: bytes, filename: str = "bulk_upload.csv") -> dict:
        """PUT /api/app/bulk_upload_products_for_wi/ — CSV file upload."""
        await self._ensure_session()
        if not self.session_id:
            await self.login()

        url = f"{self.base_url}{self.endpoints['bulk_upload']}"
        headers = {"X-CSRFToken": self.csrf_token or "", "Referer": self.base_url}

        form = aiohttp.FormData()
        form.add_field("file", csv_blob, filename=filename, content_type="text/csv")

        async with self._session.put(url, data=form, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            try:
                return await resp.json()
            except:
                return {"status": resp.status, "raw": await resp.text()}

    # ── Get Widget by slug ──

    async def get_widget(self, slug_name: str) -> dict:
        """GET /api/app/get_widget/?slug_name={slug}"""
        await self._ensure_session()
        if not self.session_id:
            await self.login()

        url = f"{self.base_url}{self.endpoints['get_widget']}?slug_name={slug_name}"
        headers = {
            "X-CSRFToken": self.csrf_token or "",
            "Cookie": f"csrftoken={self.csrf_token}; sessionid={self.session_id}",
            "Accept": "application/json",
        }

        try:
            async with self._session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    return await resp.json()
                return {"error": f"GET widget {slug_name} failed: HTTP {resp.status}"}
        except Exception as e:
            return {"error": str(e)}

    # ── Get Widget Item by slug ──

    async def get_widget_items(self, widget_slug: str) -> dict:
        """GET widget items mapped to a widget. Tries slug + _plp_w variant."""
        import urllib.request, http.cookiejar

        slugs_to_try = [widget_slug]
        for suffix in ["_spr_opt", "_spr", "_Cl_w_HP", "_cm_hp", "_sm_hp", "_pm_hp"]:
            if widget_slug.endswith(suffix):
                base = widget_slug[:-len(suffix)]
                slugs_to_try.insert(0, f"{base}_plp_w")
                break

        for try_slug in slugs_to_try:
            try:
                url = f"{self.base_url}/api/app/get_paginated_widget_widget_item_mappings/?widget_query={try_slug}&limit=50&page_no=1&status=active&sort=-updated_at"
                req = urllib.request.Request(url, headers={
                    "Cookie": f"csrftoken={self.csrf_token}; sessionid={self.session_id}",
                    "X-CSRFToken": self.csrf_token,
                    "Accept": "application/json",
                    "User-Agent": "SAM-Bot/1.0",
                })
                jar_temp = http.cookiejar.CookieJar()
                opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar_temp))
                resp = opener.open(req, timeout=15)
                data = json.loads(resp.read())

                items = []
                for widget in data.get("data", []):
                    for mapping in widget.get("mapping_data", []):
                        items.append({
                            "widget_item_id": mapping.get("widget_item_id"),
                            "slug_name": mapping.get("widget_item__slug_name"),
                            "level_tag": mapping.get("level_tag"),
                            "level_property": mapping.get("level_property"),
                            "priority": mapping.get("priority"),
                            "start_time": mapping.get("widget_item__start_time"),
                            "end_time": mapping.get("widget_item__end_time"),
                            "active": mapping.get("active"),
                        })
                if items:
                    return {"items": items, "count": len(items)}
            except Exception:
                continue

        return {"items": [], "count": 0}

    # ── PATCH Widget (update heading, start_time, end_time) ──

    async def update_widget(self, slug_name: str, fields: dict) -> dict:
        """PUT /api/app/widget/{id}/ — update widget. Fetches current data, merges changes, sends full body.
        Accepts slug_name, fetches ID automatically."""
        await self._ensure_session()
        if not self.session_id:
            await self.login()

        # Get current widget data + ID
        current = await self.get_widget(slug_name)
        if "error" in current:
            return current

        widget_id = current.get("id")
        if not widget_id:
            return {"error": f"Could not get ID for widget '{slug_name}'"}

        # Merge current data with updates
        full_data = {
            "slug_name": slug_name,
            "widget_type": current.get("widget_type", ""),
            "description": current.get("description", "") or "",
            "heading": current.get("heading", "") or "",
            "master_key": current.get("master_key", "") or "",
            "heading_en": current.get("heading_en", ""),
            "heading_hi": current.get("heading_hi", ""),
            "heading_bg": current.get("heading_bg", ""),
            "start_time": current.get("start_time", ""),
            "end_time": current.get("end_time", ""),
            "clear_bg_media": "",
            "media_aspect_ratio": current.get("media_ar", "1"),
            "view_all_action_name": current.get("view_all_action", ""),
            "view_all_action_params": json.dumps(current.get("view_all_action_params", {})) if isinstance(current.get("view_all_action_params"), dict) else str(current.get("view_all_action_params", "")).replace("'", '"'),
            "background_multimedia": "",
            "filter_dict": current.get("filter_dict", "{}"),
            "app_configurations": current.get("app_configurations", "{}"),
            "configurations": current.get("configurations", "{}"),
            "deactivated_flag": "no" if current.get("deactivated_flag") in ("False", False, "no") else "yes",
        }

        # Apply user's updates
        for key, value in fields.items():
            if value is not None:
                full_data[key] = str(value)

        # Fix None strings
        for k, v in full_data.items():
            if v == "None" or v is None:
                full_data[k] = ""

        url = f"{self.base_url}{self.endpoints['widget']}{widget_id}/"
        headers = {
            "X-CSRFToken": self.csrf_token or "",
            "Cookie": f"csrftoken={self.csrf_token}; sessionid={self.session_id}",
            "Referer": self.base_url,
        }

        form = aiohttp.FormData()
        form.add_field("csrfmiddlewaretoken", self.csrf_token or "")
        for key, value in full_data.items():
            form.add_field(key, value)

        # Use urllib for PUT — aiohttp CSRF issues
        import urllib.request
        boundary = "----SAMWidgetUpdate"
        body = b""
        for key, value in full_data.items():
            body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()
        body += f"--{boundary}--\r\n".encode()

        try:
            req = urllib.request.Request(url, data=body, method="PUT", headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Cookie": f"csrftoken={self.csrf_token}; sessionid={self.session_id}",
                "X-CSRFToken": self.csrf_token,
                "Referer": f"{self.base_url}/widget/{slug_name}/",
                "User-Agent": "SAM-Bot/1.0",
            })
            import http.cookiejar
            jar = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            resp = opener.open(req, timeout=30)
            return {"status": "updated", "slug": slug_name, "id": widget_id}
        except urllib.error.HTTPError as e:
            body_text = e.read().decode()[:300] if e.fp else ""
            return {"error": f"PUT widget {slug_name} (id={widget_id}) failed: HTTP {e.code}", "detail": body_text}
        except Exception as e:
            return {"error": str(e)}

    # ── PUT Widget Item (update product_list, text, etc.) ──

    async def update_widget_item(self, item_id: str, slug_name: str, fields: dict) -> dict:
        """POST /api/app/update_widget_item/ — update widget item. Full body with widget_item_id."""
        import urllib.request

        url = f"{self.base_url}/api/app/update_widget_item/"

        # Detect item_type from slug
        item_type = "sub_category"
        item_click = "deal-detail-redirect"
        is_clickable = "yes"
        if "_pr_wi" in slug_name:
            item_type = "item_rows"
            item_click = ""
            is_clickable = "no"
        elif "_cl_wi" in slug_name or "_carousel" in slug_name:
            item_type = "carousel"
            item_click = "redirect-to-page"
        elif "_cat_wi" in slug_name:
            item_type = "category"
            item_click = "redirect-to-page"

        # Full default fields (from curl)
        full_data = {
            "csrfmiddlewaretoken": self.csrf_token or "",
            "widget_item_id": str(item_id),
            "deactivated_flag": "no",
            "item_click_action": item_click,
            "slug_name": slug_name,
            "slave_key": "",
            "item_type": item_type,
            "media": "",
            "text_en": "",
            "media_en": "",
            "text_hi": "",
            "media_hi": "",
            "text_bg": "",
            "media_bg": "",
            "product_list": "",
            "filters": "[]",
            "filter_lst": "[]",
            "property_lst": "[]",
            "pl_edit": "PL",
            "is_clickable": is_clickable,
            "update_product_list": "yes",
            "start_time": "",
            "end_time": "",
            "background_multimedia": "",
            "image_multimedia": "",
            "secondary_image_multimedia": "",
            "progress_bar": "",
            "offer_id": "",
            "click_action_params": "{}",
            "ranking_type": "none",
            "ranking_pin_pl": "false",
            "ranking_geo_level": "",
        }

        # Apply user's updates
        for key, value in fields.items():
            if value is not None:
                full_data[key] = str(value)

        # Auto-generate filter_lst from product_list if products updated
        if "product_list" in fields and "filter_lst" not in fields:
            codes = [int(p.strip()) for p in fields["product_list"].split(",") if p.strip().isdigit()]
            full_data["filter_lst"] = json.dumps([{"condition": "in_stk_item_codes", "value": codes}])

        # Build multipart form
        boundary = "----SAMWidgetItemUpdate"
        body = b""
        for key, value in full_data.items():
            body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()
        body += f"--{boundary}--\r\n".encode()

        try:
            req = urllib.request.Request(url, data=body, method="POST", headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Cookie": f"csrftoken={self.csrf_token}; sessionid={self.session_id}",
                "X-CSRFToken": self.csrf_token,
                "Referer": f"{self.base_url}/widget-item/{slug_name}/",
                "User-Agent": "SAM-Bot/1.0",
            })
            import http.cookiejar
            jar = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            resp = opener.open(req, timeout=30)
            return {"status": "updated", "item_id": item_id, "slug": slug_name}
        except urllib.error.HTTPError as e:
            body_text = e.read().decode()[:300] if e.fp else ""
            return {"error": f"Update widget_item {slug_name} (id={item_id}) failed: HTTP {e.code}", "detail": body_text}
        except Exception as e:
            return {"error": str(e)}

    # ── Cleanup ──

    async def close(self):
        """Close the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
