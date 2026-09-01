# Cloudflare Migration Guide

This guide walks through the complete migration of your rental SaaS from Railway (PostgreSQL) to Cloudflare (D1 SQLite + Pages Functions + R2).

## Architecture Overview

**Before (Railway):**
- Express.js backend on Node.js
- PostgreSQL database
- Local file uploads in `/uploads`
- Traditional server model

**After (Cloudflare):**
- Cloudflare Pages Functions (serverless)
- D1 database (SQLite)
- R2 object storage (S3-compatible)
- Edge-first architecture

## Migration Steps

### Phase 1: Setup (Local Development)

#### 1. Install Wrangler CLI
```bash
npm install -g wrangler@latest
wrangler --version  # should be 3.x or higher
```

#### 2. Update Backend Dependencies
```bash
cd backend
npm install @cloudflare/workers-types @cloudflare/d1 sqlite
# Remove pg dependency (PostgreSQL driver)
npm uninstall pg
```

#### 3. Create D1 Database
```bash
wrangler d1 create rental-saas-db
# Copy the database_id from output and update wrangler.toml
```

#### 4. Create R2 Bucket
```bash
wrangler r2 bucket create rental-saas-uploads
# Update wrangler.toml with bucket name
```

#### 5. Create KV Namespaces (optional, for sessions)
```bash
wrangler kv:namespace create SESSIONS
wrangler kv:namespace create SESSIONS --preview
# Copy the IDs and update wrangler.toml
```

#### 6. Initialize D1 Schema
```bash
wrangler d1 execute rental-saas-db --file=backend/sql/schema-d1.sql
```

#### 7. Create `.dev.vars` File
```bash
# In project root
cat > .dev.vars << EOF
FRONTEND_URL=http://localhost:3000
ADMIN_SIGNUP_PASSWORD=fmc10123
JWT_SECRET=your-dev-jwt-secret-key
NODE_ENV=development
EOF
```

### Phase 2: Local Testing

#### 1. Start Development Server
```bash
wrangler pages dev
# or
wrangler dev
```

This exposes:
- `http://localhost:8787/api/*` - your API endpoints

#### 2. Redirect Frontend API Calls
In your frontend `.env.local`, update:
```
REACT_APP_API_URL=http://localhost:8787/api
```

#### 3. Test Auth Endpoints
```bash
# Verify admin password
curl -X POST http://localhost:8787/api/auth/verify-admin-password \
  -H "Content-Type: application/json" \
  -d '{"password":"fmc10123"}'

# Signup
curl -X POST http://localhost:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword":"fmc10123",
    "name":"John Doe",
    "email":"john@example.com",
    "password":"password123",
    "confirmPassword":"password123"
  }'

# Login
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}'
```

### Phase 3: Data Migration

#### 1. Export from PostgreSQL (Railway)
```bash
# From your Railway backend
pg_dump postgresql://[connection-string] > rental-saas-backup.sql
```

#### 2. Convert SQL Data
Use a tool like `pgcli` or write a Node.js script to:
1. Read data from PostgreSQL
2. Export as JSON
3. Import to D1

Example Node.js script:
```javascript
const { Pool } = require("pg");
const fs = require("fs");

const pool = new Pool({
  connectionString: process.env.OLD_DATABASE_URL,
});

(async () => {
  const owners = await pool.query("SELECT * FROM owners");
  fs.writeFileSync("owners.json", JSON.stringify(owners.rows, null, 2));
  // Repeat for all tables
  process.exit(0);
})();
```

#### 3. Import to D1
```bash
# Insert data into D1 database
wrangler d1 execute rental-saas-db --interactive
# Then run INSERT statements or use the Pages Functions API
```

### Phase 4: Frontend Configuration

#### 1. Update API Client
In [frontend/src/api/apiClient.js](frontend/src/api/apiClient.js):

```javascript
const API_URL = process.env.REACT_APP_API_URL || "https://api.yourdomain.com/api";
// This should point to your Cloudflare Pages Functions URL
```

#### 2. File Upload Handling
Tenant image uploads now go to R2 instead of local disk:

```javascript
// The /api/tenants/upload-image endpoint now returns R2 URLs
const formData = new FormData();
formData.append("image", fileInput.files[0]);

const response = await fetch(`${API_URL}/tenants/upload-image`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${token}` },
  body: formData,
});

const { image_url } = await response.json();
// image_url is now a direct R2 URL
```

### Phase 5: Deployment

#### 1. Connect to GitHub (optional, recommended)
```bash
# Deploy via GitHub Pages/Actions
# Or use wrangler CLI
wrangler login
```

#### 2. Deploy Pages Functions
```bash
wrangler pages deploy
# or (if using GitHub)
git push origin main
```

#### 3. Set Production Secrets
```bash
wrangler secret put ADMIN_SIGNUP_PASSWORD
wrangler secret put JWT_SECRET
wrangler secret put FRONTEND_URL
```

#### 4. Bind Production Databases
In wrangler.toml `[env.production]`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "rental-saas-db-prod"
database_id = "your-prod-db-id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "rental-saas-uploads-prod"
```

### Phase 6: Custom Domain Setup

#### 1. Add Custom Domain
```bash
wrangler pages project create
# or configure via Cloudflare Dashboard
```

#### 2. Configure CORS
Update wrangler.toml:
```toml
[env.production.vars]
FRONTEND_URL = "https://yourdomain.com"
```

#### 3. SSL/TLS Setup
Cloudflare automatically provides free SSL/TLS. No additional setup needed.

## Important Differences & Gotchas

### 1. **SQLite vs PostgreSQL**
- No `RETURNING` clause in SQLite (use `LIMIT 1` and re-query)
- Dates are TEXT (no timestamp type)
- No CHECK constraints in SQLite (still work but are advisory)
- No `$1, $2` placeholders — use `?` instead

### 2. **File Uploads**
- No local `/uploads` directory
- All uploads go to R2 (requires configuration)
- Image URLs are R2 URLs (need public bucket or signed URLs)

### 3. **Performance**
- D1 (SQLite) has limits: 10MB default, 100MB max file size
- Consider archiving old data if database grows large
- Pages Functions have cold-start latency (first request ~100ms)

### 4. **Costs**
- Cloudflare Pages: Free tier includes 500 deploys/month
- D1: $0.75/month + usage
- R2: $0.015/GB storage + $0.20/GB egress (first 25GB free)
- Much cheaper than Railway at scale

## Troubleshooting

### "D1 database not found"
- Run: `wrangler d1 info rental-saas-db`
- Verify database_id in wrangler.toml matches output

### "R2 bucket permission denied"
- Ensure R2_BUCKET_URL is set in .dev.vars
- Or bind the bucket correctly in wrangler.toml

### "JWT token verification failed"
- Check JWT_SECRET is set consistently
- Use same secret for local dev and production

### "Payment filtering not working"
- SQLite date functions differ from PostgreSQL
- Use `date(month || '-01')` format for date comparisons

## Rollback Plan

If issues arise, you can quickly return to Railway:
1. Keep PostgreSQL data synchronized during testing phase
2. Switch frontend API_URL back to Railway domain
3. Your Railway instance remains functional during migration

## Next Steps

1. ✅ Set up local D1 database
2. ✅ Test API endpoints locally
3. ✅ Migrate historical data
4. ✅ Test with frontend
5. ✅ Deploy to Cloudflare (staging first)
6. ✅ Update DNS to point to Cloudflare
7. ✅ Monitor error logs
8. ✅ Decommission Railway

## Support

- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
