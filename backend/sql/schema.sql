-- ============================================================
-- Rental Management SaaS — PostgreSQL Schema
-- Multi-tenant: every business table carries owner_id for isolation
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS (never drops data)
-- ============================================================

CREATE TABLE IF NOT EXISTS owners (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Added after initial release — safe to re-run, and safe against an
-- already-deployed owners table that predates this column.
ALTER TABLE owners ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS apartments (
  id SERIAL PRIMARY KEY,
  owner_id INT REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  owner_id INT REFERENCES owners(id) ON DELETE CASCADE,
  apartment_id INT REFERENCES apartments(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  current_rent NUMERIC DEFAULT 0,
  status TEXT CHECK (status IN ('Occupied', 'Vacant')) DEFAULT 'Vacant',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  owner_id INT REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  unit_id INT REFERENCES units(id) ON DELETE SET NULL,
  move_in DATE,
  deposit NUMERIC DEFAULT 0,
  image_url TEXT, -- tenant profile image stored as URL
  created_at TIMESTAMP DEFAULT NOW()
);

-- Added after initial release — safe to re-run against an already-live table.
-- 'Active' = currently renting; 'Unassigned' = tenant has left. Manually set
-- by the owner (not auto-derived from unit assignment).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- Move-out date, used to scope a tenant's visible records to their actual
-- tenancy window (move_in <= record_date < move_out).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS move_out DATE;

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  owner_id INT REFERENCES owners(id) ON DELETE CASCADE,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id INT REFERENCES units(id) ON DELETE SET NULL,
  apartment_id INT REFERENCES apartments(id) ON DELETE SET NULL,
  month TEXT NOT NULL,
  amount_due NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  status TEXT CHECK (status IN ('Paid', 'Late', 'Unpaid')) DEFAULT 'Unpaid',
  payment_date DATE
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  owner_id INT REFERENCES owners(id) ON DELETE CASCADE,
  apartment_id INT REFERENCES apartments(id) ON DELETE SET NULL,
  unit_id INT REFERENCES units(id) ON DELETE SET NULL,
  category TEXT,
  description TEXT,
  amount NUMERIC DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE
);

-- New expense structure: Apartment / Date / Amount / Description only.
-- Category is removed per spec. Safe to re-run; existing category data
-- for this column is intentionally dropped since it's no longer tracked.
ALTER TABLE expenses DROP COLUMN IF EXISTS category;

CREATE TABLE IF NOT EXISTS monthly_reports (
  id SERIAL PRIMARY KEY,
  owner_id INT REFERENCES owners(id) ON DELETE CASCADE,
  apartment_id INT REFERENCES apartments(id) ON DELETE SET NULL,
  month TEXT NOT NULL,
  total_income NUMERIC DEFAULT 0,
  total_expenses NUMERIC DEFAULT 0,
  profit NUMERIC DEFAULT 0,
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rent_increase_history (
  id SERIAL PRIMARY KEY,
  owner_id INT REFERENCES owners(id) ON DELETE CASCADE,
  unit_id INT REFERENCES units(id) ON DELETE CASCADE,
  old_rent NUMERIC,
  new_rent NUMERIC,
  date DATE DEFAULT CURRENT_DATE
);

-- Helpful indexes for owner-scoped lookups
CREATE INDEX IF NOT EXISTS idx_apartments_owner ON apartments(owner_id);
CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_expenses_owner ON expenses(owner_id);
CREATE INDEX IF NOT EXISTS idx_reports_owner ON monthly_reports(owner_id);
