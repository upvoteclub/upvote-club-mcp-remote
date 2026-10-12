const DEFAULT_AUTH_SERVER_URL = "https://api.upvote.club";
const DEFAULT_RESOURCE_URL = "https://mcp.upvote.club/mcp";
const DEFAULT_RESOURCE_METADATA_URL =
  "https://mcp.upvote.club/.well-known/oauth-protected-resource";


function headerValue(headers, name) {
  return (headers.get(name) || "").trim();
}

function canonicalResource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hash) {
      return "";
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function getRemoteOAuthConfig() {
  const authServerUrl = (
    process.env.MCP_AUTH_SERVER_URL || DEFAULT_AUTH_SERVER_URL
  ).replace(/\/+$/, "");
  const resourceUrl = (
    process.env.MCP_RESOURCE_URL || DEFAULT_RESOURCE_URL
  ).replace(/\/+$/, "");
  const resourceMetadataUrl =
    process.env.MCP_OAUTH_RESOURCE_METADATA_URL ||
    DEFAULT_RESOURCE_METADATA_URL;
  const internalSecret = process.env.MCP_INTERNAL_SECRET || "";

  return {
    authServerUrl,
    resourceUrl,
    resourceMetadataUrl,
    internalSecret,
  };
}

export function protectedResourceMetadata(config = getRemoteOAuthConfig()) {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.authServerUrl],
    scopes_supported: ["tasks:read", "tasks:write"],
    resource_name: "Upvote.club MCP",
    resource_documentation: "https://upvote.club/api",
    resource_policy_uri: "https://upvote.club/privacy-policy",
  };
}

export function oauthChallenge(
  config = getRemoteOAuthConfig(),
  {
    error = "invalid_token",
    description = "Connect your Upvote.club account to continue.",
    scopes = ["tasks:read", "tasks:write"],
  } = {},
) {
  // RFC 6750 3.1: omit error attributes when the request carried no credentials.
  const errorAttributes = error
    ? `error="${error}", error_description="${description}", `
    : "";
  return (
    `Bearer resource_metadata="${config.resourceMetadataUrl}", ` +
    errorAttributes +
    `scope="${scopes.join(" ")}"`
  );
}


// ─── Ariadne's Thread [AT-2246] ─────────────────────
// What: Resolve API-key requests locally and validate OAuth bearer tokens through private introspection.
// Why:  The MCP resource server must validate audience-bound tokens and must not pass them through upstream.
// Date: 2026-10-12
// Related: [AT-2233] backend→api/mcp_oauth_views.py:mcp_oauth_introspect,
//          [AT-2237] backend→api/public_api_views.py:_authenticate_public_api_request
// ─────────────────────────────────────────────────────
export async function resolveRequestAuthentication(
  headers,
  {
    config = getRemoteOAuthConfig(),
    logPrefix = "[upvote-mcp-remote]",
  } = {},
) {
  const apiKey = headerValue(headers, "x-api-key");
  const authorization = headerValue(headers, "authorization");

  if (apiKey && authorization) {
    console.error(`${logPrefix} Authentication rejected: multiple credential types`);
    return {
      ok: false,
      status: 400,
      error: "Send either X-API-Key or Authorization, not both.",
    };
  }

  if (apiKey) {
    console.error(`${logPrefix} Authentication selected: api_key`);
    return {
      ok: true,
      mode: "api_key",
      apiKey,
    };
  }

  if (!authorization) {
    console.error(
      `${logPrefix} Authentication required: request has no credentials, sending OAuth challenge`,
    );
    return {
      ok: false,
      status: 401,
      error: "Connect your Upvote.club account or send an X-API-Key header.",
      challenge: oauthChallenge(config, { error: null }),
    };
  }

  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    console.error(`${logPrefix} Authentication rejected: unsupported Authorization scheme`);
    return {
      ok: false,
      status: 401,
      error: "Authorization must use the Bearer scheme.",
      challenge: oauthChallenge(config),
    };
  }
  if (!config.internalSecret) {
    console.error(`${logPrefix} OAuth rejected: MCP_INTERNAL_SECRET is not configured`);
    return {
      ok: false,
      status: 503,
      error: "OAuth authentication is temporarily unavailable.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(`${config.authServerUrl}/api/mcp-oauth/introspect/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MCP-Internal-Secret": config.internalSecret,
      },
      body: JSON.stringify({ token: bearerMatch[1] }),
      signal: controller.signal,
    });
  } catch (error) {
    console.error(
      `${logPrefix} OAuth introspection network error: ${error.message}`,
    );
    return {
      ok: false,
      status: 503,
      error: "OAuth validation is temporarily unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    console.error(
      `${logPrefix} OAuth introspection returned invalid JSON: status=${response.status} error=${error.message}`,
    );
  }

  const audienceMatches =
    canonicalResource(payload.aud || "") ===
    canonicalResource(config.resourceUrl);
  const userId = String(payload.sub || "");
  const scopes = String(payload.scope || "")
    .split(/\s+/)
    .filter(Boolean);

  if (
    !response.ok ||
    payload.active !== true ||
    !audienceMatches ||
    !/^\d+$/.test(userId)
  ) {
    console.error(
      `${logPrefix} OAuth introspection rejected: status=${response.status} active=${payload.active === true} audience_matches=${audienceMatches}`,
    );
    return {
      ok: false,
      status: 401,
      error: "The OAuth access token is invalid, expired, or not issued for this MCP server.",
      challenge: oauthChallenge(config),
    };
  }

  console.error(
    `${logPrefix} Authentication selected: oauth user_id=${userId} scopes=${scopes.join(",")}`,
  );
  return {
    ok: true,
    mode: "oauth",
    serviceAuth: {
      userId,
      scopes,
      internalSecret: config.internalSecret,
    },
  };
}
