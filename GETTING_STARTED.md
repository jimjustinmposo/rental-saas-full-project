# ⚡ 5-Minute Getting Started

Everything is built. This file gets you running in 5 minutes.

## Prerequisites
- Node.js 18+ installed
- npm installed

## Commands (Copy & Paste)

### 1. Install Wrangler (1 min)
```bash
npm install -g wrangler@latest
```

### 2. Setup Backend (2 min)
```bash
cd backend
npm install
cd ..
```

### 3. Create D1 Database (1 min)
```bash
wrangler d1 create rental-saas-db
```

After running, **copy the database_id and update it in `wrangler.toml`** under `[[d1_databases]]`

### 4. Setup Environment (1 min)
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and change values if needed (they have defaults)
```

### 5. Run Local Server
```bash
wrangler pages dev
```

**Server is running at `http://localhost:8787`** ✅

---

## Test It Works

In another terminal:

```bash
curl http://localhost:8787/api/auth/verify-admin-password \
  -H "Content-Type: application/json" \
  -d '{"password":"fmc10123"}'
```

Should return: `{"ok":true}`

---

## Next Steps

### Connect Frontend
```bash
cd frontend
npm start
```

Frontend will be at `http://localhost:3000` and connect to backend at `http://localhost:8787/api`

### Stop the Server
Press `Ctrl+C` in the wrangler terminal

### Common Commands
```bash
# View database locally
wrangler d1 execute rental-saas-db "SELECT * FROM apartments;" --remote

# Watch for code changes
wrangler pages dev --watch

# Deploy to staging
wrangler pages deploy

# Check diagnostics
node diagnose.js
```

---

## Troubleshooting

**Database ID error?**
- Make sure you copied the ID from step 3 into `wrangler.toml`

**Port 8787 already in use?**
```bash
wrangler pages dev --port 8788
```

**npm install errors?**
```bash
rm -rf backend/node_modules package-lock.json
npm install
```

---

## Full Documentation

- [QUICKSTART.md](QUICKSTART.md) - Detailed 10-minute guide
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) - What's done
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Going to production
- [diagnose.js](diagnose.js) - Debug any issues

---

**That's it!** You're up and running. ✨

Next: Read [QUICKSTART.md](QUICKSTART.md) for more detailed steps and API testing.
