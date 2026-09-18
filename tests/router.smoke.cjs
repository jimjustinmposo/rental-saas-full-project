/**
 * Smoke test for functions/api/[[path]].js (the real router).
 *
 * Run from the project root:  node tests/router.smoke.cjs
 *
 * Nothing is reimplemented: the actual router source is loaded, with only two
 * mechanical rewrites so plain Node can execute it -
 *   1. `export async function onRequest` -> `async function onRequest` + CJS export
 *   2. its two relative requires -> absolute paths
 * The real handlers.js + db-d1.js are used as-is; only the D1 binding is stubbed.
 *
 * Covers: /api/health flags + environment mode, CORS allow-list behaviour,
 * fail-closed auth without secrets, ETag/304 + Cache-Control, bad tokens,
 * rate limiting and routing. Needs no network, no wrangler and no bindings.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const ROUTER = path.join(ROOT, "functions", "api", "[[path]].js");
const HANDLERS = path.join(ROOT, "functions", "lib", "src", "handlers.js");
const DBD1 = path.join(ROOT, "functions", "lib", "src", "db-d1.js");
const TMP = path.join(os.tmpdir(), "__router_under_test.cjs");

function loadRouter() {
  let src = fs.readFileSync(ROUTER, "utf8");
  src = src.replace("export async function onRequest", "async function onRequest");
  src = src.replace(/"\.\.\/lib\/src\/handlers"/g, JSON.stringify(HANDLERS));
  src = src.replace(/"\.\.\/lib\/src\/db-d1"/g, JSON.stringify(DBD1));
  src += "\nmodule.exports = { onRequest };\n";
  fs.writeFileSync(TMP, src);
  return require(TMP);
}

// ---------------------------------------------------------------- D1 stub
const TENANT_ROWS = [
  { id: 1, name: "Ana Reyes", unit_id: 1, status: "Active" },
  { id: 2, name: "Ben Cruz", unit_id: 2, status: "Active" },
];
function makeStatement() {
  return {
    bind: () => makeStatement(),
    run: async () => ({ success: true, meta: { changes: 0 }, results: [] }),
    all: async () => ({ success: true, results: TENANT_ROWS, meta: {} }),
    first: async () => null,
    raw: async () => [],
  };
}
const fakeDB = {
  prepare: () => makeStatement(),
  batch: async (stmts) => stmts.map(() => ({ success: true, results: TENANT_ROWS, meta: { changes: 0 } })),
};

// ------------------------------------------------------------- JWT helpers
function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  return `${data}.${b64url(crypto.createHmac("sha256", secret).update(data).digest())}`;
}

// --------------------------------------------------------------- harness
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function env(overrides) {
  return Object.assign({ DB: fakeDB, BUCKET: {} }, overrides);
}
async function call(router, envObj, url, init) {
  const request = new Request(`https://rental-saas-prod.pages.dev${url}`, init);
  return router.onRequest({ request, env: envObj, params: {} });
}
function json(body, extraHeaders) {
  return {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders),
    body: JSON.stringify(body),
  };
}

(async () => {
  const router = loadRouter();

  console.log("\n[1] /api/health reports the deployment mode and secret presence");
  let res = await call(router, env({ FRONTEND_URL: "https://app.example.com" }), "/api/health", {});
  let body = await res.json();
  check("status 200", res.status === 200, `got ${res.status}`);
  check("environment=production when NODE_ENV is unset", body.environment === "production", body.environment);
  check("jwtSecret=false", body.configured.jwtSecret === false);
  check("health is no-store", res.headers.get("Cache-Control") === "no-store", res.headers.get("Cache-Control"));
  res = await call(router, env({ JWT_SECRET: "s" }), "/api/health", {});
  check("jwtSecret set -> true", (await res.json()).configured.jwtSecret === true);
  check("database/bucket flags true", (await (async () => {
    const r = await call(router, env({ JWT_SECRET: "s" }), "/api/health", {});
    const b = await r.json();
    return b.configured.database === true && b.configured.bucket === true;
  })()) === true);

  res = await call(router, env({ NODE_ENV: "development" }), "/api/health", {});
  check("environment=development when explicitly opted in", (await res.json()).environment === "development");
  res = await call(router, env({ NODE_ENV: "Production" }), "/api/health", {});
  check("NODE_ENV=Production (odd case) still fails closed", (await res.json()).environment === "production");

  console.log("\n[2] CORS: localhost is only trusted in explicit dev mode");
  const localhost = { Origin: "http://localhost:3000" };
  res = await call(router, env({ FRONTEND_URL: "https://app.example.com" }), "/api/health", { headers: localhost });
  check("deployed: localhost gets no CORS header", res.headers.get("Access-Control-Allow-Origin") === null, String(res.headers.get("Access-Control-Allow-Origin")));
  res = await call(router, env({ FRONTEND_URL: "https://app.example.com", NODE_ENV: "development" }), "/api/health", { headers: localhost });
  check("dev: localhost allowed", res.headers.get("Access-Control-Allow-Origin") === "http://localhost:3000");
  res = await call(router, env({ FRONTEND_URL: "https://app.example.com" }), "/api/health", { headers: { Origin: "https://app.example.com" } });
  check("deployed: allow-listed origin allowed", res.headers.get("Access-Control-Allow-Origin") === "https://app.example.com");
  res = await call(router, env({ FRONTEND_URL: "https://app.example.com" }), "/api/health", { headers: { Origin: "https://evil.example.net" } });
  check("deployed: unknown origin gets no CORS headers", res.headers.get("Access-Control-Allow-Origin") === null);

  console.log("\n[3] Auth fails closed without secrets, still usable in dev");
  res = await call(router, env({ JWT_SECRET: "prod-secret" }), "/api/auth/verify-admin-password", json({ password: "fmc10123" }));
  check("deployed + no ADMIN_SIGNUP_PASSWORD -> 503", res.status === 503, `got ${res.status}`);

  res = await call(router, env({ JWT_SECRET: "prod-secret", ADMIN_SIGNUP_PASSWORD: "real-admin-pass" }), "/api/auth/verify-admin-password", json({ password: "nope" }));
  check("deployed + both secrets set + wrong password -> 401", res.status === 401, `got ${res.status}`);
  res = await call(router, env({ JWT_SECRET: "prod-secret", ADMIN_SIGNUP_PASSWORD: "real-admin-pass" }), "/api/auth/verify-admin-password", json({ password: "real-admin-pass" }));
  check("deployed + correct password -> 200 ok:true", res.status === 200 && (await res.json()).ok === true, `got ${res.status}`);

  res = await call(router, env({}), "/api/auth/verify-admin-password", json({ password: "fmc10123" }));
  check("deployed + no JWT_SECRET -> 500 (not silently 200)", res.status === 500, `got ${res.status}`);
  check("500 body is generic", (await res.json()).error === "Unexpected server error.");

  res = await call(router, env({ NODE_ENV: "development" }), "/api/auth/verify-admin-password", json({ password: "fmc10123" }));
  check("dev fallback password still works locally", res.status === 200 && (await res.json()).ok === true, `got ${res.status}`);

  console.log("\n[4] Authenticated GET: ETag, 304, cache-control, bad tokens");
  const devEnv = env({ NODE_ENV: "development", FRONTEND_URL: "http://localhost:3000" });
  const token = signJwt({ owner_id: 7, email: "owner@example.com", exp: Math.floor(Date.now() / 1000) + 3600 }, "dev-secret");
  res = await call(router, devEnv, "/api/tenants", { headers: { Authorization: `Bearer ${token}`, Origin: "http://localhost:3000" } });
  const etag = res.headers.get("ETag");
  check("200 with dev-signed token", res.status === 200, `got ${res.status}`);
  check("Cache-Control private, no-cache", res.headers.get("Cache-Control") === "private, no-cache", res.headers.get("Cache-Control"));
  check("ETag present", typeof etag === "string" && etag.startsWith('W/"'), String(etag));
  check("ETag exposed over CORS", res.headers.get("Access-Control-Expose-Headers") === "ETag");
  check("security headers on API", res.headers.get("X-Content-Type-Options") === "nosniff" && res.headers.get("X-Frame-Options") === "DENY");

  res = await call(router, devEnv, "/api/tenants", { headers: { Authorization: `Bearer ${token}`, "If-None-Match": etag } });
  check("If-None-Match -> 304", res.status === 304, `got ${res.status}`);
  check("304 has empty body", (await res.text()) === "");
  check("304 keeps ETag", res.headers.get("ETag") === etag);

  const forged = signJwt({ owner_id: 7, exp: Math.floor(Date.now() / 1000) + 3600 }, "attacker-secret");
  res = await call(router, devEnv, "/api/tenants", { headers: { Authorization: `Bearer ${forged}` } });
  check("token signed with a wrong secret -> 401", res.status === 401, `got ${res.status}`);
  res = await call(router, devEnv, "/api/tenants", {});
  check("missing Authorization -> 401", res.status === 401, `got ${res.status}`);

  console.log("\n[5] Rate limit and routing");
  const prodEnv = env({ JWT_SECRET: "prod-secret", ADMIN_SIGNUP_PASSWORD: "real-admin-pass" });
  let limited = 0;
  for (let i = 0; i < 22; i++) {
    const r = await call(router, prodEnv, "/api/auth/verify-admin-password", json({ password: "x" }, { "CF-Connecting-IP": "203.0.113.9" }));
    if (r.status === 429) limited++;
  }
  check("21st+ auth POST from one IP -> 429", limited >= 1, `limit hits=${limited}`);
  res = await call(router, prodEnv, "/api/auth/verify-admin-password", json({ password: "x" }, { "CF-Connecting-IP": "198.51.100.4" }));
  check("different IP is not blocked", res.status === 401, `got ${res.status}`);

  res = await call(router, env({}), "/api/nope", {});
  check("unknown route -> 404 JSON", res.status === 404, `got ${res.status}`);
  res = await call(router, env({}), "/api/health", { method: "OPTIONS", headers: { Origin: "https://app.example.com" } });
  check("OPTIONS preflight -> 204", res.status === 204, `got ${res.status}`);

  try { fs.unlinkSync(TMP); } catch (e) {}

  console.log(`\n==== ${pass} passed, ${failures.length} failed ====`);
  if (failures.length) {
    console.log("Failed checks:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
})().catch((err) => {
  console.error("HARNESS ERROR:", err);
  process.exit(2);
});