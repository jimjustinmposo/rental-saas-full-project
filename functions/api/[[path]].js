/**
 * Cloudflare Pages Functions - Main API Router
 * 
 * This replaces the Express server.js for use with Cloudflare Pages Functions.
 * Routes all /api/* requests to appropriate handlers.
 * 
 * Structure: functions/api/[[path]].js
 * The [[path]] dynamic segment captures the remaining URL path
 */

const {
  handleAuthRoutes,
  handleApartmentRoutes,
  handleUnitRoutes,
  handleTenantRoutes,
  handlePaymentRoutes,
  handleExpenseRoutes,
  handleReportRoutes,
} = require("../lib/src/handlers");

const { initializeSchema } = require("../lib/src/db-d1");

/**
 * Ensure the D1 schema has been initialized for this isolate.
 *
 * The previous version ran initializeSchema() on EVERY request (~15 SQL
 * statements + a console.log per API call). Because Cloudflare reuses
 * isolates across many requests, it only needs to run once per isolate.
 * We cache the in-flight promise so concurrent first requests share a single
 * run, and clear it on failure so the next request can safely retry.
 */
let schemaInitPromise = null;
function ensureSchema(env) {
  if (!schemaInitPromise) {
    schemaInitPromise = initializeSchema(env.DB).catch((err) => {
      schemaInitPromise = null;
      throw err;
    });
  }
  return schemaInitPromise;
}

/**
 * Resolve the allowed CORS origin.
 * Reflects the request's Origin header when it matches the configured
 * FRONTEND_URL (comma-separated allowed list), otherwise falls back to the
 * first configured value, so the deployed pages.dev domain (and any custom
 * domain added later) works without CORS errors.
 */
function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && (allowed.length === 0 || allowed.includes(origin))) return origin;
  if (allowed.length > 0) return allowed[0];
  return origin || "*";
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(request, response, env) {
  const headers = new Headers(response.headers);
  const allowedOrigin = getAllowedOrigin(request, env);

  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle OPTIONS requests (CORS preflight)
 */
function handleOptions(request, env) {
  const allowedOrigin = getAllowedOrigin(request, env);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

/**
 * Main Pages Function handler
 */
export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const rawPath = typeof params?.path === "string" ? params.path : url.pathname;
  const normalizedPath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  const pathValue = normalizedPath.replace(/^\/api\/?/, "");

  // Handle OPTIONS for CORS
  if (request.method === "OPTIONS") {
    return handleOptions(request, env);
  }

  try {
    // Ensure the D1 schema exists. Guarded so it only runs ONCE per isolate
    // (not on every request) — see ensureSchema above.
    await ensureSchema(env);

    // Parse the path to determine which handler to use
    const pathSegments = pathValue ? pathValue.split("/").filter(Boolean) : [];
    const resource = pathSegments[0];
    const restOfPath = pathSegments.slice(1).join("/");

    let response;

    // Route to appropriate handler based on resource
    switch (resource) {
      case "health":
        response = new Response(
          JSON.stringify({ status: "ok" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
        break;

      case "auth":
        response = await handleAuthRoutes(request, env, restOfPath);
        break;

      case "apartments":
        response = await handleApartmentRoutes(request, env, restOfPath);
        break;

      case "units":
        response = await handleUnitRoutes(request, env, restOfPath);
        break;

      case "tenants":
        response = await handleTenantRoutes(request, env, restOfPath);
        break;

      case "payments":
        response = await handlePaymentRoutes(request, env, restOfPath);
        break;

      case "expenses":
        response = await handleExpenseRoutes(request, env, restOfPath);
        break;

      case "reports":
        response = await handleReportRoutes(request, env, restOfPath);
        break;

      default:
        response = new Response(
          JSON.stringify({ error: "Route not found." }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
    }

    // Add CORS headers to all responses
    return addCorsHeaders(request, response, env);
  } catch (err) {
    console.error("[api] Unhandled error:", err);
    
    const response = new Response(
      JSON.stringify({ error: "Unexpected server error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
    
    return addCorsHeaders(request, response, env);
  }
}
