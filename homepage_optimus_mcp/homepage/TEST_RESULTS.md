# SAM MCP — Test Results

## Date: 2026-05-17 → 2026-05-18

---

## SPR / DPR All Variants — UAT

Products: 369, 370, 90513 | States: JH, CG, WB | Page: product_listing_page

### Non-Multimedia Variants

| # | Variant | widget_type | Slug | Steps | Status |
|---|---------|-------------|------|-------|--------|
| 1 | SPR Standard | `single_product_row` | `sam_all_test_spr_std_spr` | 9/9 | DEPLOYED |
| 2 | SPR Optimized (v2) | `single_product_row_v2` | `sam_all_test_spr_opt_spr_opt` | 9/9 | DEPLOYED |
| 3 | DPR Standard | `double_product_row` | `sam_all_test_dpr_std_spr` | 9/9 | DEPLOYED |
| 4 | DPR Optimized (v2) | `double_product_row_v2` | `sam_all_test_dpr_opt_spr_opt` | 9/9 | DEPLOYED |

### Multimedia Variants

Image: Malamaal Thursday banner (7.7MB original → 818KB compressed)

| # | Variant | widget_type | Slug | Steps | Status |
|---|---------|-------------|------|-------|--------|
| 5 | MM SPR Standard | `multimedia_single_product_row` | `sam_mm_spr_std_spr` | 10/10 | DEPLOYED |
| 6 | MM SPR Optimized | `multimedia_single_product_row_v2` | `sam_mm_spr_opt_spr_opt` | 10/10 | DEPLOYED |
| 7 | MM DPR Standard | `multimedia_double_product_row` | — | — | NOT AVAILABLE (backend) |
| 8 | MM DPR Optimized | `multimedia_double_product_row_v2` | — | FAIL | widget_type not valid on UAT |

### Hindi Auto-Translate Tests

| Title (EN) | Title (HI) | Widget | Status |
|-----------|-----------|--------|--------|
| Grocery Essentials | किराना आवश्यक वस्तुएँ | SPR | ✅ |
| Summer Sale | समर सेल | Banner Carousel | ✅ |
| Sugar Collection | (auto) | Category Grid | ✅ |
| Rice Products | (auto) | Secondary Masthead Item | ✅ |

---

## PROD Tests

| Variant | Slug | Status |
|---------|------|--------|
| SPR Optimized (v2) | `test_prod_sam_satyam_spr_opt` | DEPLOYED (via Claude Desktop) |
| MM SPR Standard | `sam_mm_spr_std_prod_spr` | DEPLOYED (10/10) |

---

## Banner Carousel (Scroll) — UAT

| Test | Slug | Image Source | Steps | Status |
|------|------|-------------|-------|--------|
| Banner Carousel (local image) | `sam_banner_v2_Cl_w_HP` | Malamaal Thursday (local file) | 9/9 | DEPLOYED |
| Banner Carousel (catalog image) | `sam_sugar_banner_v1_Cl_w_HP` | Product 369 from Metabase | 9/9 | DEPLOYED |
| Banner Carousel (Hindi test) | `sam_hindi_test_banner_Cl_w_HP` | Product 369 from catalog | 9/9 | DEPLOYED |

- Sub-cat items: state-wise, same image compressed to 50KB
- Carousel items: state-wise, same image compressed to 300KB
- Hindi auto-translate on sub-cat text_hi

---

## Banner Stick (Category Grid) — UAT

| Test | Slug | Image Source | Steps | Status |
|------|------|-------------|-------|--------|
| Category Grid | `sam_catgrid_test_v2_cm_hp` | Product 369 from catalog | 9/9 | DEPLOYED |

- Category items: state-wise, text_en + text_hi (auto Hindi), image 300KB
- Sub-cat items: state-wise, image 50KB

---

## Primary Masthead — UAT

| Test | Slug | Steps | Status |
|------|------|-------|--------|
| Primary Masthead (with image) | `sam_pm_test_pm_hp` | 2/2 | DEPLOYED |

- Step 1: Multimedia background uploaded (auto-compress to 1MB)
- Step 2: Widget created with `masthead_primary` type
- `background_multimedia` field only included if multimedia slug exists (empty string causes error)

---

## Secondary Masthead — UAT

| Test | Slug | Carousel Items | Steps | Status |
|------|------|---------------|-------|--------|
| Secondary Masthead (2 items) | `sam_sm_test_sm_hp` | 2 | 13/13 | DEPLOYED |

Carousel Item 1: "Rice Products"
- page_type: category_page
- 3 sub-cats (global + JH + CG), state-wise
- Hindi auto-translate ✅

Carousel Item 2: "Sugar Items"
- page_type: product_listing_page
- 2 sub-cats (global + JH), state-wise
- Hindi auto-translate ✅

Flow:
```
Phase 1: Multimedia + SM Widget (2 steps)
Phase 2: Per carousel item (page + PLP + sub-cats + mappings + carousel item)
Phase 3: Map all carousel items → SM Widget
```

---

## Image Compression Summary

| Target | Max Size | Method |
|--------|----------|--------|
| Masthead background | 1MB | JPEG q80, LANCZOS resize |
| Carousel widget item | 300KB | JPEG q80, LANCZOS resize |
| Category widget item | 300KB | JPEG q80, LANCZOS resize |
| Sub-cat widget item | 50KB | JPEG q80, LANCZOS resize |
| SPR multimedia bg | 1MB | JPEG q85, LANCZOS resize |

Original test image: 7.7MB (6000x6000 PNG) → compressed per target size automatically.

---

## All Widget Types — Final Status

| # | Widget Type | Deployer File | Tested | Status |
|---|-------------|--------------|--------|--------|
| 1 | SPR Standard | `spr_deployer.py` | UAT | ✅ |
| 2 | SPR Optimized (v2) | `spr_deployer.py` | UAT + PROD | ✅ |
| 3 | MM SPR Standard | `spr_deployer.py` | UAT + PROD | ✅ |
| 4 | MM SPR Optimized (v2) | `spr_deployer.py` | UAT | ✅ |
| 5 | DPR Standard | `spr_deployer.py` | UAT | ✅ |
| 6 | DPR Optimized (v2) | `spr_deployer.py` | UAT | ✅ |
| 7 | MM DPR Standard | — | — | NOT AVAILABLE |
| 8 | MM DPR Optimized (v2) | `spr_deployer.py` | UAT | ❌ type rejected |
| 9 | Banner Carousel (Scroll) | `banner_carousel_deployer.py` | UAT | ✅ |
| 10 | Banner Stick (Category Grid) | `banner_stick_deployer.py` | UAT | ✅ |
| 11 | Primary Masthead | `masthead_deployer.py` | UAT | ✅ |
| 12 | Secondary Masthead | `masthead_deployer.py` | UAT | ✅ |

**10 / 11 available types: ALL WORKING**

---

## Key Fixes Applied During Testing

1. **UAT password** — was `Qwerty@123`, correct is `qwerty@123` (lowercase)
2. **CSRF token** — must be in both header (`X-CSRFToken`) AND form body (`csrfmiddlewaretoken`)
3. **media_en** — blank 1x1 PNG required for sub-cat widget items
4. **Missing widget fields** — `description`, `master_key`, `clear_bg_media`, `background_multimedia`, `view_all_action_name` must be sent as empty strings
5. **Row items state-wise** — row widget items created per state, not just global
6. **Mapping with slug** — `widget_slug` / `page_layout_slug` field required in mapping form body
7. **Image compression** — auto-compress per target (50KB/300KB/1MB) using PIL LANCZOS resize + JPEG
8. **Confirm flow** — `confirm=true` parameter added to prevent infinite loop in Claude Desktop
9. **Category item text_en** — required for category type (carousel items can have empty text)
10. **background_multimedia** — omit field entirely if empty (empty string causes "invalid" error on masthead)
11. **Hindi auto-translate** — Google Translate free API, cached, applied to non-multimedia widgets
