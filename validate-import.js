// Validate import-data.sql locally: apply schema, run each statement, report failures
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const sqlPath = path.join(__dirname, "backend/scripts/import-data-fixed.sql");
const schemaPath = path.join(__dirname, "backend/sql/schema-d1.sql");

const schema = fs.readFileSync(schemaPath, "utf8");
const sql = fs.readFileSync(sqlPath, "utf8");

const db = new DatabaseSync(":memory:");

// Apply schema statement-by-statement (split on ; at line ends)
const schemaStmts = schema
  .split(";\n")
  .map((s) => s.replace(/--.*$/gm, "").trim())
  .filter(Boolean);
for (const s of schemaStmts) {
  try {
    db.exec(s);
  } catch (e) {
    console.log("SCHEMA ERROR:", e.message, "\nstmt:", s.slice(0, 100));
  }
}
// The fixed import includes the payments `note` column (matches Railway schema)
try {
  db.exec("ALTER TABLE payments ADD COLUMN note TEXT;");
} catch (e) {
  console.log("ALTER ERROR:", e.message);
}

// Split import SQL into statements on ";" — respecting quoted strings and -- comments
function splitStatements(sqlText) {
  const stmts = [];
  let cur = "";
  let inStr = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    // Skip -- line comments
    if (!inStr && ch === "-" && sqlText[i + 1] === "-") {
      const nl = sqlText.indexOf("\n", i);
      i = nl === -1 ? sqlText.length : nl;
      cur += "\n";
      continue;
    }
    if (ch === "'") {
      if (inStr && sqlText[i + 1] === "'") {
        cur += "''";
        i++;
        continue;
      }
      inStr = !inStr;
    }
    if (ch === ";" && !inStr) {
      stmts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts;
}

const statements = splitStatements(sql);
console.log(`Total statements: ${statements.length}`);

let failed = 0;
statements.forEach((stmtRaw, idx) => {
  // Strip comment lines, then skip statements that are empty or PRAGMA
  const noComments = stmtRaw.replace(/--.*$/gm, "").trim();
  if (!noComments || /^PRAGMA/i.test(noComments)) return;
  const stmt = noComments;
  try {
    db.exec(stmt);
  } catch (e) {
    failed++;
    // Find which table + estimate row index
    const tableMatch = stmt.match(/INSERT INTO (\w+)/i);
    const table = tableMatch ? tableMatch[1] : "?";
    console.log(`\n[FAIL #${idx}] table=${table}: ${e.message}`);
    console.log("stmt length:", stmt.length);
    // Show the columns list
    const colsMatch = stmt.match(/\(([^)]+)\)\s*VALUES/i);
    if (colsMatch) console.log("columns:", colsMatch[1]);
    // Count terms per tuple to find mismatched rows
    const valuesPart = stmt.slice(stmt.toUpperCase().indexOf("VALUES") + 6);
    // split top-level tuples
    let depth = 0,
      inS = false,
      tuples = [],
      curT = "";
    for (let i = 0; i < valuesPart.length; i++) {
      const ch = valuesPart[i];
      if (ch === "'") {
        if (inS && valuesPart[i + 1] === "'") {
          curT += "''";
          i++;
          continue;
        }
        inS = !inS;
      }
      if (!inS) {
        if (ch === "(") {
          depth++;
          if (depth === 1) {
            curT = "";
            continue;
          }
        } else if (ch === ")") {
          depth--;
          if (depth === 0) {
            tuples.push(curT);
            continue;
          }
        }
        if (depth >= 1) curT += ch;
      } else {
        curT += ch;
      }
    }
    console.log("tuples:", tuples.length);
    const counts = tuples.map((t) => {
      // count top-level commas outside quotes
      let c = 0,
        inStr2 = false;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === "'") {
          if (inStr2 && t[i + 1] === "'") {
            i++;
            continue;
          }
          inStr2 = !inStr2;
          continue;
        }
        if (!inStr2 && t[i] === ",") c++;
      }
      return c + 1;
    });
    const expected = counts[0];
    counts.forEach((n, i) => {
      if (n !== expected) {
        console.log(`  row ${i}: ${n} terms (expected ${expected})`);
        console.log("  content:", tuples[i].slice(0, 300));
      }
    });
  }
});

// Final counts
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
console.log("\n=== Local import result ===");
for (const t of tables) {
  const c = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get();
  console.log(`  ${t}: ${c.n} rows`);
}
db.close();
console.log(failed === 0 ? "\nAll statements OK" : `\n${failed} statement(s) FAILED`);
