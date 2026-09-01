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
} = require("../../src/handlers");

const { initializeSchema } = require("../../src/db-d1");

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response, env) {
  const headers = new Headers(response.headers);
  const frontendUrl = env.FRONTEND_URL || "*";
  
  headers.set("Access-Control-Allow-Origin", frontendUrl);
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
function handleOptions(env) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": env.FRONTEND_URL || "*",
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
    return handleOptions(env);
  }

  try {
    // Initialize database schema on first request
    // (This is safe because schema.sql uses IF NOT EXISTS everywhere)
    await initializeSchema(env.DB);

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
    return addCorsHeaders(response, env);
  } catch (err) {
    console.error("[api] Unhandled error:", err);
    
    const response = new Response(
      JSON.stringify({ error: "Unexpected server error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
    
    return addCorsHeaders(response, env);
  }
}
