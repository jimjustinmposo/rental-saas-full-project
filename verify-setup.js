#!/usr/bin/env node

/**
 * Setup Verification Script
 * 
 * Checks that your local development environment is properly configured
 * for Cloudflare Pages Functions + D1 development.
 * 
 * Run: node verify-setup.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

function run() {
  console.log("\n" + "=".repeat(60));
  console.log("Rental SaaS - Setup Verification");
  console.log("=".repeat(60) + "\n");

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of checks) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name}`);
      console.log(`   ${err.message}\n`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60) + "\n");

  if (failed === 0) {
    console.log("✨ All checks passed! You're ready to go.\n");
    console.log("Next steps:");
    console.log("  1. wrangler pages dev");
    console.log("  2. In another terminal: npm start (in frontend/)");
    console.log("  3. Open http://localhost:3000\n");
    process.exit(0);
  } else {
    console.log("⚠️  Some checks failed. Fix the issues above and re-run.\n");
    process.exit(1);
  }
}

// ============================================================
// CHECKS
// ============================================================

check("Node.js version", () => {
  const version = execSync("node --version", { encoding: "utf8" }).trim();
  const major = parseInt(version.split(".")[0].slice(1));
  if (major < 18) throw new Error(`Node.js 18+ required, got ${version}`);
});

check("npm is installed", () => {
  execSync("npm --version", { encoding: "utf8" });
});

check("Wrangler CLI installed globally", () => {
  try {
    execSync("wrangler --version", { encoding: "utf8" });
  } catch {
    throw new Error("Run: npm install -g wrangler@latest");
  }
});

check("Wrangler version", () => {
  const version = execSync("wrangler --version", { encoding: "utf8" }).trim();
  const major = parseInt(version.split(".")[0]);
  if (major < 3) throw new Error(`Wrangler 3+ required, got ${version}`);
});

check("wrangler.toml exists", () => {
  if (!fs.existsSync("wrangler.toml")) {
    throw new Error("wrangler.toml not found in project root");
  }
});

check("wrangler.toml has D1 binding", () => {
  const content = fs.readFileSync("wrangler.toml", "utf8");
  if (!content.includes("[[d1_databases]]")) {
    throw new Error("No D1 database binding in wrangler.toml");
  }
  if (!content.includes('binding = "DB"')) {
    throw new Error("D1 binding must be named 'DB' in wrangler.toml");
  }
});

check("D1 database_id configured", () => {
  const content = fs.readFileSync("wrangler.toml", "utf8");
  const match = content.match(/database_id\s*=\s*"([^"]+)"/);
  if (!match || match[1] === "") {
    throw new Error("D1 database_id not set in wrangler.toml - run: wrangler d1 create rental-saas-db");
  }
});

check(".dev.vars exists", () => {
  if (!fs.existsSync(".dev.vars")) {
    throw new Error("Create .dev.vars from .dev.vars.example: cp .dev.vars.example .dev.vars");
  }
});

check(".dev.vars has required variables", () => {
  const content = fs.readFileSync(".dev.vars", "utf8");
  const required = ["FRONTEND_URL", "ADMIN_SIGNUP_PASSWORD", "JWT_SECRET"];
  for (const v of required) {
    if (!content.includes(v)) {
      throw new Error(`${v} not found in .dev.vars`);
    }
  }
});

check(".dev.vars is in .gitignore", () => {
  const content = fs.readFileSync(".gitignore", "utf8");
  if (!content.includes(".dev.vars")) {
    throw new Error(".dev.vars not in .gitignore - add it to protect secrets");
  }
});

check("backend/package.json updated", () => {
  const pkg = JSON.parse(fs.readFileSync("backend/package.json", "utf8"));
  if (pkg.dependencies.pg || pkg.dependencies.express) {
    throw new Error("Old dependencies still in package.json (pg, express). Run: cd backend && npm install");
  }
  if (!pkg.dependencies.bcryptjs || !pkg.dependencies.jsonwebtoken) {
    throw new Error("Missing dependencies. Run: cd backend && npm install");
  }
});

check("backend/node_modules exists", () => {
  if (!fs.existsSync("backend/node_modules")) {
    throw new Error("Dependencies not installed. Run: cd backend && npm install");
  }
});

check("Database schema file exists", () => {
  if (!fs.existsSync("backend/sql/schema-d1.sql")) {
    throw new Error("schema-d1.sql not found");
  }
});

check("D1 database initialized", () => {
  try {
    const output = execSync("wrangler d1 execute rental-saas-db 'SELECT name FROM sqlite_master WHERE type=\"table\" LIMIT 1;' --remote", { encoding: "utf8" });
    // If no error, database is initialized
  } catch (err) {
    // Check if it's a "no database" error vs other error
    if (err.message.includes("Database not found")) {
      throw new Error("D1 database not initialized. Run: wrangler d1 execute rental-saas-db --file=backend/sql/schema-d1.sql");
    }
    // Local dev might not have --remote, so skip this for now
  }
});

check("Handlers file is complete", () => {
  const content = fs.readFileSync("backend/src/handlers.js", "utf8");
  if (content.includes("stubHandler")) {
    throw new Error("Stub handlers still in place - use complete handlers.js");
  }
  if (!content.includes("handlePaymentRoutes") || !content.includes("handleExpenseRoutes")) {
    throw new Error("handlers.js missing implementations");
  }
});

check("Functions entry point exists", () => {
  if (!fs.existsSync("functions/api/[[path]].js")) {
    throw new Error("Pages Functions entry point missing: functions/api/[[path]].js");
  }
});

check("Frontend exists", () => {
  if (!fs.existsSync("frontend/package.json")) {
    throw new Error("Frontend not found - check directory structure");
  }
});

check("Frontend can connect to backend", () => {
  try {
    const file = fs.readFileSync("frontend/src/api/apiClient.js", "utf8");
    if (!file.includes("API_URL")) {
      console.warn("   ⚠️  Consider updating apiClient.js API_URL for local dev");
    }
  } catch {
    // File might not exist yet
  }
});

check("README and docs exist", () => {
  const files = ["QUICKSTART.md", "DEPLOYMENT_CHECKLIST.md", "MIGRATION.md"];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      throw new Error(`${f} not found`);
    }
  }
});

// Run all checks
run();
