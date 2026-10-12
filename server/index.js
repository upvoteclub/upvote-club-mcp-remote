#!/usr/bin/env node
import { serve } from "@hono/node-server";

import { createUpvoteClubMcpHandler } from "./handler.js";

const PORT = parseInt(process.env.PORT || "8787", 10);
const BIND_HOST = process.env.BIND_HOST || "0.0.0.0";
const LOG_PREFIX = "[upvote-mcp-remote]";


// ─── Ariadne's Thread [AT-2249] ─────────────────────
// What: Run the Fetch API MCP handler as a standalone Node HTTP server.
// Why:  Local development and Node hosts use the same handler as the Vercel route.
// Date: 2026-10-12
// Related: [AT-2256] remote→server/handler.js:createUpvoteClubMcpHandler
// ─────────────────────────────────────────────────────
const handleRequest = createUpvoteClubMcpHandler({ logPrefix: LOG_PREFIX });

const httpServer = serve(
  { fetch: handleRequest, port: PORT, hostname: BIND_HOST },
  () => {
    console.error(`${LOG_PREFIX} Listening on http://${BIND_HOST}:${PORT}/mcp`);
    console.error(`${LOG_PREFIX} Health check: GET /health`);
  },
);

function shutdown(signal) {
  console.error(`${LOG_PREFIX} ${signal} received, shutting down`);
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
