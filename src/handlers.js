/**
 * COMPLETE Route Handlers for Cloudflare Pages Functions + D1 + R2
 * 
 * Replaces all Express route files with unified handlers
 * that work with Cloudflare's Request/Response API
 */

const { query, queryOne, execute, batch } = require("./db-d1");

// Optional dependency used ONLY to verify legacy bcrypt hashes that were
// migrated from the old Railway/PostgreSQL backend. New accounts use PBKDF2
// (Web Crypto) so this is not required for them.
let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch (err) {
  bcrypt = null;
}

function base64UrlEncode(bytes) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 120000,
    },
    keyMaterial,
    256
  );

  const saltStr = base64UrlEncode(salt);
  const hashStr = base64UrlEncode(derived);
  return `pbkdf2_sha256$120000$${saltStr}$${hashStr}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  // Legacy bcrypt hashes (migrated from the Railway/PostgreSQL backend).
  // Format example: $2b$10$<22-char-salt><31-char-hash>
  if (/^\$2[aby]\$\d{2}\$/.test(storedHash)) {
    if (!bcrypt) {
      console.error("[auth] bcryptjs not available for legacy hash verification");
      return false;
    }
    try {
      return await bcrypt.compare(password, storedHash);
    } catch (err) {
      console.error("[auth] bcrypt verification error:", err.message);
      return false;
    }
  }

  if (!storedHash.startsWith("pbkdf2_sha256$")) return false;
  const [, iterations, saltB64, hashB64] = storedHash.split("$");
  if (!iterations || !saltB64 || !hashB64) return false;

  const salt = Uint8Array.from(
    atob(saltB64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(saltB64.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0)
  );

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: Number(iterations),
    },
    keyMaterial,
    256
  );

  const expected = base64UrlEncode(derived);
  return safeEqual(expected, hashB64);
}

/**
 * Cache per-secret HMAC CryptoKeys so authenticated requests don't pay for a
 * fresh WebCrypto importKey() on every call. Secrets never change at runtime,
 * so keys are stable for the lifetime of the isolate.
 */
const hmacKeyCache = new Map();

async function getHmacKey(secret) {
  let key = hmacKeyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["sign"]
    );
    hmacKeyCache.set(secret, key);
  }
  return key;
}

async function signJwt(payload, secret) {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;
  const key = await getHmacKey(secret);
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const expectedStr = base64UrlEncode(expected);
  if (!safeEqual(expectedStr, signature)) {
    throw new Error("Invalid JWT signature");
  }
  return JSON.parse(base64UrlDecode(payload));
}

async function getOwnerId(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const decoded = await verifyJwt(token, env.JWT_SECRET || "dev-secret");
    return decoded.owner_id;
  } catch (err) {
    console.error("[auth] Token verification failed:", err.message);
    return null;
  }
}

async function getBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getPathId(path) {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts[0] : null;
}

function computePaymentStatus(due, paid) {
  const d = Number(due) || 0;
  const p = Number(paid) || 0;
  if (p >= d) return "Paid";
  if (p > 0) return "Late";
  return "Unpaid";
}

async function recomputeUnitStatus(db, unitId, ownerId) {
  if (!unitId) return;
  const hasActiveTenant = await queryOne(
    db,
    "SELECT 1 FROM tenants WHERE unit_id = ? AND status = 'Active' LIMIT 1",
    [unitId]
  );
  const status = hasActiveTenant ? "Occupied" : "Vacant";
  await execute(db, "UPDATE units SET status = ? WHERE id = ? AND owner_id = ?", [status, unitId, ownerId]);
}

// ============================================================
// AUTHENTICATION HANDLERS
// ============================================================

async function handleAuthRoutes(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const jwtSecret = env.JWT_SECRET || "dev-secret";

  if (path === "verify-admin-password" && method === "POST") {
    const body = await getBody(request);
    if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const { password } = body;
    const adminPassword = env.ADMIN_SIGNUP_PASSWORD || "fmc10123";
    return new Response(JSON.stringify({ ok: password === adminPassword }), { status: password === adminPassword ? 200 : 401, headers: { "Content-Type": "application/json" } });
  }

  if (path === "signup" && method === "POST") {
    const body = await getBody(request);
    if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const { adminPassword, name, email, password, confirmPassword } = body;
    const requiredAdminPassword = env.ADMIN_SIGNUP_PASSWORD || "fmc10123";

    if (adminPassword !== requiredAdminPassword) return new Response(JSON.stringify({ error: "Incorrect admin password." }), { status: 401, headers: { "Content-Type": "application/json" } });
    if (!name || !email || !password || !confirmPassword) return new Response(JSON.stringify({ error: "All fields are required." }), { status: 400, headers: { "Content-Type": "application/json" } });
    if (password !== confirmPassword) return new Response(JSON.stringify({ error: "Passwords do not match." }), { status: 400, headers: { "Content-Type": "application/json" } });
    if (password.length < 6) return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), { status: 400, headers: { "Content-Type": "application/json" } });

    try {
      const existing = await queryOne(db, "SELECT id FROM owners WHERE email = ?", [email.toLowerCase().trim()]);
      if (existing) return new Response(JSON.stringify({ error: "Email already exists." }), { status: 409, headers: { "Content-Type": "application/json" } });

      const passwordHash = await hashPassword(password);
      await execute(db, `INSERT INTO owners (name, email, password_hash, currency) VALUES (?, ?, ?, 'USD')`, [name.trim(), email.toLowerCase().trim(), passwordHash]);

      const owner = await queryOne(db, "SELECT id, name, email, currency, created_at FROM owners WHERE email = ?", [email.toLowerCase().trim()]);
      const token = await signJwt({ owner_id: owner.id, email: owner.email, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 }, jwtSecret);

      return new Response(JSON.stringify({ token, owner }), { status: 201, headers: { "Content-Type": "application/json" } });
    } catch (err) {
      console.error("[auth/signup]", err);
      return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  if (path === "login" && method === "POST") {
    const body = await getBody(request);
    if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const { email, password } = body;
    if (!email || !password) return new Response(JSON.stringify({ error: "Email and password required." }), { status: 400, headers: { "Content-Type": "application/json" } });

    try {
      const owner = await queryOne(db, "SELECT id, email, password_hash, name, currency FROM owners WHERE email = ?", [email.toLowerCase().trim()]);
      if (!owner || !(await verifyPassword(password, owner.password_hash))) return new Response(JSON.stringify({ error: "Invalid credentials." }), { status: 401, headers: { "Content-Type": "application/json" } });

      // Upgrade legacy bcrypt hashes to PBKDF2 on first successful login
      if (/^\$2[aby]\$\d{2}\$/.test(owner.password_hash || "")) {
        try {
          const upgraded = await hashPassword(password);
          await execute(db, "UPDATE owners SET password_hash = ? WHERE id = ?", [upgraded, owner.id]);
        } catch (upgradeErr) {
          console.error("[auth/login] password upgrade failed (non-fatal):", upgradeErr.message);
        }
      }

      const token = await signJwt({ owner_id: owner.id, email: owner.email, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 }, jwtSecret);
      const { password_hash, ...ownerData } = owner;
      return new Response(JSON.stringify({ token, owner: ownerData }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (err) {
      console.error("[auth/login]", err);
      return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
}

// ============================================================
// APARTMENT HANDLERS
// ============================================================

async function handleApartmentRoutes(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const ownerId = await getOwnerId(request, env);
  const body = await getBody(request);

  if (!ownerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const id = getPathId(path);

    if (method === "GET") {
      if (id) {
        const result = await queryOne(db, `SELECT a.*, 
          (SELECT COUNT(*) FROM units WHERE apartment_id = a.id AND owner_id = a.owner_id) AS total_units,
          (SELECT COUNT(*) FROM units WHERE apartment_id = a.id AND owner_id = a.owner_id AND status = 'Occupied') AS occupied_units
          FROM apartments a WHERE a.id = ? AND a.owner_id = ?`, [id, ownerId]);
        if (!result) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const result = await query(db, `SELECT a.*,
        (SELECT COUNT(*) FROM units WHERE apartment_id = a.id AND owner_id = a.owner_id) AS total_units,
        (SELECT COUNT(*) FROM units WHERE apartment_id = a.id AND owner_id = a.owner_id AND status = 'Occupied') AS occupied_units
        FROM apartments a WHERE a.owner_id = ? ORDER BY a.created_at DESC`, [ownerId]);
      return new Response(JSON.stringify(result.rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "POST") {
      if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { name, address, payment_note } = body;
      if (!name) return new Response(JSON.stringify({ error: "Name required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      await execute(db, `INSERT INTO apartments (owner_id, name, address, payment_note) VALUES (?, ?, ?, ?)`, [ownerId, name, address || null, payment_note || null]);
      const result = await queryOne(db, "SELECT * FROM apartments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1", [ownerId]);
      return new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    if (method === "PUT") {
      if (!body || !id) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { name, address, payment_note } = body;
      const existing = await queryOne(db, "SELECT id FROM apartments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      const updates = [], vals = [];
      if (name !== undefined) { updates.push("name = ?"); vals.push(name); }
      if (address !== undefined) { updates.push("address = ?"); vals.push(address); }
      if (payment_note !== undefined) { updates.push("payment_note = ?"); vals.push(payment_note); }
      if (updates.length === 0) return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400, headers: { "Content-Type": "application/json" } });
      vals.push(id, ownerId);
      await execute(db, `UPDATE apartments SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`, vals);
      const result = await queryOne(db, "SELECT * FROM apartments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const result = await execute(db, "DELETE FROM apartments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (result.changes === 0) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[apartments]", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// ============================================================
// UNIT HANDLERS
// ============================================================

async function handleUnitRoutes(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const ownerId = await getOwnerId(request, env);
  const body = await getBody(request);

  if (!ownerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const id = getPathId(path);
    const url = new URL(request.url);
    const apartmentId = url.searchParams.get("apartment_id");

    if (method === "GET") {
      if (id) {
        const result = await queryOne(db, `SELECT u.*, a.name AS apartment_name, t.name AS tenant_name
          FROM units u JOIN apartments a ON a.id = u.apartment_id
          LEFT JOIN tenants t ON t.unit_id = u.id AND t.status = 'Active'
          WHERE u.id = ? AND u.owner_id = ?`, [id, ownerId]);
        if (!result) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      let sql = `SELECT u.*, a.name AS apartment_name, t.name AS tenant_name FROM units u
        JOIN apartments a ON a.id = u.apartment_id LEFT JOIN tenants t ON t.unit_id = u.id AND t.status = 'Active'
        WHERE u.owner_id = ?`;
      const params = [ownerId];
      if (apartmentId) { sql += ` AND u.apartment_id = ?`; params.push(apartmentId); }
      sql += ` ORDER BY u.created_at DESC`;
      const result = await query(db, sql, params);
      return new Response(JSON.stringify(result.rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "POST") {
      if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { apartment_id, unit_number, current_rent, status } = body;
      if (!apartment_id || !unit_number) return new Response(JSON.stringify({ error: "apartment_id and unit_number required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      await execute(db, `INSERT INTO units (owner_id, apartment_id, unit_number, current_rent, status) VALUES (?, ?, ?, ?, ?)`, [ownerId, apartment_id, unit_number, current_rent || 0, status || "Vacant"]);
      const result = await queryOne(db, "SELECT * FROM units WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1", [ownerId]);
      return new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    if (method === "PUT") {
      if (!body || !id) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { unit_number, current_rent, status } = body;
      const existing = await queryOne(db, "SELECT * FROM units WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      const oldRent = Number(existing.current_rent);
      const updates = [], vals = [];
      if (unit_number !== undefined) { updates.push("unit_number = ?"); vals.push(unit_number); }
      if (current_rent !== undefined) { updates.push("current_rent = ?"); vals.push(current_rent); }
      if (status !== undefined) { updates.push("status = ?"); vals.push(status); }
      if (updates.length > 0) {
        vals.push(id, ownerId);
        await execute(db, `UPDATE units SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`, vals);
        if (current_rent !== undefined && Number(current_rent) !== oldRent) {
          await execute(db, `INSERT INTO rent_increase_history (owner_id, unit_id, old_rent, new_rent) VALUES (?, ?, ?, ?)`, [ownerId, id, oldRent, current_rent]);
        }
      }
      const result = await queryOne(db, "SELECT * FROM units WHERE id = ? AND owner_id = ?", [id, ownerId]);
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const result = await execute(db, "DELETE FROM units WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (result.changes === 0) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[units]", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// ============================================================
// TENANT HANDLERS (with R2 file upload)
// ============================================================

async function handleTenantRoutes(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const ownerId = await getOwnerId(request, env);
  const bucket = env.BUCKET;

  if (!ownerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    if (path === "upload-image" && method === "POST") {
      if (!bucket) return new Response(JSON.stringify({ error: "R2 not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
      try {
        const formData = await request.formData();
        const imageFile = formData.get("image");
        if (!imageFile) return new Response(JSON.stringify({ error: "No image uploaded" }), { status: 400, headers: { "Content-Type": "application/json" } });
        const validMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!validMimes.includes(imageFile.type)) return new Response(JSON.stringify({ error: "Invalid image type" }), { status: 400, headers: { "Content-Type": "application/json" } });
        if (imageFile.size > 5 * 1024 * 1024) return new Response(JSON.stringify({ error: "File too large" }), { status: 400, headers: { "Content-Type": "application/json" } });
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1e9);
        const ext = imageFile.name.split(".").pop() || "jpg";
        const filename = `${ownerId}/${timestamp}-${random}.${ext}`;
        const buffer = await imageFile.arrayBuffer();
        await bucket.put(filename, buffer, { httpMetadata: { contentType: imageFile.type } });
        const imageUrl = `${env.R2_BUCKET_URL || "/uploads"}/${filename}`;
        return new Response(JSON.stringify({ image_url: imageUrl }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (err) {
        console.error("[tenants/upload-image]", err);
        return new Response(JSON.stringify({ error: "Upload failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    const id = getPathId(path);
    const body = await getBody(request);

    if (method === "GET") {
      if (id) {
        const result = await queryOne(db, `SELECT t.*, u.unit_number, a.name AS apartment_name FROM tenants t
          LEFT JOIN units u ON u.id = t.unit_id LEFT JOIN apartments a ON a.id = u.apartment_id
          WHERE t.id = ? AND t.owner_id = ?`, [id, ownerId]);
        if (!result) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const result = await query(db, `SELECT t.*, u.unit_number, a.name AS apartment_name FROM tenants t
        LEFT JOIN units u ON u.id = t.unit_id LEFT JOIN apartments a ON a.id = u.apartment_id
        WHERE t.owner_id = ? ORDER BY (t.status = 'Unassigned') ASC, t.created_at DESC`, [ownerId]);
      return new Response(JSON.stringify(result.rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "POST") {
      if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { name, phone, unit_id, move_in, move_out, deposit, image_url } = body;
      if (!name) return new Response(JSON.stringify({ error: "Name required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const hasMoveOut = !!move_out;
      const finalStatus = hasMoveOut ? "Unassigned" : "Active";
      const finalUnitId = hasMoveOut ? null : unit_id || null;
      await execute(db, `INSERT INTO tenants (owner_id, name, phone, unit_id, move_in, move_out, deposit, image_url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [ownerId, name, phone || null, finalUnitId, move_in || null, move_out || null, deposit || 0, image_url || null, finalStatus]);
      if (finalUnitId) {
        await execute(db, `UPDATE tenants SET status = 'Unassigned', unit_id = NULL, move_out = COALESCE(move_out, date('now'))
          WHERE unit_id = ? AND owner_id = ? AND status = 'Active' AND id <> (SELECT id FROM tenants WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1)`, [finalUnitId, ownerId, ownerId]);
        await recomputeUnitStatus(db, finalUnitId, ownerId);
      }
      const result = await queryOne(db, "SELECT * FROM tenants WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1", [ownerId]);
      return new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    if (method === "PUT") {
      if (!body || !id) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { name, phone, unit_id, move_in, move_out, deposit, image_url } = body;
      const existing = await queryOne(db, "SELECT * FROM tenants WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      const previousUnitId = existing.unit_id;
      const finalMoveOut = move_out !== undefined ? move_out || null : existing.move_out;
      const hasMoveOut = !!finalMoveOut;
      const finalStatus = hasMoveOut ? "Unassigned" : "Active";
      const finalUnitId = hasMoveOut ? null : unit_id !== undefined ? unit_id || null : previousUnitId;
      const updates = [], vals = [];
      if (name !== undefined) { updates.push("name = ?"); vals.push(name); }
      if (phone !== undefined) { updates.push("phone = ?"); vals.push(phone); }
      updates.push("unit_id = ?"); vals.push(finalUnitId);
      if (move_in !== undefined) { updates.push("move_in = ?"); vals.push(move_in); }
      updates.push("move_out = ?"); vals.push(finalMoveOut);
      if (deposit !== undefined) { updates.push("deposit = ?"); vals.push(deposit); }
      if (image_url !== undefined) { updates.push("image_url = ?"); vals.push(image_url); }
      updates.push("status = ?"); vals.push(finalStatus);
      vals.push(id, ownerId);
      await execute(db, `UPDATE tenants SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`, vals);
      if (finalUnitId && String(finalUnitId) !== String(previousUnitId)) {
        await execute(db, `UPDATE tenants SET status = 'Unassigned', unit_id = NULL, move_out = COALESCE(move_out, date('now'))
          WHERE unit_id = ? AND owner_id = ? AND status = 'Active' AND id <> ?`, [finalUnitId, ownerId, id]);
      }
      if (previousUnitId) await recomputeUnitStatus(db, previousUnitId, ownerId);
      if (finalUnitId) await recomputeUnitStatus(db, finalUnitId, ownerId);
      const result = await queryOne(db, "SELECT * FROM tenants WHERE id = ? AND owner_id = ?", [id, ownerId]);
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const existing = await queryOne(db, "SELECT unit_id FROM tenants WHERE id = ? AND owner_id = ?", [id, ownerId]);
      const result = await execute(db, "DELETE FROM tenants WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (result.changes === 0) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      if (existing?.unit_id) await recomputeUnitStatus(db, existing.unit_id, ownerId);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[tenants]", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// ============================================================
// PAYMENT HANDLERS
// ============================================================

async function handlePaymentRoutes(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const ownerId = await getOwnerId(request, env);
  const body = await getBody(request);

  if (!ownerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const id = getPathId(path);

    if (method === "GET") {
      if (id) {
        const result = await queryOne(db, `SELECT p.*, t.name AS tenant_name, u.unit_number, a.name AS apartment_name
          FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id LEFT JOIN units u ON u.id = p.unit_id LEFT JOIN apartments a ON a.id = p.apartment_id
          WHERE p.id = ? AND p.owner_id = ?`, [id, ownerId]);
        if (!result) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const result = await query(db, `SELECT p.*, t.name AS tenant_name, u.unit_number, a.name AS apartment_name
        FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id LEFT JOIN units u ON u.id = p.unit_id LEFT JOIN apartments a ON a.id = p.apartment_id
        WHERE p.owner_id = ? AND (t.move_in IS NULL OR date(p.month || '-01') >= date(t.move_in))
          AND (t.move_out IS NULL OR date(p.month || '-01') < date(t.move_out))
        ORDER BY p.payment_date DESC NULLS LAST, p.id DESC`, [ownerId]);
      return new Response(JSON.stringify(result.rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "POST") {
      if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { tenant_id, unit_id, apartment_id, month, amount_due, amount_paid, payment_date, note } = body;
      if (!tenant_id || !month) return new Response(JSON.stringify({ error: "tenant_id and month required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const due = Number(amount_due) || 0;
      const paid = Number(amount_paid) || 0;
      const balance = due - paid;
      const status = computePaymentStatus(due, paid);
      const existing = await queryOne(db, "SELECT id FROM payments WHERE owner_id = ? AND tenant_id = ? AND month = ?", [ownerId, tenant_id, month]);
      if (existing) {
        await execute(db, `UPDATE payments SET unit_id = ?, apartment_id = ?, amount_due = ?, amount_paid = ?, balance = ?, status = ?, payment_date = ?, note = ?
          WHERE id = ? AND owner_id = ?`, [unit_id || null, apartment_id || null, due, paid, balance, status, payment_date || null, note || null, existing.id, ownerId]);
        const result = await queryOne(db, "SELECT * FROM payments WHERE id = ? AND owner_id = ?", [existing.id, ownerId]);
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      await execute(db, `INSERT INTO payments (owner_id, tenant_id, unit_id, apartment_id, month, amount_due, amount_paid, balance, status, payment_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [ownerId, tenant_id, unit_id || null, apartment_id || null, month, due, paid, balance, status, payment_date || null, note || null]);
      const result = await queryOne(db, "SELECT * FROM payments WHERE owner_id = ? ORDER BY id DESC LIMIT 1", [ownerId]);
      return new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    if (method === "PUT") {
      if (!body || !id) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { amount_due, amount_paid, payment_date, month, note } = body;
      const existing = await queryOne(db, "SELECT * FROM payments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      const due = amount_due !== undefined ? Number(amount_due) : Number(existing.amount_due);
      const paid = amount_paid !== undefined ? Number(amount_paid) : Number(existing.amount_paid);
      const balance = due - paid;
      const paymentStatus = computePaymentStatus(due, paid);
      const updates = [], vals = [];
      if (amount_due !== undefined) { updates.push("amount_due = ?"); vals.push(due); }
      if (amount_paid !== undefined) { updates.push("amount_paid = ?"); vals.push(paid); }
      if (payment_date !== undefined) { updates.push("payment_date = ?"); vals.push(payment_date); }
      if (month !== undefined) { updates.push("month = ?"); vals.push(month); }
      if (note !== undefined) { updates.push("note = ?"); vals.push(note); }
      updates.push("balance = ?", "status = ?");
      vals.push(balance, paymentStatus, id, ownerId);
      await execute(db, `UPDATE payments SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`, vals);
      const result = await queryOne(db, "SELECT * FROM payments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const result = await execute(db, "DELETE FROM payments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (result.changes === 0) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[payments]", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// ============================================================
// EXPENSE HANDLERS
// ============================================================

async function handleExpenseRoutes(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const ownerId = await getOwnerId(request, env);
  const body = await getBody(request);

  if (!ownerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const id = getPathId(path);

    if (method === "GET") {
      if (id) {
        const result = await queryOne(db, `SELECT e.*, a.name AS apartment_name, u.unit_number FROM expenses e
          LEFT JOIN apartments a ON a.id = e.apartment_id LEFT JOIN units u ON u.id = e.unit_id
          WHERE e.id = ? AND e.owner_id = ?`, [id, ownerId]);
        if (!result) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const result = await query(db, `SELECT e.*, a.name AS apartment_name, u.unit_number FROM expenses e
        LEFT JOIN apartments a ON a.id = e.apartment_id LEFT JOIN units u ON u.id = e.unit_id
        WHERE e.owner_id = ? ORDER BY e.date DESC, e.id DESC`, [ownerId]);
      return new Response(JSON.stringify(result.rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "POST") {
      if (!body) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { apartment_id, unit_id, description, amount, date } = body;
      if (!description || !amount) return new Response(JSON.stringify({ error: "description and amount required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      await execute(db, `INSERT INTO expenses (owner_id, apartment_id, unit_id, description, amount, date)
        VALUES (?, ?, ?, ?, ?, ?)`, [ownerId, apartment_id || null, unit_id || null, description, Number(amount), date || null]);
      const result = await queryOne(db, "SELECT * FROM expenses WHERE owner_id = ? ORDER BY id DESC LIMIT 1", [ownerId]);
      return new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    if (method === "PUT") {
      if (!body || !id) return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const { apartment_id, unit_id, description, amount, date } = body;
      const existing = await queryOne(db, "SELECT id FROM expenses WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      const updates = [], vals = [];
      if (apartment_id !== undefined) { updates.push("apartment_id = ?"); vals.push(apartment_id); }
      if (unit_id !== undefined) { updates.push("unit_id = ?"); vals.push(unit_id); }
      if (description !== undefined) { updates.push("description = ?"); vals.push(description); }
      if (amount !== undefined) { updates.push("amount = ?"); vals.push(Number(amount)); }
      if (date !== undefined) { updates.push("date = ?"); vals.push(date); }
      if (updates.length === 0) return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400, headers: { "Content-Type": "application/json" } });
      vals.push(id, ownerId);
      await execute(db, `UPDATE expenses SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`, vals);
      const result = await queryOne(db, "SELECT * FROM expenses WHERE id = ? AND owner_id = ?", [id, ownerId]);
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const result = await execute(db, "DELETE FROM expenses WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (result.changes === 0) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("[expenses]", err);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// ============================================================
// REPORT HANDLERS
// ============================================================

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function handleReportRoutes(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const ownerId = await getOwnerId(request, env);

  if (!ownerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const url = new URL(request.url);
  const jsonRes = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  try {
    // GET /reports/dashboard?range=month|year|all
    if (path === "dashboard" && method === "GET") {
      const rangeParam = url.searchParams.get("range");
      const range = ["month", "year", "all"].includes(rangeParam) ? rangeParam : "month";
      const incomeRangeCond =
        range === "month" ? "strftime('%Y-%m', payment_date) = strftime('%Y-%m','now')" :
        range === "year" ? "strftime('%Y', payment_date) = strftime('%Y','now')" : "1=1";
      const expenseRangeCond =
        range === "month" ? "strftime('%Y-%m', date) = strftime('%Y-%m','now')" :
        range === "year" ? "strftime('%Y', date) = strftime('%Y','now')" : "1=1";

      // All seven dashboard queries run in a single D1 batch (1 network
      // round-trip instead of 7 sequential ones). Results are in statement order.
      const [totalsRes, expenseTotalsRes, unitsRes, recentPaymentsRes, latestExpensesRes, paidSummaryRes, pendingSummaryRes] = await batch(db, [
        {
          sql: `
        SELECT
          COALESCE(SUM(CASE WHEN strftime('%Y-%m', payment_date) = strftime('%Y-%m','now') THEN amount_paid ELSE 0 END), 0) AS income_this_month,
          COALESCE(SUM(CASE WHEN payment_date = date('now') THEN amount_paid ELSE 0 END), 0) AS income_today,
          COALESCE(SUM(CASE WHEN ${incomeRangeCond} THEN amount_paid ELSE 0 END), 0) AS income_range
        FROM payments WHERE owner_id = ?`,
          params: [ownerId],
        },
        {
          sql: `
        SELECT
          COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m','now') THEN amount ELSE 0 END), 0) AS expenses_this_month,
          COALESCE(SUM(CASE WHEN date = date('now') THEN amount ELSE 0 END), 0) AS expenses_today,
          COALESCE(SUM(CASE WHEN ${expenseRangeCond} THEN amount ELSE 0 END), 0) AS expenses_range
        FROM expenses WHERE owner_id = ?`,
          params: [ownerId],
        },
        {
          sql: `
        SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) AS occupied
        FROM units WHERE owner_id = ?`,
          params: [ownerId],
        },
        {
          sql: `
        SELECT p.*, t.name AS tenant_name
        FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id
        WHERE p.owner_id = ?
        ORDER BY (p.payment_date IS NULL), p.payment_date DESC, p.id DESC
        LIMIT 5`,
          params: [ownerId],
        },
        {
          sql: `
        SELECT e.*, a.name AS apartment_name
        FROM expenses e LEFT JOIN apartments a ON a.id = e.apartment_id
        WHERE e.owner_id = ?
        ORDER BY (e.date IS NULL), e.date DESC, e.id DESC
        LIMIT 5`,
          params: [ownerId],
        },
        {
          // Current-month PAID summary: tenant-months fully paid this month.
          sql: `
        SELECT COUNT(*) AS paid_count,
               COALESCE(SUM(amount_paid), 0) AS paid_amount
        FROM payments
        WHERE owner_id = ? AND month = strftime('%Y-%m','now') AND status = 'Paid'`,
          params: [ownerId],
        },
        {
          // Current-month NOT-PAID summary: active tenants without a Paid record
          // this month. For partial payers the remaining balance is used, for
          // tenants with no record at all the unit's current rent is used.
          sql: `
        SELECT COUNT(*) AS pending_count,
               COALESCE(SUM(pending_amount), 0) AS pending_amount
        FROM (
          SELECT t.id AS tenant_id,
                 CASE WHEN p.id IS NOT NULL THEN p.balance
                      ELSE COALESCE(u.current_rent, 0) END AS pending_amount
          FROM tenants t
          JOIN units u ON u.id = t.unit_id AND u.owner_id = t.owner_id
          LEFT JOIN payments p ON p.tenant_id = t.id AND p.owner_id = t.owner_id
            AND p.month = strftime('%Y-%m','now')
          WHERE t.owner_id = ? AND t.status = 'Active'
            AND (p.id IS NULL OR (p.status != 'Paid' AND p.balance > 0))
        )
        WHERE pending_amount > 0`,
          params: [ownerId],
        },
      ]);

      const totals = totalsRes.rows[0] || {};
      const expenseTotals = expenseTotalsRes.rows[0] || {};
      const units = unitsRes.rows[0] || {};
      const recentPayments = { rows: recentPaymentsRes.rows };
      const latestExpenses = { rows: latestExpensesRes.rows };
      const paidSummary = paidSummaryRes.rows[0] || {};
      const pendingSummary = pendingSummaryRes.rows[0] || {};

      const incomeRange = Number(totals.income_range) || 0;
      const expensesRange = Number(expenseTotals.expenses_range) || 0;

      return jsonRes({
        range,
        totalIncome: incomeRange,
        totalExpenses: expensesRange,
        netProfit: incomeRange - expensesRange,
        incomeToday: Number(totals.income_today) || 0,
        expensesToday: Number(expenseTotals.expenses_today) || 0,
        occupiedUnits: Number(units.occupied) || 0,
        totalUnits: Number(units.total) || 0,
        paidCount: Number(paidSummary.paid_count) || 0,
        paidAmount: Number(paidSummary.paid_amount) || 0,
        pendingCount: Number(pendingSummary.pending_count) || 0,
        pendingAmount: Number(pendingSummary.pending_amount) || 0,
        recentPayments: recentPayments.rows,
        latestExpenses: latestExpenses.rows,
      });
    }

    // GET /reports/trend?view=month|year|all&apartment_id=
    if (path === "trend" && method === "GET") {
      const viewParam = url.searchParams.get("view");
      const view = ["month", "year", "all"].includes(viewParam) ? viewParam : "month";
      const apartmentId = url.searchParams.get("apartment_id");

      if (view === "all") {
        const incomeParams = [ownerId];
        let incomeSql = `SELECT COALESCE(SUM(amount_paid),0) AS value FROM payments WHERE owner_id = ?`;
        if (apartmentId) { incomeSql += ` AND apartment_id = ?`; incomeParams.push(apartmentId); }
        const expenseParams = [ownerId];
        let expenseSql = `SELECT COALESCE(SUM(amount),0) AS value FROM expenses WHERE owner_id = ?`;
        if (apartmentId) { expenseSql += ` AND apartment_id = ?`; expenseParams.push(apartmentId); }
        const [incomeRes, expensesRes] = await batch(db, [
          { sql: incomeSql, params: incomeParams },
          { sql: expenseSql, params: expenseParams },
        ]);
        const income = incomeRes.rows[0] || {};
        const expenses = expensesRes.rows[0] || {};
        return jsonRes({ data: [{ label: "All Time", income: Number(income.value) || 0, expenses: Number(expenses.value) || 0 }] });
      }

      const incomeLabelExpr = view === "year" ? "substr(month, 1, 4)" : "month";
      const incomeParams = [ownerId];
      let incomeSql = `SELECT ${incomeLabelExpr} AS label, SUM(amount_paid) AS income FROM payments WHERE owner_id = ? AND month IS NOT NULL`;
      if (apartmentId) { incomeSql += ` AND apartment_id = ?`; incomeParams.push(apartmentId); }
      incomeSql += ` GROUP BY label`;

      const expenseLabelExpr = view === "year" ? "strftime('%Y', date)" : "strftime('%Y-%m', date)";
      const expenseParams = [ownerId];
      let expenseSql = `SELECT ${expenseLabelExpr} AS label, SUM(amount) AS expenses FROM expenses WHERE owner_id = ? AND date IS NOT NULL`;
      if (apartmentId) { expenseSql += ` AND apartment_id = ?`; expenseParams.push(apartmentId); }
      expenseSql += ` GROUP BY label`;

      const [incomeResult, expenseResult] = await batch(db, [
        { sql: incomeSql, params: incomeParams },
        { sql: expenseSql, params: expenseParams },
      ]);

      const merged = new Map();
      for (const row of incomeResult.rows) {
        merged.set(row.label, { label: row.label, income: Number(row.income) || 0, expenses: 0 });
      }
      for (const row of expenseResult.rows) {
        const existing = merged.get(row.label) || { label: row.label, income: 0, expenses: 0 };
        existing.expenses = Number(row.expenses) || 0;
        merged.set(row.label, existing);
      }
      const data = Array.from(merged.values()).sort((a, b) => (a.label > b.label ? 1 : a.label < b.label ? -1 : 0));
      return jsonRes({ data });
    }

    // GET /reports/checklist?month=YYYY-MM
    if (path === "checklist" && method === "GET") {
      const month = url.searchParams.get("month") || currentMonthStr();
      const result = await query(db, `
        SELECT a.id AS apartment_id, a.name AS apartment_name,
               t.id AS tenant_id, t.name AS tenant_name,
               u.current_rent,
               CASE WHEN p.id IS NOT NULL AND p.status = 'Paid' THEN 1 ELSE 0 END AS paid
        FROM apartments a
        JOIN units u ON u.apartment_id = a.id AND u.owner_id = a.owner_id
        JOIN tenants t ON t.unit_id = u.id AND t.owner_id = a.owner_id AND t.status = 'Active'
        LEFT JOIN payments p ON p.tenant_id = t.id AND p.month = ? AND p.owner_id = a.owner_id
        WHERE a.owner_id = ?
        ORDER BY a.name, t.name`, [month, ownerId]);

      const grouped = {};
      for (const row of result.rows) {
        if (!grouped[row.apartment_id]) {
          grouped[row.apartment_id] = { apartment_id: row.apartment_id, apartment_name: row.apartment_name, tenants: [] };
        }
        grouped[row.apartment_id].tenants.push({
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          current_rent: row.current_rent,
          paid: Boolean(row.paid),
        });
      }
      return jsonRes({ month, apartments: Object.values(grouped) });
    }

    // POST /reports/checklist/toggle  { tenant_id, month, checked }
    if (path === "checklist/toggle" && method === "POST") {
      const body = await getBody(request);
      const { tenant_id, month, checked } = body || {};
      if (!tenant_id || !month) return jsonRes({ error: "tenant_id and month are required." }, 400);

      const tenant = await queryOne(db, `
        SELECT t.id, t.unit_id, u.apartment_id, u.current_rent
        FROM tenants t LEFT JOIN units u ON u.id = t.unit_id
        WHERE t.id = ? AND t.owner_id = ?`, [tenant_id, ownerId]);
      if (!tenant) return jsonRes({ error: "Tenant not found." }, 404);

      if (!checked) {
        await execute(db, `DELETE FROM payments WHERE owner_id = ? AND tenant_id = ? AND month = ?`, [ownerId, tenant_id, month]);
        return jsonRes({ tenant_id, month, paid: false });
      }

      const rent = Number(tenant.current_rent) || 0;
      const existing = await queryOne(db, `SELECT id FROM payments WHERE owner_id = ? AND tenant_id = ? AND month = ?`, [ownerId, tenant_id, month]);

      if (existing) {
        await execute(db, `
          UPDATE payments SET amount_due = ?, amount_paid = ?, balance = 0, status = 'Paid', payment_date = date('now')
          WHERE id = ? AND owner_id = ?`, [rent, rent, existing.id, ownerId]);
      } else {
        await execute(db, `
          INSERT INTO payments (owner_id, tenant_id, unit_id, apartment_id, month, amount_due, amount_paid, balance, status, payment_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Paid', date('now'))`,
          [ownerId, tenant_id, tenant.unit_id, tenant.apartment_id, month, rent, rent]);
      }
      return jsonRes({ tenant_id, month, paid: true });
    }

    // GET /reports/months?apartment_id=
    if (path === "months" && method === "GET") {
      const apartmentId = url.searchParams.get("apartment_id");
      const paymentParams = [ownerId];
      let paymentSql = `SELECT DISTINCT month FROM payments WHERE owner_id = ? AND month IS NOT NULL`;
      if (apartmentId) { paymentSql += ` AND apartment_id = ?`; paymentParams.push(apartmentId); }

      const expenseParams = [ownerId];
      let expenseSql = `SELECT DISTINCT strftime('%Y-%m', date) AS month FROM expenses WHERE owner_id = ? AND date IS NOT NULL`;
      if (apartmentId) { expenseSql += ` AND apartment_id = ?`; expenseParams.push(apartmentId); }

      const [paymentMonths, expenseMonths] = await batch(db, [
        { sql: paymentSql, params: paymentParams },
        { sql: expenseSql, params: expenseParams },
      ]);
      const months = Array.from(new Set([...paymentMonths.rows.map((r) => r.month), ...expenseMonths.rows.map((r) => r.month)])).sort().reverse();
      return jsonRes({ months });
    }

    // GET /reports/years?apartment_id=
    if (path === "years" && method === "GET") {
      const apartmentId = url.searchParams.get("apartment_id");
      const paymentParams = [ownerId];
      let paymentSql = `SELECT DISTINCT substr(month, 1, 4) AS year FROM payments WHERE owner_id = ? AND month IS NOT NULL`;
      if (apartmentId) { paymentSql += ` AND apartment_id = ?`; paymentParams.push(apartmentId); }

      const expenseParams = [ownerId];
      let expenseSql = `SELECT DISTINCT strftime('%Y', date) AS year FROM expenses WHERE owner_id = ? AND date IS NOT NULL`;
      if (apartmentId) { expenseSql += ` AND apartment_id = ?`; expenseParams.push(apartmentId); }

      const [paymentYears, expenseYears] = await batch(db, [
        { sql: paymentSql, params: paymentParams },
        { sql: expenseSql, params: expenseParams },
      ]);
      const years = Array.from(new Set([...paymentYears.rows.map((r) => r.year), ...expenseYears.rows.map((r) => r.year)])).sort().reverse();
      return jsonRes({ years });
    }

    // GET /reports/monthly?apartment_id=&month=YYYY-MM (also doubles as the "Total" report when month is omitted)
    if (path === "monthly" && method === "GET") {
      const apartmentId = url.searchParams.get("apartment_id");
      const month = url.searchParams.get("month");

      const incomeParams = [ownerId];
      let incomeSql = `SELECT COALESCE(SUM(amount_paid),0) AS income FROM payments WHERE owner_id = ?`;
      if (apartmentId) { incomeSql += ` AND apartment_id = ?`; incomeParams.push(apartmentId); }
      if (month) { incomeSql += ` AND month = ?`; incomeParams.push(month); }

      const expenseParams = [ownerId];
      let expenseSql = `SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE owner_id = ?`;
      if (apartmentId) { expenseSql += ` AND apartment_id = ?`; expenseParams.push(apartmentId); }
      if (month) { expenseSql += ` AND strftime('%Y-%m', date) = ?`; expenseParams.push(month); }

      const [incomeRes, expensesRes] = await batch(db, [
        { sql: incomeSql, params: incomeParams },
        { sql: expenseSql, params: expenseParams },
      ]);
      const income = incomeRes.rows[0] || {};
      const expenses = expensesRes.rows[0] || {};
      const totalIncome = Number(income.income) || 0;
      const totalExpenses = Number(expenses.expenses) || 0;

      return jsonRes({
        month: month || "all",
        apartment_id: apartmentId || null,
        totalIncome,
        totalExpenses,
        profit: totalIncome - totalExpenses,
      });
    }

    // GET /reports/yearly?apartment_id=&year=YYYY
    if (path === "yearly" && method === "GET") {
      const apartmentId = url.searchParams.get("apartment_id");
      const year = url.searchParams.get("year");
      if (!year) return jsonRes({ error: "year is required." }, 400);

      const incomeParams = [ownerId, year];
      let incomeSql = `SELECT COALESCE(SUM(amount_paid),0) AS income FROM payments WHERE owner_id = ? AND substr(month, 1, 4) = ?`;
      if (apartmentId) { incomeSql += ` AND apartment_id = ?`; incomeParams.push(apartmentId); }

      const expenseParams = [ownerId, year];
      let expenseSql = `SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE owner_id = ? AND strftime('%Y', date) = ?`;
      if (apartmentId) { expenseSql += ` AND apartment_id = ?`; expenseParams.push(apartmentId); }

      const [incomeRes, expensesRes] = await batch(db, [
        { sql: incomeSql, params: incomeParams },
        { sql: expenseSql, params: expenseParams },
      ]);
      const income = incomeRes.rows[0] || {};
      const expenses = expensesRes.rows[0] || {};
      const totalIncome = Number(income.income) || 0;
      const totalExpenses = Number(expenses.expenses) || 0;

      return jsonRes({
        year,
        apartment_id: apartmentId || null,
        totalIncome,
        totalExpenses,
        profit: totalIncome - totalExpenses,
      });
    }

    // POST /reports/generate — save a monthly_reports snapshot
    if (path === "generate" && method === "POST") {
      const body = await getBody(request);
      if (!body) return jsonRes({ error: "Invalid request" }, 400);
      const { apartment_id, month, total_income, total_expenses } = body;
      if (!month) return jsonRes({ error: "month is required." }, 400);
      const income = Number(total_income) || 0;
      const expenses = Number(total_expenses) || 0;
      const profit = income - expenses;
      await execute(db, `
        INSERT INTO monthly_reports (owner_id, apartment_id, month, total_income, total_expenses, profit)
        VALUES (?, ?, ?, ?, ?, ?)`, [ownerId, apartment_id || null, month, income, expenses, profit]);
      const result = await queryOne(db, `SELECT * FROM monthly_reports WHERE owner_id = ? ORDER BY id DESC LIMIT 1`, [ownerId]);
      return jsonRes(result, 201);
    }

    // GET /reports/history — all saved snapshots
    if (path === "history" && method === "GET") {
      const result = await query(db, `
        SELECT r.*, a.name AS apartment_name
        FROM monthly_reports r LEFT JOIN apartments a ON a.id = r.apartment_id
        WHERE r.owner_id = ? ORDER BY r.generated_at DESC`, [ownerId]);
      return jsonRes(result.rows);
    }

    // DELETE /reports/history — wipe all saved snapshots
    if (path === "history" && method === "DELETE") {
      const result = await execute(db, `DELETE FROM monthly_reports WHERE owner_id = ?`, [ownerId]);
      return jsonRes({ success: true, deletedCount: result.changes });
    }

    // GET /reports/pending-all — every outstanding balance across all recorded months
    if (path === "pending-all" && method === "GET") {
      const result = await query(db, `
        SELECT t.id AS tenant_id, t.name AS tenant_name, t.status AS tenant_status,
               a.name AS apartment_name, u.unit_number,
               SUM(p.balance) AS total_pending,
               COUNT(*) AS unpaid_months
        FROM payments p
        JOIN tenants t ON t.id = p.tenant_id
        LEFT JOIN units u ON u.id = p.unit_id
        LEFT JOIN apartments a ON a.id = p.apartment_id
        WHERE p.owner_id = ? AND p.balance > 0
        GROUP BY t.id, t.name, t.status, a.name, u.unit_number
        ORDER BY total_pending DESC`, [ownerId]);

      // SQLite/D1 has no array_agg, so aggregate every tenant's unpaid months in
      // ONE extra query with GROUP_CONCAT (was previously an N+1 loop that
      // issued a separate query for every tenant).
      const monthRows = await query(db, `
        SELECT tenant_id, GROUP_CONCAT(month, ',') AS months
        FROM (
          SELECT tenant_id, month FROM payments
          WHERE owner_id = ? AND balance > 0 AND tenant_id IS NOT NULL
          ORDER BY month
        )
        GROUP BY tenant_id`, [ownerId]);

      const monthMap = new Map();
      for (const m of monthRows.rows) {
        monthMap.set(String(m.tenant_id), m.months ? String(m.months).split(",") : []);
      }

      const pending = result.rows.map((row) => ({
        ...row,
        unpaid_month_list: monthMap.get(String(row.tenant_id)) || [],
      }));
      return jsonRes({ pending });
    }

    // GET /reports (bare) — list all snapshots, kept for backward compatibility
    if (!path && method === "GET") {
      const result = await query(db, `SELECT * FROM monthly_reports WHERE owner_id = ? ORDER BY month DESC`, [ownerId]);
      return jsonRes(result.rows);
    }

    return jsonRes({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[reports]", err);
    return jsonRes({ error: "Server error" }, 500);
  }
}

module.exports = {
  handleAuthRoutes,
  handleApartmentRoutes,
  handleUnitRoutes,
  handleTenantRoutes,
  handlePaymentRoutes,
  handleExpenseRoutes,
  handleReportRoutes,
};
