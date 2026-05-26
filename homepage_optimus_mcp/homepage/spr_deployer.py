"""
SPR Widget Deployer — 9-step Samaan API flow for Product Rail creation.

Flow:
  Step 1: Create Sub-Cat Widget Items (per state)    → POST /api/app/post_widget_item/
  Step 2: Create PLP Widget                          → POST /api/app/widget/
  Step 3: Create Page Layout                         → POST /api/app/post_page_layout/
  Step 4: Map Sub-Cats → PLP Widget                  → CSV mapping
  Step 5: Map PLP → Page Layout                      → CSV mapping
  Step 6: Map Page → Global Registry                 → CSV mapping
  Step 7: Create Row Widget Item                     → POST /api/app/post_widget_item/
  Step 8: Create Homepage SPR Widget                 → POST /api/app/widget/
  Step 9: Map Row Item → SPR Widget                  → CSV mapping
"""

import asyncio
import aiohttp
import json
import base64

# Blank 1x1 PNG — required for media_en field on widget items
BLANK_PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==')


async def deploy_spr(samaan_client, widget_data: dict, progress_callback=None) -> dict:
    """Deploy SPR widget via Samaan 9-step flow.

    Args:
        samaan_client: Authenticated SamaanClient
        widget_data: {slug, title, titleHi, products, stateProducts, pageType, start_time, end_time, rows, is_optimized, has_multimedia, image}
        progress_callback: async fn(step, total, message) for progress updates

    Returns: {status, slug, steps_completed, steps_failed, details}
    """
    slug = widget_data["slug"]
    title = widget_data.get("title", "")
    title_hi = widget_data.get("titleHi", "")
    products = widget_data.get("products", "")  # comma-separated string
    state_products = widget_data.get("stateProducts", {"global": products})
    page_type = widget_data.get("pageType", "product_listing_page")
    start_time = widget_data.get("start_time", "")
    end_time = widget_data.get("end_time", "")
    rows = widget_data.get("rows", 1)  # 1 = single, 2 = double
    is_optimized = widget_data.get("is_optimized", True)
    has_multimedia = widget_data.get("has_multimedia", False)
    image = widget_data.get("image")

    # Product codes as integers for filter_lst
    product_codes = [p.strip() for p in products.split(",") if p.strip()]
    filter_lst_value = [int(p) for p in product_codes if p.isdigit()]

    # Auto-translate title to Hindi (skip for multimedia)
    if not has_multimedia:
        from homepage.translator import to_hindi
        title_hi = title_hi or to_hindi(title)

    # 8-variant widget type resolution
    widget_type = _resolve_widget_type(rows, is_optimized, has_multimedia)

    # Slug suffixes
    spr_suffix = "_spr_opt" if is_optimized else "_spr"

    results = {"steps": [], "slug": slug}
    total_steps = 10 if has_multimedia else 9

    async def _progress(step, msg):
        results["steps"].append({"step": step, "message": msg, "status": "ok"})
        if progress_callback:
            await progress_callback(step, total_steps, msg)

    async def _fail(step, msg, error):
        results["steps"].append({"step": step, "message": msg, "status": "failed", "error": str(error)})
        results["status"] = "failed"
        results["error"] = f"Step {step}/{total_steps} failed: {msg} — {error}"
        return results

    try:
        # ── Step 1: Create Sub-Cat Widget Items (per state) ──
        sub_cat_slugs = []
        for state_key, state_products_str in state_products.items():
            state_suffix = _state_suffix(state_key)
            sc_slug = f"{slug}_sc_wi{state_suffix}"

            codes = [p.strip() for p in state_products_str.split(",") if p.strip()]
            codes_int = [int(p) for p in codes if p.isdigit()]

            form = aiohttp.FormData()
            form.add_field("slug_name", sc_slug)
            form.add_field("item_type", "sub_category")
            form.add_field("text_en", title)
            form.add_field("text_hi", title_hi or "")
            form.add_field("product_list", ",".join(codes))
            form.add_field("filter_lst", json.dumps([{"condition": "in_stk_item_codes", "value": codes_int}]))
            form.add_field("item_click_action", "deal-detail-redirect")
            form.add_field("is_clickable", "yes")
            form.add_field("deactivated_flag", "no")
            form.add_field("pl_edit", "PL")
            form.add_field("update_product_list", "no")
            form.add_field("start_time", start_time)
            form.add_field("end_time", end_time)
            form.add_field("click_action_params", "{}")
            form.add_field("filters", "[]")
            form.add_field("property_lst", "[]")
            form.add_field("media_en", BLANK_PNG, filename="blank.png", content_type="image/png")

            r = await samaan_client.create_widget_item(form)
            if _is_error(r):
                return await _fail(1, f"Sub-cat {sc_slug}", r)

            sub_cat_slugs.append({"slug": sc_slug, "state_key": state_key})
            await asyncio.sleep(0.2)

        await _progress(1, f"Created {len(sub_cat_slugs)} sub-cat widget items")

        # ── Step 2: Create PLP Widget ──
        plp_slug = f"{slug}_plp_w"
        form = aiohttp.FormData()
        form.add_field("slug_name", plp_slug)
        form.add_field("widget_type", "product_listing")
        form.add_field("heading", title)
        form.add_field("heading_en", title)
        form.add_field("heading_hi", "")
        form.add_field("heading_bg", "")
        form.add_field("description", "")
        form.add_field("master_key", "")
        form.add_field("clear_bg_media", "")
        form.add_field("view_all_action_name", "")
        form.add_field("background_multimedia", "")
        form.add_field("start_time", start_time)
        form.add_field("end_time", end_time)
        form.add_field("filter_dict", "{}")
        form.add_field("app_configurations", "{}")
        form.add_field("media_aspect_ratio", "1")

        r = await samaan_client.create_widget(form)
        if _is_error(r):
            return await _fail(2, f"PLP widget {plp_slug}", r)
        await _progress(2, f"Created PLP widget: {plp_slug}")
        await asyncio.sleep(0.2)

        # ── Step 3: Create Page Layout ──
        page_slug = f"{slug}_page_p"
        r = await samaan_client.create_page_layout({
            "slug_name": page_slug,
            "page_type": page_type,
            "page_heading": title,
            "page_layout_type": "2",
        })
        if _is_error(r):
            return await _fail(3, f"Page layout {page_slug}", r)
        await _progress(3, f"Created page layout: {page_slug}")
        await asyncio.sleep(0.2)

        # ── Step 4: Map Sub-Cats → PLP Widget ──
        # GAS script sends: widget_slug + mapping_file CSV
        csv_lines = ["widget_item_slug_name,level_tag,level_property,priority,cohort"]
        for i, sc in enumerate(sub_cat_slugs):
            level_tag = "global" if sc["state_key"] == "global" else "state"
            level_prop = sc["state_key"] if sc["state_key"] == "global" else _state_property(sc["state_key"])
            csv_lines.append(f"{sc['slug']},{level_tag},{level_prop},{i+1},")

        csv_blob = "\n".join(csv_lines).encode("utf-8")
        r = await samaan_client.map_widget_items_with_slug(plp_slug, csv_blob)
        if _is_error(r):
            return await _fail(4, "Map sub-cats → PLP", r)
        await _progress(4, f"Mapped {len(sub_cat_slugs)} sub-cats → PLP widget")
        await asyncio.sleep(0.2)

        # ── Step 5: Map PLP → Page Layout ──
        csv5 = f"widget_slug_name,level_tag,level_property,priority,cohort\n{plp_slug},global,global,1,"
        r = await samaan_client.map_layout_widget_with_slug(page_slug, csv5.encode("utf-8"))
        if _is_error(r):
            return await _fail(5, "Map PLP → Page", r)
        await _progress(5, "Mapped PLP → Page layout")
        await asyncio.sleep(0.2)

        # ── Step 6: Map Page → Global Registry ──
        csv6 = f"level_tag,level_property\nglobal,global"
        r = await samaan_client.map_page_layout_with_slug(page_slug, "", csv6.encode("utf-8"))
        if _is_error(r):
            return await _fail(6, "Map Page → Global", r)
        await _progress(6, "Mapped Page → Global registry")
        await asyncio.sleep(0.2)

        # ── Step 7: Create Row Widget Items (per state) ──
        row_slugs = []
        for state_key, state_products_str in state_products.items():
            state_suffix = _state_suffix(state_key)
            row_slug = f"{slug}_pr_wi{state_suffix}"

            codes = [p.strip() for p in state_products_str.split(",") if p.strip()]
            codes_int = [int(p) for p in codes if p.isdigit()]

            form = aiohttp.FormData()
            form.add_field("widget_item_id", "undefined")
            form.add_field("slug_name", row_slug)
            form.add_field("item_type", "item_rows")
            form.add_field("slave_key", "")
            form.add_field("text_en", "")
            form.add_field("text_hi", "")
            form.add_field("text_bg", "")
            form.add_field("media", "")
            form.add_field("media_en", "")
            form.add_field("media_hi", "")
            form.add_field("media_bg", "")
            form.add_field("product_list", ",".join(codes))
            form.add_field("filter_lst", json.dumps([{"condition": "in_stk_item_codes", "value": codes_int}]))
            form.add_field("filters", "[]")
            form.add_field("property_lst", "[]")
            form.add_field("pl_edit", "PL")
            form.add_field("item_click_action", "")
            form.add_field("click_action_params", "{}")
            form.add_field("is_clickable", "no")
            form.add_field("update_product_list", "no")
            form.add_field("deactivated_flag", "no")
            form.add_field("start_time", start_time)
            form.add_field("end_time", end_time)

            r = await samaan_client.create_widget_item(form)
            if _is_error(r):
                return await _fail(7, f"Row widget item {row_slug}", r)

            row_slugs.append({"slug": row_slug, "state_key": state_key})
            await asyncio.sleep(0.2)

        await _progress(7, f"Created {len(row_slugs)} row widget items (state-wise)")

        # ── Step 7.5 (optional): Upload Multimedia Background ──
        multimedia_slug = ""
        if has_multimedia and image:
            step_mm = 8 if total_steps == 10 else -1
            mm_slug = f"{slug}_bg"

            # Fetch image — local file or URL
            try:
                if image.startswith("file://") or image.startswith("/"):
                    # Local file
                    local_path = image.replace("file://", "")
                    with open(local_path, "rb") as f:
                        img_bytes = f.read()
                else:
                    # Remote URL
                    import aiohttp as aio_mod
                    async with aio_mod.ClientSession() as img_session:
                        async with img_session.get(image, timeout=aio_mod.ClientTimeout(total=15)) as img_resp:
                            img_bytes = await img_resp.read()

                # Compress if > 1MB
                if len(img_bytes) > 1024 * 1024:
                    from PIL import Image as PILImage
                    import io
                    pil_img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
                    for factor in [0.5, 0.4, 0.3, 0.25]:
                        new_w = int(pil_img.width * factor)
                        new_h = int(pil_img.height * factor)
                        resized = pil_img.resize((new_w, new_h), PILImage.LANCZOS)
                        buf = io.BytesIO()
                        resized.save(buf, "JPEG", quality=85)
                        img_bytes = buf.getvalue()
                        if len(img_bytes) < 1024 * 1024:
                            break
            except Exception as e:
                return await _fail(step_mm, f"Image fetch from {image}", {"error": str(e)})

            form = aiohttp.FormData()
            form.add_field("name", mm_slug)
            form.add_field("multimedia_type", "3")  # 3 = image
            form.add_field("aspect_ratio", "1")
            form.add_field("file_en", img_bytes, filename="background.jpg", content_type="image/jpeg")
            form.add_field("transition_color", "#FFFFFF")
            form.add_field("accent_color", "#0277FA")
            form.add_field("text_color", "#FFFFFF")
            form.add_field("icon_bg_color", "#F0F0F0")
            form.add_field("is_multimedia_dark", "false")

            r = await samaan_client.upload_multimedia(form)
            if _is_error(r):
                return await _fail(step_mm, f"Multimedia upload {mm_slug}", r)
            multimedia_slug = mm_slug
            await _progress(step_mm, f"Uploaded multimedia background: {mm_slug}")
            await asyncio.sleep(0.2)

        # ── Step 8 (or 9): Create Homepage SPR Widget ──
        step_spr = 9 if has_multimedia else 8
        spr_slug = f"{slug}{spr_suffix}"
        form = aiohttp.FormData()
        form.add_field("slug_name", spr_slug)
        form.add_field("widget_type", widget_type)
        form.add_field("description", "")
        form.add_field("heading", "")
        form.add_field("master_key", "")
        form.add_field("heading_en", title)
        form.add_field("heading_hi", title_hi or title)
        form.add_field("heading_bg", "")
        form.add_field("start_time", start_time)
        form.add_field("end_time", end_time)
        form.add_field("clear_bg_media", "")
        form.add_field("media_aspect_ratio", "1")
        form.add_field("view_all_action_name", "redirect-to-page")
        form.add_field("view_all_action_params", json.dumps({
            "page_type": page_type,
            "page_layout_slug_name": page_slug
        }))
        # Only include background_multimedia if multimedia was uploaded
        if multimedia_slug:
            form.add_field("background_multimedia", multimedia_slug)
        else:
            form.add_field("background_multimedia", "")
        form.add_field("filter_dict", "{}")
        form.add_field("app_configurations", "{}")

        r = await samaan_client.create_widget(form)
        if _is_error(r):
            return await _fail(step_spr, f"SPR widget {spr_slug}", r)
        await _progress(step_spr, f"Created {widget_type} widget: {spr_slug}")
        await asyncio.sleep(0.2)

        # ── Step 9 (or 10): Map Row Items → SPR Widget (state-wise) ──
        step_map = step_spr + 1
        csv_lines = ["widget_item_slug_name,level_tag,level_property,priority,cohort"]
        for i, ri in enumerate(row_slugs):
            level_tag = "global" if ri["state_key"] == "global" else "state"
            level_prop = ri["state_key"] if ri["state_key"] == "global" else _state_property(ri["state_key"])
            csv_lines.append(f"{ri['slug']},{level_tag},{level_prop},{i+1},")

        csv9 = "\n".join(csv_lines)
        r = await samaan_client.map_widget_items_with_slug(spr_slug, csv9.encode("utf-8"))
        if _is_error(r):
            return await _fail(step_map, "Map Row → SPR widget", r)
        await _progress(step_map, "Mapped Row items → SPR widget (state-wise)")

        results["status"] = "deployed"
        results["spr_slug"] = spr_slug
        results["plp_slug"] = plp_slug
        results["page_slug"] = page_slug
        results["message"] = f"Widget deployed! SPR slug: {spr_slug}"
        return results

    except Exception as e:
        results["status"] = "failed"
        results["error"] = str(e)
        return results


def _resolve_widget_type(rows: int, is_optimized: bool, has_multimedia: bool) -> str:
    """Resolve exact widget_type from 8-variant matrix."""
    matrix = {
        (1, False, False): "single_product_row",
        (1, True,  False): "single_product_row_v2",
        (1, False, True):  "multimedia_single_product_row",
        (1, True,  True):  "multimedia_single_product_row_v2",
        (2, False, False): "double_product_row",
        (2, True,  False): "double_product_row_v2",
        (2, False, True):  "multimedia_double_product_row",      # NOT AVAILABLE on backend
        (2, True,  True):  "multimedia_double_product_row_v2",
    }
    key = (rows, is_optimized, has_multimedia)
    wtype = matrix.get(key, "single_product_row_v2")

    # multimedia_double_product_row (non-optimized) is NOT AVAILABLE
    if wtype == "multimedia_double_product_row":
        wtype = "multimedia_double_product_row_v2"  # fallback to optimized

    return wtype


def _is_error(response: dict) -> bool:
    """Check if API response is an error."""
    if isinstance(response, dict):
        return "error" in response
    return False


def _state_suffix(state_key: str) -> str:
    """Convert state key to slug suffix."""
    suffix_map = {
        "global": "_global",
        "jharkhand": "_jh", "jh": "_jh",
        "chhattisgarh": "_cg", "cg": "_cg",
        "west bengal": "_wb", "wb": "_wb",
        "uttar pradesh": "_up", "up": "_up",
        "patna": "_patna",
    }
    return suffix_map.get(state_key.lower(), f"_{state_key.lower()}")


def _state_property(state_key: str) -> str:
    """Convert state key to level_property value."""
    prop_map = {
        "jh": "jharkhand", "jharkhand": "jharkhand",
        "cg": "chhattisgarh", "chhattisgarh": "chhattisgarh",
        "wb": "west bengal", "west bengal": "west bengal",
        "up": "uttar pradesh", "uttar pradesh": "uttar pradesh",
        "patna": "patna",
    }
    return prop_map.get(state_key.lower(), state_key.lower())
