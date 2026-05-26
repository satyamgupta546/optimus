"""
sam_page — Page operations: list locations or get header widgets.
Locations from BigQuery. Header widgets from BigQuery canvas_widgets.
"""


async def handle_page(arguments: dict, configs: dict) -> dict:
    """Route page actions to handlers."""
    action = arguments.get("action")

    if not action:
        return {"error": "page requires 'action' parameter. Options: locations, header_widgets"}

    if action == "locations":
        return await _locations(arguments, configs)
    elif action == "header_widgets":
        return await _header_widgets(arguments, configs)
    else:
        return {"error": f"page.{action} is not a valid action. Options: locations, header_widgets"}


async def _locations(args: dict, configs: dict) -> dict:
    """List all available locations/states from BigQuery."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    from homepage.bq_client import BQClient
    bq = BQClient()

    locations = bq.list_locations(env)
    return {
        "environment": env,
        "count": len(locations),
        "locations": [{
            "key": loc.get("key"),
            "label": loc.get("label"),
            "level_tag": loc.get("level_tag"),
            "level_property": loc.get("level_property"),
            "slug_suffix": loc.get("slug_suffix"),
            "is_default": loc.get("is_default"),
        } for loc in locations]
    }


async def _header_widgets(args: dict, configs: dict) -> dict:
    """Get current masthead widgets from BigQuery."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    from homepage.bq_client import BQClient
    bq = BQClient()

    widgets = bq.list_widgets(env, {"type": "masthead"})
    return {
        "environment": env,
        "count": len(widgets),
        "header_widgets": [{
            "slug": w.get("slug"),
            "type": w.get("type"),
            "title": w.get("title"),
            "status": w.get("status"),
            "created_at": str(w.get("created_at", "")),
        } for w in widgets]
    }
