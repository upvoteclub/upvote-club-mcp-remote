import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";


function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForHealth(port, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Remote MCP exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // The child has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Remote MCP did not become healthy.");
}

function startRemote({ port, upstreamPort }) {
  const child = spawn("node", ["server/index.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      MCP_INTERNAL_SECRET: "test-internal-secret",
      MCP_AUTH_SERVER_URL: `http://127.0.0.1:${upstreamPort}`,
      MCP_RESOURCE_URL: "https://mcp.upvote.club/mcp",
      MCP_OAUTH_RESOURCE_METADATA_URL:
        "https://mcp.upvote.club/.well-known/oauth-protected-resource",
      UPVOTE_API_URL: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function connectClient(port, headers) {
  const client = new Client({
    name: "upvote-club-remote-test",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    {
      requestInit: { headers },
    },
  );
  await client.connect(transport);
  return client;
}


// ─── Ariadne's Thread [AT-2251] ─────────────────────
// What: Smoke-test discovery, OAuth introspection, API-key fallback, and token non-passthrough.
// Why:  The canonical endpoint must authenticate every supported MCP host without leaking bearer tokens upstream.
// Date: 2026-10-12
// Related: [AT-2246] remote→server/oauth.js:resolveRequestAuthentication,
//          [AT-2249] remote→server/index.js:/mcp
// ─────────────────────────────────────────────────────
test("universal remote MCP supports OAuth and API-key clients", async () => {
  const upstreamRequests = [];
  const upstream = createServer(async (request, response) => {
    const bodyChunks = [];
    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }
    const bodyText = Buffer.concat(bodyChunks).toString("utf8");

    if (request.url === "/api/mcp-oauth/introspect/") {
      const body = JSON.parse(bodyText || "{}");
      const active =
        request.headers["x-mcp-internal-secret"] === "test-internal-secret" &&
        body.token === "valid-oauth-token";
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify(
          active
            ? {
                active: true,
                sub: "42",
                scope: "tasks:read tasks:write",
                aud: "https://mcp.upvote.club/mcp",
              }
            : { active: false },
        ),
      );
      return;
    }

    if (request.url?.startsWith("/api/public-api/task-status/")) {
      upstreamRequests.push({
        authorization: request.headers.authorization,
        apiKey: request.headers["x-api-key"],
        internalSecret: request.headers["x-mcp-internal-secret"],
        userId: request.headers["x-mcp-user-id"],
        scopes: request.headers["x-mcp-oauth-scopes"],
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          count: 1,
          tasks: [
            {
              id: 123,
              type: "UPVOTE",
              status: "ACTIVE",
              actions_required: 10,
              actions_completed: 4,
              progress_percentage: 40,
            },
          ],
        }),
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  const upstreamPort = await listen(upstream);
  const remotePort = 9876 + Math.floor(Math.random() * 1000);
  const child = startRemote({ port: remotePort, upstreamPort });

  try {
    const health = await waitForHealth(remotePort, child);
    assert.equal(health.ok, true);
    assert.equal(health.version, "2.0.0");
    assert.equal(health.oauth_configured, true);

    const metadataResponse = await fetch(
      `http://127.0.0.1:${remotePort}/.well-known/oauth-protected-resource`,
    );
    assert.equal(metadataResponse.status, 200);
    const metadata = await metadataResponse.json();
    assert.equal(metadata.resource, "https://mcp.upvote.club/mcp");
    assert.deepEqual(metadata.scopes_supported, [
      "tasks:read",
      "tasks:write",
    ]);

    const oauthClient = await connectClient(remotePort, {
      Authorization: "Bearer valid-oauth-token",
    });
    try {
      const result = await oauthClient.callTool({
        name: "get_task_status",
        arguments: { task_ids: [123] },
      });
      assert.equal(result.structuredContent.success, true);
      assert.equal(result.structuredContent.tasks[0].progress_percentage, 40);
    } finally {
      await oauthClient.close();
    }

    const apiKeyClient = await connectClient(remotePort, {
      "X-API-Key": "upv_test_key",
    });
    try {
      const result = await apiKeyClient.callTool({
        name: "get_task_status",
        arguments: { task_ids: [123] },
      });
      assert.equal(result.structuredContent.success, true);
    } finally {
      await apiKeyClient.close();
    }

    assert.equal(upstreamRequests.length, 2);
    assert.equal(upstreamRequests[0].authorization, undefined);
    assert.equal(
      upstreamRequests[0].internalSecret,
      "test-internal-secret",
    );
    assert.equal(upstreamRequests[0].userId, "42");
    assert.equal(upstreamRequests[0].scopes, "tasks:read tasks:write");
    assert.equal(upstreamRequests[1].apiKey, "upv_test_key");
    assert.equal(upstreamRequests[1].authorization, undefined);

    const invalidTokenResponse = await fetch(
      `http://127.0.0.1:${remotePort}/mcp`,
      {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer invalid-oauth-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "invalid-test", version: "1.0.0" },
          },
        }),
      },
    );
    assert.equal(invalidTokenResponse.status, 401);
    assert.match(
      invalidTokenResponse.headers.get("www-authenticate"),
      /resource_metadata=/,
    );

    const anonymousResponse = await fetch(
      `http://127.0.0.1:${remotePort}/mcp`,
      {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "anonymous-test", version: "1.0.0" },
          },
        }),
      },
    );
    assert.equal(anonymousResponse.status, 401);
    const anonymousChallenge = anonymousResponse.headers.get("www-authenticate");
    assert.match(
      anonymousChallenge,
      /resource_metadata="https:\/\/mcp\.upvote\.club\/\.well-known\/oauth-protected-resource"/,
    );
    assert.match(anonymousChallenge, /scope="tasks:read tasks:write"/);
    assert.doesNotMatch(anonymousChallenge, /error=/);
    assert.equal(upstreamRequests.length, 2);

    const preflightResponse = await fetch(
      `http://127.0.0.1:${remotePort}/mcp`,
      { method: "OPTIONS" },
    );
    assert.equal(preflightResponse.status, 204);
  } finally {
    child.kill("SIGTERM");
    await closeServer(upstream);
  }
});

