"""
sam_help — Discovery tool. Lists all SAM MCP tools, actions, and per-widget-type field requirements.
"""


HELP_DATA = {
    "overview": {
        "name": "SAM MCP Server",
        "description": "Homepage Pod operations — widget creation, bulk uploads, catalog lookup.",
        "tools": ["sam_widget", "sam_bulk", "sam_catalog", "sam_page", "sam_help"],
        "widget_types": {
            "spr": "Single Product Row (1 row of products)",
            "dpr": "Double Product Row (2 rows of products)",
            "banner_scroll": "Banner Carousel (horizontal swipeable banners)",
            "banner_stick": "Category Grid (4-column static grid)",
            "primary_masthead": "Primary Masthead (header with category icons)",
            "secondary_masthead": "Secondary Masthead (banner + carousel items below)",
        },
        "usage": "Type naturally. Example: 'Create SPR widget Summer Sale for JH and CG with products 369,370'",
    },
    "widget": {
        "tool": "sam_widget",
        "description": "All widget operations — create, edit, list, get, duplicate, history.",
        "actions": {
            "create": {
                "description": "Create a new widget. Provide type + required fields. SAM asks for missing fields.",
                "types": ["spr", "dpr", "banner_scroll", "banner_stick", "primary_masthead", "secondary_masthead"],
                "example": 'sam_widget({ action: "create", type: "spr", title: "Summer Sale", states: ["JH", "CG"], products: "369,370", env: "UAT" })'
            },
            "edit": "Edit existing widget by slug",
            "list": "List widgets with filters",
            "get": "Get widget details by slug",
            "duplicate": "Duplicate existing widget",
            "history": "View slug lifecycle"
        }
    },
    "spr": {
        "type": "spr",
        "name": "Single Product Row",
        "backend_type": "single_product_row / single_product_row_v2",
        "required_fields": {
            "title": "Widget heading (English). Hindi auto-generated.",
            "products": "Comma-separated item codes. Example: '369,370,90513'",
            "states": "State list. Example: ['JH', 'CG', 'WB']",
            "page_type": "product_listing_page or category_page",
            "start_time": "Format: YYYY-MM-DD HH:MM:SS",
            "end_time": "Format: YYYY-MM-DD HH:MM:SS",
            "env": "PROD or UAT",
        },
        "optional_fields": {
            "slug": "Auto-generated from title if not given",
            "is_optimized": "true (default, v2) or false (standard)",
            "image": "Image URL — makes it multimedia variant",
        },
        "auto_generated": ["title_hi (Hindi auto-translate)", "slug suffixes", "state-wise sub-cat items", "state-wise row items"],
        "example": "Create SPR widget 'Rice Sale' with products 369,370 for JH,CG on UAT",
    },
    "dpr": {
        "type": "dpr",
        "name": "Double Product Row",
        "backend_type": "double_product_row / double_product_row_v2",
        "note": "Same fields as SPR. Only difference: 2 rows instead of 1.",
        "required_fields": "Same as SPR",
        "example": "Create DPR widget 'Best Sellers' with products 369,370,90513 for JH,CG,WB on UAT",
    },
    "banner_scroll": {
        "type": "banner_scroll",
        "name": "Banner Carousel (Scroll)",
        "backend_type": "carousel",
        "required_fields": {
            "title": "Banner/page heading",
            "products": "Comma-separated item codes",
            "states": "State list",
            "page_type": "product_listing_page or category_page",
            "image": "Banner image URL (compressed to 300KB for carousel, 50KB for sub-cat)",
            "start_time": "Format: YYYY-MM-DD HH:MM:SS",
            "end_time": "Format: YYYY-MM-DD HH:MM:SS",
            "env": "PROD or UAT",
        },
        "optional_fields": {
            "slug": "Auto-generated from title",
            "media_number": "Visible items count (default 3.5)",
        },
        "auto_generated": ["title_hi", "slug suffixes (_Cl_w_HP, _cl_wi, etc.)", "image auto-compress", "state-wise items"],
        "example": "Create banner carousel 'Summer Sale' with products 369,370 image https://... for JH,CG on UAT",
    },
    "banner_stick": {
        "type": "banner_stick",
        "name": "Category Grid (Stick)",
        "backend_type": "category",
        "required_fields": {
            "title": "Category grid heading",
            "products": "Comma-separated item codes",
            "states": "State list",
            "page_type": "product_listing_page or category_page",
            "image": "Category item image URL (300KB for category item, 50KB for sub-cat)",
            "start_time": "Format: YYYY-MM-DD HH:MM:SS",
            "end_time": "Format: YYYY-MM-DD HH:MM:SS",
            "env": "PROD or UAT",
        },
        "optional_fields": {
            "slug": "Auto-generated from title",
        },
        "auto_generated": ["title_hi (on category items)", "slug suffixes (_cm_hp, _cat_wi, etc.)", "image auto-compress", "state-wise items"],
        "example": "Create category grid 'Dairy Products' with products 1001,1002 image https://... for JH on UAT",
    },
    "primary_masthead": {
        "type": "primary_masthead",
        "name": "Primary Masthead",
        "backend_type": "masthead_primary",
        "required_fields": {
            "slug": "Unique identifier (no auto-generate for masthead)",
            "start_time": "Format: YYYY-MM-DD HH:MM:SS",
            "end_time": "Format: YYYY-MM-DD HH:MM:SS",
            "env": "PROD or UAT",
        },
        "optional_fields": {
            "image": "Background image URL (compressed to 1MB)",
            "master_key": "Category pane widget link",
            "aspect_ratio": "Default: 1",
        },
        "note": "No products, no states, no title needed. Simple 2-step: multimedia upload + widget create.",
        "example": "Create primary masthead slug 'diwali_2024' with image https://... on UAT",
    },
    "secondary_masthead": {
        "type": "secondary_masthead",
        "name": "Secondary Masthead",
        "backend_type": "masthead_secondary_category_hp",
        "required_fields": {
            "slug": "Unique identifier",
            "start_time": "Format: YYYY-MM-DD HH:MM:SS",
            "end_time": "Format: YYYY-MM-DD HH:MM:SS",
            "carousel_items": "Array of items — each needs: title, products, page_type, image (optional), stateProducts (optional)",
            "env": "PROD or UAT",
        },
        "optional_fields": {
            "image": "Banner background image (1MB)",
            "master_key": "Category pane link",
            "aspect_ratio": "Default: 4",
        },
        "carousel_item_fields": {
            "title": "Item heading (Hindi auto-generated)",
            "products": "Comma-separated item codes",
            "page_type": "category_page or product_listing_page (per item)",
            "image": "Carousel item image (300KB)",
            "stateProducts": "State-wise products: {'global': '369', 'jharkhand': '370'}",
        },
        "example": "Create secondary masthead 'festive_banner' with 2 carousel items: Rice (369,370) and Sugar (90513) on UAT",
    },
    "bulk": {
        "tool": "sam_bulk",
        "description": "Bulk item code operations from Google Sheet.",
        "actions": {
            "upload": {
                "description": "Read item codes from Sheet and upload to Samaan",
                "required": ["sheet_url", "env"],
                "optional": ["states", "tab"],
                "note": "Sheet must be shared with sonic-bot@widget-474311.iam.gserviceaccount.com"
            },
            "dry_run": {
                "description": "Preview CSVs without uploading",
                "required": ["sheet_url", "env"],
            }
        }
    },
    "catalog": {
        "tool": "sam_catalog",
        "description": "Product catalog lookup.",
        "actions": {
            "search": {"description": "Search products by name", "required": ["query", "env"], "example": "search for 'rice'"},
            "batch": {"description": "Fetch products by item codes", "required": ["codes", "env"], "example": "get products 369,370"}
        }
    },
    "page": {
        "tool": "sam_page",
        "description": "Page and location operations.",
        "actions": {
            "locations": {"description": "List all states/cities", "required": ["env"]},
            "header_widgets": {"description": "Get current masthead widgets", "required": ["env"]}
        }
    }
}


async def handle_help(arguments: dict) -> dict:
    """Handle sam_help tool calls."""
    topic = arguments.get("topic")

    if not topic:
        return HELP_DATA["overview"]

    if topic in HELP_DATA:
        return HELP_DATA[topic]

    return {"error": f"Unknown topic: {topic}. Available: widget, spr, dpr, banner_scroll, banner_stick, primary_masthead, secondary_masthead, bulk, catalog, page"}
