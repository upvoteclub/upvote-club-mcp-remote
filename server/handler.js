import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createUniversalUpvoteClubServer } from "./create-universal-server.js";
import {
  getRemoteOAuthConfig,
  protectedResourceMetadata,
  resolveRequestAuthentication,
} from "./oauth.js";

export { getRemoteOAuthConfig } from "./oauth.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
  "X-Content-Type-Options": "nosniff",
};

const PROTECTED_RESOURCE_METADATA_PATHS = new Set([
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
]);


function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return withCors(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
    }),
  );
}


// ─── Ariadne's Thread [AT-2256] ─────────────────────
// What: Serve the universal remote MCP through one Fetch API handler (Request → Response).
// Why:  The same code must run on Vercel route handlers and in the standalone Node server.
// Date: 2026-10-12
// Related: [AT-2246] remote→server/oauth.js:resolveRequestAuthentication,
//          [AT-2247] remote→server/create-universal-server.js,
//          frontend→app/mcp/route.ts
// ─────────────────────────────────────────────────────
export function createUpvoteClubMcpHandler({
  config = getRemoteOAuthConfig(),
  logPrefix = "[upvote-mcp-remote]",
} = {}) {
  console.error(
    `${logPrefix} MCP handler ready resource=${config.resourceUrl} authorization_server=${config.authServerUrl} oauth_configured=${Boolean(config.internalSecret)}`,
  );

  return async function handleUpvoteClubMcpRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    console.error(`${logPrefix} ${request.method} ${pathname}`);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (PROTECTED_RESOURCE_METADATA_PATHS.has(pathname)) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "GET" });
      }
      return jsonResponse(protectedResourceMetadata(config));
    }

    if (pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "upvote-club-mcp-remote",
        version: "2.0.0",
        mcp_path: "/mcp",
        oauth_configured: Boolean(config.internalSecret),
      });
    }

    if (pathname !== "/mcp") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (request.method !== "POST") {
      console.error(
        `${logPrefix} Rejecting ${request.method} /mcp: stateless server accepts POST only`,
      );
      return jsonResponse(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        },
        405,
        { Allow: "POST, OPTIONS" },
      );
    }

    const authentication = await resolveRequestAuthentication(request.headers, {
      config,
      logPrefix,
    });
    if (!authentication.ok) {
      return jsonResponse(
        { error: authentication.error },
        authentication.status,
        authentication.challenge
          ? { "WWW-Authenticate": authentication.challenge }
          : {},
      );
    }

    const server = createUniversalUpvoteClubServer({
      apiKey: authentication.mode === "api_key" ? authentication.apiKey : "",
      serviceAuth:
        authentication.mode === "oauth" ? authentication.serviceAuth : null,
      oauthResourceMetadataUrl: config.resourceMetadataUrl,
      logPrefix,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      console.error(`${logPrefix} MCP response status=${response.status}`);
      return withCors(response);
    } catch (error) {
      console.error(
        `${logPrefix} MCP handler error: ${error?.stack || error?.message || error}`,
      );
      return jsonResponse(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        },
        500,
      );
    } finally {
      await transport
        .close()
        .catch((error) =>
          console.error(`${logPrefix} transport.close error: ${error.message}`),
        );
      await server
        .close()
        .catch((error) =>
          console.error(`${logPrefix} server.close error: ${error.message}`),
        );
    }
  };
}
