"""
sam_bulk — Bulk update item codes for widget items.

Supports:
  - upload: Update product codes for one or more widget items on Samaan
  - dry_run: Preview the CSV that would be uploaded (no actual upload)

CSV format for Samaan bulk upload:
  widget_item_slug_name,item_code,priority
  slug_1,90513,1
  slug_1,90518,2
"""

import json


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


def _build_csv(items: list) -> tuple:
    """Build bulk upload CSV from items list.

    Args:
        items: list of {"slug": "...", "products": "code1,code2,..."}

    Returns:
        (csv_string, total_rows, item_count)
    """
    rows = []
    for item in items:
        slug = item.get("slug", "")
        products = item.get("products", "")
        if not slug or not products:
            continue
        codes = [c.strip() for c in str(products).split(",") if c.strip()]
        for priority, code in enumerate(codes, 1):
            rows.append(f"{slug},{code},{priority}")

    header = "widget_item_slug_name,item_code,priority"
    csv_str = header + "\n" + "\n".join(rows)
    return csv_str, len(rows), len(items)


async def _upload(args: dict, configs: dict) -> dict:
    """Bulk upload item codes to Samaan widget items."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    items = args.get("items")
    # items = [{"slug": "widget_item_slug", "products": "code1,code2,..."}]

    if not items or not isinstance(items, list):
        return {
            "status": "missing_fields",
            "message": "Provide 'items' — list of widget items with product codes.",
            "example": {
                "items": [
                    {"slug": "bau_plp_firstfold_sale_grocery_cl_wi_all_both", "products": "90513,90518,368"},
                    {"slug": "bau_plp_firstfold_sale_snacks_cl_wi_all_both", "products": "1249,4686"}
                ]
            }
        }

    confirm = args.get("confirm", False)

    csv_str, total_rows, item_count = _build_csv(items)

    if not confirm:
        # Preview
        preview_lines = csv_str.split("\n")[:20]
        return {
            "status": "ready",
            "message": f"Ready to upload {total_rows} product codes across {item_count} widget items on {env}.",
            "environment": env,
            "total_product_codes": total_rows,
            "widget_items": item_count,
            "csv_preview": "\n".join(preview_lines) + ("\n..." if len(csv_str.split("\n")) > 20 else ""),
            "next_step": "Confirm? Call again with confirm=true",
        }

    # PROD safety gate
    if env == "PROD" and not args.get("prod_ack"):
        return {
            "status": "prod_confirmation_required",
            "message": f"PROD BULK UPLOAD — {total_rows} codes across {item_count} items.\nCall again with prod_ack=true.",
            "environment": "PROD",
        }

    # Execute upload
    from homepage.samaan_client import SamaanClient

    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)

    try:
        login_ok = await samaan.login()
        if not login_ok:
            return {"status": "failed", "error": f"Samaan login failed on {env}."}

        csv_bytes = csv_str.encode("utf-8")
        result = await samaan.bulk_upload(csv_bytes, "bulk_upload.csv")

        return {
            "status": "uploaded",
            "message": f"Bulk upload done on {env}! {total_rows} codes across {item_count} items.",
            "environment": env,
            "total_product_codes": total_rows,
            "widget_items": item_count,
            "samaan_response": result,
        }
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        await samaan.close()


async def _dry_run(args: dict, configs: dict) -> dict:
    """Preview bulk upload CSV without uploading."""
    env = args.get("env", "UAT")

    items = args.get("items")
    if not items or not isinstance(items, list):
        return {
            "status": "missing_fields",
            "message": "Provide 'items' — list of widget items with product codes.",
            "example": {
                "items": [
                    {"slug": "widget_item_slug", "products": "90513,90518"}
                ]
            }
        }

    csv_str, total_rows, item_count = _build_csv(items)

    return {
        "status": "preview",
        "message": f"Dry run — {total_rows} codes across {item_count} items. No upload.",
        "environment": env,
        "total_product_codes": total_rows,
        "widget_items": item_count,
        "csv": csv_str,
    }
