// Inlined so bundlers (Next.js on Vercel) ship the MCP App without filesystem tracing.
export const TASK_STATUS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Upvote.club Task Progress</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        --background: #ffffff;
        --surface: #f8fafc;
        --border: #e2e8f0;
        --text: #0f172a;
        --muted: #64748b;
        --accent: #4f46e5;
        --accent-soft: #e0e7ff;
        --error: #b91c1c;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 12px;
        background: transparent;
        color: var(--text);
      }

      main {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--background);
        padding: 16px;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      h1 {
        margin: 0;
        font-size: 16px;
        line-height: 1.3;
      }

      button {
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--background);
        color: var(--text);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        padding: 7px 11px;
      }

      button:hover {
        background: var(--surface);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      #tasks {
        display: grid;
        gap: 10px;
      }

      .task {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
        padding: 12px;
      }

      .task-heading,
      .task-counts {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .task-heading {
        font-size: 13px;
        font-weight: 700;
      }

      .status {
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 11px;
        padding: 3px 7px;
      }

      .task-counts {
        color: var(--muted);
        font-size: 12px;
        margin-top: 9px;
      }

      .track {
        height: 8px;
        margin-top: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--border);
      }

      .progress {
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        transition: width 180ms ease;
      }

      .message {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .message.error {
        color: var(--error);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --background: #111827;
          --surface: #1f2937;
          --border: #374151;
          --text: #f8fafc;
          --muted: #cbd5e1;
          --accent: #a5b4fc;
          --accent-soft: #312e81;
          --error: #fca5a5;
        }
      }
    </style>
  </head>
  <body>
    <!-- ─── Ariadne's Thread [AT-2248] ─────────────────────
      What: Render task progress through the host-neutral MCP Apps postMessage bridge.
      Why:  One UI must work in ChatGPT, Claude, and every MCP Apps-compatible client.
      Date: 2026-10-12
      Related: [AT-2247] remote→server/create-universal-server.js:createUniversalUpvoteClubServer
    ─────────────────────────────────────────────────────── -->
    <main>
      <header>
        <h1>Task Progress</h1>
        <button id="refresh" type="button" disabled>Refresh</button>
      </header>
      <div id="tasks">
        <p class="message">Loading task status…</p>
      </div>
    </main>

    <script type="module">
      const tasksElement = document.querySelector("#tasks");
      const refreshButton = document.querySelector("#refresh");
      const pendingRequests = new Map();
      let nextRequestId = 0;
      let lastTaskIds = [];
      let bridgeReady;

      function notify(method, params) {
        window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
      }

      function request(method, params) {
        return new Promise((resolve, reject) => {
          const id = ++nextRequestId;
          pendingRequests.set(id, { resolve, reject });
          window.parent.postMessage(
            { jsonrpc: "2.0", id, method, params },
            "*",
          );
        });
      }

      function resultPayload(result) {
        if (result?.structuredContent) {
          return result.structuredContent;
        }
        const text = result?.content?.find((item) => item.type === "text")?.text;
        if (!text) {
          return null;
        }
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }

      function showMessage(message, isError = false) {
        tasksElement.replaceChildren();
        const paragraph = document.createElement("p");
        paragraph.className = isError ? "message error" : "message";
        paragraph.textContent = message;
        tasksElement.appendChild(paragraph);
      }

      function renderTasks(payload) {
        if (!payload || payload.success === false) {
          showMessage(
            payload?.error || "Could not load task status.",
            true,
          );
          return;
        }

        const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
        if (tasks.length === 0) {
          showMessage("No tasks returned.");
          return;
        }

        tasksElement.replaceChildren();
        for (const task of tasks) {
          const required = Number(task.actions_required || 0);
          const completed = Number(task.actions_completed || 0);
          const rawPercentage =
            task.progress_percentage ??
            (required > 0 ? Math.round((completed / required) * 100) : 0);
          const percentage = Math.max(
            0,
            Math.min(100, Number(rawPercentage) || 0),
          );

          const article = document.createElement("article");
          article.className = "task";

          const heading = document.createElement("div");
          heading.className = "task-heading";

          const title = document.createElement("span");
          title.textContent =
            "#" + task.id + " · " + (task.type || task.task_type || "TASK");

          const status = document.createElement("span");
          status.className = "status";
          status.textContent = task.status || "UNKNOWN";

          heading.append(title, status);

          const counts = document.createElement("div");
          counts.className = "task-counts";

          const actionCount = document.createElement("span");
          actionCount.textContent = completed + " / " + required + " actions";

          const percentText = document.createElement("span");
          percentText.textContent = percentage + "%";

          counts.append(actionCount, percentText);

          const track = document.createElement("div");
          track.className = "track";
          track.setAttribute("role", "progressbar");
          track.setAttribute("aria-valuemin", "0");
          track.setAttribute("aria-valuemax", "100");
          track.setAttribute("aria-valuenow", String(percentage));

          const progress = document.createElement("div");
          progress.className = "progress";
          progress.style.width = percentage + "%";

          track.appendChild(progress);
          article.append(heading, counts, track);
          tasksElement.appendChild(article);
        }
      }

      function captureToolInput(input) {
        const args = input?.arguments || input;
        if (Array.isArray(args?.task_ids)) {
          lastTaskIds = args.task_ids;
          refreshButton.disabled = lastTaskIds.length === 0;
        }
      }

      window.addEventListener(
        "message",
        (event) => {
          if (event.source !== window.parent) {
            return;
          }
          const message = event.data;
          if (!message || message.jsonrpc !== "2.0") {
            return;
          }

          if (message.id !== undefined) {
            const pending = pendingRequests.get(message.id);
            if (!pending) {
              return;
            }
            pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(message.error);
            } else {
              pending.resolve(message.result);
            }
            return;
          }

          if (message.method === "ui/notifications/tool-input") {
            captureToolInput(message.params);
          }
          if (message.method === "ui/notifications/tool-result") {
            const result = message.params?.result || message.params;
            renderTasks(resultPayload(result));
          }
        },
        { passive: true },
      );

      async function initializeBridge() {
        await request("ui/initialize", {
          appInfo: {
            name: "upvote-club-task-progress",
            version: "2.0.0",
          },
          appCapabilities: {},
          protocolVersion: "2026-01-26",
        });
        notify("ui/notifications/initialized", {});
      }

      bridgeReady = initializeBridge().catch((error) => {
        console.error("Failed to initialize the MCP Apps bridge:", error);
        showMessage("Could not initialize the task progress view.", true);
        throw error;
      });

      refreshButton.addEventListener("click", async () => {
        if (lastTaskIds.length === 0) {
          return;
        }
        refreshButton.disabled = true;
        try {
          await bridgeReady;
          const result = await request("tools/call", {
            name: "get_task_status",
            arguments: { task_ids: lastTaskIds },
          });
          renderTasks(resultPayload(result));
        } catch (error) {
          console.error("Failed to refresh task status:", error);
          showMessage("Could not refresh task status.", true);
        } finally {
          refreshButton.disabled = false;
        }
      });
    </script>
  </body>
</html>
`;
