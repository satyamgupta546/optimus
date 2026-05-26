# SAM MCP — Widget Types & Required Fields

---

## SPR (Single Product Row)

**Type:** `spr` | **Backend:** `single_product_row` / `single_product_row_v2`

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| title | Yes | Widget heading (English) | "Rice Sale" |
| products | Yes | Comma-separated item codes | "369,370,90513" |
| states | Yes | State list | ["JH", "CG", "WB"] |
| page_type | Yes | product_listing_page or category_page | "product_listing_page" |
| start_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-05-18 00:00:00" |
| end_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-06-18 00:00:00" |
| slug | Optional | Auto-generated from title if not given | "rice_sale" |
| is_optimized | Optional | true (default) = v2, false = standard | true |
| image | Optional | Image URL for multimedia variant | "https://..." |
| env | Required | PROD or UAT | "UAT" |

**Auto-generated:** title_hi (Hindi auto-translate), slug suffixes (_spr_opt / _spr)
**State-wise:** Sub-cat items + Row items per state
**Variants:** 7 working (standard/optimized × single/double × with/without multimedia)

---

## DPR (Double Product Row)

**Type:** `dpr` | **Backend:** `double_product_row` / `double_product_row_v2`

Same fields as SPR. Only difference: `rows=2` (auto-set when type="dpr")

---

## Banner Carousel (Scroll)

**Type:** `banner_scroll` | **Backend:** `carousel`

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| title | Yes | Widget/page heading | "Summer Sale" |
| products | Yes | Comma-separated item codes | "369,370,90513" |
| states | Yes | State list | ["JH", "CG", "WB"] |
| page_type | Yes | product_listing_page or category_page | "product_listing_page" |
| start_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-05-18 00:00:00" |
| end_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-06-18 00:00:00" |
| image | Yes | Banner image URL or local path | "https://..." |
| slug | Optional | Auto-generated if not given | "summer_sale" |
| media_number | Optional | Visible items count (default 3.5) | "3.5" |
| env | Required | PROD or UAT | "UAT" |

**Auto-generated:** title_hi, slug suffixes (_Cl_w_HP, _cl_wi, _sub_cat_wi, _plp_w, _Page_p)
**Image rules:** Carousel item = 300KB max, Sub-cat item = 50KB max (auto-compress)
**State-wise:** Sub-cat items + Carousel items per state

---

## Banner Stick (Category Grid)

**Type:** `banner_stick` | **Backend:** `category`

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| title | Yes | Category grid heading | "Sugar Collection" |
| products | Yes | Comma-separated item codes | "369,370,90513" |
| states | Yes | State list | ["JH", "CG", "WB"] |
| page_type | Yes | product_listing_page or category_page | "product_listing_page" |
| start_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-05-18 00:00:00" |
| end_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-06-18 00:00:00" |
| image | Yes | Category item image URL | "https://..." |
| slug | Optional | Auto-generated if not given | "sugar_collection" |
| env | Required | PROD or UAT | "UAT" |

**Auto-generated:** title_hi (on category items), slug suffixes (_cm_hp, _cat_wi, _sub_cat_wi, _plp_w, _Page_p)
**Image rules:** Category item = 300KB max, Sub-cat item = 50KB max
**State-wise:** Sub-cat items + Category items per state

---

## Primary Masthead

**Type:** `primary_masthead` | **Backend:** `masthead_primary`

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| slug | Yes | Unique identifier | "diwali_2024" |
| start_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-05-18 00:00:00" |
| end_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-06-18 00:00:00" |
| image | Optional | Background image URL | "https://..." |
| master_key | Optional | Category pane widget link | "1020" |
| aspect_ratio | Optional | 1 (default) | "1" |
| env | Required | PROD or UAT | "UAT" |

**Auto-generated:** slug suffixes (_pm_hp, _bg)
**Image rules:** Masthead background = 1MB max
**No products, no states, no title needed**
**Important:** background_multimedia field omitted if no image (empty string = error)

---

## Secondary Masthead

**Type:** `secondary_masthead` | **Backend:** `masthead_secondary_category_hp`

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| slug | Yes | Unique identifier | "festive_banner" |
| start_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-05-18 00:00:00" |
| end_time | Yes | YYYY-MM-DD HH:MM:SS | "2026-06-18 00:00:00" |
| image | Optional | Background banner image | "https://..." |
| master_key | Optional | Category pane link | "" |
| aspect_ratio | Optional | 4 (default) | "4" |
| carousel_items | Yes | Array of carousel items (see below) | [...] |
| env | Required | PROD or UAT | "UAT" |

### Carousel Item Fields (each item in carousel_items array)

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| title | Yes | Item heading | "Rice Products" |
| products | Yes | Comma-separated item codes | "369,370" |
| image | Optional | Carousel item image | "https://..." |
| page_type | Yes | category_page or product_listing_page | "category_page" |
| stateProducts | Optional | State-wise products | {"global": "369,370", "jharkhand": "369"} |

**Auto-generated:** title_hi per item, slug suffixes (_sm_hp, _bg, _item_N_page, _item_N_plp, _item_N_subcat_1_{state}, _item_N_carousel)
**Image rules:** Background = 1MB, Carousel item = 300KB, Sub-cat = 50KB
**State-wise:** Sub-cat items per carousel item per state

---

## Quick Reference — All Required Fields

| Widget Type | title | products | states | page_type | image | start/end | carousel_items |
|-------------|-------|----------|--------|-----------|-------|-----------|---------------|
| SPR | Yes | Yes | Yes | Yes | Optional | Yes | — |
| DPR | Yes | Yes | Yes | Yes | Optional | Yes | — |
| Banner Carousel | Yes | Yes | Yes | Yes | Yes | Yes | — |
| Banner Stick | Yes | Yes | Yes | Yes | Yes | Yes | — |
| Primary Masthead | — | — | — | — | Optional | Yes | — |
| Secondary Masthead | — | — | — | — | Optional | Yes | Yes |

---

## Image Size Limits

| Target | Max Size | Auto-compress |
|--------|----------|---------------|
| Carousel widget item | 300KB | Yes (JPEG q80) |
| Category widget item | 300KB | Yes (JPEG q80) |
| Sub-category widget item | 50KB | Yes (JPEG q80) |
| Masthead background | 1MB | Yes (JPEG q80) |
| SPR multimedia background | 1MB | Yes (JPEG q85) |

---

## States Reference

| Code | Full Name | level_property | slug_suffix |
|------|-----------|---------------|-------------|
| JH | Jharkhand | jharkhand | _jh |
| CG | Chhattisgarh | chhattisgarh | _cg |
| WB | West Bengal | west bengal | _wb |
| UP | Uttar Pradesh | uttar pradesh | _up |
| PATNA | Patna | patna | _patna |
