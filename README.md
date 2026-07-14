# Upvote.club — Remote MCP Server

[Streamable HTTP](https://modelcontextprotocol.io) MCP server for Claude.ai custom connectors.

Per [Anthropic remote MCP docs](https://claude.com/docs/connectors/custom/remote-mcp): add `https://YOUR-HOST/mcp` in Settings → Connectors → Add custom connector, with **X-API-Key** request header (`upv_...`).

## Upvote Club MCP packages

| Package | Repository | Use case |
|---------|------------|----------|
| Core | [upvote-club-mcp-core](https://github.com/upvoteclub/upvote-club-mcp-core) | Shared MCP server library (6 tools) |
| Local | [upvote-club-mcp-local](https://github.com/upvoteclub/upvote-club-mcp-local) | Cursor, Claude Code, manual Claude Desktop (`stdio`) |
| MCPB | [upvote-club-mcp-mcpb](https://github.com/upvoteclub/upvote-club-mcp-mcpb) | Single-click Claude Desktop `.mcpb` install |
| **Remote** | **This repo** — [upvote-club-mcp-remote](https://github.com/upvoteclub/upvote-club-mcp-remote) | Claude.ai custom connector (Streamable HTTP) |
| Apps | [upvote-club-mcp-apps](https://github.com/upvoteclub/upvote-club-mcp-apps) | MCP Apps + inline task progress UI |

## Run locally

```bash
git clone https://github.com/upvoteclub/upvote-club-mcp-remote.git
cd upvote-club-mcp-remote
npm install
UPVOTE_API_KEY=upv_... npm start
# → http://localhost:8787/mcp
curl http://localhost:8787/health
```

## Test with tunnel

```bash
npx cloudflared tunnel --url http://localhost:8787
# Add the HTTPS URL + /mcp as custom connector in Claude.ai
```

## Auth modes

1. **Per-user (recommended):** Claude sends `X-API-Key: upv_...` on every request (Request headers in connector settings).
2. **Server default:** Set `UPVOTE_API_KEY` env var on the host (single shared key — not for production multi-tenant).

## Deploy (Heroku example)

```bash
git clone https://github.com/upvoteclub/upvote-club-mcp-remote.git
cd upvote-club-mcp-remote
heroku create upvote-club-mcp --buildpack heroku/nodejs
git push heroku main
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | HTTP port |
| `BIND_HOST` | `0.0.0.0` | Bind address |
| `UPVOTE_API_URL` | `https://api.upvote.club` | Backend API |
| `UPVOTE_API_KEY` | — | Optional fallback API key |

## Tools (6)

`get_api_reference`, `list_platforms`, `create_task`, `get_task_status`, `delete_task`

Full reference: [API_REFERENCE.md](https://github.com/upvoteclub/upvote-club-mcp-core/blob/main/docs/API_REFERENCE.md)

## Related

- Core dependency: [@upvote-club/mcp-core](https://github.com/upvoteclub/upvote-club-mcp-core)
- Want inline task progress UI in chat? → [upvote-club-mcp-apps](https://github.com/upvoteclub/upvote-club-mcp-apps)
- Local stdio instead of HTTP? → [upvote-club-mcp-local](https://github.com/upvoteclub/upvote-club-mcp-local)

## Security

- Use HTTPS in production
- Prefer per-user `X-API-Key` headers over a shared env key
- Do not expose without TLS

## Privacy

Proxies requests to `https://api.upvote.club` only. https://upvote.club/privacy-policy
