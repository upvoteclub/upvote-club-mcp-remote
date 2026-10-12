#!/usr/bin/env node
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createUniversalUpvoteClubServer } from "./create-universal-server.js";
import {
  getRemoteOAuthConfig,
  protectedResourceMetadata,
  resolveRequestAuthentication,
} from "./oauth.js";

const PORT = parseInt(process.env.PORT || "8787", 10);
const BIND_HOST = process.env.BIND_HOST || "0.0.0.0";
const OAUTH_CONFIG = getRemoteOAuthConfig();

console.error(
  `[upvote-mcp-remote] Booting universal remote MCP port=${PORT} oauth_configured=${Boolean(OAUTH_CONFIG.internalSecret)}`,
);

const app = createMcpExpressApp({ host: BIND_HOST });

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, mcp-protocol-version, mcp-session-id, x-api-key",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "upvote-club-mcp-remote",
    version: "2.0.0",
    mcp_path: "/mcp",
    oauth_configured: Boolean(OAUTH_CONFIG.internalSecret),
  });
});

app.get("/", (_req, res) => {
  res.type("text/plain").send("Upvote.club Remote MCP");
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(protectedResourceMetadata(OAUTH_CONFIG));
});

app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  res.json(protectedResourceMetadata(OAUTH_CONFIG));
});

app.options("/mcp", (_req, res) => {
  res.status(204).end();
});

// ─── Ariadne's Thread [AT-2249] ─────────────────────
// What: Serve one stateless Streamable HTTP endpoint with API-key and OAuth authentication.
// Why:  Cursor, ChatGPT, Claude, and other MCP hosts must share the same URL and tool implementation.
// Date: 2026-10-12
// Related: [AT-2246] remote→server/oauth.js:resolveRequestAuthentication,
//          [AT-2247] remote→server/create-universal-server.js:createUniversalUpvoteClubServer
// ─────────────────────────────────────────────────────
app.all("/mcp", async (req, res) => {
  console.error(`[upvote-mcp-remote] MCP ${req.method} /mcp from=${req.ip}`);

  const authentication = await resolveRequestAuthentication(req, {
    config: OAUTH_CONFIG,
    logPrefix: "[upvote-mcp-remote]",
  });
  if (!authentication.ok) {
    if (authentication.challenge) {
      res.setHeader("WWW-Authenticate", authentication.challenge);
    }
    res.status(authentication.status).json({
      error: authentication.error,
    });
    return;
  }

  const server = createUniversalUpvoteClubServer({
    apiKey: authentication.mode === "api_key" ? authentication.apiKey : "",
    serviceAuth:
      authentication.mode === "oauth" ? authentication.serviceAuth : null,
    oauthResourceMetadataUrl: OAUTH_CONFIG.resourceMetadataUrl,
    logPrefix: "[upvote-mcp-remote]",
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    console.error("[upvote-mcp-remote] Request closed, tearing down transport");
    transport.close().catch((err) => console.error(`[upvote-mcp-remote] transport.close error: ${err.message}`));
    server.close().catch((err) => console.error(`[upvote-mcp-remote] server.close error: ${err.message}`));
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(`[upvote-mcp-remote] MCP handler error: ${err.stack || err.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const httpServer = app.listen(PORT, BIND_HOST, () => {
  console.error(`[upvote-mcp-remote] Listening on http://${BIND_HOST}:${PORT}/mcp`);
  console.error("[upvote-mcp-remote] Health check: GET /health");
  console.error(
    `[upvote-mcp-remote] OAuth resource=${OAUTH_CONFIG.resourceUrl} authorization_server=${OAUTH_CONFIG.authServerUrl}`,
  );
});

function shutdown(signal) {
  console.error(`[upvote-mcp-remote] ${signal} received, shutting down`);
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
