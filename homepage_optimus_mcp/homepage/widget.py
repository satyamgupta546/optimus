"""
sam_widget — Widget operations: create, edit, list, get, duplicate, history.
All data reads/writes go to BigQuery (apna-mart-data.optimus.*).
Widget deployment to backend goes via Samaan API.
"""


async def handle_widget(arguments: dict, configs: dict) -> dict:
    """Route widget actions to handlers."""
    action = arguments.get("action")

    if not action:
        return {"error": "widget requires 'action' parameter. Options: create, edit, list, get, duplicate, history"}

    if action == "create":
        return await _create(arguments, configs)
    elif action == "edit":
        return await _edit(arguments, configs)
    elif action == "list":
        return await _list(arguments, configs)
    elif action == "get":
        return await _get(arguments, configs)
    elif action == "duplicate":
        return await _duplicate(arguments, configs)
    elif action == "history":
        return await _history(arguments, configs)
    else:
        return {"error": f"widget.{action} is not a valid action. Options: create, edit, list, get, duplicate, history"}


async def _create(args: dict, configs: dict) -> dict:
    """Create a new widget. Validates required fields, asks for missing ones."""
    missing = []

    widget_type = args.get("type")  # spr, dpr, banner_scroll, banner_stick, primary_masthead, secondary_masthead
    title = args.get("title")
    states = args.get("states")
    products = args.get("products")
    start_time = args.get("start_time")
    end_time = args.get("end_time")
    page_type = args.get("page_type")
    image = args.get("image")
    slug = args.get("slug")
    env = args.get("env")
    rows = args.get("rows", 2 if widget_type == "dpr" else 1)  # 1=single, 2=double
    is_optimized = args.get("is_optimized", True)  # default optimized

    # Environment is FIRST question
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    # Check required fields
    if not widget_type:
        missing.append("type — Which widget? Options: spr, banner_scroll, banner_stick, primary_masthead, secondary_masthead")
    if not title:
        missing.append("title — Widget title?")
    if not states:
        missing.append("states — Which states? e.g. ['JH', 'CG', 'WB']")
    if not start_time:
        missing.append("start_time — Start date? (YYYY-MM-DD HH:MM:SS)")
    if not end_time:
        missing.append("end_time — End date? (YYYY-MM-DD HH:MM:SS)")

    # Type-specific required fields
    if widget_type in ("spr", "banner_scroll", "banner_stick") and not products:
        missing.append("products — Product codes? (comma-separated or Sheet URL)")
    if widget_type in ("banner_scroll", "banner_stick", "primary_masthead", "secondary_masthead") and not image:
        missing.append("image — Image URL?")
    if widget_type in ("spr", "banner_scroll", "banner_stick") and not page_type:
        missing.append("page_type — Product Listing Page or Category Page?")

    if missing:
        return {"status": "missing_fields", "message": "Please provide the following details:", "missing": missing}

    confirm = args.get("confirm", False)
    final_slug = slug or _generate_slug(title, widget_type)

    # If confirm=false → show summary
    if not confirm:
        return {
            "status": "ready",
            "message": f"Ready to create on {env}. Call again with confirm=true to execute.",
            "environment": env,
            "summary": {
                "type": widget_type, "title": title, "slug": final_slug,
                "states": states, "products": products, "page_type": page_type,
                "image": image, "start_time": start_time, "end_time": end_time,
            },
            "next_step": "Show this summary to user. If user confirms, call sam_widget again with all same params + confirm=true"
        }

    # confirm=true → DEPLOY via Samaan API
    from homepage.samaan_client import SamaanClient
    from logger.bq_logger import log_action, log_slug_event

    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)

    # Login to Samaan
    login_ok = await samaan.login()
    if not login_ok:
        return {"status": "failed", "error": f"Samaan login failed on {env}. Check credentials."}

    product_list = [p.strip() for p in products.split(",") if p.strip()]

    # Deploy based on widget type
    if widget_type in ("spr", "dpr"):
        from homepage.spr_deployer import deploy_spr

        deploy_data = {
            "slug": final_slug,
            "title": title,
            "titleHi": "",
            "products": products,
            "stateProducts": _build_state_products(states, products),
            "pageType": page_type,
            "start_time": start_time,
            "end_time": end_time,
            "rows": rows,
            "is_optimized": is_optimized,
            "has_multimedia": bool(image),
            "image": image,
        }

        result = await deploy_spr(samaan, deploy_data)
    elif widget_type == "banner_scroll":
        from homepage.banner_carousel_deployer import deploy_banner_carousel

        deploy_data = {
            "slug": final_slug,
            "title": title,
            "products": products,
            "stateProducts": _build_state_products(states, products),
            "image": image,
            "media_number": args.get("media_number", "3.5"),
            "start_time": start_time,
            "end_time": end_time,
        }

        result = await deploy_banner_carousel(samaan, deploy_data)
    elif widget_type == "banner_stick":
        from homepage.banner_stick_deployer import deploy_banner_stick

        deploy_data = {
            "slug": final_slug,
            "title": title,
            "products": products,
            "stateProducts": _build_state_products(states, products),
            "image": image,
            "start_time": start_time,
            "end_time": end_time,
        }

        result = await deploy_banner_stick(samaan, deploy_data)
    elif widget_type == "primary_masthead":
        from homepage.masthead_deployer import deploy_primary_masthead

        deploy_data = {
            "slug": final_slug,
            "master_key": args.get("master_key", ""),
            "image": image,
            "start_time": start_time,
            "end_time": end_time,
            "aspect_ratio": args.get("aspect_ratio", "1"),
        }
        result = await deploy_primary_masthead(samaan, deploy_data)
    elif widget_type == "secondary_masthead":
        from homepage.masthead_deployer import deploy_secondary_masthead

        deploy_data = {
            "slug": final_slug,
            "image": image,
            "master_key": args.get("master_key", ""),
            "carousel_items": args.get("carousel_items", []),
            "start_time": start_time,
            "end_time": end_time,
            "aspect_ratio": args.get("aspect_ratio", "4"),
        }
        result = await deploy_secondary_masthead(samaan, deploy_data)
    else:
        result = {"status": "failed", "message": f"Unknown widget type: {widget_type}"}

    await samaan.close()

    if result.get("status") == "deployed":
        log_action("sam_mcp", "widget.create", final_slug, {"type": widget_type, "env": env}, result, "success")
        log_slug_event(final_slug, "created", "sam_mcp", {"type": widget_type, "states": states})
        return {
            "status": "deployed",
            "message": f"Widget deployed on {env}!",
            "environment": env,
            "widget_slug": result.get("spr_slug") or result.get("carousel_slug") or result.get("category_slug") or result.get("masthead_slug") or final_slug,
            "spr_slug": result.get("spr_slug"),
            "carousel_slug": result.get("carousel_slug"),
            "category_slug": result.get("category_slug"),
            "plp_slug": result.get("plp_slug"),
            "page_slug": result.get("page_slug"),
            "title": title,
            "states": states,
            "products_count": len(product_list),
            "steps": result.get("steps", []),
        }
    else:
        log_action("sam_mcp", "widget.create", final_slug, {"type": widget_type, "env": env}, result, "failed", str(result.get("error", "")))
        return {
            "status": "failed",
            "message": f"Widget deploy failed on {env}.",
            "environment": env,
            "slug": final_slug,
            "error": result.get("error", "Unknown error"),
            "steps_completed": [s for s in result.get("steps", []) if s.get("status") == "ok"],
        }


async def _edit(args: dict, configs: dict) -> dict:
    """Edit existing widget or widget item by slug.

    Supports:
    - Widget edit: heading, start_time, end_time (scheduling), heading_en, heading_hi
    - Widget item edit: product_list, text_en, start_time, end_time, filter_lst

    Uses slug to determine if it's a widget or widget item:
    - Widget item slugs contain: _sc_wi, _pr_wi, _cl_wi, _cat_wi, _sub_cat_wi, _carousel
    - Everything else is a widget slug
    """
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    slug = args.get("slug")
    fields = args.get("fields_to_update")

    if not slug:
        return {"error": "widget.edit requires 'slug' parameter."}
    if not fields:
        return {"error": "widget.edit requires 'fields_to_update'. Options: heading, start_time, end_time, product_list, text_en"}

    confirm = args.get("confirm", False)

    from homepage.samaan_client import SamaanClient
    from logger.bq_logger import log_action

    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)
    login_ok = await samaan.login()
    if not login_ok:
        return {"status": "failed", "error": f"Samaan login failed on {env}."}

    # Detect if widget or widget item
    item_suffixes = ["_sc_wi", "_pr_wi", "_cl_wi", "_cat_wi", "_sub_cat_wi", "_carousel", "_subcat_"]
    is_widget_item = any(s in slug for s in item_suffixes)

    if is_widget_item:
        # Widget item edit — find item via parent widget mapping
        # Extract parent widget slug from item slug
        parent_slug = _get_parent_widget_slug(slug)

        items_data = await samaan.get_widget_items(parent_slug)
        if "error" in items_data:
            await samaan.close()
            return {"status": "failed", "error": f"Could not find widget items for parent '{parent_slug}' on {env}.", "detail": items_data}

        # Find the specific item
        item = None
        for it in items_data.get("items", []):
            if it.get("slug_name") == slug:
                item = it
                break

        if not item:
            await samaan.close()
            return {"status": "failed", "error": f"Widget item '{slug}' not found in mappings of '{parent_slug}' on {env}.",
                    "available_items": [it.get("slug_name") for it in items_data.get("items", [])]}

        item_id = item.get("widget_item_id")

        if not confirm:
            await samaan.close()
            return {
                "status": "ready",
                "message": f"Ready to edit widget item '{slug}' (ID: {item_id}) on {env}. Call with confirm=true.",
                "environment": env,
                "slug": slug,
                "item_id": str(item_id),
                "type": "widget_item",
                "parent_widget": parent_slug,
                "current": {
                    "level": f"{item.get('level_tag')}/{item.get('level_property')}",
                    "start_time": str(item.get("start_time", "")),
                    "end_time": str(item.get("end_time", "")),
                    "priority": item.get("priority"),
                },
                "updates": fields,
                "next_step": "Call sam_widget(action='edit', slug=..., fields_to_update=..., env=..., confirm=true)"
            }

        # Fill start_time/end_time from current if not in user fields
        if "start_time" not in fields and item.get("start_time"):
            fields["start_time"] = str(item["start_time"]).replace("T", " ").replace("+00:00", "").replace("Z", "")
        if "end_time" not in fields and item.get("end_time"):
            fields["end_time"] = str(item["end_time"]).replace("T", " ").replace("+00:00", "").replace("Z", "")

        # Execute update
        result = await samaan.update_widget_item(str(item_id), slug, fields)
        await samaan.close()
        log_action("sam_mcp", "widget_item.edit", slug, fields, result, "success" if "error" not in result else "failed")
        return {
            "status": result.get("status", "failed"),
            "message": f"Widget item '{slug}' updated on {env}." if "error" not in result else f"Failed: {result.get('error')}",
            "environment": env,
            "slug": slug,
            "item_id": str(item_id),
            "updates": fields,
            "result": result,
        }

    else:
        # Widget edit — PATCH by slug
        current = await samaan.get_widget(slug)
        if "error" in current:
            await samaan.close()
            return {"status": "failed", "error": f"Widget '{slug}' not found on {env}.", "detail": current}

        # Show current before confirming
        current_info = {}
        if isinstance(current, list) and len(current) > 0:
            current_info = current[0]
        elif isinstance(current, dict):
            current_info = current

        if not confirm:
            await samaan.close()
            return {
                "status": "ready",
                "message": f"Ready to edit widget '{slug}' on {env}. Call with confirm=true.",
                "environment": env,
                "slug": slug,
                "type": "widget",
                "current": {
                    "heading_en": current_info.get("heading_en", ""),
                    "start_time": str(current_info.get("start_time", "")),
                    "end_time": str(current_info.get("end_time", "")),
                    "widget_type": current_info.get("widget_type", ""),
                },
                "updates": fields,
                "next_step": "Call sam_widget(action='edit', slug=..., fields_to_update=..., env=..., confirm=true)"
            }

        # Build update fields
        update_fields = {}
        if "heading" in fields or "heading_en" in fields:
            update_fields["heading_en"] = fields.get("heading_en") or fields.get("heading", "")
        if "heading_hi" in fields:
            update_fields["heading_hi"] = fields["heading_hi"]
        if "start_time" in fields:
            update_fields["start_time"] = fields["start_time"]
        if "end_time" in fields:
            update_fields["end_time"] = fields["end_time"]
        if "deactivated_flag" in fields:
            update_fields["deactivated_flag"] = fields["deactivated_flag"]

        if not update_fields:
            await samaan.close()
            return {"error": "No valid fields to update. Supported: heading, heading_en, heading_hi, start_time, end_time, deactivated_flag"}

        result = await samaan.update_widget(slug, update_fields)
        await samaan.close()
        log_action("sam_mcp", "widget.edit", slug, update_fields, result, "success" if "error" not in result else "failed")
        return {
            "status": result.get("status", "failed"),
            "message": f"Widget '{slug}' updated on {env}." if "error" not in result else f"Failed: {result.get('error')}",
            "environment": env,
            "slug": slug,
            "updates": update_fields,
            "result": result,
        }


async def _list(args: dict, configs: dict) -> dict:
    """List widgets from BigQuery."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    from homepage.bq_client import BQClient
    bq = BQClient()

    filters = {}
    if args.get("type"):
        filters["type"] = args["type"]
    if args.get("status"):
        filters["status"] = args["status"]
    if args.get("slug"):
        filters["slug"] = args["slug"]

    widgets = bq.list_widgets(env, filters)
    return {
        "environment": env,
        "count": len(widgets),
        "widgets": [{
            "slug": w.get("slug"),
            "type": w.get("type"),
            "title": w.get("title"),
            "status": w.get("status"),
            "created_at": str(w.get("created_at", "")),
        } for w in widgets]
    }


async def _get(args: dict, configs: dict) -> dict:
    """Get widget details from BigQuery."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    slug_or_id = args.get("slug_or_id")
    if not slug_or_id:
        return {"error": "widget.get requires 'slug_or_id' parameter."}

    from homepage.bq_client import BQClient
    bq = BQClient()

    widget = bq.get_widget(slug_or_id, env)
    if "error" in widget:
        return widget

    # Convert non-serializable fields
    result = {}
    for k, v in widget.items():
        result[k] = str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v

    result["environment"] = env
    return result


async def _duplicate(args: dict, configs: dict) -> dict:
    """Duplicate existing widget."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    slug = args.get("slug")
    if not slug:
        return {"error": "widget.duplicate requires 'slug' parameter."}

    from homepage.bq_client import BQClient
    bq = BQClient()

    widget = bq.get_widget(slug, env)
    if "error" in widget:
        return widget

    return {
        "status": "pending_implementation",
        "message": f"Widget '{slug}' found on {env}. Duplicate via BQ insert coming soon.",
        "environment": env,
        "original_slug": slug,
    }


async def _history(args: dict, configs: dict) -> dict:
    """View slug lifecycle from widget_versions table."""
    env = args.get("env")
    if not env:
        return {"status": "missing_env", "message": "Which environment? PROD or UAT?", "options": ["PROD", "UAT"]}

    slug = args.get("slug")
    if not slug:
        return {"error": "widget.history requires 'slug' parameter."}

    from homepage.bq_client import BQClient
    bq = BQClient()

    versions = bq.get_versions(slug, env)
    return {
        "environment": env,
        "slug": slug,
        "versions_count": len(versions),
        "versions": [{
            "version": v.get("version"),
            "changed_by": v.get("changed_by"),
            "change_log": v.get("change_log"),
            "created_at": str(v.get("created_at", "")),
        } for v in versions]
    }


def _get_parent_widget_slug(item_slug: str) -> str:
    """Extract parent widget slug from widget item slug.
    e.g. 'test_spr_sc_wi_global' → 'test_spr_spr_opt' (try common suffixes)
         'test_spr_pr_wi_jh' → 'test_spr_spr_opt'
         'test_banner_cl_wi_global' → 'test_banner_Cl_w_HP'
         'test_cat_cat_wi_global' → 'test_cat_cm_hp'
    """
    # Remove state suffix
    for suffix in ["_global", "_jh", "_cg", "_wb", "_up", "_patna"]:
        if item_slug.endswith(suffix):
            item_slug = item_slug[:-len(suffix)]
            break

    # Remove item type suffix and add widget suffix
    if "_sc_wi" in item_slug:
        base = item_slug.replace("_sc_wi", "")
        return f"{base}_spr_opt"
    elif "_pr_wi" in item_slug:
        base = item_slug.replace("_pr_wi", "")
        return f"{base}_spr_opt"
    elif "_sub_cat_wi" in item_slug:
        base = item_slug.replace("_sub_cat_wi", "")
        return f"{base}_Cl_w_HP"
    elif "_cl_wi" in item_slug:
        base = item_slug.replace("_cl_wi", "")
        return f"{base}_Cl_w_HP"
    elif "_cat_wi" in item_slug:
        base = item_slug.replace("_cat_wi", "")
        return f"{base}_cm_hp"
    elif "_carousel" in item_slug:
        base = item_slug.replace("_carousel", "").rsplit("_item_", 1)[0]
        return f"{base}_sm_hp"
    elif "_subcat_" in item_slug:
        base = item_slug.rsplit("_item_", 1)[0]
        return f"{base}_sm_hp"

    return item_slug


def _build_pnc(widget_type: str, image: str = None) -> dict:
    """Build PNC based on widget type."""
    if widget_type == "spr":
        return {"rows": 1, "is_optimized": True, "has_multimedia": bool(image)}
    elif widget_type == "banner_scroll":
        return {"displayMode": "scroll"}
    elif widget_type == "banner_stick":
        return {"displayMode": "stick"}
    elif widget_type == "primary_masthead":
        return {"variant": "primary", "has_multimedia": bool(image)}
    elif widget_type == "secondary_masthead":
        return {"variant": "secondary", "has_multimedia": bool(image)}
    return {}


def _build_state_products(states: list, products: str) -> dict:
    """Build state-wise products dict."""
    result = {"global": products}
    state_map = {
        "JH": "jharkhand", "CG": "chhattisgarh", "WB": "west bengal",
        "UP": "uttar pradesh", "PATNA": "patna"
    }
    for state in (states or []):
        key = state.upper()
        if key in state_map:
            result[state_map[key]] = products
    return result


def _generate_slug(title: str, widget_type: str) -> str:
    """Generate slug from title + widget type."""
    base = title.lower().replace(" ", "_").replace("-", "_")
    base = "".join(c for c in base if c.isalnum() or c == "_")
    base = base[:50]

    type_suffix = {
        "spr": "_spr_opt",
        "banner_scroll": "_Cl_w_HP",
        "banner_stick": "_cm_hp",
        "primary_masthead": "_pm_hp",
        "secondary_masthead": "_sm_hp",
    }
    return f"{base}{type_suffix.get(widget_type, '')}"
