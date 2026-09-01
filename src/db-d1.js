/**
 * D1 Database Module for Cloudflare
 * Replaces the PostgreSQL pg pool with Cloudflare D1
 * 
 * Usage in route handlers:
 *   const { query, queryOne } = require("../db");
 *   const result = await query("SELECT * FROM owners WHERE id = ?", [owner_id]);
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  currency TEXT DEFAULT 'USD',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apartments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  payment_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  apartment_id INTEGER,
  unit_number TEXT NOT NULL,
  current_rent REAL DEFAULT 0,
  status TEXT DEFAULT 'Vacant' CHECK (status IN ('Occupied', 'Vacant')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  unit_id INTEGER,
  move_in TEXT,
  move_out TEXT,
  deposit REAL DEFAULT 0,
  image_url TEXT,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  tenant_id INTEGER,
  unit_id INTEGER,
  apartment_id INTEGER,
  month TEXT NOT NULL,
  amount_due REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  status TEXT DEFAULT 'Unpaid' CHECK (status IN ('Paid', 'Late', 'Unpaid')),
  payment_date TEXT,
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  apartment_id INTEGER,
  unit_id INTEGER,
  description TEXT,
  amount REAL DEFAULT 0,
  date TEXT DEFAULT (date('now')),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS monthly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  apartment_id INTEGER,
  month TEXT NOT NULL,
  total_income REAL DEFAULT 0,
  total_expenses REAL DEFAULT 0,
  profit REAL DEFAULT 0,
  generated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rent_increase_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  unit_id INTEGER NOT NULL,
  old_rent REAL,
  new_rent REAL,
  date TEXT DEFAULT (date('now')),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_apartments_owner ON apartments(owner_id);
CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_owner ON expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_reports_owner ON monthly_reports(owner_id);
`;

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
    const statements = SCHEMA_SQL
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => {
        if (!statement || statement.startsWith("--")) return false;
        if (statement.toUpperCase().startsWith("PRAGMA")) return false;
        return true;
      });

    for (const statement of statements) {
      await db.prepare(statement).run();
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
