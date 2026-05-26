"""
Optimus API Client — handles all Optimus REST API calls.
"""

import aiohttp


class OptimusClient:
    def __init__(self, config: dict, env: str = None):
        self.env = env or config.get("auth", {}).get("default_env", "UAT")
        self.base_url = config.get("base_url", "")
        self.headers = {
            "Content-Type": "application/json",
            **config.get("headers", {}),
            "X-Optimus-Env": self.env
        }

    async def _request(self, method: str, endpoint: str, params: dict = None, json_body: dict = None) -> dict:
        """Make HTTP request to Optimus API."""
        url = f"{self.base_url}{endpoint}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method, url,
                    headers=self.headers,
                    params=params,
                    json=json_body,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    data = await resp.json()
                    if resp.status >= 400:
                        return {"error": f"Optimus API {method} {endpoint} failed: HTTP {resp.status}", "detail": data}
                    return data
        except Exception as e:
            return {"error": f"Optimus API {method} {endpoint} failed: {str(e)}"}

    # ── Widget operations ──

    async def list_widgets(self, params: dict = None) -> dict:
        return await self._request("GET", "/widgets", params=params)

    async def get_widget(self, slug_or_id: str) -> dict:
        return await self._request("GET", f"/widgets/{slug_or_id}")

    async def create_widget(self, data: dict) -> dict:
        return await self._request("POST", "/widgets", json_body=data)

    async def update_widget(self, widget_id: str, data: dict) -> dict:
        return await self._request("PATCH", f"/widgets/{widget_id}", json_body=data)

    async def duplicate_widget(self, widget_id: str) -> dict:
        return await self._request("POST", f"/widgets/{widget_id}/duplicate")

    async def get_versions(self, widget_id: str) -> dict:
        return await self._request("GET", f"/widgets/{widget_id}/versions")

    # ── Catalog operations ──

    async def search_products(self, query: str, limit: int = 20) -> dict:
        return await self._request("GET", "/catalog/search", params={"q": query, "limit": limit})

    async def batch_products(self, codes: str) -> dict:
        return await self._request("GET", "/catalog/batch", params={"codes": codes})

    # ── Page operations ──

    async def list_locations(self) -> dict:
        return await self._request("GET", "/locations")

    async def get_header_widgets(self) -> dict:
        return await self._request("GET", "/header-widgets")

    # ── Request operations ──

    async def create_request(self, data: dict) -> dict:
        return await self._request("POST", "/requests", json_body=data)

    async def list_requests(self, params: dict = None) -> dict:
        return await self._request("GET", "/requests", params=params)
