/**
 * Generates a correct D1 import SQL file from exported-data.json
 * (the authoritative Railway PostgreSQL export).
 *
 * Fixes the bugs in migrate-data.js's generateInsertSQL:
 *  - every row tuple now has EXACTLY the same number of terms as the
 *    column list (missing keys become NULL),
 *  - includes the `note` column for payments (exists in Railway, was
 *    missing from the SQLite schema),
 *  - converts ISO timestamps to YYYY-MM-DD,
 *  - converts numeric strings to real numbers for REAL columns.
 *
 * Usage:  node backend/scripts/generate-d1-import.js
 * Output: backend/scripts/import-data-fixed.sql
 */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "exported-data.json");
const OUT_PATH = path.join(__dirname, "import-data-fixed.sql");
const BATCH_SIZE = 40; // rows per INSERT statement (keeps each statement well under D1 limits)

// Column order per table, matching backend/sql/schema-d1.sql
// (payments includes `note` — added to the remote schema via ALTER TABLE)
const TABLE_COLUMNS = {
  owners: ["id", "name", "email", "password_hash", "currency", "created_at"],
  apartments: ["id", "owner_id", "name", "address", "payment_note", "created_at"],
  units: ["id", "owner_id", "apartment_id", "unit_number", "current_rent", "status", "created_at"],
  tenants: [
    "id", "owner_id", "name", "phone", "unit_id", "move_in", "move_out",
    "deposit", "image_url", "status", "created_at",
  ],
  payments: [
    "id", "owner_id", "tenant_id", "unit_id", "apartment_id", "month",
    "amount_due", "amount_paid", "balance", "status", "payment_date", "note",
  ],
  expenses: ["id", "owner_id", "apartment_id", "unit_id", "description", "amount", "date"],
  monthly_reports: [
    "id", "owner_id", "apartment_id", "month",
    "total_income", "total_expenses", "profit", "generated_at",
  ],
  rent_increase_history: ["id", "owner_id", "unit_id", "old_rent", "new_rent", "date"],
};

// Import order respects foreign keys
const TABLE_ORDER = [
  "owners",
  "apartments",
  "units",
  "tenants",
  "payments",
  "expenses",
  "monthly_reports",
  "rent_increase_history",
];

// Columns that hold dates / timestamps → normalize to YYYY-MM-DD
const DATE_COLUMNS = new Set([
  "created_at", "move_in", "move_out", "payment_date", "date", "generated_at",
]);

// Columns that hold numbers → coerce numeric strings
const NUMERIC_COLUMNS = new Set([
  "current_rent", "deposit", "amount_due", "amount_paid", "balance",
  "amount", "total_income", "total_expenses", "profit", "old_rent", "new_rent",
  "id", "owner_id", "apartment_id", "unit_id", "tenant_id",
]);

function normalizeDate(val) {
  if (val === null || val === undefined) return null;
  const s = String(val);
  // "2026-08-05T03:40:14.039Z" or "2026-08-05 ..." → "2026-08-05"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function normalizeNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  const n = Number(val);
  return Number.isNaN(n) ? val : n;
}

function escapeSqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

function toSqlLiteral(val, col) {
  if (val === null || val === undefined) return "NULL";
  if (DATE_COLUMNS.has(col)) {
    const d = normalizeDate(val);
    return d === null ? "NULL" : escapeSqlString(d);
  }
  if (NUMERIC_COLUMNS.has(col)) {
    const n = normalizeNumber(val);
    return n === null ? "NULL" : String(n);
  }
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "object") return escapeSqlString(JSON.stringify(val));
  return escapeSqlString(String(val));
}

function generateInserts(table, rows) {
  const columns = TABLE_COLUMNS[table];
  // Safety: warn if JSON contains keys outside the canonical list
  const extra = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!columns.includes(k)) extra.add(k);
    }
  }
  if (extra.size) {
    console.warn(
      `  ! ${table}: JSON keys not in canonical column list (dropped): ${[...extra].join(", ")}`
    );
  }

  const statements = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const tuples = batch.map((row) => {
      const values = columns.map((col) => toSqlLiteral(row[col], col));
      return `(${values.join(", ")})`;
    });
    statements.push(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${tuples.join(",\n  ")};`
    );
  }
  return statements;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  let sql = `-- D1 import generated from exported-data.json (Railway PostgreSQL export)
-- Generated: ${new Date().toISOString()}
-- Every tuple matches its column list exactly; missing values are NULL.
-- Batched at ${BATCH_SIZE} rows per statement (safe for D1 statement limits).
--
-- NOTE: requires the payments table to have a \`note\` column first:
--   ALTER TABLE payments ADD COLUMN note TEXT;

`;

  const summary = [];
  for (const table of TABLE_ORDER) {
    const rows = data[table] || [];
    if (rows.length === 0) {
      summary.push(`${table}: 0 rows (skipped)`);
      continue;
    }
    sql += `-- ${table} (${rows.length} rows)\n`;
    sql += generateInserts(table, rows).join("\n\n");
    sql += "\n\n";
    summary.push(`${table}: ${rows.length} rows`);
  }

  fs.writeFileSync(OUT_PATH, sql);
  console.log("Generated:", OUT_PATH);
  console.log(`Size: ${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB`);
  console.log("\nContents:");
  summary.forEach((s) => console.log("  " + s));
}

main();
