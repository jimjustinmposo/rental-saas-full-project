/**
 * One-time importer: loads the cleaned data extracted from the old Excel
 * workbook (migration-data.json) into the live Railway PostgreSQL database.
 *
 * SAFE TO RE-RUN: every insert first checks whether the row already
 * exists (by a natural key) and skips it if so. Running this twice never
 * creates duplicates and never touches unrelated data.
 *
 * Usage:
 *   DATABASE_URL=<your railway connection string> \
 *   OWNER_EMAIL=<the owner account these records belong to> \
 *   node scripts/import-excel-data.js
 *
 * Or, if run from within the deployed Railway environment where
 * DATABASE_URL is already set:
 *   OWNER_EMAIL=you@example.com node scripts/import-excel-data.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DATA_PATH = path.join(__dirname, "migration-data.json");

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    console.error("ERROR: set OWNER_EMAIL to the account these records belong to.");
    console.error("Example: OWNER_EMAIL=you@example.com node scripts/import-excel-data.js");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : false,
  });

  const stats = {
    apartments: { created: 0, existing: 0 },
    units: { created: 0, existing: 0 },
    tenants: { created: 0, existing: 0 },
    payments: { created: 0, existing: 0 },
    expenses: { created: 0 },
  };

  try {
    const ownerRes = await pool.query("SELECT id FROM owners WHERE email = $1", [
      ownerEmail.toLowerCase().trim(),
    ]);
    if (!ownerRes.rows[0]) {
      console.error(`No owner found with email ${ownerEmail}. Create the account first, then re-run.`);
      process.exit(1);
    }
    const ownerId = ownerRes.rows[0].id;
    console.log(`Importing into owner_id=${ownerId} (${ownerEmail})`);

    // ---- 1. Apartments — reuse existing rows by name, create if missing ----
    const apartmentIdByName = {};
    for (const name of data.apartments) {
      const existing = await pool.query(
        "SELECT id FROM apartments WHERE owner_id = $1 AND name = $2",
        [ownerId, name]
      );
      if (existing.rows[0]) {
        apartmentIdByName[name] = existing.rows[0].id;
        stats.apartments.existing++;
      } else {
        const inserted = await pool.query(
          "INSERT INTO apartments (owner_id, name) VALUES ($1, $2) RETURNING id",
          [ownerId, name]
        );
        apartmentIdByName[name] = inserted.rows[0].id;
        stats.apartments.created++;
      }
    }

    // ---- 2. Units — one per (apartment, unit_code) ----
    const unitIdByKey = {}; // "apartment||unit_code" -> unit id
    for (const u of data.units) {
      const apartmentId = apartmentIdByName[u.apartment];
      const existing = await pool.query(
        "SELECT id FROM units WHERE owner_id = $1 AND apartment_id = $2 AND unit_number = $3",
        [ownerId, apartmentId, u.unit_code]
      );
      const key = `${u.apartment}||${u.unit_code}`;
      if (existing.rows[0]) {
        unitIdByKey[key] = existing.rows[0].id;
        stats.units.existing++;
      } else {
        const inserted = await pool.query(
          `INSERT INTO units (owner_id, apartment_id, unit_number, current_rent, status)
           VALUES ($1, $2, $3, $4, 'Vacant') RETURNING id`,
          [ownerId, apartmentId, u.unit_code, u.current_rent]
        );
        unitIdByKey[key] = inserted.rows[0].id;
        stats.units.created++;
      }
    }

    // ---- 3. Tenants — one per (apartment, tenant_raw name) ----
    const tenantIdByKey = {}; // "apartment||tenant_raw" -> tenant id
    for (const t of data.tenants) {
      const unitId = unitIdByKey[`${t.apartment}||${t.unit_code}`] || null;
      const existing = await pool.query(
        "SELECT id FROM tenants WHERE owner_id = $1 AND name = $2",
        [ownerId, t.display_name]
      );
      const key = `${t.apartment}||${t.tenant_raw}`;
      if (existing.rows[0]) {
        tenantIdByKey[key] = existing.rows[0].id;
        stats.tenants.existing++;
      } else {
        const inserted = await pool.query(
          `INSERT INTO tenants (owner_id, name, phone, unit_id, move_in, move_out, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            ownerId,
            t.display_name,
            t.phone,
            t.status === "Active" ? unitId : null, // only currently-active tenants occupy a unit
            t.move_in,
            t.move_out,
            t.status,
          ]
        );
        tenantIdByKey[key] = inserted.rows[0].id;
        stats.tenants.created++;

        if (t.status === "Active" && unitId) {
          await pool.query("UPDATE units SET status = 'Occupied' WHERE id = $1", [unitId]);
        }
      }
    }

    // ---- 4. Payments — one per (tenant, month), matching the app's
    //         monthly-rental-rule upsert behavior ----
    for (const p of data.payments) {
      const tenantId = tenantIdByKey[`${p.apartment}||${p.tenant_raw}`];
      const unitId = unitIdByKey[`${p.apartment}||${p.unit_code}`];
      const apartmentId = apartmentIdByName[p.apartment];
      if (!tenantId) continue;

      const existing = await pool.query(
        "SELECT id FROM payments WHERE owner_id = $1 AND tenant_id = $2 AND month = $3",
        [ownerId, tenantId, p.month]
      );
      if (existing.rows[0]) {
        stats.payments.existing++;
        continue;
      }
      const balance = p.amount_due - p.amount_paid;
      await pool.query(
        `INSERT INTO payments
           (owner_id, tenant_id, unit_id, apartment_id, month, amount_due, amount_paid, balance, status, payment_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ownerId, tenantId, unitId, apartmentId, p.month, p.amount_due, p.amount_paid, balance, p.status, p.payment_date]
      );
      stats.payments.created++;
    }

    // ---- 5. Expenses — no natural per-row dedupe key, so instead we check
    //         ONCE per apartment, before importing anything, whether that
    //         apartment already has expenses on file. If it does, we skip
    //         importing expenses for it entirely (safe default against
    //         re-running this script creating duplicates); otherwise we
    //         import every expense row for that apartment.
    const apartmentIdsInExpenses = [...new Set(data.expenses.map((e) => apartmentIdByName[e.apartment]))];
    const skipExpensesForApartment = new Set();
    for (const apartmentId of apartmentIdsInExpenses) {
      const check = await pool.query(
        "SELECT id FROM expenses WHERE owner_id = $1 AND apartment_id = $2 LIMIT 1",
        [ownerId, apartmentId]
      );
      if (check.rows[0]) {
        console.log(`Skipping expense import for apartment_id=${apartmentId} — expenses already exist.`);
        skipExpensesForApartment.add(apartmentId);
      }
    }

    for (const e of data.expenses) {
      const apartmentId = apartmentIdByName[e.apartment];
      if (skipExpensesForApartment.has(apartmentId)) continue;

      await pool.query(
        `INSERT INTO expenses (owner_id, apartment_id, description, amount, date)
         VALUES ($1,$2,$3,$4,$5)`,
        [ownerId, apartmentId, e.description, e.amount, e.date]
      );
      stats.expenses.created++;
    }

    console.log("\n=== Import complete ===");
    console.log(JSON.stringify(stats, null, 2));
    if (data.warnings && data.warnings.length) {
      console.log("\nWarnings from extraction:");
      data.warnings.forEach((w) => console.log(" -", w));
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
