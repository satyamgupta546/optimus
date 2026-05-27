# SAM MCP Server — Setup Guide

## What is this?
SAM MCP lets you manage Apna Mart homepage widgets directly from Claude Desktop chat.
Create, edit, list widgets — all through natural language.

## Quick Setup (5 min)

### Step 1: Clone & Install

```bash
git clone https://github.com/satyamgupta546/optimus.git
cd optimus/homepage_optimus_mcp
pip install -r requirements.txt
```

### Step 2: GCP Credentials

You need BigQuery access (read/write to `apna-mart-data.optimus`).

```bash
# Option A: Login with your Google account
gcloud auth application-default login

# Option B: Service account (ask Satyam for the key file)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
```

### Step 3: Start the Server

```bash
python main.py
```

You'll see:
```
SAM MCP Server starting on port 8080...
SSE endpoint: http://localhost:8080/sse
```

### Step 4: Add to Claude Desktop

Open Claude Desktop → Settings → Developer → Edit Config

Add this:
```json
{
  "mcpServers": {
    "sam": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8080/sse", "--allow-http"]
    }
  }
}
```

Restart Claude Desktop. You'll see SAM tools available.

---

## What Can You Do?

### Create a Widget
> "Create an SPR widget called Rice Sale for JH and CG with products 90513, 90518"

### Edit a Widget
> "Change the heading of rice_sale_spr_opt to Summer Rice Sale"

### List Widgets
> "Show me all PROD widgets"

### Schedule a Widget
> "Set start time of rice_sale_spr_opt to June 1 and end time to June 30"

---

## Widget Types

| Type | Code | Description |
|------|------|-------------|
| Single Product Row | `spr` | Product rail with 1 row |
| Double Product Row | `dpr` | Product rail with 2 rows |
| Banner Carousel | `banner_scroll` | Scrollable banner images |
| Category Grid | `banner_stick` | Category grid with images |
| Primary Masthead | `primary_masthead` | Top hero banner |
| Secondary Masthead | `secondary_masthead` | Secondary carousel banner |

---

## Safety

- **UAT is default** for all read operations (list, get, history)
- **PROD requires double confirmation** — first `confirm=true`, then `prod_ack=true`
- Duplicate slugs are auto-detected before deploy
- All actions are logged to BigQuery audit trail

---

## Environments

| Env | Samaan URL | Use |
|-----|-----------|-----|
| UAT | smapi-cu.apnamart.in | Testing |
| PROD | samaan.apnamart.in | Live |

---

## Troubleshooting

**"Server disconnected" in Claude Desktop**
→ Server is not running. Run `python main.py` first.

**"Samaan login failed"**
→ Check your network. Samaan APIs need VPN/office network.

**"Widget not found"**
→ Use full slug with suffix (e.g., `rice_sale_spr_opt` not just `rice_sale`)

**BigQuery permission error**
→ Run `gcloud auth application-default login` again.

---

## Need Help?

- Type "help" in Claude Desktop — SAM will show all available commands
- Ask Satyam (@satyam.gupta) for access or credentials
