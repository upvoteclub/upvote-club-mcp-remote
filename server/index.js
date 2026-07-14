#!/usr/bin/env node
// ─── Ariadne's Thread [AT-0536] ─────────────────────
// What: Remote MCP server (Streamable HTTP) for Upvote.club Public API
// Why:  Claude.ai / mobile custom connector via HTTPS URL + X-API-Key request header auth
// Date: 2026-07-14
// Related: https://claude.com/docs/connectors/custom/remote-mcp
// ─────────────────────────────────────────────────────
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createUpvoteClubServer } from "@upvote-club/mcp-core";

const PORT = parseInt(process.env.PORT || "8787", 10);
const DEFAULT_API_KEY = process.env.UPVOTE_API_KEY || "";
const BIND_HOST = process.env.BIND_HOST || "0.0.0.0";

console.error(`[upvote-mcp-remote] Booting remote MCP server port=${PORT} default_api_key_present=${Boolean(DEFAULT_API_KEY)}`);

function extractApiKey(req) {
  const headerKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "").trim();
  const key = (typeof headerKey === "string" ? headerKey : "") || DEFAULT_API_KEY;
  console.error(`[upvote-mcp-remote] extractApiKey: present=${Boolean(key)} source=${headerKey ? "request" : DEFAULT_API_KEY ? "env" : "none"}`);
  return key;
}

const app = createMcpExpressApp({ host: BIND_HOST });

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "upvote-club-mcp-remote",
    version: "1.0.0",
    mcp_path: "/mcp",
  });
});

app.all("/mcp", async (req, res) => {
  console.error(`[upvote-mcp-remote] MCP ${req.method} /mcp from=${req.ip}`);

  const apiKey = extractApiKey(req);
  const server = createUpvoteClubServer({
    apiKey,
    logPrefix: "[upvote-mcp-remote]",
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
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
  console.error("[upvote-mcp-remote] Claude connector URL: https://YOUR-HOST/mcp with X-API-Key header");
});

function shutdown(signal) {
  console.error(`[upvote-mcp-remote] ${signal} received, shutting down`);
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
