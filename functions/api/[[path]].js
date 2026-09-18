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

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

function isProduction(env) {
  return (env.NODE_ENV || "").toLowerCase() === "production";
}

/**
 * Build the CORS allowlist. Production uses ONLY the configured FRONTEND_URL
 * list (comma-separated). Development additionally allows the usual dev ports
 * so the app keeps working out of the box locally.
 */
function allowedOrigins(env) {
  const configured = (env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (isProduction(env)) return configured;
  return configured.concat(DEV_ORIGINS);
}

/**
 * Resolve the allowed CORS origin, or null when the request origin is not
 * trusted. A null result emits no CORS headers, so the browser blocks the
 * cross-origin read — unknown sites never get to read the response.
 *
 * Same-origin requests (the normal production case, where Pages serves both
 * the SPA and /api) never need CORS headers at all.
 */
function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = allowedOrigins(env);
  if (allowed.length === 0) {
    // Nothing configured: fail closed in production, stay permissive in dev.
    return isProduction(env) ? null : origin;
  }
  return allowed.includes(origin) ? origin : null;
}

/**
 * Handle OPTIONS requests (CORS preflight)
 */
function handleOptions(request, env) {
  const allowedOrigin = getAllowedOrigin(request, env);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, If-None-Match",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return new Response(null, { status: 204, headers });
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 20; // 20 auth POSTs per IP per window
const rateBuckets = new Map();

/**
 * Fixed-window limiter kept in isolate memory. It is intentionally a cheap
 * first line of defence against password brute-forcing and signup spam — an
 * attacker spread across many colo isolates can still exceed it, so it
 * complements (never replaces) the PBKDF2 hashing and password-length rules.
 *
 * Returns a 429 Response when the limit is exceeded, otherwise null.
 */
function checkRateLimit(request, resource, method) {
  if (resource !== "auth" || method !== "POST") return null;

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
    "unknown";

  const key = `${ip}|auth`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    // Opportunistic cleanup so the map cannot grow without bound.
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) {
        if (now - v.start > RATE_LIMIT_WINDOW_MS) rateBuckets.delete(k);
      }
    }
    return null;
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.max(
      1,
      Math.ceil((bucket.start + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    return new Response(
      JSON.stringify({ error: "Too many attempts. Please wait a few minutes and try again." }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
      }
    );
  }
  return null;
}

/**
 * Resource prefixes whose GET responses are safe to store in the browser cache.
 * Everything else (health, auth, and every mutation) is explicitly `no-store`.
 *
 * `private` matters: these payloads are per-owner, so a shared/CDN cache must
 * never store them.
 *
 * We deliberately use `no-cache` (store, but ALWAYS revalidate) instead of
 * `max-age=10`: a positive max-age would let the browser replay a stale list
 * for up to 10 s after a write, making a just-created payment appear missing.
 * With the ETag below, revalidation costs a ~200 byte 304 instead of the whole
 * JSON body, so this is both correct and cheap. Instant paint is handled one
 * layer up by the in-memory stale-while-revalidate cache in
 * frontend/src/api/cache.js, which mutations bypass via invalidate().
 */
const CACHEABLE_GET_RESOURCES = new Set([
  "apartments",
  "units",
  "tenants",
  "payments",
  "expenses",
  "reports",
]);

const CACHEABLE_CACHE_CONTROL = "private, no-cache";

function cacheControlFor(method, resource) {
  if (method === "GET" && CACHEABLE_GET_RESOURCES.has(resource)) {
    return CACHEABLE_CACHE_CONTROL;
  }
  return "no-store";
}

/**
 * Weak ETag over the response body. 32 hex chars (128 bits) of SHA-256 is far
 * more than enough to detect changes in a few KB of JSON, and a short ETag
 * keeps the header small.
 */
async function computeEtag(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let hex = "";
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, "0");
  return `W/"${hex.slice(0, 32)}"`;
}

/**
 * Attach caching, security and CORS headers to a handler response, and
 * short-circuit with 304 Not Modified when the client already holds this body.
 */
async function finalize(request, env, response, resource) {
  const method = request.method;
  const headers = new Headers(response.headers);

  headers.set("Cache-Control", cacheControlFor(method, resource));

  // Baseline security headers for the JSON API.
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  // The CORS headers vary by Origin, so any cache must key on it too.
  headers.set("Vary", "Origin");

  const origin = getAllowedOrigin(request, env);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, If-None-Match");
    headers.set("Access-Control-Expose-Headers", "ETag");
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  // Only successful, cacheable GETs get an ETag — no point hashing errors or
  // mutation responses, and `no-store` responses must not be revalidated.
  const etagEligible =
    method === "GET" && response.status === 200 && CACHEABLE_GET_RESOURCES.has(resource);

  if (!etagEligible) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const bodyText = await response.text();
  const etag = await computeEtag(bodyText);
  headers.set("ETag", etag);

  if (request.headers.get("If-None-Match") === etag) {
    // 304 must not carry a body; the cached copy is still valid.
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  return new Response(bodyText, {
    status: response.status,
    statusText: response.statusText,
    headers,
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

  // Parse the path to determine which handler to use
  const pathSegments = pathValue ? pathValue.split("/").filter(Boolean) : [];
  const resource = pathSegments[0];
  const restOfPath = pathSegments.slice(1).join("/");

  try {
    // Cheap brute-force guard for /api/auth/* before any DB work happens.
    const limited = checkRateLimit(request, resource, request.method);
    if (limited) return await finalize(request, env, limited, resource);

    // Ensure the D1 schema exists. Guarded so it only runs ONCE per isolate
    // (not on every request) — see ensureSchema above.
    await ensureSchema(env);

    let response;

    // Route to appropriate handler based on resource
    switch (resource) {
      case "health":
        // Booleans only — never echo secret values. Lets an operator confirm
        // that `wrangler secret put` actually landed before users hit 401s.
        response = new Response(
          JSON.stringify({
            status: "ok",
            configured: {
              jwtSecret: Boolean(env.JWT_SECRET),
              adminSignupPassword: Boolean(env.ADMIN_SIGNUP_PASSWORD),
              frontendUrl: Boolean(env.FRONTEND_URL),
              database: Boolean(env.DB),
              bucket: Boolean(env.BUCKET),
            },
          }),
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

    // Add caching, security and CORS headers to all responses
    return await finalize(request, env, response, resource);
  } catch (err) {
    console.error("[api] Unhandled error:", err);
    
    const response = new Response(
      JSON.stringify({ error: "Unexpected server error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
    
    return await finalize(request, env, response, resource);
  }
}
