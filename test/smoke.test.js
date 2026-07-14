import test from "node:test";
import assert from "node:assert/strict";

test("remote health endpoint responds ok", async () => {
  const port = 9876 + Math.floor(Math.random() * 1000);
  process.env.PORT = String(port);
  process.env.UPVOTE_API_KEY = "upv_test";

  const { spawn } = await import("node:child_process");
  const child = spawn("node", ["server/index.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "upvote-club-mcp-remote");
  } finally {
    child.kill("SIGTERM");
  }
});
