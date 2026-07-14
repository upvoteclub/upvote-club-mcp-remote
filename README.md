# Upvote.club — Remote MCP Server

[Streamable HTTP](https://modelcontextprotocol.io) MCP server for Claude.ai custom connectors.

Per [Anthropic remote MCP docs](https://claude.com/docs/connectors/custom/remote-mcp): add `https://YOUR-HOST/mcp` in Settings → Connectors → Add custom connector, with **X-API-Key** request header (`upv_...`).

## Run locally

```bash
cd upvote-club-mcp/remote
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
cd upvote-club-mcp/remote
heroku create upvote-club-mcp --buildpack heroku/nodejs
git subtree push --prefix upvote-club-mcp/remote heroku main
```

Or deploy as a separate Heroku app pointing at this folder.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | HTTP port |
| `BIND_HOST` | `0.0.0.0` | Bind address |
| `UPVOTE_API_URL` | `https://api.upvote.club` | Backend API |
| `UPVOTE_API_KEY` | — | Optional fallback API key |

## Tools

All 7 Public API tools — see [../docs/ENDPOINT_MAP.md](../docs/ENDPOINT_MAP.md).

## Security

- Use HTTPS in production
- Prefer per-user `X-API-Key` headers over a shared env key
- Do not expose without TLS

## Privacy

Proxies requests to `https://api.upvote.club` only. https://upvote.club/privacy-policy
