# Samaan API — All Curls & Endpoints

> All curls tested and verified. Save kiya hai — dobara puchna nahi padega.

---

## 1. Login

### PROD
```bash
curl 'https://samaan.apnamart.in/login/' \
  -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Referer: https://samaan.apnamart.in/login/' \
  --data-raw 'csrfmiddlewaretoken={csrf}&username=Automation&password=Qwerty%40123'
```

### UAT
```bash
curl 'https://smapi-cu.apnamart.in/login/' \
  -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Referer: https://smapi-cu.apnamart.in/login/' \
  --data-raw 'csrfmiddlewaretoken={csrf}&username=vicky.das&password=qwerty%40123'
```

**Flow:** GET /login/ → csrftoken cookie → POST /login/ → sessionid cookie

---

## 2. Widget Create

```
POST /api/app/widget/
Content-Type: multipart/form-data
```

**Fields:** slug_name, widget_type, description, heading, master_key, heading_en, heading_hi, heading_bg, start_time, end_time, clear_bg_media, media_aspect_ratio, view_all_action_name, view_all_action_params, background_multimedia, filter_dict, app_configurations, configurations, deactivated_flag

**Auth:** csrfmiddlewaretoken in body + X-CSRFToken header + Cookie header

---

## 3. Widget Update

```
PUT /api/app/widget/{id}/
Content-Type: multipart/form-data
```

**URL mein numeric ID use hota hai (slug nahi)**. Pehle GET se ID fetch karo.

**Full curl (from browser):**
```bash
curl 'https://samaan.apnamart.in/api/app/widget/1218/' \
  -X PUT \
  -H 'content-type: multipart/form-data; boundary=----WebKitFormBoundary...' \
  -H 'x-csrftoken: {csrf}' \
  -b 'csrftoken={csrf}; sessionid={sid}' \
  --data-raw '
    slug_name=Sauces_and_Dip_recipe_rail_w
    widget_type=single_product_row
    description=
    heading=
    master_key=
    heading_en=Dip Karo, Enjoy Karo
    heading_hi=Dip Karo, Enjoy Karo
    heading_bg=
    start_time=2024-10-18 22:20:00
    end_time=2026-08-30 22:20:00
    clear_bg_media=
    media_aspect_ratio=1
    view_all_action_name=redirect-to-page
    view_all_action_params={"page_type":"product_listing_page","page_layout_slug_name":"Sauces_and_Dip_rail_plp"}
    background_multimedia=
    filter_dict={}
    app_configurations={}
    configurations={}
    deactivated_flag=no
  '
```

**Important:** Saare fields bhejne padte hain — sirf changed nahi. `view_all_action_params` mein single quotes nahi, double quotes chahiye.

---

## 4. Widget Get

```
GET /api/app/get_widget/?slug_name={slug}
```

**Returns:** id, heading_en, widget_type, start_time, end_time, view_all_action_params, etc.

---

## 5. Widget Item Create

```
POST /api/app/post_widget_item/
Content-Type: multipart/form-data
```

**Fields:** widget_item_id, deactivated_flag, item_click_action, slug_name, slave_key, item_type, media, text_en, media_en (file), text_hi, media_hi, text_bg, media_bg, product_list, filters, filter_lst, property_lst, pl_edit, is_clickable, update_product_list, start_time, end_time, background_multimedia, image_multimedia, secondary_image_multimedia, progress_bar, offer_id, click_action_params

**media_en required:** blank 1x1 PNG for sub_category items, empty string for item_rows

---

## 6. Widget Item Update

```
POST /api/app/update_widget_item/
Content-Type: multipart/form-data
```

**NOT PUT, NOT PATCH — it's POST with widget_item_id in body.**

**Full curl (from browser):**
```bash
curl 'https://samaan.apnamart.in/api/app/update_widget_item/' \
  -X POST \
  -H 'content-type: multipart/form-data; boundary=----WebKitFormBoundary...' \
  -H 'x-csrftoken: {csrf}' \
  -b 'csrftoken={csrf}; sessionid={sid}' \
  --data-raw '
    widget_item_id=456
    deactivated_flag=no
    item_click_action=null
    slug_name=Personal_Care_holi_sub_cat_wi
    slave_key=
    item_type=sub_category
    media=
    text_en=Personal Care
    media_en=https://gs.apnamart.in/...image.jpg
    text_hi=Personal Care
    media_hi=
    text_bg=
    media_bg=
    product_list=30404,86106,96394,...
    filters=[]
    filter_lst=[]
    property_lst=[]
    pl_edit=PL
    is_clickable=yes
    update_product_list=yes
    start_time=2024-03-15 03:36:00
    end_time=2026-11-25 03:36:00
    background_multimedia=
    image_multimedia=
    secondary_image_multimedia=
    progress_bar=
    offer_id=
    click_action_params={"item_id":"-1"}
    ranking_type=none
    ranking_pin_pl=false
    ranking_geo_level=
  '
```

**Key:** `update_product_list=yes` — required for product_list changes to take effect.

---

## 7. Widget to Widget Item Mapping (GET)

```
GET /api/app/get_paginated_widget_widget_item_mappings/?widget_query={widget_slug}&limit=50&page_no=1&status=active&sort=-updated_at
```

**Returns:** widget_id, widget__slug_name, mapping_data[] with widget_item_id, widget_item__slug_name, level_tag, level_property, priority

**Use case:** Get all widget items mapped to a widget (to find item IDs for editing)

---

## 8. Page to Widget Mapping (GET)

```
GET /api/app/get_paginated_page_widget_mappings/?slug_name={page_slug}&limit=50&page_no=1&status=active&store_id={store_id}&timestamp={iso_timestamp}
```

**Returns:** widget_id, widget__slug_name, priority, level_tag, level_property, widget__start_time, widget__end_time

**Use case:** Homepage mapping dashboard — see all widgets on GL-HP-global

---

## 9. Page Layout Create

```
POST /api/app/post_page_layout/
Content-Type: application/json
```

```json
{
  "slug_name": "test_page_p",
  "page_heading": "Test Page",
  "page_layout_type": "2",
  "page_type": "product_listing_page"
}
```

**Note:** `page_layout_type` must be string `"2"` not number `2`.

---

## 10. Multimedia Upload

```
POST /api/app/multimedia/
Content-Type: multipart/form-data
```

**Fields:** name, multimedia_type (3=image, 4=video, 1=lottie), aspect_ratio, file_en (binary), transition_color, accent_color, text_color, icon_bg_color, is_multimedia_dark

---

## 11. Mapping CSV Uploads

### Widget Item → Widget
```
POST /api/app/update_widget_widget_item_mapping/
Fields: widget_slug={slug}, mapping_file=CSV
```

### Widget → Page Layout
```
POST /api/app/update_layout_widget_mapping/
Fields: page_layout_slug={slug}, mapping_file=CSV
```

### Page → Global Registry
```
POST /api/app/update_page_page_layout_mapping/
Fields: page_layout_slug={slug}, page_type={type}, mapping_file=CSV
```

**CSV format (widget item mapping):**
```csv
widget_item_slug_name,level_tag,level_property,priority,cohort
slug_global,global,global,1,
slug_jh,state,jharkhand,2,
slug_cg,state,chhattisgarh,3,
```

---

## 12. Bulk Upload

```
PUT /api/app/bulk_upload_products_for_wi/
Content-Type: multipart/form-data
Fields: file=CSV (widget_item, item_code, priority)
```

---

## Auth Notes

- **CSRF token:** Must be in 3 places: `X-CSRFToken` header + `csrfmiddlewaretoken` form body + `csrftoken` cookie
- **Referer:** Required — use `{base_url}/widget/` or `{base_url}/widget-item/`
- **Session expiry:** Auto re-login on 403
- **PROD credentials:** Automation / Qwerty@123
- **UAT credentials:** vicky.das / qwerty@123 (lowercase q)

---

## Environments

| Env | URL | Credentials |
|-----|-----|-------------|
| PROD | https://samaan.apnamart.in | Automation / Qwerty@123 |
| UAT | https://smapi-cu.apnamart.in | vicky.das / qwerty@123 |

---

## Known Issues

1. **aiohttp CSRF mismatch:** PUT/POST calls via aiohttp get 403. Use urllib for write operations.
2. **Automation user mapping access:** `get_paginated_widget_widget_item_mappings` returns 0 items for Automation user on PROD. Need personal session.
3. **UAT PATCH:** PATCH method returns 404 on UAT. Use PUT instead.
4. **Empty background_multimedia:** Sending empty string causes "Background Multimedia Name is invalid" on masthead. Omit field entirely.
5. **view_all_action_params:** Must use double quotes in JSON. Single quotes from Python dict → API rejects.
