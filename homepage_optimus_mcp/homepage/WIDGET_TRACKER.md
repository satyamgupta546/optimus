# SAM MCP — Widget Creation Tracker

> All widgets created via SAM MCP (Claude Desktop / Claude Code)

---

## Widgets Created — PROD

| # | Date | Widget Type | Slug | Title | Products | States | Created By | Status |
|---|------|-------------|------|-------|----------|--------|------------|--------|
| 1 | 2026-05-17 | SPR Optimized | `test_prod_sam_satyam_spr_opt` | spr test | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 2 | 2026-05-17 | MM SPR Standard | `sam_mm_spr_std_prod_spr` | MM SPR Standard | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |

---

## Widgets Created — UAT

| # | Date | Widget Type | Slug | Title | Products | States | Created By | Status |
|---|------|-------------|------|-------|----------|--------|------------|--------|
| 1 | 2026-05-17 | SPR Standard | `sam_all_test_spr_std_spr` | SPR Standard | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 2 | 2026-05-17 | SPR Optimized | `sam_all_test_spr_opt_spr_opt` | SPR Optimized (v2) | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 3 | 2026-05-17 | DPR Standard | `sam_all_test_dpr_std_spr` | DPR Standard | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 4 | 2026-05-17 | DPR Optimized | `sam_all_test_dpr_opt_spr_opt` | DPR Optimized (v2) | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 5 | 2026-05-17 | MM SPR Standard | `sam_mm_spr_std_spr` | MM SPR Standard | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 6 | 2026-05-17 | MM SPR Optimized | `sam_mm_spr_opt_spr_opt` | MM SPR Optimized | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 7 | 2026-05-17 | SPR Optimized | `test_uat_sam_spr_opt` | spr test | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in (Claude Desktop) | LIVE |
| 8 | 2026-05-18 | SPR Optimized | `sam_hindi_test_spr_spr_opt` | Grocery Essentials | 369,370,90513 | JH,CG | satyam.gupta@apnamart.in | LIVE |
| 9 | 2026-05-18 | Banner Carousel | `sam_banner_v2_Cl_w_HP` | SAM Banner V2 | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 10 | 2026-05-18 | Banner Carousel | `sam_sugar_banner_v1_Cl_w_HP` | Sugar Sale Banner | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 11 | 2026-05-18 | Banner Carousel | `sam_hindi_test_banner_Cl_w_HP` | Summer Sale | 369,370 | JH | satyam.gupta@apnamart.in | LIVE |
| 12 | 2026-05-18 | Category Grid | `sam_catgrid_test_v2_cm_hp` | Sugar Collection | 369,370,90513 | JH,CG,WB | satyam.gupta@apnamart.in | LIVE |
| 13 | 2026-05-18 | Primary Masthead | `sam_pm_test_pm_hp` | PM Test | — | JH | satyam.gupta@apnamart.in | LIVE |
| 14 | 2026-05-18 | Secondary Masthead | `sam_sm_test_sm_hp` | SM Test (2 items) | — | JH,CG | satyam.gupta@apnamart.in | LIVE |

---

## Claude Desktop Credentials & Access

| # | Email | Name | Role | Projects | MCP Added | Status |
|---|-------|------|------|----------|-----------|--------|
| 1 | satyam.gupta@apnamart.in | Satyam Gupta | Super Admin | All (*) | Yes | Active |

### How to Add New User

1. Admin adds user in `sam-mcp/configs/users.json`:
```json
{
  "users": {
    "azeem.namaji@apnamart.in": {
      "name": "Azeem Namaji",
      "password_plain": "password_here",
      "projects": ["homepage_pod"],
      "role": "user"
    }
  }
}
```

2. User adds SAM MCP in Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "sam": {
      "command": "npx",
      "args": ["mcp-remote", "http://<server-ip>:8080/sse", "--allow-http"]
    }
  }
}
```

3. User restarts Claude Desktop → first tool call opens browser login → enter email + password → done.

---

## Samaan Backend Credentials (used by SAM internally)

| Env | URL | Username | Password | Notes |
|-----|-----|----------|----------|-------|
| PROD | samaan.apnamart.in | Automation | Qwerty@123 | Widget deploy to production |
| UAT | smapi-cu.apnamart.in | vicky.das | qwerty@123 | Widget deploy to UAT (testing) |

---

## Widget Count Summary

| Environment | Total Widgets | Widget Types Used |
|-------------|--------------|-------------------|
| PROD | 2 | SPR Optimized, MM SPR Standard |
| UAT | 14 | SPR (4 variants), MM SPR (2), DPR (2), Banner Carousel (3), Category Grid (1), Primary Masthead (1), Secondary Masthead (1) |
