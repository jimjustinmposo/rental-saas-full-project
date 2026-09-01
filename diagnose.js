#!/usr/bin/env node

/**
 * Troubleshooting Diagnostic Tool
 * 
 * Helps diagnose common issues with Cloudflare Pages Functions setup
 * 
 * Run: node diagnose.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let verbose = process.argv.includes("--verbose");

function log(msg) {
  console.log(msg);
}

function info(msg) {
  if (verbose) console.log(`  ℹ️  ${msg}`);
}

function section(title) {
  console.log("\n" + "─".repeat(60));
  console.log(title);
  console.log("─".repeat(60));
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

section("📊 Environment Diagnostics");

// Node.js version
const nodeVersion = run("node --version");
console.log(`Node.js: ${nodeVersion || "❌ Not found"}`);

// npm version
const npmVersion = run("npm --version");
console.log(`npm: ${npmVersion || "❌ Not found"}`);

// Wrangler version
const wranglerVersion = run("wrangler --version");
console.log(`Wrangler: ${wranglerVersion || "❌ Not installed (run: npm install -g wrangler)"}`);

section("📁 File Structure");

const files = [
  ["wrangler.toml", "Cloudflare config"],
  [".dev.vars", "Environment variables"],
  [".dev.vars.example", "Environment template"],
  ["backend/src/handlers.js", "Route handlers"],
  ["backend/src/db-d1.js", "D1 adapter"],
  ["backend/sql/schema-d1.sql", "Database schema"],
  ["functions/api/[[path]].js", "Pages Functions entry"],
  ["backend/package.json", "Backend dependencies"],
];

for (const [file, desc] of files) {
  const exists = fs.existsSync(file);
  console.log(`${exists ? "✅" : "❌"} ${file} - ${desc}`);
}

section("🔧 Configuration Check");

// Check wrangler.toml
if (fs.existsSync("wrangler.toml")) {
  const content = fs.readFileSync("wrangler.toml", "utf8");
  const hasD1 = content.includes("[[d1_databases]]");
  const hasR2 = content.includes("[[r2_buckets]]");
  const dbId = content.match(/database_id\s*=\s*"([^"]+)"/);

  console.log(`D1 Database binding: ${hasD1 ? "✅" : "❌"}`);
  console.log(`R2 Bucket binding: ${hasR2 ? "✅" : "❌"}`);
  console.log(`D1 Database ID set: ${dbId ? "✅" : "❌ Run: wrangler d1 create rental-saas-db"}`);
  
  if (dbId) info(`Database ID: ${dbId[1].substring(0, 10)}...`);
}

// Check .dev.vars
if (fs.existsSync(".dev.vars")) {
  const content = fs.readFileSync(".dev.vars", "utf8");
  const vars = ["FRONTEND_URL", "ADMIN_SIGNUP_PASSWORD", "JWT_SECRET", "NODE_ENV"];
  
  for (const v of vars) {
    const has = content.includes(v);
    console.log(`${has ? "✅" : "❌"} ${v} in .dev.vars`);
  }
} else {
  console.log("❌ .dev.vars missing - create from .dev.vars.example");
}

section("📦 Dependencies");

if (fs.existsSync("backend/package.json")) {
  const pkg = JSON.parse(fs.readFileSync("backend/package.json", "utf8"));
  
  // Check for old dependencies
  const oldDeps = ["pg", "express", "cors", "multer"];
  let hasOld = false;
  for (const dep of oldDeps) {
    if (pkg.dependencies[dep]) {
      console.log(`❌ ${dep} still in dependencies (should be removed)`);
      hasOld = true;
    }
  }
  if (!hasOld) console.log("✅ No old dependencies (pg, express removed)");

  // Check for required dependencies
  const required = ["bcryptjs", "jsonwebtoken"];
  for (const dep of required) {
    const has = pkg.dependencies[dep];
    console.log(`${has ? "✅" : "❌"} ${dep}`);
  }

  if (!fs.existsSync("backend/node_modules")) {
    console.log(`❌ node_modules missing - run: cd backend && npm install`);
  } else {
    console.log("✅ node_modules installed");
  }
}

section("🗄️ Database Status");

// Check D1
try {
  const dbList = run("wrangler d1 list");
  if (dbList && dbList.includes("rental-saas-db")) {
    console.log("✅ D1 database 'rental-saas-db' exists");
    
    // Check if initialized
    try {
      const tables = run("wrangler d1 execute rental-saas-db 'SELECT COUNT(*) FROM sqlite_master WHERE type=\"table\";' --remote 2>/dev/null");
      if (tables) {
        console.log(`✅ Database initialized (${tables} tables)`);
      } else {
        console.log("❌ Database not initialized - run schema migration");
      }
    } catch {
      console.log("⚠️  Could not check database status (may be offline)");
    }
  } else {
    console.log("❌ D1 database 'rental-saas-db' not found");
    console.log("   Run: wrangler d1 create rental-saas-db");
  }
} catch (err) {
  console.log("⚠️  Could not check D1 status");
  info(`Error: ${err.message.substring(0, 100)}`);
}

// Check R2
try {
  const buckets = run("wrangler r2 bucket list");
  if (buckets && buckets.includes("rental-saas-uploads")) {
    console.log("✅ R2 bucket 'rental-saas-uploads' exists");
  } else {
    console.log("⚠️  R2 bucket 'rental-saas-uploads' not found (optional)");
    console.log("   Run: wrangler r2 bucket create rental-saas-uploads");
  }
} catch {
  console.log("⚠️  Could not check R2 status");
}

section("💻 Local Server Test");

try {
  // Try to connect to local dev server
  const http = require("http");
  const req = http.get("http://localhost:8787/api/health", (res) => {
    if (res.statusCode === 200) {
      console.log("✅ Dev server running at http://localhost:8787");
    } else {
      console.log("⚠️  Dev server responded with status " + res.statusCode);
    }
  });
  req.on("error", () => {
    console.log("❌ Dev server not running");
    console.log("   Run: wrangler pages dev");
  });
  req.setTimeout(2000);
} catch {
  console.log("⚠️  Could not test dev server");
}

section("🔍 Common Issues & Fixes");

const issues = [];

// Check for .dev.vars in git
if (fs.existsSync(".gitignore")) {
  const gitignore = fs.readFileSync(".gitignore", "utf8");
  if (!gitignore.includes(".dev.vars")) {
    issues.push("⚠️  .dev.vars not in .gitignore - secrets may be exposed!");
  }
}

// Check for old Express code
if (fs.existsSync("backend/src/server.js")) {
  const content = fs.readFileSync("backend/src/server.js", "utf8");
  if (content.includes("express")) {
    issues.push("📝 Old Express code still present (unused) in backend/src/server.js");
  }
}

// Check handlers for stubs
if (fs.existsSync("backend/src/handlers.js")) {
  const content = fs.readFileSync("backend/src/handlers.js", "utf8");
  if (content.includes("stubHandler")) {
    issues.push("❌ Stub handlers still in handlers.js - use complete version");
  }
  if (!content.includes("handlePaymentRoutes")) {
    issues.push("❌ Missing route handler implementations");
  }
}

if (issues.length === 0) {
  console.log("✅ No common issues detected!");
} else {
  for (const issue of issues) {
    log(issue);
  }
}

section("🆘 Next Steps");

console.log("\n✅ Quick Start:");
console.log("  1. npm install -g wrangler@latest");
console.log("  2. cd backend && npm install");
console.log("  3. wrangler d1 create rental-saas-db");
console.log("  4. cp .dev.vars.example .dev.vars");
console.log("  5. wrangler pages dev\n");

console.log("📖 Documentation:");
console.log("  • QUICKSTART.md - 10-minute setup");
console.log("  • DEPLOYMENT_CHECKLIST.md - Production steps");
console.log("  • MIGRATION.md - Complete migration guide\n");

console.log("🐛 Debug Mode:");
console.log("  Run with --verbose for more details:");
console.log("  node diagnose.js --verbose\n");

console.log("═".repeat(60));
