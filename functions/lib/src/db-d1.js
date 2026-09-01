/**
 * D1 Database Module for Cloudflare
 * Replaces the PostgreSQL pg pool with Cloudflare D1
 * 
 * Usage in route handlers:
 *   const { query, queryOne } = require("../db");
 *   const result = await query("SELECT * FROM owners WHERE id = ?", [owner_id]);
 */

const fs = require("fs");
const path = require("path");

/**
 * Query function - returns an object with { rows: [...] } to match pg pool interface
 * @param {D1Database} db - The D1 database binding (passed from Cloudflare environment)
 * @param {string} sql - SQL query string (use ? for placeholders, not $1, $2, etc.)
 * @param {Array} params - Query parameters
 * @returns {Promise<{rows: Array}>}
 */
async function query(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...params).all();
    
    // D1's .all() returns { success, results }
    if (result.success) {
      return { rows: result.results || [] };
    }
    throw new Error(result.error || "D1 query failed");
  } catch (err) {
    console.error("[db] Query error:", err, "SQL:", sql);
    throw err;
  }
}

/**
 * Query single row
 * @param {D1Database} db
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Object|null>}
 */
async function queryOne(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...params).first();
    return result || null;
  } catch (err) {
    console.error("[db] QueryOne error:", err, "SQL:", sql);
    throw err;
  }
}

/**
 * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
 * @param {D1Database} db
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<{changes: number}>}
 */
async function execute(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...params).run();
    
    if (result.success) {
      return { changes: result.meta?.changes || 0 };
    }
    throw new Error(result.error || "D1 execute failed");
  } catch (err) {
    console.error("[db] Execute error:", err, "SQL:", sql);
    throw err;
  }
}

/**
 * Transaction support - executes multiple statements atomically
 * @param {D1Database} db
 * @param {Array<{sql: string, params: Array}>} statements
 * @returns {Promise<Array>}
 */
async function transaction(db, statements) {
  try {
    const results = [];
    
    for (const stmt of statements) {
      const result = await execute(db, stmt.sql, stmt.params);
      results.push(result);
    }
    
    return results;
  } catch (err) {
    console.error("[db] Transaction error:", err);
    throw err;
  }
}

/**
 * Initialize database schema - runs on every request (safe with IF NOT EXISTS)
 * @param {D1Database} db
 * @returns {Promise<void>}
 */
async function initializeSchema(db) {
  try {
    const schemaPath = path.join(__dirname, "..", "sql", "schema-d1.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    const statements = schema
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => {
        if (!statement || statement.startsWith("--")) return false;
        if (statement.toUpperCase().startsWith("PRAGMA")) return false;
        return true;
      });

    for (const statement of statements) {
      if (statement) {
        await db.prepare(statement).run();
      }
    }

    console.log("[db] Schema initialized");
  } catch (err) {
    console.error("[db] Schema initialization error:", err);
    throw err;
  }
}

module.exports = {
  query,
  queryOne,
  execute,
  transaction,
  initializeSchema,
};
