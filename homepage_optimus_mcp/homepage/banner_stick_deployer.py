"""
Banner Stick (Category Grid) Deployer — 9-step Samaan API flow.
Same as Carousel but with category item_type and category widget_type.

Flow:
  Step 1: Create Sub-Cat Widget Items (per state)      → POST /api/app/post_widget_item/
  Step 2: Create PLP Widget (product_listing)           → POST /api/app/widget/
  Step 3: Create Page Layout                            → POST /api/app/post_page_layout/
  Step 4: Create Category Widget Items (per state)      → POST /api/app/post_widget_item/
  Step 5: Create Category Grid Widget (category)        → POST /api/app/widget/
  Step 6: Map PLP → Page Layout                         → CSV mapping
  Step 7: Map Sub-Cat → PLP Widget                      → CSV mapping
  Step 8: Map Category Items → Category Widget          → CSV mapping
  Step 9: Map Page → Global Registry                    → CSV mapping
"""

import asyncio
import aiohttp
import json
import base64
import io

# Blank 1x1 PNG — fallback only if no image provided
BLANK_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==")


async def deploy_banner_stick(samaan_client, widget_data: dict, progress_callback=None) -> dict:
    """Deploy Banner Stick (Category Grid) widget via Samaan 9-step flow.

    Args:
        samaan_client: Authenticated SamaanClient
        widget_data: {slug, title, products, stateProducts, image, start_time, end_time}
    """
    slug = widget_data["slug"]
    title = widget_data.get("title", "")
    products = widget_data.get("products", "")
    state_products = widget_data.get("stateProducts", {"global": products})
    image = widget_data.get("image")
    start_time = widget_data.get("start_time", "")
    end_time = widget_data.get("end_time", "")

    # Base slugs (state suffix added per item)
    names = {
        "w_plp": f"{slug}_plp_w",
        "page": f"{slug}_Page_p",
        "w_cat": f"{slug}_cm_hp",
    }

    product_codes = [p.strip() for p in products.split(",") if p.strip()]

    # Auto-translate title to Hindi
    from homepage.translator import to_hindi
    title_hi = await to_hindi(title)

    results = {"steps": [], "slug": slug}
    total_steps = 9

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
        # ── Pre-step: Fetch image and prepare 2 versions ──
        img_raw = BLANK_PNG
        if image:
            try:
                if image.startswith("/") or image.startswith("file://"):
                    local_path = image.replace("file://", "")
                    with open(local_path, "rb") as f:
                        img_raw = f.read()
                else:
                    async with aiohttp.ClientSession() as img_session:
                        async with img_session.get(image, timeout=aiohttp.ClientTimeout(total=15)) as img_resp:
                            img_raw = await img_resp.read()
            except Exception as e:
                return await _fail(0, "Image fetch", {"error": str(e)})

        # Carousel item image — max 300KB
        img_carousel = _compress_image(img_raw, max_kb=300)
        # Sub-cat item image — max 50KB
        img_subcat = _compress_image(img_raw, max_kb=50)

        # ── Step 1: Sub-Cat Widget Items (per state) ──
        sub_cat_slugs = []
        for state_key, state_products_str in state_products.items():
            state_suffix = _state_suffix(state_key)
            sc_slug = f"{slug}_sub_cat_wi{state_suffix}"

            codes = [p.strip() for p in state_products_str.split(",") if p.strip()]
            codes_int = [int(c) for c in codes if str(c).strip().isdigit()]

            form = aiohttp.FormData()
            form.add_field("slug_name", sc_slug)
            form.add_field("text_en", title)
            form.add_field("text_hi", title_hi)
            form.add_field("text_bg", "")
            form.add_field("product_list", ",".join(codes))
            form.add_field("item_type", "sub_category")
            form.add_field("media_en", img_subcat, filename="subcat.jpg", content_type="image/jpeg")
            form.add_field("widget_item_id", "undefined")
            form.add_field("deactivated_flag", "no")
            form.add_field("item_click_action", "deal-detail-redirect")
            form.add_field("slave_key", "")
            form.add_field("media", "")
            form.add_field("media_hi", "")
            form.add_field("media_bg", "")
            form.add_field("filters", "[]")
            form.add_field("filter_lst", json.dumps([{"condition": "in_stk_item_codes", "value": codes_int}]))
            form.add_field("property_lst", "[]")
            form.add_field("pl_edit", "PL")
            form.add_field("is_clickable", "yes")
            form.add_field("update_product_list", "no")
            form.add_field("start_time", start_time)
            form.add_field("end_time", end_time)
            form.add_field("background_multimedia", "")
            form.add_field("image_multimedia", "")
            form.add_field("secondary_image_multimedia", "")
            form.add_field("progress_bar", "")
            form.add_field("offer_id", "")
            form.add_field("click_action_params", "{}")

            r = await samaan_client.create_widget_item(form)
            if _is_error(r):
                return await _fail(1, f"Sub-cat item {sc_slug}", r)
            sub_cat_slugs.append({"slug": sc_slug, "state_key": state_key})
            await asyncio.sleep(0.2)

        await _progress(1, f"Created {len(sub_cat_slugs)} sub-cat widget items (state-wise)")

        # ── Step 2: PLP Widget ──
        form = aiohttp.FormData()
        form.add_field("slug_name", names["w_plp"])
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
        form.add_field("media_aspect_ratio", "1")
        form.add_field("filter_dict", "{}")
        form.add_field("app_configurations", "{}")

        r = await samaan_client.create_widget(form)
        if _is_error(r):
            return await _fail(2, f"PLP widget {names['w_plp']}", r)
        await _progress(2, f"Created PLP widget: {names['w_plp']}")
        await asyncio.sleep(0.2)

        # ── Step 3: Page Layout ──
        r = await samaan_client.create_page_layout({
            "slug_name": names["page"],
            "page_heading": title,
            "page_layout_type": "2",
            "page_type": "product_listing_page",
        })
        if _is_error(r):
            return await _fail(3, f"Page layout {names['page']}", r)
        await _progress(3, f"Created page layout: {names['page']}")
        await asyncio.sleep(0.2)

        # ── Step 4: Category Widget Items (per state, with image) ──
        click_params = json.dumps({"page_type": "product_listing_page", "page_layout_slug_name": names["page"]})

        category_slugs = []
        for state_key in state_products.keys():
            state_suffix = _state_suffix(state_key)
            cat_slug = f"{slug}_cat_wi{state_suffix}"

            form = aiohttp.FormData()
            form.add_field("widget_item_id", "undefined")
            form.add_field("deactivated_flag", "no")
            form.add_field("item_click_action", "redirect-to-page")
            form.add_field("slug_name", cat_slug)
            form.add_field("slave_key", "")
            form.add_field("item_type", "category")
            form.add_field("media", "")
            form.add_field("text_en", title)
            form.add_field("media_en", img_carousel, filename="category.jpg", content_type="image/jpeg")
            form.add_field("text_hi", title_hi)
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
            form.add_field("background_multimedia", "")
            form.add_field("image_multimedia", "")
            form.add_field("secondary_image_multimedia", "")
            form.add_field("progress_bar", "")
            form.add_field("offer_id", "")
            form.add_field("click_action_params", click_params)

            r = await samaan_client.create_widget_item(form)
            if _is_error(r):
                return await _fail(4, f"Category item {cat_slug}", r)
            category_slugs.append({"slug": cat_slug, "state_key": state_key})
            await asyncio.sleep(0.2)

        await _progress(4, f"Created {len(category_slugs)} category widget items (state-wise)")

        # ── Step 5: Category Grid Widget ──
        form = aiohttp.FormData()
        form.add_field("slug_name", names["w_cat"])
        form.add_field("widget_type", "category")
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
        form.add_field("app_configurations", "{}")

        r = await samaan_client.create_widget(form)
        if _is_error(r):
            return await _fail(5, f"Category grid widget {names['w_cat']}", r)
        await _progress(5, f"Created category grid widget: {names['w_cat']}")
        await asyncio.sleep(0.2)

        # ── Step 6: Map PLP → Page Layout ──
        csv6 = f"widget_slug_name,level_tag,level_property,priority,cohort\n{names['w_plp']},global,global,1,"
        r = await samaan_client.map_layout_widget_with_slug(names["page"], csv6.encode("utf-8"))
        if _is_error(r):
            return await _fail(6, "Map PLP → Page", r)
        await _progress(6, "Mapped PLP → Page layout")
        await asyncio.sleep(0.2)

        # ── Step 7: Map Sub-Cats → PLP Widget (state-wise) ──
        csv_lines = ["widget_item_slug_name,level_tag,level_property,priority,cohort"]
        for i, sc in enumerate(sub_cat_slugs):
            level_tag = "global" if sc["state_key"] == "global" else "state"
            level_prop = sc["state_key"] if sc["state_key"] == "global" else _state_property(sc["state_key"])
            csv_lines.append(f"{sc['slug']},{level_tag},{level_prop},{i+1},")
        r = await samaan_client.map_widget_items_with_slug(names["w_plp"], "\n".join(csv_lines).encode("utf-8"))
        if _is_error(r):
            return await _fail(7, "Map Sub-Cats → PLP", r)
        await _progress(7, f"Mapped {len(sub_cat_slugs)} Sub-Cats → PLP widget (state-wise)")
        await asyncio.sleep(0.2)

        # ── Step 8: Map Category Items → Category Widget (state-wise) ──
        csv_lines = ["widget_item_slug_name,level_tag,level_property,priority,cohort"]
        for i, cat in enumerate(category_slugs):
            level_tag = "global" if cat["state_key"] == "global" else "state"
            level_prop = cat["state_key"] if cat["state_key"] == "global" else _state_property(cat["state_key"])
            csv_lines.append(f"{cat['slug']},{level_tag},{level_prop},{i+1},")
        r = await samaan_client.map_widget_items_with_slug(names["w_cat"], "\n".join(csv_lines).encode("utf-8"))
        if _is_error(r):
            return await _fail(8, "Map Category Items → Category Widget", r)
        await _progress(8, f"Mapped {len(category_slugs)} Category Items → Category Widget (state-wise)")
        await asyncio.sleep(0.2)

        # ── Step 9: Map Page → Global Registry ──
        csv9 = "level_tag,level_property\nglobal,global"
        r = await samaan_client.map_page_layout_with_slug(names["page"], "", csv9.encode("utf-8"))
        if _is_error(r):
            return await _fail(9, "Map Page → Global", r)
        await _progress(9, "Mapped Page → Global registry")

        results["status"] = "deployed"
        results["category_slug"] = names["w_cat"]
        results["plp_slug"] = names["w_plp"]
        results["page_slug"] = names["page"]
        results["message"] = f"Category Grid deployed! Slug: {names['w_cat']}"
        return results

    except Exception as e:
        results["status"] = "failed"
        results["error"] = str(e)
        return results


def _compress_image(img_bytes: bytes, max_kb: int = 300) -> bytes:
    """Compress image to under max_kb. Returns JPEG bytes."""
    if len(img_bytes) <= max_kb * 1024:
        return img_bytes

    from PIL import Image as PILImage
    pil_img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")

    for factor in [0.7, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1]:
        new_w = int(pil_img.width * factor)
        new_h = int(pil_img.height * factor)
        if new_w < 10 or new_h < 10:
            break
        resized = pil_img.resize((new_w, new_h), PILImage.LANCZOS)
        buf = io.BytesIO()
        resized.save(buf, "JPEG", quality=80)
        result = buf.getvalue()
        if len(result) <= max_kb * 1024:
            return result

    # Last resort — lowest quality
    buf = io.BytesIO()
    pil_img.resize((100, 100), PILImage.LANCZOS).save(buf, "JPEG", quality=50)
    return buf.getvalue()


def _is_error(response: dict) -> bool:
    if isinstance(response, dict):
        return "error" in response
    return False


def _state_suffix(state_key: str) -> str:
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
    prop_map = {
        "jh": "jharkhand", "jharkhand": "jharkhand",
        "cg": "chhattisgarh", "chhattisgarh": "chhattisgarh",
        "wb": "west bengal", "west bengal": "west bengal",
        "up": "uttar pradesh", "uttar pradesh": "uttar pradesh",
        "patna": "patna",
    }
    return prop_map.get(state_key.lower(), state_key.lower())
