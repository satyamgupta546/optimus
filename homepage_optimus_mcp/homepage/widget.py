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
    elif action == "create_page":
        return await _create_page(arguments, configs)
    elif action == "create_item":
        return await _create_item(arguments, configs)
    elif action == "map_item":
        return await _map_item(arguments, configs)
    elif action == "map_widget_to_page":
        return await _map_widget_to_page(arguments, configs)
    elif action == "update_item":
        return await _update_item(arguments, configs)
    elif action == "create_widget_raw":
        return await _create_widget_raw(arguments, configs)
    elif action == "update_widget_time":
        return await _update_widget_time(arguments, configs)
    elif action == "update_item_image":
        return await _update_item_image(arguments, configs)
    else:
        return {"error": f"widget.{action} is not a valid action. Options: create, edit, list, get, history, create_page, create_item, map_item, map_widget_to_page, update_item, create_widget_raw, update_widget_time, update_item_image"}


_WIDGET_TYPE_MAP = {
    "spr": "product_rail", "dpr": "product_rail",
    "banner_scroll": "collection_banner", "banner_stick": "collection_banner",
    "primary_masthead": "masthead", "secondary_masthead": "masthead",
}


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
        return {
            "status": "missing_fields",
            "message": "Please provide the following details:",
            "missing": missing,
            "hint": f"Call sam_help(topic='{widget_type or 'widget'}') for field requirements",
        }

    confirm = args.get("confirm", False)
    final_slug = slug or _generate_slug(title, widget_type)

    # Slug duplicate check (check both base slug and with deployer suffix)
    from homepage.bq_client import BQClient
    bq = BQClient()
    _DEPLOY_SUFFIX = {"spr": "_spr_opt", "dpr": "_spr", "banner_scroll": "_Cl_w_HP", "banner_stick": "_cm_hp", "primary_masthead": "_pm_hp", "secondary_masthead": "_sm_hp"}
    full_slug = f"{final_slug}{_DEPLOY_SUFFIX.get(widget_type, '')}" if not any(final_slug.endswith(s) for s in _DEPLOY_SUFFIX.values()) else final_slug
    if bq.slug_exists(final_slug, env) or bq.slug_exists(full_slug, env):
        dup = full_slug if bq.slug_exists(full_slug, env) else final_slug
        return {
            "status": "duplicate_slug",
            "message": f"Slug '{dup}' already exists in {env}. Use a different slug.",
            "environment": env,
            "existing_slug": dup,
        }

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
            "next_step": "Confirm? Call again with confirm=true",
        }

    # Fix 1: PROD safety gate
    if env == "PROD" and not args.get("prod_ack"):
        return {
            "status": "prod_confirmation_required",
            "message": f"⚠️ PROD DEPLOY — This will go LIVE for real users!\n\nWidget: {title} ({widget_type})\nSlug: {final_slug}\nStates: {', '.join(states)}\n\nCall again with prod_ack=true to proceed.",
            "environment": "PROD",
        }

    # confirm=true → DEPLOY via Samaan API
    from homepage.samaan_client import SamaanClient
    from logger.bq_logger import log_action, log_slug_event

    samaan_cfg = configs.get("samaan", {})

    # Fix 2: Session leak — try/finally
    samaan = SamaanClient(samaan_cfg, env)
    try:
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
    finally:
        await samaan.close()

    if result.get("status") == "deployed":
        log_action("sam_mcp", "widget.create", final_slug, {"type": widget_type, "env": env}, result, "success")
        log_slug_event(final_slug, "created", "sam_mcp", {"type": widget_type, "states": states})

        # Save to BigQuery canvas_widgets for tracking
        try:
            deployed_slug = result.get("spr_slug") or result.get("carousel_slug") or result.get("category_slug") or result.get("masthead_slug") or final_slug
            bq.create_widget({
                "type": _WIDGET_TYPE_MAP.get(widget_type, widget_type),
                "slug": deployed_slug,
                "env": env,
                "title": title,
                "pnc": {"rows": rows, "is_optimized": is_optimized},
                "config": {"start_time": start_time, "end_time": end_time, "page_type": page_type, "states": states},
                "products": product_list,
                "author": "sam_mcp",
            })
        except Exception as bq_err:
            pass  # Non-blocking — widget is deployed even if BQ save fails

        # Fix 4: Build response, exclude null slugs
        response = {
            "status": "deployed",
            "message": f"Widget deployed on {env}!",
            "environment": env,
            "widget_slug": result.get("spr_slug") or result.get("carousel_slug") or result.get("category_slug") or result.get("masthead_slug") or final_slug,
            "title": title,
            "states": states,
            "products_count": len(product_list),
            "steps": result.get("steps", []),
        }
        for key in ["spr_slug", "carousel_slug", "category_slug", "plp_slug", "page_slug", "masthead_slug"]:
            val = result.get(key)
            if val:
                response[key] = val
        return response
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

    slug = args.get("slug") or args.get("slug_or_id")
    fields = args.get("fields_to_update")

    if not slug:
        return {"error": "widget.edit requires 'slug' (or 'slug_or_id') parameter."}
    if not fields:
        return {"error": "widget.edit requires 'fields_to_update'. Options: heading, start_time, end_time, product_list, text_en"}

    confirm = args.get("confirm", False)

    # Fix 1: PROD safety gate (edit)
    if env == "PROD" and not args.get("prod_ack"):
        return {
            "status": "prod_confirmation_required",
            "message": f"⚠️ PROD EDIT — This will go LIVE for real users!\n\nSlug: {slug}\nFields: {list(fields.keys())}\n\nCall again with prod_ack=true to proceed.",
            "environment": "PROD",
        }

    from homepage.samaan_client import SamaanClient
    from logger.bq_logger import log_action

    samaan_cfg = configs.get("samaan", {})

    # Detect if widget or widget item
    item_suffixes = ["_sc_wi", "_pr_wi", "_cl_wi", "_cat_wi", "_sub_cat_wi", "_carousel", "_subcat_"]
    is_widget_item = any(s in slug for s in item_suffixes)

    # Fix 2: Session leak — try/finally (edit)
    samaan = SamaanClient(samaan_cfg, env)
    try:
        login_ok = await samaan.login()
        if not login_ok:
            return {"status": "failed", "error": f"Samaan login failed on {env}."}

        if is_widget_item:
            # Widget item edit — find item via parent widget mapping
            # Extract parent widget slug from item slug
            parent_slug = _get_parent_widget_slug(slug)

            items_data = await samaan.get_widget_items(parent_slug)
            if "error" in items_data:
                return {"status": "failed", "error": f"Could not find widget items for parent '{parent_slug}' on {env}.", "detail": items_data}

            # Find the specific item
            item = None
            for it in items_data.get("items", []):
                if it.get("slug_name") == slug:
                    item = it
                    break

            if not item:
                return {"status": "failed", "error": f"Widget item '{slug}' not found in mappings of '{parent_slug}' on {env}.",
                        "available_items": [it.get("slug_name") for it in items_data.get("items", [])]}

            item_id = item.get("widget_item_id")

            if not confirm:
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
                    "next_step": "Confirm? Call again with confirm=true",
                }

            # Fill mandatory fields from current data if not in user fields
            if "start_time" not in fields and item.get("start_time"):
                fields["start_time"] = str(item["start_time"]).replace("T", " ").replace("+00:00", "").replace("Z", "")
            if "end_time" not in fields and item.get("end_time"):
                fields["end_time"] = str(item["end_time"]).replace("T", " ").replace("+00:00", "").replace("Z", "")

            # Detect item_type from slug
            if "item_type" not in fields:
                if "_pr_wi" in slug:
                    fields["item_type"] = "item_rows"
                elif "_cl_wi" in slug or "_carousel" in slug:
                    fields["item_type"] = "carousel"
                elif "_cat_wi" in slug:
                    fields["item_type"] = "category"
                else:
                    fields["item_type"] = "sub_category"

            # text_en — use slug base if not provided
            if "text_en" not in fields:
                fields["text_en"] = slug.replace("_", " ").split(" sc wi")[0].split(" pr wi")[0].title()

            # Execute update
            result = await samaan.update_widget_item(str(item_id), slug, fields)
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
                return {"status": "failed", "error": f"Widget '{slug}' not found on {env}.", "detail": current}

            # Show current before confirming
            current_info = {}
            if isinstance(current, list) and len(current) > 0:
                current_info = current[0]
            elif isinstance(current, dict):
                current_info = current

            if not confirm:
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
                    "next_step": "Confirm? Call again with confirm=true",
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
                return {"error": "No valid fields to update. Supported: heading, heading_en, heading_hi, start_time, end_time, deactivated_flag"}

            result = await samaan.update_widget(slug, update_fields)
            log_action("sam_mcp", "widget.edit", slug, update_fields, result, "success" if "error" not in result else "failed")
            return {
                "status": result.get("status", "failed"),
                "message": f"Widget '{slug}' updated on {env}." if "error" not in result else f"Failed: {result.get('error')}",
                "environment": env,
                "slug": slug,
                "updates": update_fields,
                "result": result,
            }
    finally:
        await samaan.close()


async def _list(args: dict, configs: dict) -> dict:
    """List widgets from BigQuery."""
    # Fix 5: Default UAT for read-only operations
    env = args.get("env", "UAT")

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
        # Fix 8: Remove created_at, keep slug/type/title/status/env
        "widgets": [{
            "slug": w.get("slug"),
            "type": w.get("type"),
            "title": w.get("title"),
            "status": w.get("status"),
            "env": env,
        } for w in widgets]
    }


async def _get(args: dict, configs: dict) -> dict:
    """Get widget details from BigQuery."""
    # Fix 5: Default UAT for read-only operations
    env = args.get("env", "UAT")

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

    # Fix 6: Accept slug_or_id in _duplicate
    slug = args.get("slug") or args.get("slug_or_id")
    if not slug:
        return {"error": "widget.duplicate requires 'slug' (or 'slug_or_id') parameter."}

    # Fix 10: Remove 'pending_implementation', clearly say not available
    return {
        "status": "not_available",
        "message": f"Widget duplicate is coming soon. For now, create a new widget with a different slug.",
        "environment": env,
        "original_slug": slug,
    }


async def _history(args: dict, configs: dict) -> dict:
    """View slug lifecycle from widget_versions table."""
    # Fix 5: Default UAT for read-only operations
    env = args.get("env", "UAT")

    # Fix 6: Accept slug_or_id in _history
    slug = args.get("slug") or args.get("slug_or_id")
    if not slug:
        return {"error": "widget.history requires 'slug' (or 'slug_or_id') parameter."}

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
        return f"{base}_plp_w"
    elif "_pr_wi" in item_slug:
        base = item_slug.replace("_pr_wi", "")
        return f"{base}_spr"
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


# ══════════════════════════════════════════════════════════════
# GRANULAR ACTIONS — individual page, item, mapping operations
# ══════════════════════════════════════════════════════════════

async def _create_page(args: dict, configs: dict) -> dict:
    """Create a category page layout."""
    env = args.get("env", "UAT")
    slug = args.get("slug")
    heading = args.get("heading", "")
    page_type = args.get("page_type", "category_page")

    if not slug:
        return {"error": "create_page requires 'slug' parameter."}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — create page '{slug}'. Call with prod_ack=true.", "environment": "PROD"}

    from homepage.samaan_client import SamaanClient
    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)
    try:
        await samaan.login()
        r = await samaan._request("POST", "page_layout", json_body={
            "slug_name": slug,
            "page_heading": heading,
            "page_layout_type": "2",
            "page_type": page_type,
        })
        return {"status": "created", "slug": slug, "page_type": page_type, "environment": env, "response": r}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        await samaan.close()


async def _create_item(args: dict, configs: dict) -> dict:
    """Create a widget item (sub_category or carousel)."""
    import aiohttp, base64, json as json_mod

    env = args.get("env", "UAT")
    slug = args.get("slug")
    item_type = args.get("item_type", "sub_category")
    text_en = args.get("text_en", "")
    text_hi = args.get("text_hi", "")
    products = args.get("products", "")
    click_action = args.get("click_action", "null" if item_type == "sub_category" else "redirect-to-page")
    slave_key = args.get("slave_key", "")
    click_params = args.get("click_action_params", "{}")
    start_time = args.get("start_time")
    end_time = args.get("end_time")

    if not slug:
        return {"error": "create_item requires 'slug' parameter."}
    if not start_time or not end_time:
        return {"error": "create_item requires 'start_time' and 'end_time'."}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — create item '{slug}'. Call with prod_ack=true."}

    BLANK_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")

    codes_int = [int(c) for c in products.split(",") if c.strip().isdigit()] if products else []
    filter_lst = json_mod.dumps([{"condition": "in_stk_item_codes", "value": codes_int}]) if codes_int else "[]"

    from homepage.samaan_client import SamaanClient
    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)
    try:
        await samaan.login()
        form = aiohttp.FormData()
        form.add_field("widget_item_id", "undefined")
        form.add_field("deactivated_flag", "no")
        form.add_field("item_click_action", click_action)
        form.add_field("slug_name", slug)
        form.add_field("item_type", item_type)
        form.add_field("text_en", text_en)
        form.add_field("text_hi", text_hi)
        form.add_field("media_en", BLANK_PNG, filename="blank.png", content_type="image/png")
        form.add_field("product_list", products)
        form.add_field("filters", "[]")
        form.add_field("filter_lst", filter_lst)
        form.add_field("property_lst", "[]")
        form.add_field("pl_edit", "PL")
        form.add_field("is_clickable", "yes")
        form.add_field("update_product_list", "no")
        form.add_field("start_time", start_time)
        form.add_field("end_time", end_time)
        form.add_field("slave_key", slave_key)
        form.add_field("click_action_params", click_params)
        r = await samaan.create_widget_item(form)
        return {"status": "created" if "error" not in r else "failed", "slug": slug, "item_type": item_type, "environment": env, "response": r}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        await samaan.close()


async def _map_item(args: dict, configs: dict) -> dict:
    """Map widget items to a widget (CSV mapping)."""
    env = args.get("env", "UAT")
    widget_slug = args.get("widget_slug")
    items = args.get("items")  # [{"slug": "...", "level_tag": "global", "level_property": "global", "priority": 1}]

    if not widget_slug or not items:
        return {"error": "map_item requires 'widget_slug' and 'items' list. Each item: {slug, level_tag, level_property, priority}"}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — map {len(items)} items to '{widget_slug}'. Call with prod_ack=true."}

    header = "widget_item_slug_name,level_tag,level_property,priority,cohort"
    rows = [f"{it['slug']},{it.get('level_tag','global')},{it.get('level_property','global')},{it.get('priority',i+1)}," for i, it in enumerate(items)]
    csv_str = header + "\n" + "\n".join(rows)

    from homepage.samaan_client import SamaanClient
    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)
    try:
        await samaan.login()
        r = await samaan.map_widget_items_with_slug(widget_slug, csv_str.encode())
        return {"status": "mapped" if r.get("message") == "success" else "failed", "widget_slug": widget_slug, "items_count": len(items), "environment": env, "response": r}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        await samaan.close()


async def _map_widget_to_page(args: dict, configs: dict) -> dict:
    """Map widget to page layout + page to global registry."""
    env = args.get("env", "UAT")
    page_slug = args.get("page_slug")
    widget_slug = args.get("widget_slug")
    page_type = args.get("page_type", "category_page")

    if not page_slug or not widget_slug:
        return {"error": "map_widget_to_page requires 'page_slug' and 'widget_slug'."}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — map '{widget_slug}' to '{page_slug}'. Call with prod_ack=true."}

    from homepage.samaan_client import SamaanClient
    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)
    try:
        await samaan.login()
        # Widget → Page
        plp_csv = f"widget_slug_name,level_tag,level_property,priority,cohort\n{widget_slug},global,global,1,\n"
        r1 = await samaan.map_layout_widget_with_slug(page_slug, plp_csv.encode())
        # Page → Global
        pg_csv = "level_tag,level_property\nglobal,global\n"
        r2 = await samaan.map_page_layout_with_slug(page_slug, page_type, pg_csv.encode())
        return {"status": "mapped", "page_slug": page_slug, "widget_slug": widget_slug, "environment": env, "widget_to_page": r1, "page_to_global": r2}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        await samaan.close()


async def _update_item(args: dict, configs: dict) -> dict:
    """Update widget item — products, text, time, image."""
    env = args.get("env", "UAT")
    slug = args.get("slug") or args.get("slug_or_id")
    fields = args.get("fields_to_update", {})

    if not slug:
        return {"error": "update_item requires 'slug' parameter."}
    if not fields:
        return {"error": "update_item requires 'fields_to_update'. Options: product_list, text_en, text_hi, start_time, end_time"}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — update item '{slug}'. Call with prod_ack=true."}

    from homepage.samaan_client import SamaanClient
    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)
    try:
        await samaan.login()
        # Get item ID from Samaan
        item_data = await samaan.get_widget_items(slug)
        items = item_data.get("items", [])
        if not items:
            # Try BQ
            from homepage.bq_client import BQClient
            bq = BQClient()
            bq_rows = bq._query(f"SELECT id FROM `apna-mart-data.smpublic.smapp_widgetitem` WHERE slug_name = '{slug}' AND active = true LIMIT 1")
            if not bq_rows:
                return {"error": f"Widget item '{slug}' not found."}
            item_id = str(bq_rows[0]["id"])
        else:
            item_id = str(items[0].get("widget_item_id", ""))

        r = await samaan.update_widget_item(item_id, slug, fields)
        return {"status": r.get("status", "failed"), "slug": slug, "environment": env, "response": r}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        await samaan.close()


async def _create_widget_raw(args: dict, configs: dict) -> dict:
    """Create any widget type (PLP, masthead, carousel, etc.) with full control."""
    import aiohttp, json as json_mod

    env = args.get("env", "UAT")
    slug = args.get("slug")
    widget_type = args.get("widget_type", "product_listing")
    heading = args.get("heading", "")
    app_config = args.get("app_configurations", '{"show_sub_cat":true,"display_vertical":true}')
    bg_multimedia = args.get("background_multimedia", "")
    start_time = args.get("start_time")
    end_time = args.get("end_time")

    if not slug:
        return {"error": "create_widget_raw requires 'slug'."}
    if not start_time or not end_time:
        return {"error": "create_widget_raw requires 'start_time' and 'end_time'."}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — create widget '{slug}'. Call with prod_ack=true."}

    from homepage.samaan_client import SamaanClient
    samaan_cfg = configs.get("samaan", {})
    samaan = SamaanClient(samaan_cfg, env)
    try:
        await samaan.login()
        form_fields = {
            "slug_name": slug,
            "widget_type": widget_type,
            "description": "",
            "heading": "",
            "master_key": "",
            "heading_en": heading,
            "heading_hi": "",
            "heading_bg": "",
            "start_time": start_time,
            "end_time": end_time,
            "clear_bg_media": "",
            "media_aspect_ratio": args.get("aspect_ratio", "1"),
            "view_all_action_name": "",
            "background_multimedia": bg_multimedia,
            "filter_dict": "{}",
            "app_configurations": app_config,
            "deactivated_flag": "no",
        }
        # Omit background_multimedia if empty
        if not bg_multimedia:
            del form_fields["background_multimedia"]

        r = await samaan.create_widget(form_fields)
        return {"status": "created" if "error" not in r else "failed", "slug": slug, "widget_type": widget_type, "environment": env, "response": r}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        await samaan.close()


async def _update_widget_time(args: dict, configs: dict) -> dict:
    """Update widget start_time/end_time using exact Samaan PUT format."""
    import json as json_mod, io, uuid, urllib.request, http.cookiejar, urllib.parse

    env = args.get("env", "UAT")
    slug = args.get("slug") or args.get("slug_or_id")
    start_time = args.get("start_time")
    end_time = args.get("end_time")

    if not slug:
        return {"error": "update_widget_time requires 'slug'."}
    if not start_time or not end_time:
        return {"error": "update_widget_time requires 'start_time' and 'end_time'."}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — update widget time '{slug}'. Call with prod_ack=true."}

    samaan_cfg = configs.get("samaan", {})
    env_key = "PROD" if env == "PROD" else "UAT"
    import os
    base = samaan_cfg.get("environments", {}).get(env_key, "")
    username = os.environ.get(f"SAMAAN_{env_key}_USER") or samaan_cfg.get("credentials", {}).get(env_key, {}).get("username", "")
    password = os.environ.get(f"SAMAAN_{env_key}_PASS") or samaan_cfg.get("credentials", {}).get(env_key, {}).get("password", "")

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{base}/login/", timeout=30)
    csrf = None
    for c in jar:
        if c.name == 'csrftoken': csrf = c.value
    opener.open(urllib.request.Request(f"{base}/login/",
        data=urllib.parse.urlencode({'csrfmiddlewaretoken': csrf, 'username': username, 'password': password}).encode(),
        headers={'Referer': f"{base}/login/"}), timeout=30)
    csrf = session = None
    for c in jar:
        if c.name == 'csrftoken': csrf = c.value
        if c.name == 'sessionid': session = c.value

    # Get widget data
    resp = opener.open(urllib.request.Request(f"{base}/api/app/get_widget/?slug_name={slug}",
        headers={'Cookie': f'csrftoken={csrf}; sessionid={session}'}), timeout=15)
    wdata = json_mod.loads(resp.read())
    wid = wdata.get('id')
    if not wid:
        return {"error": f"Widget '{slug}' not found."}

    heading = args.get("heading", wdata.get('heading_en', ''))
    wtype = wdata.get('widget_type', 'product_listing')
    app_cfg = wdata.get('app_configurations', {})
    app_cfg_str = json_mod.dumps(app_cfg) if isinstance(app_cfg, dict) else str(app_cfg or '{}')

    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex[:16]
    body = io.BytesIO()
    fields = [
        ("slug_name", slug), ("widget_type", wtype), ("description", "undefined"), ("heading", "undefined"),
        ("master_key", ""), ("heading_en", heading), ("heading_hi", ""), ("heading_bg", ""),
        ("start_time", start_time), ("end_time", end_time), ("clear_bg_media", ""),
        ("media_aspect_ratio", "1"), ("view_all_action_name", "null"), ("background_multimedia", ""),
        ("filter_dict", "{}"), ("app_configurations", app_cfg_str), ("configurations", "{}"), ("deactivated_flag", "no"),
    ]
    for k, v in fields:
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    body.write(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(f"{base}/api/app/widget/{wid}/", data=body.getvalue(), method='PUT')
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    req.add_header('x-csrftoken', csrf)
    req.add_header('Cookie', f'csrftoken={csrf}; sessionid={session}')
    req.add_header('Referer', f'{base}/widget/{slug}/')
    req.add_header('Origin', base)

    try:
        resp = opener.open(req, timeout=30)
        return {"status": "updated", "slug": slug, "id": wid, "start_time": start_time, "environment": env}
    except urllib.error.HTTPError as e:
        return {"status": "failed", "error": f"HTTP {e.code}: {e.read().decode()[:100]}"}


async def _update_item_image(args: dict, configs: dict) -> dict:
    """Update widget item image from GCS registry or URL."""
    import json as json_mod, io, uuid, urllib.request, http.cookiejar, urllib.parse
    from datetime import datetime

    env = args.get("env", "UAT")
    slug = args.get("slug") or args.get("slug_or_id")
    image_source = args.get("image_source")  # slug_name from registry or URL

    if not slug:
        return {"error": "update_item_image requires 'slug'."}
    if not image_source:
        return {"error": "update_item_image requires 'image_source' — GCS registry slug or image URL."}

    if env == "PROD" and not args.get("prod_ack"):
        return {"status": "prod_confirmation_required", "message": f"PROD — update image '{slug}'. Call with prod_ack=true."}

    # Get image bytes
    if image_source.startswith('http'):
        img_bytes = urllib.request.urlopen(image_source, timeout=15).read()
    else:
        # From GCS registry
        gcs_url = f"https://storage.googleapis.com/optimus-widget-media/widget-item-images/{image_source}.webp"
        try:
            img_bytes = urllib.request.urlopen(gcs_url, timeout=15).read()
        except:
            return {"error": f"Image not found in GCS registry: {image_source}"}

    # Compress if > 48KB
    if len(img_bytes) > 48000:
        from PIL import Image
        import tempfile
        img = Image.open(io.BytesIO(img_bytes))
        tmp = tempfile.NamedTemporaryFile(suffix='.webp', delete=False)
        img.save(tmp.name, 'WEBP', quality=60)
        img_bytes = open(tmp.name, 'rb').read()

    samaan_cfg = configs.get("samaan", {})
    env_key = "PROD" if env == "PROD" else "UAT"
    import os
    base = samaan_cfg.get("environments", {}).get(env_key, "")
    username = os.environ.get(f"SAMAAN_{env_key}_USER") or samaan_cfg.get("credentials", {}).get(env_key, {}).get("username", "")
    password = os.environ.get(f"SAMAAN_{env_key}_PASS") or samaan_cfg.get("credentials", {}).get(env_key, {}).get("password", "")

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{base}/login/", timeout=30)
    csrf = None
    for c in jar:
        if c.name == 'csrftoken': csrf = c.value
    opener.open(urllib.request.Request(f"{base}/login/",
        data=urllib.parse.urlencode({'csrfmiddlewaretoken': csrf, 'username': username, 'password': password}).encode(),
        headers={'Referer': f"{base}/login/"}), timeout=30)
    csrf = session = None
    for c in jar:
        if c.name == 'csrftoken': csrf = c.value
        if c.name == 'sessionid': session = c.value
    cookie = f"csrftoken={csrf}; sessionid={session}"

    NOW = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Get current item data
    resp = opener.open(urllib.request.Request(f"{base}/api/app/get_widget_item/?widget_item_slug_name={slug}",
        headers={'Cookie': cookie}), timeout=15)
    item = json_mod.loads(resp.read())
    wid = str(item['id'])
    pl = item.get('product_list', [])
    pl_str = ','.join(str(c) for c in pl) if isinstance(pl, list) else str(pl)
    fl = item.get('filter_dict', [])
    fl_str = json_mod.dumps(fl) if isinstance(fl, list) else str(fl or '[]')

    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex[:16]
    body = io.BytesIO()

    for k, v in [("widget_item_id", wid), ("deactivated_flag", "no"),
                 ("item_click_action", str(item.get('item_click_action') or 'null')),
                 ("slug_name", slug), ("slave_key", ""), ("item_type", item.get('item_type', 'sub_category')),
                 ("media", ""), ("text_en", item.get('text_en', ''))]:
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())

    body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"media_en\"; filename=\"image.webp\"\r\nContent-Type: image/webp\r\n\r\n".encode())
    body.write(img_bytes)
    body.write(b"\r\n")

    for k, v in [("text_hi", item.get('text_hi', '')), ("media_hi", ""), ("text_bg", ""), ("media_bg", ""),
                 ("product_list", pl_str), ("filters", "[]"), ("filter_lst", fl_str), ("property_lst", "[]"),
                 ("pl_edit", "PL"), ("is_clickable", "yes"), ("update_product_list", "no"),
                 ("start_time", NOW), ("end_time", "2027-06-01 23:59:00"), ("background_multimedia", ""),
                 ("image_multimedia", ""), ("secondary_image_multimedia", ""), ("progress_bar", ""),
                 ("offer_id", ""), ("click_action_params", "{}"), ("ranking_type", "none"),
                 ("ranking_pin_pl", "false"), ("ranking_geo_level", "")]:
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    body.write(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(f"{base}/api/app/update_widget_item/", data=body.getvalue(), method='POST')
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    req.add_header('x-csrftoken', csrf)
    req.add_header('Cookie', cookie)
    req.add_header('Referer', f'{base}/widget-item/{slug}/')
    req.add_header('Origin', base)

    try:
        resp = opener.open(req, timeout=30)
        return {"status": "updated", "slug": slug, "image_size_kb": round(len(img_bytes)/1024, 1), "environment": env}
    except urllib.error.HTTPError as e:
        return {"status": "failed", "error": f"HTTP {e.code}: {e.read().decode()[:100]}"}
