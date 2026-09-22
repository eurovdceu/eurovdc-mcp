# EuroVDC MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for [EuroVDC](https://www.eurovdc.eu) — live EUR hosting catalog, domain search, AI server recommendations, and Phase 1 agent checkout.

- **Remote HTTP MCP:** `https://www.eurovdc.eu/mcp`
- **Docs:** [for-agents](https://www.eurovdc.eu/en/for-agents) · [agents.md](https://www.eurovdc.eu/agents.md)
- **Smithery:** [vakar/eurovdc](https://smithery.ai/servers/vakar/eurovdc)
- [![smithery badge](https://smithery.ai/badge/vakar/eurovdc)](https://smithery.ai/servers/vakar/eurovdc)
- **Privacy:** [privacy policy](https://www.eurovdc.eu/en/contracts/privacy-policy)

## Quick connect (remote)

Most MCP clients (Claude custom connector, Smithery, Cursor HTTP) only need:

```json
{
  "mcpServers": {
    "eurovdc": {
      "url": "https://www.eurovdc.eu/mcp"
    }
  }
}
```

- Manifest: `GET https://www.eurovdc.eu/.well-known/mcp.json`
- JSON-RPC: `POST https://www.eurovdc.eu/mcp?lang=en`

No API key required for public tools. Optional partner key (`Authorization: Bearer evdc_…`) raises rate limits — contact support@eurovdc.eu.

## Stdio install (Claude Desktop / local Cursor)

```bash
git clone https://github.com/eurovdceu/eurovdc-mcp.git
cd eurovdc-mcp
npm install
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "eurovdc": {
      "command": "node",
      "args": ["/absolute/path/to/eurovdc-mcp/index.js"],
      "env": {
        "EUROVDC_BASE_URL": "https://www.eurovdc.eu",
        "EUROVDC_LANG": "en"
      }
    }
  }
}
```

Optional env: `EUROVDC_AGENT_API_KEY=evdc_…`

## Tools

| Tool | Purpose |
|------|---------|
| `search_domain` | Domain availability + EUR price |
| `recommend_server` | AI VPS/cloud recommendation |
| `list_products` | Live catalog (hosting, VPS, SSL, email, VPN) |
| `list_tlds` | TLD price list |
| `whois_lookup` | WHOIS |
| `ai_domain_suggest` | Brandable domain ideas |
| `agent_domain_fields` | ccTLD extra registrant fields |
| `agent_cart_add` | Cart + `checkout_url` (browser handoff) |
| `agent_cart_get` | Cart summary |
| `agent_checkout_*` | ACP quote / Stripe / fulfill |

## License

MIT © EuroVDC
