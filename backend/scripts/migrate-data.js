/**
 * Data Migration Script: Railway PostgreSQL → Cloudflare D1
 * 
 * This script exports data from Railway PostgreSQL database
 * and imports it into Cloudflare D1 (SQLite).
 * 
 * Usage:
 *   node migrate-data.js
 * 
 * Make sure to:
 * 1. Set DATABASE_URL env var with Railway PostgreSQL connection string
 * 2. Have D1 database created and initialized with schema-d1.sql
 * 3. Update the D1 database credentials below
 */

const fs = require("fs");
const path = require("path");

// For PostgreSQL (source)
let postgresModule;
try {
  postgresModule = require("pg");
} catch (e) {
  console.error("PostgreSQL module 'pg' not installed. Install with: npm install pg");
  process.exit(1);
}

const { Pool } = postgresModule;

// ============================================================
// CONFIGURATION
// ============================================================

const SOURCE_DB = {
  connectionString: process.env.DATABASE_URL,
};

// D1 target database - update these after creating your D1 database
const TARGET_DB = {
  dbName: "rental-saas-db", // From: wrangler d1 create rental-saas-db
};

const BATCH_SIZE = 100; // Insert in batches to avoid memory issues

// ============================================================
// UTILITIES
// ============================================================

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function formatDate(date) {
  if (!date) return null;
  if (typeof date === "string") return date.split("T")[0]; // Convert to YYYY-MM-DD
  return date.toISOString().split("T")[0];
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// EXPORT FROM POSTGRESQL
// ============================================================

async function exportFromPostgres() {
  log("Connecting to Railway PostgreSQL...");
  const pool = new Pool(SOURCE_DB);
  
  try {
    const data = {};
    const tables = [
      "owners",
      "apartments",
      "units",
      "tenants",
      "payments",
      "expenses",
      "monthly_reports",
      "rent_increase_history",
    ];

    for (const table of tables) {
      log(`Exporting ${table}...`);
      try {
        const result = await pool.query(`SELECT * FROM ${table}`);
        data[table] = result.rows;
        log(`  ✓ ${result.rows.length} rows exported`);
      } catch (err) {
        if (err.message.includes("does not exist")) {
          log(`  ⚠ Table ${table} does not exist (skipping)`);
          data[table] = [];
        } else {
          throw err;
        }
      }
    }

    // Save to file
    const exportFile = path.join(__dirname, "exported-data.json");
    fs.writeFileSync(exportFile, JSON.stringify(data, null, 2));
    log(`✓ Data exported to ${exportFile}`);

    return data;
  } finally {
    await pool.end();
  }
}

// ============================================================
// CONVERT DATA FOR SQLITE
// ============================================================

function convertToSqlite(data) {
  log("Converting data for SQLite...");

  const converted = { ...data };

  // Convert date fields to YYYY-MM-DD text format
  if (converted.owners) {
    converted.owners = converted.owners.map(row => ({
      ...row,
      created_at: formatDate(row.created_at),
    }));
  }

  if (converted.apartments) {
    converted.apartments = converted.apartments.map(row => ({
      ...row,
      created_at: formatDate(row.created_at),
    }));
  }

  if (converted.units) {
    converted.units = converted.units.map(row => ({
      ...row,
      created_at: formatDate(row.created_at),
    }));
  }

  if (converted.tenants) {
    converted.tenants = converted.tenants.map(row => ({
      ...row,
      move_in: formatDate(row.move_in),
      move_out: formatDate(row.move_out),
      created_at: formatDate(row.created_at),
    }));
  }

  if (converted.payments) {
    converted.payments = converted.payments.map(row => ({
      ...row,
      payment_date: formatDate(row.payment_date),
    }));
  }

  if (converted.expenses) {
    converted.expenses = converted.expenses.map(row => ({
      ...row,
      date: formatDate(row.date),
    }));
  }

  if (converted.monthly_reports) {
    converted.monthly_reports = converted.monthly_reports.map(row => ({
      ...row,
      generated_at: formatDate(row.generated_at),
    }));
  }

  if (converted.rent_increase_history) {
    converted.rent_increase_history = converted.rent_increase_history.map(row => ({
      ...row,
      date: formatDate(row.date),
    }));
  }

  log("✓ Data converted");
  return converted;
}

// ============================================================
// GENERATE SQL INSERTS FOR D1
// ============================================================

function generateInsertSQL(table, rows) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const statements = [];
  const columns = Object.keys(rows[0]);
  const columnNames = columns.join(", ");

  // Group rows into batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valuesList = batch
      .map(row => {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return "NULL";
          if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
          if (typeof val === "boolean") return val ? "1" : "0";
          return val;
        });
        return `(${values.join(", ")})`;
      })
      .join(", ");

    statements.push(`INSERT INTO ${table} (${columnNames}) VALUES ${valuesList};`);
  }

  return statements;
}

// ============================================================
// EXPORT SQL SCRIPT
// ============================================================

async function exportAsSQLScript(data) {
  log("Generating SQL insert statements...");

  let sql = "-- Exported from Railway PostgreSQL\n";
  sql += `-- Generated: ${new Date().toISOString()}\n\n`;
  sql += "PRAGMA foreign_keys = ON;\n\n";

  const tables = [
    "owners",
    "apartments",
    "units",
    "tenants",
    "payments",
    "expenses",
    "monthly_reports",
    "rent_increase_history",
  ];

  for (const table of tables) {
    if (data[table] && data[table].length > 0) {
      sql += `-- ${table} (${data[table].length} rows)\n`;
      const statements = generateInsertSQL(table, data[table]);
      sql += statements.join("\n");
      sql += "\n\n";
    }
  }

  const sqlFile = path.join(__dirname, "import-data.sql");
  fs.writeFileSync(sqlFile, sql);
  log(`✓ SQL script generated: ${sqlFile}`);

  return sqlFile;
}

// ============================================================
// MAIN MIGRATION FLOW
// ============================================================

async function main() {
  try {
    log("=".repeat(60));
    log("Railway → Cloudflare D1 Data Migration");
    log("=".repeat(60));

    // Step 1: Export from PostgreSQL
    log("\n[Step 1] Exporting data from Railway PostgreSQL...");
    const exported = await exportFromPostgres();

    // Step 2: Convert for SQLite
    log("\n[Step 2] Converting data format...");
    const converted = convertToSqlite(exported);

    // Step 3: Generate SQL import script
    log("\n[Step 3] Generating SQL import script...");
    const sqlFile = await exportAsSQLScript(converted);

    // Print summary
    log("\n" + "=".repeat(60));
    log("MIGRATION EXPORT COMPLETE ✓");
    log("=".repeat(60));
    log("\nNext steps:");
    log("1. Import the SQL into D1:");
    log(`   wrangler d1 execute rental-saas-db --file=${sqlFile}`);
    log("\n2. Or paste the contents into D1 interactive mode:");
    log("   wrangler d1 execute rental-saas-db --interactive");
    log(`   Then paste contents of ${sqlFile}`);
    log("\n3. Verify the data:");
    log("   wrangler d1 execute rental-saas-db --interactive");
    log("   > SELECT COUNT(*) FROM owners;");
    log("   > SELECT COUNT(*) FROM apartments;");
    log("   > etc...");

    log("\nExported files:");
    log(`  - exported-data.json (backup)`);
    log(`  - import-data.sql (SQL statements)`);

  } catch (err) {
    console.error("\n❌ MIGRATION FAILED:");
    console.error(err.message);
    console.error("\nTroubleshooting:");
    console.error("1. Check DATABASE_URL is set correctly");
    console.error("2. Ensure 'pg' module is installed: npm install pg");
    console.error("3. Verify PostgreSQL connection is accessible");
    console.error("4. Check D1 database exists: wrangler d1 list");
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  main();
}

module.exports = { exportFromPostgres, convertToSqlite, generateInsertSQL };
