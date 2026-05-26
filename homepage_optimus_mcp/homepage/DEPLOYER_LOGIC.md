# SAM MCP — Widget Deployer Logic

## SPR / DPR Deployer (`clients/spr_deployer.py`)

### 8-Variant Matrix
| # | Rows | Optimized | Multimedia | widget_type | Status |
|---|------|-----------|------------|-------------|--------|
| 1 | 1 | false | false | `single_product_row` | Working |
| 2 | 1 | true | false | `single_product_row_v2` | Working |
| 3 | 1 | false | true | `multimedia_single_product_row` | Working |
| 4 | 1 | true | true | `multimedia_single_product_row_v2` | Working |
| 5 | 2 | false | false | `double_product_row` | Working |
| 6 | 2 | true | false | `double_product_row_v2` | Working |
| 7 | 2 | false | true | `multimedia_double_product_row` | NOT AVAILABLE |
| 8 | 2 | true | true | `multimedia_double_product_row_v2` | UAT rejected |

### 9-Step Flow (10 with multimedia)

```
Step 1: Create Sub-Cat Widget Items (per state)
  - slug: {base}_sc_wi_{state_suffix}
  - item_type: sub_category
  - media_en: blank 1x1 PNG
  - filter_lst: [{"condition": "in_stk_item_codes", "value": [int codes]}]
  - State-wise: global + JH + CG + WB etc.

Step 2: Create PLP Widget
  - slug: {base}_plp_w
  - widget_type: product_listing
  - Required empty fields: description, master_key, clear_bg_media, view_all_action_name, background_multimedia

Step 3: Create Page Layout
  - slug: {base}_page_p
  - page_type: product_listing_page
  - page_layout_type: "2" (string, not int)
  - Content-Type: application/json

Step 4: Map Sub-Cats → PLP Widget (state-wise CSV)
  - widget_slug in form body
  - CSV: widget_item_slug_name, level_tag, level_property, priority, cohort

Step 5: Map PLP → Page Layout
  - page_layout_slug in form body

Step 6: Map Page → Global Registry
  - page_layout_slug + page_type in form body
  - CSV: level_tag, level_property

Step 7: Create Row Widget Items (per state)
  - slug: {base}_pr_wi_{state_suffix}
  - item_type: item_rows
  - media_en: empty string (not file)
  - State-wise products

Step 7.5 (multimedia only): Upload Multimedia Background
  - slug: {base}_bg
  - multimedia_type: "3" (image)
  - Auto-compress to under 1MB

Step 8: Create Homepage SPR/DPR Widget
  - slug: {base}_spr_opt (optimized) or {base}_spr (standard)
  - widget_type: resolved from matrix
  - view_all_action_params: {"page_type": "...", "page_layout_slug_name": "..."}
  - background_multimedia: only if multimedia, otherwise empty string

Step 9: Map Row Items → SPR Widget (state-wise CSV)
```

### Auth — Critical Details
- CSRF token must be in BOTH `X-CSRFToken` header AND `csrfmiddlewaretoken` form body field
- Explicit `Cookie` header with `csrftoken` + `sessionid`
- `Referer` header required
- Auto re-login on 403

### Image Rules
- Sub-cat items: blank 1x1 PNG
- Row items: media_en = empty string
- Multimedia background: auto-compress to under 1MB (JPEG, LANCZOS resize)

---

## Banner Carousel Deployer (`clients/banner_carousel_deployer.py`)

### 9-Step Flow

```
Step 0 (pre): Fetch image → compress to 2 versions
  - Carousel version: max 300KB
  - Sub-cat version: max 50KB

Step 1: Create Sub-Cat Widget Items (per state)
  - slug: {base}_sub_cat_wi_{state_suffix}
  - media_en: user's image compressed to 50KB
  - Same image for all states

Step 2: Create PLP Widget
  - slug: {base}_plp_w
  - widget_type: product_listing

Step 3: Create Page Layout
  - slug: {base}_Page_p (capital P — matches GAS script)

Step 4: Create Carousel Widget Items (per state)
  - slug: {base}_cl_wi_{state_suffix}
  - item_type: carousel
  - media_en: user's image compressed to 300KB
  - click_action_params: {"page_type": "product_listing_page", "page_layout_slug_name": "{base}_Page_p"}
  - Same image for all states

Step 5: Create Carousel Widget
  - slug: {base}_Cl_w_HP (capital C — matches GAS script)
  - widget_type: carousel
  - media_aspect_ratio: media_number (default 3.5)

Step 6: Map PLP → Page Layout
Step 7: Map Sub-Cats → PLP Widget (state-wise CSV)
Step 8: Map Carousel Items → Carousel Widget (state-wise CSV)
Step 9: Map Page → Global Registry
```

### Image Compression
| Target | Max Size | Method |
|--------|----------|--------|
| Carousel item | 300KB | JPEG q80, LANCZOS resize |
| Sub-cat item | 50KB | JPEG q80, LANCZOS resize (smaller) |
| Masthead bg | 1MB | JPEG q85, LANCZOS resize |

---

## Primary Masthead Deployer (`clients/masthead_deployer.py` → `deploy_primary_masthead`)

### 2-Step Flow
```
Step 1 (optional): Upload Multimedia Background
  - slug: {base}_bg
  - POST /api/app/multimedia/
  - Auto-compress image to 1MB
  - ONLY if image provided

Step 2: Create Primary Masthead Widget
  - slug: {base}_pm_hp
  - widget_type: masthead_primary
  - master_key: optional (links to category pane)
  - background_multimedia: ONLY include if multimedia uploaded (empty string = error)
  - No heading fields needed
```

---

## Secondary Masthead Deployer (`clients/masthead_deployer.py` → `deploy_secondary_masthead`)

### Multi-Phase Flow
```
Phase 1: Parent containers
  Step 1: Upload Multimedia Background → {base}_bg
  Step 2: Create SM Widget → {base}_sm_hp (masthead_secondary_category_hp)

Phase 2: Per carousel item (repeat for each)
  Step A: Create Page Layout → {base}_item_{n}_page
  Step B: Create PLP Widget → {base}_item_{n}_plp (show_sub_cat: true)
  Step C: Create Sub-Cat Items (state-wise) → {base}_item_{n}_subcat_1_{state}
  Step D: Map Sub-cats → PLP, PLP → Page, Page → Global
  Step E: Create Carousel Widget Item → {base}_item_{n}_carousel

Phase 3: Final mapping
  Map all carousel items → SM Widget (global mapping)
```

### Carousel Item Fields
- title/text — heading for the page
- products — comma-separated item codes
- stateProducts — state-wise product mapping
- image — carousel item image (300KB), sub-cat image (50KB)
- page_type — per-item: category_page or product_listing_page

### Key Differences from Banner Carousel
- Secondary Masthead has its own multimedia background (banner-level)
- Each carousel item creates a FULL page ecosystem (page + PLP + sub-cats + mappings)
- Sub-cat item_click_action = "null" (not "deal-detail-redirect")
- PLP gets `show_sub_cat: true` in app_configurations
- Hindi auto-translate on sub-cat text_hi

---

## Samaan Client (`clients/samaan_client.py`)

### Auth Flow
```
1. GET /login/ → csrftoken cookie (via cookie jar)
2. POST /login/ → sessionid cookie
3. All API calls: X-CSRFToken header + csrfmiddlewaretoken body + Cookie header
```

### Environments
| Env | URL | Username |
|-----|-----|----------|
| PROD | samaan.apnamart.in | Automation / Qwerty@123 |
| UAT | smapi-cu.apnamart.in | vicky.das / qwerty@123 |

### Mapping Methods
- `map_widget_items_with_slug(widget_slug, csv)` — includes `widget_slug` in form body
- `map_layout_widget_with_slug(page_layout_slug, csv)` — includes `page_layout_slug`
- `map_page_layout_with_slug(page_layout_slug, page_type, csv)` — includes both

---

## Hindi Auto-Translate (`clients/translator.py`)

- Uses Google Translate free API (no key, no library)
- English → Hindi translation via `translate.googleapis.com`
- Cache enabled — same text translated only once
- Applied to: sub-cat `text_hi`, category `text_hi`, SPR/DPR `heading_hi`, Banner Carousel sub-cat `text_hi`
- NOT applied to: multimedia widgets
- Fallback: empty string if translate fails (don't block widget creation)

---

## State Mapping Reference

| State | level_tag | level_property | slug_suffix |
|-------|-----------|----------------|-------------|
| Global | global | global | _global |
| Jharkhand | state | jharkhand | _jh |
| Chhattisgarh | state | chhattisgarh | _cg |
| West Bengal | state | west bengal | _wb |
| Uttar Pradesh | state | uttar pradesh | _up |
| Patna | state | patna | _patna |
