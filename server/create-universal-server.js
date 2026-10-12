import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUpvoteClubTools } from "@upvote-club/mcp-core";
import { z } from "zod";

import { TASK_STATUS_HTML } from "../ui/task-status-html.js";


const TASK_STATUS_UI_URI = "ui://upvote-club/task-status.html";
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
const TASK_READ_SECURITY_SCHEMES = [
  { type: "oauth2", scopes: ["tasks:read"] },
];


// ─── Ariadne's Thread [AT-2247] ─────────────────────
// What: Combine every Public API tool and the task-progress MCP App in one remote server.
// Why:  All MCP hosts should connect to one canonical endpoint instead of separate Remote and Apps servers.
// Date: 2026-10-12
// Related: [AT-2244] core→create-server.js:registerUpvoteClubTools,
//          remote→ui/task-status.html
// ─────────────────────────────────────────────────────
export function createUniversalUpvoteClubServer(config = {}) {
  const logPrefix = config.logPrefix || "[upvote-mcp-remote]";
  const uiDomain =
    process.env.MCP_UI_DOMAIN || "https://mcp.upvote.club";
  const server = new McpServer(
    {
      name: "upvote-club",
      version: "2.0.0",
    },
    {
      instructions:
        "Use list_platforms before creating a task when the platform or action is uncertain. " +
        "Before create_task, confirm the URL, action, quantity, price per action, and that points will be spent. " +
        "Use delete_task only after explicit user confirmation.",
    },
  );

  const {
    apiRequest,
    toolResult,
    requireAuthorization,
  } = registerUpvoteClubTools(server, config, {
    skipTools: ["get_task_status"],
  });

  server.registerTool(
    "get_task_status",
    {
      title: "Get Task Status",
      description:
        "Get status and progress of one or more Upvote.club tasks created by the connected account. Returns actions completed, progress percentage, and submitted comment evidence when available.",
      inputSchema: {
        task_ids: z
          .array(z.number().int().positive())
          .min(1)
          .describe("Task IDs returned by create_task"),
      },
      outputSchema: z
        .object({
          success: z.boolean(),
          tasks: z.array(z.object({}).passthrough()).optional(),
          count: z.number().int().optional(),
        })
        .passthrough(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: TASK_READ_SECURITY_SCHEMES,
        ui: {
          resourceUri: TASK_STATUS_UI_URI,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": TASK_STATUS_UI_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Loading task progress…",
        "openai/toolInvocation/invoked": "Task progress ready",
      },
    },
    async (args) => {
      console.error(
        `${logPrefix} Tool call: get_task_status task_ids=${args.task_ids.join(",")}`,
      );
      const authorizationFailure = requireAuthorization("tasks:read");
      if (authorizationFailure) {
        return authorizationFailure;
      }

      const query = args.task_ids.join(",");
      const { ok, status, data } = await apiRequest(
        "GET",
        `/api/public-api/task-status/?task_ids=${encodeURIComponent(query)}`,
      );
      if (!ok) {
        return toolResult(
          { success: false, http_status: status, ...data },
          true,
        );
      }
      return toolResult(data);
    },
  );

  server.registerResource(
    "Upvote.club task progress",
    TASK_STATUS_UI_URI,
    {
      title: "Upvote.club Task Progress",
      description:
        "Interactive progress card for tasks returned by get_task_status.",
      mimeType: MCP_APP_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
          domain: uiDomain,
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
        "openai/widgetDescription":
          "Shows Upvote.club promotion task status and completion progress.",
        "openai/widgetPrefersBorder": true,
        "openai/widgetDomain": uiDomain,
      },
    },
    async () => {
      console.error(
        `${logPrefix} Resource read: ${TASK_STATUS_UI_URI} bytes=${TASK_STATUS_HTML.length}`,
      );
      return {
        contents: [
          {
            uri: TASK_STATUS_UI_URI,
            mimeType: MCP_APP_MIME_TYPE,
            text: TASK_STATUS_HTML,
            _meta: {
              ui: {
                prefersBorder: true,
                domain: uiDomain,
                csp: {
                  connectDomains: [],
                  resourceDomains: [],
                },
              },
              "openai/widgetDescription":
                "Shows Upvote.club promotion task status and completion progress.",
              "openai/widgetPrefersBorder": true,
              "openai/widgetDomain": uiDomain,
            },
          },
        ],
      };
    },
  );

  return server;
}
