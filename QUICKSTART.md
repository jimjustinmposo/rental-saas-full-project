# Quick Start Guide - Local Development Setup

Get your rental SaaS backend running locally on Cloudflare Pages Functions + D1 in 10 minutes.

## Prerequisites

✅ **Required:**
- Node.js 18+ (`node --version`)
- npm or yarn

✅ **Recommended:**
- Cloudflare account (free tier works)
- Git

## Step 1: Install Wrangler CLI (2 min)

```bash
npm install -g wrangler@latest
wrangler --version
# Should show 3.x or higher
```

## Step 2: Setup Backend Dependencies (2 min)

```bash
cd backend
npm install
# Installs @cloudflare/workers-types, wrangler, and other deps
# Note: Express and pg are REMOVED - we use D1 instead
```

## Step 3: Create D1 Database Locally (3 min)

```bash
# Create database
wrangler d1 create rental-saas-db

# Copy the database_id from output (looks like "12345-abc-67890")
# Then edit wrangler.toml and update this section:
# [[d1_databases]]
# binding = "DB"
# database_id = "PASTE_YOUR_ID_HERE"

# Initialize schema
wrangler d1 execute rental-saas-db --file=sql/schema-d1.sql

# Verify tables created
wrangler d1 execute rental-saas-db --interactive
# Run: SELECT name FROM sqlite_master WHERE type='table';
# You should see: owners, apartments, units, tenants, payments, expenses, monthly_reports, rent_increase_history
```

## Step 4: Create .dev.vars File (1 min)

```bash
# In project root (not in backend/)
cp .dev.vars.example .dev.vars

# Edit .dev.vars and set your values:
# FRONTEND_URL=http://localhost:3000
# ADMIN_SIGNUP_PASSWORD=fmc10123
# JWT_SECRET=your-dev-jwt-secret-key
# NODE_ENV=development
```

## Step 5: Start Dev Server (1 min)

```bash
# From project root (where wrangler.toml is)
wrangler pages dev

# You should see:
# ✓ Your Pages Functions site is ready on: http://localhost:8787
```

## Step 6: Test API Endpoints (1 min)

Open a new terminal and test:

```bash
# Test health check
curl http://localhost:8787/api/health
# Expected: {"status":"ok"}

# Test admin password verification
curl -X POST http://localhost:8787/api/auth/verify-admin-password \
  -H "Content-Type: application/json" \
  -d '{"password":"fmc10123"}'
# Expected: {"ok":true}

# Create account
curl -X POST http://localhost:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword":"fmc10123",
    "name":"Test User",
    "email":"test@example.com",
    "password":"password123",
    "confirmPassword":"password123"
  }'
# Expected: {"token":"eyJ...","owner":{...}}

# Save the token from above response
TOKEN="eyJ..."

# Test creating apartment (with token)
curl -X POST http://localhost:8787/api/apartments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name":"My Apartment",
    "address":"123 Main St",
    "payment_note":"Pay by 15th of month"
  }'
# Expected: {"id":1,"owner_id":1,"name":"My Apartment",...}
```

✅ **All working? Great! Move to Step 7.**

## Step 7: Connect Frontend (optional, but recommended)

Update frontend to point to local API:

```bash
# In frontend/.env.local
REACT_APP_API_URL=http://localhost:8787/api

# Start frontend dev server
cd frontend
npm start
```

Frontend should now connect to your local Cloudflare backend.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "D1 database not found" | Run: `wrangler d1 list` - verify database exists |
| "Cannot find module '@cloudflare/workers-types'" | Run: `cd backend && npm install` |
| "CORS errors in frontend" | Check `FRONTEND_URL` in .dev.vars matches frontend domain |
| "wrangler: command not found" | Run: `npm install -g wrangler@latest` |
| "Module pg not found" | pg is removed - not needed. Use D1 instead. |
| "R2 bucket not configured" | Optional. File uploads will fail until R2 is set up (see DEPLOYMENT_CHECKLIST.md Phase 2) |

## Next Steps

### To migrate data from Railway:

```bash
# 1. Set DATABASE_URL env var with Railway connection
export DATABASE_URL="postgresql://user:pass@host/db"

# 2. Install pg module
cd backend && npm install pg

# 3. Run migration script
node scripts/migrate-data.js

# 4. Follow the generated instructions
```

See [MIGRATION.md](../MIGRATION.md) Phase 3 for detailed instructions.

### To deploy to Cloudflare:

See [DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md) Phase 7.

## Environment Variables

| Variable | Purpose | Local | Production |
|----------|---------|-------|------------|
| `FRONTEND_URL` | CORS origin | `http://localhost:3000` | `https://yourdomain.com` |
| `ADMIN_SIGNUP_PASSWORD` | Gatekeeper for account creation | `fmc10123` | Use unique secret |
| `JWT_SECRET` | Token signing key | dev secret | Use unique secret |
| `NODE_ENV` | Environment | `development` | `production` |

## Database Schema

All tables are auto-created on first request (uses `IF NOT EXISTS`). Never drops data.

Key tables:
- `owners` - User accounts
- `apartments` - Rental properties
- `units` - Individual units/rooms
- `tenants` - Tenant profiles
- `payments` - Monthly rent payments
- `expenses` - Expense tracking
- `monthly_reports` - Financial summaries

## File Uploads (R2)

For local dev, file uploads are stubbed out. To enable R2:

1. Create R2 bucket: `wrangler r2 bucket create rental-saas-uploads`
2. Update wrangler.toml with bucket binding
3. Set `R2_BUCKET_URL` in .dev.vars
4. Test upload: POST `/api/tenants/upload-image`

## Common Tasks

### View D1 database contents
```bash
wrangler d1 execute rental-saas-db --interactive
# Then run SQL queries
```

### Reset database (clear all data)
```bash
# ⚠️ WARNING: This deletes all data
wrangler d1 execute rental-saas-db --file=sql/schema-d1.sql
```

### View server logs
```bash
# Logs appear in terminal where wrangler pages dev is running
# Or: wrangler tail
```

### Test specific endpoint
```bash
# Create a test token first, then:
curl http://localhost:8787/api/apartments \
  -H "Authorization: Bearer $TOKEN"
```

## Performance Tips

- First request to Pages Function may be slow (~100ms) - this is normal
- Subsequent requests are fast (<50ms)
- D1 queries are optimized with indexes on owner_id
- No N+1 query problems in handlers

## Need Help?

- **API not responding?** → Check `wrangler pages dev` is running
- **Database errors?** → Run `wrangler d1 list` and verify schema
- **Frontend CORS issues?** → Check FRONTEND_URL in .dev.vars
- **Auth failing?** → Verify JWT_SECRET matches in .dev.vars

See [MIGRATION.md](../MIGRATION.md) for detailed documentation.
