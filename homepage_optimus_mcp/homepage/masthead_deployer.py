"""
Masthead Deployer — Primary (2-step) + Secondary (multi-phase) via Samaan API.

Primary: Multimedia upload (optional) → Widget create
Secondary: Multimedia → Widget → Per carousel item (Page + PLP + Sub-cats + Carousel item) → Final mapping
"""

import asyncio
import aiohttp
import json
import base64
import io

BLANK_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==")


async def deploy_primary_masthead(samaan_client, widget_data: dict, progress_callback=None) -> dict:
    """Deploy Primary Masthead — 2 steps: multimedia + widget."""
    slug = widget_data["slug"]
    master_key = widget_data.get("master_key", "")
    image = widget_data.get("image")
    start_time = widget_data.get("start_time", "")
    end_time = widget_data.get("end_time", "")
    aspect_ratio = widget_data.get("aspect_ratio", "1")

    widget_slug = f"{slug}_pm_hp"
    mm_slug = f"{slug}_bg"

    results = {"steps": [], "slug": slug}
    total_steps = 2 if image else 1

    async def _progress(step, msg):
        results["steps"].append({"step": step, "message": msg, "status": "ok"})

    async def _fail(step, msg, error):
        results["steps"].append({"step": step, "message": msg, "status": "failed", "error": str(error)})
        results["status"] = "failed"
        results["error"] = f"Step {step}/{total_steps} failed: {msg} — {error}"
        return results

    try:
        # ── Step 1 (optional): Upload Multimedia Background ──
        background_multimedia = ""
        if image:
            img_bytes = await _fetch_and_compress(image, max_kb=1024)
            if img_bytes is None:
                return await _fail(1, "Image fetch failed", {"error": "Could not load image"})

            form = aiohttp.FormData()
            form.add_field("name", mm_slug)
            form.add_field("multimedia_type", "3")
            form.add_field("background_color", "")
            form.add_field("aspect_ratio", aspect_ratio)
            form.add_field("transition_color", "#FFFFFF")
            form.add_field("accent_color", "#0000FF")
            form.add_field("text_color", "#FFFFFF")
            form.add_field("icon_bg_color", "#F0F0F0")
            form.add_field("is_multimedia_dark", "false")
            form.add_field("file_en", img_bytes, filename="bg.jpg", content_type="image/jpeg")

            r = await samaan_client.upload_multimedia(form)
            if _is_error(r):
                return await _fail(1, f"Multimedia {mm_slug}", r)
            background_multimedia = mm_slug
            await _progress(1, f"Uploaded multimedia: {mm_slug}")
            await asyncio.sleep(0.2)

        # ── Step 2: Create Primary Masthead Widget ──
        step_num = 2 if image else 1
        form = aiohttp.FormData()
        form.add_field("slug_name", widget_slug)
        form.add_field("widget_type", "masthead_primary")
        form.add_field("description", "")
        form.add_field("heading", "")
        form.add_field("master_key", master_key)
        form.add_field("heading_en", "")
        form.add_field("heading_hi", "")
        form.add_field("heading_bg", "")
        form.add_field("start_time", start_time)
        form.add_field("end_time", end_time)
        form.add_field("clear_bg_media", "")
        form.add_field("media_aspect_ratio", aspect_ratio)
        form.add_field("view_all_action_name", "")
        form.add_field("filter_dict", "{}")
        form.add_field("app_configurations", "{}")
        # Only include if we have a valid slug — empty string causes error
        if background_multimedia:
            form.add_field("background_multimedia", background_multimedia)

        r = await samaan_client.create_widget(form)
        if _is_error(r):
            return await _fail(step_num, f"Primary Masthead {widget_slug}", r)
        await _progress(step_num, f"Created Primary Masthead: {widget_slug}")

        results["status"] = "deployed"
        results["masthead_slug"] = widget_slug
        results["message"] = f"Primary Masthead deployed! Slug: {widget_slug}"
        return results

    except Exception as e:
        results["status"] = "failed"
        results["error"] = str(e)
        return results


async def deploy_secondary_masthead(samaan_client, widget_data: dict, progress_callback=None) -> dict:
    """Deploy Secondary Masthead — multi-phase: multimedia → widget → carousel items → mappings."""
    slug = widget_data["slug"]
    image = widget_data.get("image")
    carousel_items = widget_data.get("carousel_items", [])
    master_key = widget_data.get("master_key", "")
    start_time = widget_data.get("start_time", "")
    end_time = widget_data.get("end_time", "")
    aspect_ratio = widget_data.get("aspect_ratio", "4")

    widget_slug = f"{slug}_sm_hp"
    mm_slug = f"{slug}_bg"

    results = {"steps": [], "slug": slug}

    async def _progress(step, msg):
        results["steps"].append({"step": step, "message": msg, "status": "ok"})

    async def _fail(step, msg, error):
        results["steps"].append({"step": step, "message": msg, "status": "failed", "error": str(error)})
        results["status"] = "failed"
        results["error"] = f"Step {step} failed: {msg} — {error}"
        return results

    try:
        step = 1

        # ── Phase 1: Multimedia + Widget ──

        # Step 1: Multimedia background
        background_multimedia = ""
        if image:
            img_bytes = await _fetch_and_compress(image, max_kb=1024)
            if img_bytes is None:
                return await _fail(step, "Image fetch failed", {"error": "Could not load image"})

            form = aiohttp.FormData()
            form.add_field("name", mm_slug)
            form.add_field("multimedia_type", "3")
            form.add_field("background_color", "")
            form.add_field("aspect_ratio", aspect_ratio)
            form.add_field("transition_color", "#FFFFFF")
            form.add_field("accent_color", "#0277FA")
            form.add_field("text_color", "")
            form.add_field("icon_bg_color", "#F0F0F0")
            form.add_field("is_multimedia_dark", "false")
            form.add_field("file_en", img_bytes, filename="bg.jpg", content_type="image/jpeg")

            r = await samaan_client.upload_multimedia(form)
            if _is_error(r):
                return await _fail(step, f"Multimedia {mm_slug}", r)
            background_multimedia = mm_slug
            await _progress(step, f"Uploaded multimedia: {mm_slug}")
            step += 1
            await asyncio.sleep(0.2)

        # Step 2: Secondary Masthead Widget
        form = aiohttp.FormData()
        form.add_field("slug_name", widget_slug)
        form.add_field("widget_type", "masthead_secondary_category_hp")
        form.add_field("description", "")
        form.add_field("heading", "")
        form.add_field("master_key", master_key)
        form.add_field("heading_en", "")
        form.add_field("heading_hi", "")
        form.add_field("heading_bg", "")
        form.add_field("start_time", start_time)
        form.add_field("end_time", end_time)
        form.add_field("clear_bg_media", "")
        form.add_field("media_aspect_ratio", aspect_ratio)
        form.add_field("view_all_action_name", "")
        form.add_field("filter_dict", "{}")
        form.add_field("app_configurations", "{}")
        if background_multimedia:
            form.add_field("background_multimedia", background_multimedia)

        r = await samaan_client.create_widget(form)
        if _is_error(r):
            return await _fail(step, f"Secondary Masthead {widget_slug}", r)
        await _progress(step, f"Created Secondary Masthead: {widget_slug}")
        step += 1
        await asyncio.sleep(0.2)

        # ── Phase 2: Per Carousel Item ──
        carousel_item_slugs = []

        for i, item in enumerate(carousel_items):
            item_slug_base = f"{slug}_item_{i+1}"
            page_slug = f"{item_slug_base}_page"
            plp_slug = f"{item_slug_base}_plp"
            carousel_slug = f"{item_slug_base}_carousel"
            heading = item.get("title", item.get("text", "Category"))
            item_products = item.get("products", "")
            item_image = item.get("image")
            page_type = item.get("page_type", "category_page")

            from homepage.translator import to_hindi
            heading_hi = to_hindi(heading)

            # Step A: Page Layout
            r = await samaan_client.create_page_layout({
                "slug_name": page_slug,
                "page_type": page_type,
                "page_heading": heading,
                "page_layout_type": "2",
            })
            if _is_error(r):
                return await _fail(step, f"Page layout {page_slug}", r)
            await _progress(step, f"Item {i+1}: Page layout {page_slug}")
            step += 1
            await asyncio.sleep(0.2)

            # Step B: PLP Widget
            form = aiohttp.FormData()
            form.add_field("slug_name", plp_slug)
            form.add_field("widget_type", "product_listing")
            form.add_field("description", "")
            form.add_field("heading", "")
            form.add_field("master_key", "")
            form.add_field("heading_en", "")
            form.add_field("heading_hi", "")
            form.add_field("heading_bg", "")
            form.add_field("start_time", start_time)
            form.add_field("end_time", end_time)
            form.add_field("clear_bg_media", "")
            form.add_field("media_aspect_ratio", "1")
            form.add_field("view_all_action_name", "")
            form.add_field("background_multimedia", "")
            form.add_field("filter_dict", "{}")
            form.add_field("app_configurations", json.dumps({"show_sub_cat": True}))
            form.add_field("configurations", "{}")
            form.add_field("deactivated_flag", "no")

            r = await samaan_client.create_widget(form)
            if _is_error(r):
                return await _fail(step, f"PLP widget {plp_slug}", r)
            await _progress(step, f"Item {i+1}: PLP widget {plp_slug}")
            step += 1
            await asyncio.sleep(0.2)

            # Step C: Sub-cat items (state-wise from item products)
            state_products = item.get("stateProducts", {"global": item_products})
            sub_cat_slugs = []
            for state_key, state_prods in state_products.items():
                if not state_prods or not state_prods.strip():
                    continue
                state_suffix = _state_suffix(state_key)
                sc_slug = f"{item_slug_base}_subcat_1{state_suffix}"
                codes = [p.strip() for p in state_prods.split(",") if p.strip()]
                codes_int = [int(p) for p in codes if p.isdigit()]

                sc_image = BLANK_PNG
                if item_image:
                    fetched = await _fetch_and_compress(item_image, max_kb=50)
                    if fetched:
                        sc_image = fetched

                form = aiohttp.FormData()
                form.add_field("widget_item_id", "undefined")
                form.add_field("deactivated_flag", "no")
                form.add_field("item_click_action", "null")
                form.add_field("slug_name", sc_slug)
                form.add_field("slave_key", "")
                form.add_field("item_type", "sub_category")
                form.add_field("media", "")
                form.add_field("text_en", heading)
                form.add_field("media_en", sc_image, filename="subcat.jpg", content_type="image/jpeg")
                form.add_field("text_hi", heading_hi)
                form.add_field("media_hi", "")
                form.add_field("text_bg", "")
                form.add_field("media_bg", "")
                form.add_field("product_list", ",".join(codes))
                form.add_field("filters", "[]")
                form.add_field("filter_lst", json.dumps([{"condition": "in_stk_item_codes", "value": codes_int}]))
                form.add_field("property_lst", "[]")
                form.add_field("pl_edit", "PL")
                form.add_field("is_clickable", "yes")
                form.add_field("update_product_list", "no")
                form.add_field("start_time", start_time)
                form.add_field("end_time", end_time)
                form.add_field("click_action_params", "{}")
                form.add_field("background_multimedia", "")
                form.add_field("image_multimedia", "")
                form.add_field("secondary_image_multimedia", "")
                form.add_field("progress_bar", "")
                form.add_field("offer_id", "")

                r = await samaan_client.create_widget_item(form)
                if _is_error(r):
                    return await _fail(step, f"Sub-cat {sc_slug}", r)
                sub_cat_slugs.append({"slug": sc_slug, "state_key": state_key})
                await asyncio.sleep(0.2)

            await _progress(step, f"Item {i+1}: {len(sub_cat_slugs)} sub-cats (state-wise)")
            step += 1

            # Step D: Map Sub-cats → PLP
            csv_lines = ["widget_item_slug_name,level_tag,level_property,priority,cohort"]
            for idx, sc in enumerate(sub_cat_slugs):
                tag = "global" if sc["state_key"] == "global" else "state"
                prop = sc["state_key"] if sc["state_key"] == "global" else _state_property(sc["state_key"])
                csv_lines.append(f"{sc['slug']},{tag},{prop},{idx+1},")
            r = await samaan_client.map_widget_items_with_slug(plp_slug, "\n".join(csv_lines).encode())
            if _is_error(r):
                return await _fail(step, f"Map sub-cats → PLP", r)

            # Map PLP → Page
            csv_plp = f"widget_slug_name,level_tag,level_property,priority,cohort\n{plp_slug},global,global,1,"
            await samaan_client.map_layout_widget_with_slug(page_slug, csv_plp.encode())

            # Map Page → Global
            csv_page = "level_tag,level_property\nglobal,global"
            await samaan_client.map_page_layout_with_slug(page_slug, "", csv_page.encode())

            await _progress(step, f"Item {i+1}: All mappings done")
            step += 1
            await asyncio.sleep(0.2)

            # Step E: Carousel Widget Item
            ci_image = BLANK_PNG
            if item_image:
                fetched = await _fetch_and_compress(item_image, max_kb=300)
                if fetched:
                    ci_image = fetched

            form = aiohttp.FormData()
            form.add_field("widget_item_id", "undefined")
            form.add_field("deactivated_flag", "no")
            form.add_field("item_click_action", "redirect-to-page")
            form.add_field("slug_name", carousel_slug)
            form.add_field("slave_key", "")
            form.add_field("item_type", "carousel")
            form.add_field("media", "")
            form.add_field("text_en", "")
            form.add_field("media_en", ci_image, filename="carousel.jpg", content_type="image/jpeg")
            form.add_field("text_hi", "")
            form.add_field("media_hi", "")
            form.add_field("text_bg", "")
            form.add_field("media_bg", "")
            form.add_field("product_list", "")
            form.add_field("filters", "[]")
            form.add_field("filter_lst", "[]")
            form.add_field("property_lst", "[]")
            form.add_field("pl_edit", "PL")
            form.add_field("is_clickable", "yes")
            form.add_field("update_product_list", "no")
            form.add_field("start_time", start_time)
            form.add_field("end_time", end_time)
            form.add_field("click_action_params", json.dumps({
                "page_type": page_type,
                "page_layout_slug_name": page_slug
            }))
            form.add_field("background_multimedia", "")
            form.add_field("image_multimedia", "")
            form.add_field("secondary_image_multimedia", "")
            form.add_field("progress_bar", "")
            form.add_field("offer_id", "")

            r = await samaan_client.create_widget_item(form)
            if _is_error(r):
                return await _fail(step, f"Carousel item {carousel_slug}", r)
            carousel_item_slugs.append(carousel_slug)
            await _progress(step, f"Item {i+1}: Carousel item {carousel_slug}")
            step += 1
            await asyncio.sleep(0.2)

        # ── Phase 3: Map all carousel items → SM Widget ──
        if carousel_item_slugs:
            csv_lines = ["widget_item_slug_name,level_tag,level_property,priority,cohort"]
            for idx, ci_slug in enumerate(carousel_item_slugs):
                csv_lines.append(f"{ci_slug},global,global,{idx+1},")
            r = await samaan_client.map_widget_items_with_slug(widget_slug, "\n".join(csv_lines).encode())
            if _is_error(r):
                return await _fail(step, "Map carousel items → SM widget", r)
            await _progress(step, f"Mapped {len(carousel_item_slugs)} carousel items → SM widget")

        results["status"] = "deployed"
        results["masthead_slug"] = widget_slug
        results["message"] = f"Secondary Masthead deployed! Slug: {widget_slug}"
        return results

    except Exception as e:
        results["status"] = "failed"
        results["error"] = str(e)
        return results


async def _fetch_and_compress(image: str, max_kb: int = 1024) -> bytes:
    """Fetch image from URL or local path, compress if needed."""
    try:
        if image.startswith("/") or image.startswith("file://"):
            local_path = image.replace("file://", "")
            with open(local_path, "rb") as f:
                img_bytes = f.read()
        else:
            async with aiohttp.ClientSession() as session:
                async with session.get(image, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    img_bytes = await resp.read()

        if len(img_bytes) > max_kb * 1024:
            from PIL import Image as PILImage
            pil_img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
            for factor in [0.7, 0.5, 0.4, 0.3, 0.2, 0.15]:
                new_w = int(pil_img.width * factor)
                new_h = int(pil_img.height * factor)
                if new_w < 10:
                    break
                resized = pil_img.resize((new_w, new_h), PILImage.LANCZOS)
                buf = io.BytesIO()
                resized.save(buf, "JPEG", quality=80)
                img_bytes = buf.getvalue()
                if len(img_bytes) <= max_kb * 1024:
                    break
        return img_bytes
    except:
        return None


def _is_error(response: dict) -> bool:
    if isinstance(response, dict):
        return "error" in response
    return False


def _state_suffix(state_key: str) -> str:
    suffix_map = {
        "global": "_global", "jharkhand": "_jh", "jh": "_jh",
        "chhattisgarh": "_cg", "cg": "_cg", "west bengal": "_wb", "wb": "_wb",
        "uttar pradesh": "_up", "up": "_up", "patna": "_patna",
    }
    return suffix_map.get(state_key.lower(), f"_{state_key.lower()}")


def _state_property(state_key: str) -> str:
    prop_map = {
        "jh": "jharkhand", "jharkhand": "jharkhand", "cg": "chhattisgarh",
        "chhattisgarh": "chhattisgarh", "wb": "west bengal", "west bengal": "west bengal",
        "up": "uttar pradesh", "uttar pradesh": "uttar pradesh", "patna": "patna",
    }
    return prop_map.get(state_key.lower(), state_key.lower())
