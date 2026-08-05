# RentalOS — Multi-Tenant Rental Management SaaS

A full-stack, multi-tenant rental management platform for flat/apartment owners.
Every owner gets their own private dashboard, apartments, units, tenants,
payments, expenses, and reports — all sharing **one** PostgreSQL database,
isolated by `owner_id`. Verified end-to-end against a live PostgreSQL instance
(auth, signup/login, owner isolation, CRUD, image upload, dashboard aggregation
all tested and passing) and the frontend production build compiles cleanly.

```
Frontend (React, Vercel)  →  Backend (Express, Railway)  →  PostgreSQL (Railway)
```

---

## 1. Project structure

```
rental-saas/
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── sql/
│   │   └── schema.sql
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── middleware/
│       │   └── auth.js
│       └── routes/
│           ├── auth.js
│           ├── apartments.js
│           ├── units.js
│           ├── tenants.js
│           ├── payments.js
│           ├── expenses.js
│           └── reports.js
└── frontend/
    ├── package.json
    ├── .env.example
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js
        ├── App.js
        ├── api/
        │   ├── apiClient.js
        │   └── AuthContext.js
        ├── components/
        │   ├── Sidebar.js
        │   ├── MobileNav.js
        │   ├── SummaryCards.js
        │   ├── ApartmentsOverview.js
        │   ├── IncomeExpensesChart.js
        │   ├── RecentPaymentsTable.js
        │   ├── LatestExpensesTable.js
        │   └── MonthlyReportSummary.js
        ├── pages/
        │   ├── LoginPage.js
        │   ├── CreateAccountPage.js
        │   ├── DashboardPage.js
        │   ├── ApartmentsPage.js
        │   ├── UnitsPage.js
        │   ├── TenantsPage.js
        │   ├── PaymentsPage.js
        │   ├── ExpensesPage.js
        │   └── ReportsPage.js
        └── styles/
            ├── theme.css
            └── responsive.css
```

---

## 2. Multi-tenant architecture

- **One** Postgres database, **one** Railway backend, **one** Vercel frontend.
- Every business table (`apartments`, `units`, `tenants`, `payments`,
  `expenses`, `monthly_reports`, `rent_increase_history`) carries `owner_id`.
- Every route in `backend/src/routes/*` runs behind `requireAuth`
  (`middleware/auth.js`), which decodes the JWT and attaches `req.ownerId`.
  Every SQL query filters `WHERE owner_id = $1` (or joins through a table that
  does). This was verified directly: a second owner's dashboard and apartment
  list come back completely empty even after the first owner creates data.
- `sql/schema.sql` uses `CREATE TABLE IF NOT EXISTS` everywhere, and `db.js`
  runs it on every boot — new deploys/restarts never wipe existing data, and
  new owner signups never touch other owners' rows.

---

## 3. Database schema

See `backend/sql/schema.sql` for the full DDL. Tables: `owners`, `apartments`,
`units`, `tenants` (includes `image_url` for the profile photo), `payments`,
`expenses`, `monthly_reports`, `rent_increase_history`.

---

## 4. Authentication

- **Login page** — email + password, mobile-friendly.
- **JWT** — signed with `JWT_SECRET`, payload contains `owner_id` and `email`,
  7-day expiry. Sent as `Authorization: Bearer <token>` on every API call
  (handled automatically by `frontend/src/api/apiClient.js`).
- **Create-account flow (admin-gated):**
  1. `CreateAccountPage.js` first shows a popup: *"Enter Admin Password to
     proceed."*
  2. That password is checked **server-side** via
     `POST /api/auth/verify-admin-password` — the real password lives only in
     the backend's `ADMIN_SIGNUP_PASSWORD` env var, never in frontend code.
  3. Wrong password → *"Incorrect admin password. Contact Jim Justin M. Poso,
     webapp dev, @ +971 501905318 (call or WhatsApp) to get access to the
     webapp."*
  4. Correct password → the owner name / email / password / confirm-password
     form appears. On submit, the admin password is re-verified server-side
     inside `POST /api/auth/signup` before the owner row is inserted.
  5. New owner starts with a completely empty dashboard; no existing data is
     touched.

---

## 5. Environment variables

**Backend** (`backend/.env`):

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/railway` | Provided by Railway's Postgres plugin |
| `JWT_SECRET` | a long random string | Sign with `openssl rand -hex 32` |
| `PORT` | `5000` | Railway sets this automatically in production |
| `ADMIN_SIGNUP_PASSWORD` | `fmc10123` | Gate before account creation |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Used for CORS |
| `PUBLIC_BASE_URL` | `https://your-backend.up.railway.app` | Prefixed onto uploaded tenant image URLs |

**Frontend** (`frontend/.env`):

| Variable | Example |
|---|---|
| `REACT_APP_API_BASE_URL` | `https://your-backend.up.railway.app/api` |

---

## 6. Deployment steps

### Railway (backend + PostgreSQL)

1. Create a new Railway project.
2. **Add a PostgreSQL plugin** — Railway generates `DATABASE_URL` automatically.
3. **Add a new service** from this repo's `backend/` folder (or upload the
   `backend/` folder directly).
4. Set the service's environment variables: `DATABASE_URL` (copy from the
   Postgres plugin, or reference it directly), `JWT_SECRET`,
   `ADMIN_SIGNUP_PASSWORD`, `FRONTEND_URL`, `PUBLIC_BASE_URL`. Railway sets
   `PORT` itself.
5. Build/start commands: `npm install` then `npm start` (Railway detects
   these from `package.json` automatically).
6. Deploy. On boot, `db.js` runs `sql/schema.sql` automatically — tables are
   created if they don't already exist. Nothing is ever dropped.
7. Copy the generated public domain (e.g. `your-backend.up.railway.app`) —
   you'll need it for the frontend.

> Only ever run **one** backend service against **one** Postgres database.
> Do not spin up a second database when adding owners — owners are just rows
> in the shared `owners` table.

### Vercel (frontend)

1. Import this repo's `frontend/` folder as a new Vercel project (framework
   preset: **Create React App**).
2. Set the environment variable `REACT_APP_API_BASE_URL` to
   `https://<your-railway-domain>/api`.
3. Deploy. Vercel runs `npm install && npm run build` and serves `build/`.
4. Visit the live URL, go to `/create-account`, enter the admin password,
   and create your first owner account.

> Keep this to **one** Vercel deployment. New owners sign up through the
> in-app admin-gated form — they never need a separate deployment.

---

## 7. Example usage / test flow

This exact flow was run against a live PostgreSQL instance during development:

```bash
# 1. Check the admin gate
POST /api/auth/verify-admin-password  { "password": "fmc10123" }
→ { "ok": true }

# 2. Create the first owner
POST /api/auth/signup
{ "adminPassword": "fmc10123", "name": "Jim Poso",
  "email": "jim@example.com", "password": "secret123", "confirmPassword": "secret123" }
→ { "token": "...", "owner": { "id": 1, "name": "Jim Poso", ... } }

# 3. Create a second, unrelated owner
POST /api/auth/signup  { ... "email": "second@example.com" ... }
→ { "token": "...", "owner": { "id": 2, ... } }

# 4. Owner 1 creates a property
POST /api/apartments   Authorization: Bearer <owner1 token>
{ "name": "Downtown Plaza", "address": "123 Main St" }
→ { "id": 1, "owner_id": 1, ... }

# 5. Isolation check — owner 2 sees nothing
GET /api/apartments    Authorization: Bearer <owner2 token>
→ []

# 6. Owner 1 adds a unit, a tenant, a payment, and an expense
POST /api/units     { "apartment_id": 1, "unit_number": "101", "current_rent": 1200 }
POST /api/tenants   { "name": "John Doe", "unit_id": 1, "deposit": 1200 }
POST /api/payments  { "tenant_id": 1, "unit_id": 1, "apartment_id": 1,
                       "month": "2026-08", "amount_due": 1200, "amount_paid": 1200 }
POST /api/expenses  { "apartment_id": 1, "category": "Plumbing Repair", "amount": 450 }

# 7. Dashboard reflects owner 1's data only
GET /api/reports/dashboard   Authorization: Bearer <owner1 token>
→ { "totalIncome": 1200, "totalExpenses": 450, "netProfit": 750,
    "occupiedUnits": 1, "totalUnits": 1, ... }

GET /api/reports/dashboard   Authorization: Bearer <owner2 token>
→ { "totalIncome": 0, "totalExpenses": 0, "netProfit": 0,
    "occupiedUnits": 0, "totalUnits": 0, ... }
```

### In the browser

1. Go to `/create-account` → enter admin password `fmc10123` → fill in the
   owner form → land straight on an empty `/dashboard`.
2. Go to **Apartments** → add a property.
3. Go to **Units** → add a unit under that property.
4. Go to **Tenants** → add a tenant, upload a profile photo, assign a unit
   (the unit flips to *Occupied* automatically).
5. Go to **Payments** → record a payment for that tenant.
6. Go to **Expenses** → log a repair cost.
7. Back on **Dashboard**, the summary cards, income/expense chart, recent
   payments, and latest expenses all update to reflect just that owner's data.
8. Go to **Reports** → generate and save a monthly snapshot.

---

## 8. Local development

```bash
# Backend
cd backend
cp .env.example .env      # fill in DATABASE_URL (a local Postgres works fine) + JWT_SECRET
npm install
npm run dev                # nodemon, http://localhost:5000

# Frontend
cd frontend
cp .env.example .env       # REACT_APP_API_BASE_URL=http://localhost:5000/api
npm install
npm start                  # http://localhost:3000
```
