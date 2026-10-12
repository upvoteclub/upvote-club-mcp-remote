# Upvote.club — Universal Remote MCP

[Streamable HTTP](https://modelcontextprotocol.io) MCP server for Cursor, ChatGPT, Claude, and other MCP-compatible agents.

Canonical endpoint: `https://mcp.upvote.club/mcp`.

The same endpoint includes all five Public API tools, OAuth 2.1, API-key compatibility, and the MCP Apps task-progress UI.

## Upvote Club MCP packages

| Package | Repository | Use case |
|---------|------------|----------|
| Core | [upvote-club-mcp-core](https://github.com/upvoteclub/upvote-club-mcp-core) | Shared MCP server library (5 tools) |
| Local | [upvote-club-mcp-local](https://github.com/upvoteclub/upvote-club-mcp-local) | Cursor, Claude Code, manual Claude Desktop (`stdio`) |
| MCPB | [upvote-club-mcp-mcpb](https://github.com/upvoteclub/upvote-club-mcp-mcpb) | Single-click Claude Desktop `.mcpb` install |
| **Remote** | **This repo** — [upvote-club-mcp-remote](https://github.com/upvoteclub/upvote-club-mcp-remote) | Canonical remote server for every HTTP MCP host |

## Run locally

```bash
git clone https://github.com/upvoteclub/upvote-club-mcp-remote.git
cd upvote-club-mcp-remote
npm install
MCP_INTERNAL_SECRET=development-secret npm start
# → http://localhost:8787/mcp
curl http://localhost:8787/health
```

For local API-key calls, send `X-API-Key: upv_...` in the MCP client configuration.

## Production deployment

Production runs inside the Upvote.club Next.js app on Vercel. The package exports one Fetch API handler that the app mounts on `/mcp` and `/.well-known/oauth-protected-resource` for the `mcp.upvote.club` host:

```js
import { createUpvoteClubMcpHandler } from "upvote-club-mcp-remote";

const handleMcpRequest = createUpvoteClubMcpHandler();
export { handleMcpRequest as POST, handleMcpRequest as OPTIONS };
```

`npm start` serves the same handler as a standalone Node server (Node 20+).

## Authentication

1. **OAuth 2.1:** ChatGPT and OAuth-capable hosts open Upvote.club sign-in. Access is issued only to active MEMBER or MATE accounts.
2. **API key:** clients that support static headers send `X-API-Key: upv_...`. Generate the key at https://upvote.club/api.

Every `/mcp` request requires one of these credentials. A request without credentials receives `401 Unauthorized` with a `WWW-Authenticate` header that points to `/.well-known/oauth-protected-resource`, which is how hosts start the OAuth flow.

OAuth access tokens are audience-bound to `https://mcp.upvote.club/mcp`. They are validated through Upvote.club OAuth introspection and are never forwarded to the Public API.

## ChatGPT

Open ChatGPT Plugins → Add custom MCP server → enter `https://mcp.upvote.club/mcp` → connect your Upvote.club account.

## Claude

```bash
claude mcp add --transport http upvote-club https://mcp.upvote.club/mcp
```

Claude Code marks the server as needing authentication; run `/mcp` and choose the server to sign in with your Upvote.club account. API-key mode is also supported:

```bash
claude mcp add --transport http upvote-club https://mcp.upvote.club/mcp \
  --header "X-API-Key: upv_..."
```

## Cursor

OAuth sign-in:

```json
{
  "mcpServers": {
    "upvote-club": {
      "url": "https://mcp.upvote.club/mcp"
    }
  }
}
```

API key:

```json
{
  "mcpServers": {
    "upvote-club": {
      "type": "http",
      "url": "https://mcp.upvote.club/mcp",
      "headers": {
        "X-API-Key": "upv_..."
      }
    }
  }
}
```

## Other MCP hosts

Use Streamable HTTP URL `https://mcp.upvote.club/mcp`. Prefer OAuth when supported; otherwise configure the `X-API-Key` request header.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | HTTP port |
| `BIND_HOST` | `0.0.0.0` | Bind address |
| `UPVOTE_API_URL` | `https://api.upvote.club` | Backend API |
| `MCP_AUTH_SERVER_URL` | `https://api.upvote.club` | OAuth issuer origin |
| `MCP_RESOURCE_URL` | `https://mcp.upvote.club/mcp` | OAuth resource audience |
| `MCP_OAUTH_RESOURCE_METADATA_URL` | `https://mcp.upvote.club/.well-known/oauth-protected-resource` | RFC 9728 metadata URL |
| `MCP_INTERNAL_SECRET` | — | Required shared secret for introspection and upstream MCP service auth |
| `MCP_UI_DOMAIN` | `https://mcp.upvote.club` | MCP Apps component domain |

## Tools (5)

`get_api_reference`, `list_platforms`, `create_task`, `get_task_status`, `delete_task`

Full reference: [API_REFERENCE.md](https://github.com/upvoteclub/upvote-club-mcp-core/blob/main/docs/API_REFERENCE.md)

## Related

- Core dependency: [@upvote-club/mcp-core](https://github.com/upvoteclub/upvote-club-mcp-core)
- Local stdio instead of HTTP? → [upvote-club-mcp-local](https://github.com/upvoteclub/upvote-club-mcp-local)

## Security

- Use HTTPS in production
- Never configure a shared customer API key on the remote service
- Keep `MCP_INTERNAL_SECRET` only in backend and remote-service environment variables
- Do not expose without TLS

## Privacy

Proxies requests to `https://api.upvote.club` only. https://upvote.club/privacy-policy
