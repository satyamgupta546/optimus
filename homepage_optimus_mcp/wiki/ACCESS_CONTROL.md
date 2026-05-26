# SAM MCP — Access Control & User Management

---

## Project-wise Access Model

Users get access to specific projects only. A user assigned to "Homepage Pod" cannot use Pricing or Offer tools.

```
Super Admin (Satyam)
  └── All projects, all tools, user management

User (Radhika)
  └── homepage_pod only → sam_widget, sam_bulk, sam_catalog, sam_page, sam_help

User (Azeem)
  └── homepage_pod only → sam_widget, sam_bulk, sam_catalog, sam_page, sam_help

Future: User (xyz)
  └── pricing only → pricing tools
  └── homepage_pod + offer → both project tools
```

---

## Projects

| Project | Status | Tools | Description |
|---------|--------|-------|-------------|
| **Homepage Pod** | Active | sam_widget, sam_bulk, sam_catalog, sam_page, sam_help | Widget management — SPR, Banner, Masthead, bulk upload |
| **Pricing** | Planned | TBD | Price rules, MRP/SP update, discount management |
| **Offer** | Planned | TBD | Offer creation, coupon management, deal setup |
| **Catalog** | Planned | TBD | EAN mapping, GST update, product mapping |

---

## Users

### Super Admin

| Email | Name | Projects | Status |
|-------|------|----------|--------|
| satyam.gupta@apnamart.in | Satyam Gupta | All (*) | Active |

### Homepage Pod Users

| Email | Name | Projects | Password Set | Claude Desktop | Status |
|-------|------|----------|-------------|----------------|--------|
| radhika.maheshwari@apnamart.in | Radhika Maheshwari | homepage_pod | No | No | Pending |
| aayushi.chhatre@apnamart.in | Aayushi Chhatre | homepage_pod | No | No | Pending |
| azeem.namaji@apnamart.in | Azeem Namaji | homepage_pod | No | No | Pending |

---

## How Access Works

### Backend (MCP Server)

1. User calls any SAM tool → MCP server checks auth token
2. Token decoded → user email + role + projects
3. Tool call checks: is this tool allowed for user's projects?
4. If not → `{"error": "Access denied. You don't have access to this project."}`

```python
# auth/access_control.py
def can_access_tool(user_projects, tool_name, projects_config):
    # Super admin → always yes
    if user_projects == ["*"]:
        return True
    
    # Check which projects have this tool
    for project_id in user_projects:
        project = projects_config.get(project_id, {})
        if tool_name in project.get("tools", []):
            return True
    
    return False
```

### Frontend (Claude Desktop)

1. User adds SAM MCP URL in Claude Desktop config
2. First tool call → browser opens → login page
3. User enters email + password
4. Server validates → returns token with projects list
5. Claude Desktop gets tools → only shows tools user has access to

---

## How to Add New User

### Step 1: Add to `configs/users.json`
```json
{
    "users": {
        "new.user@apnamart.in": {
            "name": "New User",
            "password_plain": "their_password",
            "projects": ["homepage_pod"],
            "role": "user",
            "status": "active"
        }
    }
}
```

### Step 2: Assign Projects
- `["homepage_pod"]` — only Homepage
- `["homepage_pod", "pricing"]` — Homepage + Pricing
- `["*"]` — everything (super admin only)

### Step 3: User Setup (Claude Desktop)
User adds to their `~/Library/Application Support/Claude/claude_desktop_config.json`:
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

### Step 4: First Login
1. User opens Claude Desktop → new chat
2. Types anything with SAM tool → browser opens
3. Enters email + password → token stored for 7 days
4. Done — user can use SAM tools for their assigned projects

---

## How to Add New Project

### Step 1: Add to `configs/projects.json`
```json
{
    "projects": {
        "pricing": {
            "name": "Pricing",
            "description": "Price rules, MRP/SP update",
            "tools": ["sam_pricing"],
            "status": "active"
        }
    }
}
```

### Step 2: Create Tool Handler
New file: `tools/pricing.py` → register in `main.py`

### Step 3: Assign Users
Update `configs/users.json` → add `"pricing"` to user's projects array

---

## Security Rules

1. **Password stored plain** in configs (V1). V2: hash + salt.
2. **Token expiry**: 7 days. After that, re-login required.
3. **No anonymous access**: every tool call needs valid token.
4. **Project scoped**: user can ONLY use tools for assigned projects.
5. **Super admin**: only satyam.gupta@apnamart.in has `"*"` access.
6. **Samaan credentials**: shared — all users use same Automation/vicky.das account to deploy widgets.
