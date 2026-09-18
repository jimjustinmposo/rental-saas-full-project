# Cloudflare Migration - Quick Start Checklist
> ### ⚠️ Breaking change: secrets are no longer committed
>
> `JWT_SECRET` and `ADMIN_SIGNUP_PASSWORD` used to sit in `wrangler.toml` as
> plaintext (they are still in this repo's Git history, so treat them as
> compromised and use fresh values). They have been removed from the config and
> the API now **fails closed in every deployed environment**:
>
> | Missing secret | What users see |
> | --- | --- |
> | `JWT_SECRET` | login/signup → **500**, every authenticated request → **401** |
> | `ADMIN_SIGNUP_PASSWORD` | signup → **503** "Signup is disabled on this deployment." |
>
> There is no hardcoded fallback outside dev mode, and dev mode is opt-in: it
> activates only when `NODE_ENV=development`, which comes from `.dev.vars`
> locally and is never set on a deployed environment.
>
> **This is a Pages project, so use `wrangler pages secret put` — plain
> `wrangler secret put` targets Workers and will not configure this app.** Run
> **Phase 8** *before* the first production deploy.
>
> Verify with `https://<project>.pages.dev/api/health` — `environment` must read
> `production` and every flag in `configured` must be `true`.

## Pre-Migration

- [ ] **Backup Database**: Export all data from Railway PostgreSQL
- [ ] **Domain Ready**: Have your custom domain ready (or use Cloudflare Pages default)
- [ ] **Cloudflare Account**: Create account at https://dash.cloudflare.com
- [ ] **Node.js 18+**: Verify `node --version`
- [ ] **Read MIGRATION.md**: Review complete migration guide

## Phase 1: Local Setup (30 min)

```bash
# 1. Install Wrangler
npm install -g wrangler@latest
wrangler --version

# 2. Update dependencies
cd backend
npm install
# Note: pg is removed, use D1 instead

# 3. Create local D1 database
wrangler d1 create rental-saas-db
# Save the database_id from output

# 4. Update wrangler.toml with database_id
# Find this section and paste your ID:
# [[d1_databases]]
# binding = "DB"
# database_id = "12345-abcde-67890"
```

- [ ] Wrangler installed and authenticated (`wrangler login`)
- [ ] `wrangler.toml` updated with D1 database ID
- [ ] `.dev.vars` file created with environment variables
- [ ] `backend/sql/schema-d1.sql` exists

## Phase 2: Database Setup (15 min)

```bash
# 1. Initialize D1 schema
wrangler d1 execute rental-saas-db --file=backend/sql/schema-d1.sql

# 2. Verify schema created
wrangler d1 execute rental-saas-db --interactive
# Run: SELECT name FROM sqlite_master WHERE type='table';
```

- [ ] D1 database schema created
- [ ] All tables visible via D1 CLI
- [ ] Can connect to D1 locally

## Phase 3: R2 Setup (10 min)

```bash
# 1. Create R2 bucket
wrangler r2 bucket create rental-saas-uploads

# 2. Update wrangler.toml with bucket name
# [[r2_buckets]]
# binding = "BUCKET"
# bucket_name = "rental-saas-uploads"

# 3. (Optional) Set public R2 URL for local dev
# In .dev.vars:
# R2_BUCKET_URL=https://cdn.example.com
```

- [ ] R2 bucket created
- [ ] `wrangler.toml` updated with bucket binding
- [ ] `.dev.vars` includes R2_BUCKET_URL (if using custom domain)

## Phase 4: Local Testing (20 min)

```bash
# 1. Start dev server
wrangler pages dev

# 2. Update frontend API URL
# In frontend/.env.local:
# REACT_APP_API_URL=http://localhost:8787/api

# 3. Test endpoints
curl -X POST http://localhost:8787/api/auth/verify-admin-password \
  -H "Content-Type: application/json" \
  -d '{"password":"fmc10123"}'
# Expected: {"ok":true}
```

- [ ] Wrangler dev server running
- [ ] Frontend can reach backend at http://localhost:8787/api
- [ ] Authentication endpoints working
- [ ] Can create account and login
- [ ] File uploads to R2 working (test in /tenants/upload-image)

## Phase 5: Data Migration (varies)

```bash
# Option A: Manual INSERT via D1 CLI
wrangler d1 execute rental-saas-db --interactive
# Then paste SQL INSERT statements

# Option B: Import via Pages Function
# Create a migration endpoint POST /api/migrate that accepts bulk data
# (See MIGRATION.md for data migration script)

# Option C: Use Railway export + SQL conversion tool
# Export from Railway, convert dates/types, import to D1
```

- [ ] Data exported from Railway PostgreSQL
- [ ] Data converted to SQLite compatible format
- [ ] Data imported to D1
- [ ] Data verified (row counts match)

## Phase 6: Frontend Configuration

In [frontend/src/api/apiClient.js](frontend/src/api/apiClient.js):

```javascript
const API_URL = process.env.REACT_APP_API_URL || "https://api.yourdomain.com/api";
// For local: http://localhost:8787/api
// For production: https://api.yourdomain.com/api
```

- [ ] Frontend API_URL points to `http://localhost:8787/api` (local dev)
- [ ] Frontend file upload handler updated for R2 URLs
- [ ] CORS headers in handler match frontend domain

## Phase 7: Staging Deployment (10 min)

```bash
# 1. Create GitHub repo (if not already)
git init
git add .
git commit -m "Migrate to Cloudflare"
git branch -M main

# 2. Connect to Cloudflare Pages
wrangler pages project create
# Follow prompts to connect GitHub repo

# 3. Deploy the staging build
#    --branch picks production vs preview: it must match the project's
#    configured production branch (main) to be a production deployment.
wrangler pages deploy --project-name rental-saas-preview --branch preview
# or: git push origin main (if using GitHub Actions)
```

- [ ] GitHub repo created and pushed
- [ ] Cloudflare Pages project created
- [ ] Staging deployment URL working
- [ ] Test in staging: `https://your-project.pages.dev/api/health`

## Phase 8: Secrets — do this BEFORE deploying (5 min)

`wrangler.toml` declares `pages_build_output_dir`, so this is a **Pages**
project: secrets are stored per project *and* per environment with
`wrangler pages secret put`. `wrangler secret put` configures Workers and does
not apply here.

```bash
# 1. Generate a strong signing key (paste the output when prompted below)
openssl rand -base64 32

# 2. Production project
wrangler pages secret put JWT_SECRET --project-name rental-saas-prod --env production
wrangler pages secret put ADMIN_SIGNUP_PASSWORD --project-name rental-saas-prod --env production

# 3. Staging/preview project as well - it points at the SAME D1 database, so it
#    must also hold real secrets rather than falling back to dev values
wrangler pages secret put JWT_SECRET --project-name rental-saas-preview --env preview
wrangler pages secret put ADMIN_SIGNUP_PASSWORD --project-name rental-saas-preview --env preview

# 4. Confirm the names are stored (values are never displayed)
wrangler pages secret list --project-name rental-saas-prod --env production

# 5. Verify from outside (booleans only - no secret values are exposed)
curl https://rental-saas-prod.pages.dev/api/health
```

Notes:
- `FRONTEND_URL` is **not** a secret. It lives in `wrangler.toml` under
  `[env.production.vars]` / `[env.preview.vars]`, so it stays in source control.
- `NODE_ENV` must **never** be `development` on a deployed environment. The API
  treats "development" as the only opt-in to dev fallbacks; anything else
  (including unset) fails closed.
- Because the old plaintext secret is in this repo's Git history, rotate it:
  generate a fresh value rather than reusing anything that was ever committed.

- [ ] Secrets set with `wrangler pages secret put` (both projects)
- [ ] `wrangler pages secret list` shows both secret names
- [ ] `/api/health` reports `environment: "production"` and `jwtSecret` / `adminSignupPassword` as `true`
- [ ] Do NOT commit secrets to Git
- [ ] `.dev.vars` is in `.gitignore`

## Phase 9: Custom Domain (5 min)

1. Go to Cloudflare Dashboard → Pages → Your Project → Settings
2. Add custom domain: `api.yourdomain.com`
3. Update DNS records (follow Cloudflare's instructions)
4. Wait for SSL/TLS to provision (~5 min)

- [ ] Custom domain added to Pages project
- [ ] SSL/TLS certificate provisioned
- [ ] Domain resolves to Cloudflare
- [ ] CORS FRONTEND_URL env var updated to match domain

## Phase 10: Production Deployment

`wrangler pages deploy` has no `--env` flag. Production vs preview is decided by
`--branch`, which must match the project's configured production branch
(Dashboard → Pages → project → Settings → Builds & deployments → Production
branch).

```bash
# 1. Build the SPA. This creates frontend/build, including public/_headers
#    (CRA copies everything in public/ into the build output).
cd frontend
npm ci
npm run build
cd ..

# 2. Deploy the directory declared by pages_build_output_dir in wrangler.toml
wrangler pages deploy --project-name rental-saas-prod --branch main

# 3. Verify
curl https://rental-saas-prod.pages.dev/api/health
```

- [ ] `frontend/build/index.html` and `frontend/build/_headers` exist after the build
- [ ] Production code deployed
- [ ] Database, R2, and Secrets are production versions
- [ ] Test API: `curl https://api.yourdomain.com/api/health`
- [ ] Frontend can login and access app

## Phase 11: Cutover & Cleanup

```bash
# Once everything working in production:
# 1. Update frontend to point to production domain
# 2. Update any DNS records
# 3. Decommission Railway backend
# 4. Keep Railway database as backup for 30 days
# 5. Monitor Cloudflare analytics
```

- [ ] Frontend production URL points to Cloudflare API
- [ ] Users can access app and login
- [ ] File uploads work
- [ ] Payments and expense tracking work
- [ ] Reports generate correctly

## Phase 12: Monitoring & Optimization

```bash
# Monitor errors
wrangler tail --env production

# View analytics
# Cloudflare Dashboard → Pages → Analytics

# Monitor database usage
# Cloudflare Dashboard → D1 → Usage
```

- [ ] Set up error alerts
- [ ] Monitor D1 database size
- [ ] Monitor R2 storage usage
- [ ] Check Cloudflare analytics dashboard

## Troubleshooting Quick Links

| Issue | Solution |
|-------|----------|
| "D1 database not found" | Run `wrangler d1 info rental-saas-db` and update database_id in wrangler.toml |
| "R2 bucket not found" | Run `wrangler r2 bucket list` and verify bucket name in wrangler.toml |
| "JWT verification failed" | Ensure JWT_SECRET is identical in .dev.vars and production secrets |
| "CORS errors" | Check FRONTEND_URL in env vars matches your domain, update [[ path ]].js CORS handler |
| "File uploads fail" | Verify R2 bucket binding exists and R2_BUCKET_URL is set correctly |
| "Cold start latency" | Normal for Cloudflare Workers (~100ms first request). Use regional warming if needed. |

## Cost Estimation

| Service | Cost (monthly) |
|---------|-----------------|
| Pages Functions | Free (up to 500 deploys) |
| D1 | ~$0.75 + usage |
| R2 | $0.015/GB storage + egress |
| Custom domain | Included (if Cloudflare registered) |
| **Total** | **~$1-5/month** (vs Railway $7+) |

## Rollback Plan

If critical issues:
1. Switch frontend API_URL back to Railway domain
2. Keep Railway running as backup during migration
3. D1/R2 data is safely stored in Cloudflare
4. Can migrate back to any provider anytime (export D1, convert, import)

## Success Criteria

✅ **Migration Complete When:**
1. All users can login
2. Can create/edit apartments, units, tenants
3. Payments recorded and calculated correctly  
4. Expense tracking works
5. Reports generate properly
6. Tenant images upload to R2
7. No database errors in logs
8. Page load times < 1s (from edge)

## Next: Run Commands

```bash
# Start working through checklist
cd backend
npm install
wrangler login
wrangler d1 create rental-saas-db
# ... continue with phases above
```

**Need help?** See [MIGRATION.md](MIGRATION.md) for detailed instructions.
