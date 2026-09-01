const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway")
      ? { rejectUnauthorized: false }
      : process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Runs schema.sql on boot. Uses IF NOT EXISTS everywhere, so this
// NEVER wipes existing data — safe to run on every deploy/restart.
async function runMigrations() {
  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
  console.log("[db] schema verified / migrated (no data was wiped)");
}

module.exports = { pool, runMigrations };
