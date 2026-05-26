"""
sam_catalog — Product catalog operations: search or batch fetch.
"""


async def handle_catalog(arguments: dict, configs: dict) -> dict:
    """Route catalog actions to handlers."""
    action = arguments.get("action")

    if not action:
        return {"error": "catalog requires 'action' parameter. Options: search, batch"}

    if action == "search":
        return await _search(arguments, configs)
    elif action == "batch":
        return await _batch(arguments, configs)
    else:
        return {"error": f"catalog.{action} is not a valid action. Options: search, batch"}


async def _search(args: dict, configs: dict) -> dict:
    """Search products by query."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    query = args.get("query")
    limit = args.get("limit", 20)

    if not query:
        return {"error": "catalog.search requires 'query' parameter. What are you looking for?"}

    from homepage.optimus_client import OptimusClient

    client = OptimusClient(configs["optimus"], env)
    result = await client.search_products(query, limit)
    return result


async def _batch(args: dict, configs: dict) -> dict:
    """Batch fetch products by item codes."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    codes = args.get("codes")

    if not codes:
        return {"error": "catalog.batch requires 'codes' parameter. Provide comma-separated item codes."}

    from homepage.optimus_client import OptimusClient

    client = OptimusClient(configs["optimus"], env)
    result = await client.batch_products(codes)
    return result
