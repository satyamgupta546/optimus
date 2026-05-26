"""
sam_bulk — Bulk item code operations: upload or dry_run from Google Sheet.
"""


async def handle_bulk(arguments: dict, configs: dict) -> dict:
    """Route bulk actions to handlers."""
    action = arguments.get("action")

    if not action:
        return {"error": "bulk requires 'action' parameter. Options: upload, dry_run"}

    if action == "upload":
        return await _upload(arguments, configs)
    elif action == "dry_run":
        return await _dry_run(arguments, configs)
    else:
        return {"error": f"bulk.{action} is not a valid action. Options: upload, dry_run"}


async def _upload(args: dict, configs: dict) -> dict:
    """Bulk upload item codes from Google Sheet to Samaan."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    sheet_url = args.get("sheet_url")
    states = args.get("states")
    tab = args.get("tab")

    if not sheet_url:
        return {
            "status": "missing_fields",
            "message": "Please provide the Google Sheet URL.",
            "missing": ["sheet_url"],
            "note": "Sheet must be shared with sonic-bot@widget-474311.iam.gserviceaccount.com"
        }

    # TODO: Read sheet, validate, upload
    return {
        "status": "pending_implementation",
        "message": f"Will read sheet and upload item codes on **{env}**",
        "environment": env,
        "sheet_url": sheet_url,
        "states": states or ["JH", "CG", "WB"],
        "tab": tab,
        "confirm": f"Reply 'yes' to upload on {env}, 'cancel' to abort."
    }


async def _dry_run(args: dict, configs: dict) -> dict:
    """Generate CSVs from Sheet without uploading."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    sheet_url = args.get("sheet_url")
    states = args.get("states")
    tab = args.get("tab")

    if not sheet_url:
        return {
            "status": "missing_fields",
            "message": "Please provide the Google Sheet URL.",
            "missing": ["sheet_url"]
        }

    # TODO: Read sheet, generate CSVs, return preview
    return {
        "status": "pending_implementation",
        "message": f"Will generate CSVs from sheet on {env} (no upload)",
        "environment": env,
        "sheet_url": sheet_url,
        "states": states or ["JH", "CG", "WB"],
        "tab": tab
    }
