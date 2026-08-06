const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/reports/dashboard?range=month|year|all
// range controls the window for Total Income / Total Expenses / Net Profit.
router.get("/dashboard", async (req, res) => {
  try {
    const ownerId = req.ownerId;
    const range = ["month", "year", "all"].includes(req.query.range) ? req.query.range : "month";

    let incomeCondition = "TRUE";
    let expenseCondition = "TRUE";
    if (range === "month") {
      incomeCondition = "date_trunc('month', payment_date) = date_trunc('month', CURRENT_DATE)";
      expenseCondition = "date_trunc('month', date) = date_trunc('month', CURRENT_DATE)";
    } else if (range === "year") {
      incomeCondition = "date_trunc('year', payment_date) = date_trunc('year', CURRENT_DATE)";
      expenseCondition = "date_trunc('year', date) = date_trunc('year', CURRENT_DATE)";
    }
    // range === "all" -> TRUE, no date filter at all

    const totals = await pool.query(
      `SELECT
         COALESCE(SUM(amount_paid) FILTER (WHERE date_trunc('month', payment_date) = date_trunc('month', CURRENT_DATE)), 0) AS income_this_month,
         COALESCE(SUM(amount_paid) FILTER (WHERE payment_date = CURRENT_DATE), 0) AS income_today,
         COALESCE(SUM(amount_paid) FILTER (WHERE ${incomeCondition}), 0) AS income_range
       FROM payments WHERE owner_id = $1`,
      [ownerId]
    );

    const expenseTotals = await pool.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)), 0) AS expenses_this_month,
         COALESCE(SUM(amount) FILTER (WHERE date = CURRENT_DATE), 0) AS expenses_today,
         COALESCE(SUM(amount) FILTER (WHERE ${expenseCondition}), 0) AS expenses_range
       FROM expenses WHERE owner_id = $1`,
      [ownerId]
    );

    const units = await pool.query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'Occupied') AS occupied
       FROM units WHERE owner_id = $1`,
      [ownerId]
    );

    const monthlyTrend = await pool.query(
      `SELECT to_char(month_start, 'Mon') AS label,
              income, expenses
       FROM (
         SELECT date_trunc('month', payment_date) AS month_start,
                SUM(amount_paid) AS income
         FROM payments WHERE owner_id = $1 AND payment_date IS NOT NULL
         GROUP BY 1
       ) i
       FULL OUTER JOIN (
         SELECT date_trunc('month', date) AS month_start,
                SUM(amount) AS expenses
         FROM expenses WHERE owner_id = $1 AND date IS NOT NULL
         GROUP BY 1
       ) e USING (month_start)
       ORDER BY month_start DESC
       LIMIT 6`,
      [ownerId]
    );

    const recentPayments = await pool.query(
      `SELECT p.*, t.name AS tenant_name
       FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id
       WHERE p.owner_id = $1
       ORDER BY p.payment_date DESC NULLS LAST, p.id DESC LIMIT 5`,
      [ownerId]
    );

    const latestExpenses = await pool.query(
      `SELECT e.*, a.name AS apartment_name
       FROM expenses e LEFT JOIN apartments a ON a.id = e.apartment_id
       WHERE e.owner_id = $1
       ORDER BY e.date DESC NULLS LAST, e.id DESC LIMIT 5`,
      [ownerId]
    );

    const incomeRange = Number(totals.rows[0].income_range);
    const expensesRange = Number(expenseTotals.rows[0].expenses_range);

    res.json({
      range,
      totalIncome: incomeRange,
      totalExpenses: expensesRange,
      netProfit: incomeRange - expensesRange,
      incomeToday: Number(totals.rows[0].income_today),
      expensesToday: Number(expenseTotals.rows[0].expenses_today),
      occupiedUnits: Number(units.rows[0].occupied),
      totalUnits: Number(units.rows[0].total),
      monthlyTrend: monthlyTrend.rows.reverse(),
      recentPayments: recentPayments.rows,
      latestExpenses: latestExpenses.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build dashboard summary." });
  }
});

// GET /api/reports/checklist?month=YYYY-MM
// Per-apartment list of Active tenants with a Paid/Not Paid checkbox for
// the given month. Defaults to the current month.
router.get("/checklist", async (req, res) => {
  const month = req.query.month || currentMonthStr();
  try {
    const result = await pool.query(
      `SELECT a.id AS apartment_id, a.name AS apartment_name,
              t.id AS tenant_id, t.name AS tenant_name,
              u.current_rent,
              (p.id IS NOT NULL AND p.status = 'Paid') AS paid
       FROM apartments a
       JOIN units u ON u.apartment_id = a.id AND u.owner_id = a.owner_id
       JOIN tenants t ON t.unit_id = u.id AND t.owner_id = a.owner_id AND t.status = 'Active'
       LEFT JOIN payments p ON p.tenant_id = t.id AND p.month = $2 AND p.owner_id = a.owner_id
       WHERE a.owner_id = $1
       ORDER BY a.name, t.name`,
      [req.ownerId, month]
    );

    // Group flat rows into { apartment_name: [ {tenant...}, ... ] }
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.apartment_id]) {
        grouped[row.apartment_id] = {
          apartment_id: row.apartment_id,
          apartment_name: row.apartment_name,
          tenants: [],
        };
      }
      grouped[row.apartment_id].tenants.push({
        tenant_id: row.tenant_id,
        tenant_name: row.tenant_name,
        current_rent: row.current_rent,
        paid: row.paid,
      });
    }

    res.json({ month, apartments: Object.values(grouped) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load payment checklist." });
  }
});

// POST /api/reports/checklist/toggle
// Body: { tenant_id, month, checked }
// checked=true  -> creates/updates a Paid payment record for that month
//                  (amount = the tenant's unit rent, date = today)
// checked=false -> deletes the payment record for that month
router.post("/checklist/toggle", async (req, res) => {
  const { tenant_id, month, checked } = req.body;
  if (!tenant_id || !month) {
    return res.status(400).json({ error: "tenant_id and month are required." });
  }
  try {
    const tenantResult = await pool.query(
      `SELECT t.id, t.unit_id, u.apartment_id, u.current_rent
       FROM tenants t LEFT JOIN units u ON u.id = t.unit_id
       WHERE t.id = $1 AND t.owner_id = $2`,
      [tenant_id, req.ownerId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) return res.status(404).json({ error: "Tenant not found." });

    if (!checked) {
      await pool.query(
        "DELETE FROM payments WHERE owner_id = $1 AND tenant_id = $2 AND month = $3",
        [req.ownerId, tenant_id, month]
      );
      return res.json({ tenant_id, month, paid: false });
    }

    const rent = Number(tenant.current_rent) || 0;
    const existing = await pool.query(
      "SELECT id FROM payments WHERE owner_id = $1 AND tenant_id = $2 AND month = $3",
      [req.ownerId, tenant_id, month]
    );

    if (existing.rows[0]) {
      await pool.query(
        `UPDATE payments SET amount_due = $1, amount_paid = $1, balance = 0,
           status = 'Paid', payment_date = CURRENT_DATE
         WHERE id = $2 AND owner_id = $3`,
        [rent, existing.rows[0].id, req.ownerId]
      );
    } else {
      await pool.query(
        `INSERT INTO payments
           (owner_id, tenant_id, unit_id, apartment_id, month, amount_due, amount_paid, balance, status, payment_date)
         VALUES ($1,$2,$3,$4,$5,$6,$6,0,'Paid',CURRENT_DATE)`,
        [req.ownerId, tenant_id, tenant.unit_id, tenant.apartment_id, month, rent]
      );
    }

    res.json({ tenant_id, month, paid: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update payment checklist." });
  }
});

// GET /api/reports/pending?month=YYYY-MM
// Active tenants who have NOT paid for the given month (defaults to current).
router.get("/pending", async (req, res) => {
  const month = req.query.month || currentMonthStr();
  try {
    const result = await pool.query(
      `SELECT t.id AS tenant_id, t.name AS tenant_name, t.phone,
              a.name AS apartment_name, u.unit_number, u.current_rent
       FROM tenants t
       LEFT JOIN units u ON u.id = t.unit_id
       LEFT JOIN apartments a ON a.id = u.apartment_id
       LEFT JOIN payments p ON p.tenant_id = t.id AND p.month = $2
         AND p.owner_id = t.owner_id AND p.status = 'Paid'
       WHERE t.owner_id = $1 AND t.status = 'Active' AND p.id IS NULL
       ORDER BY a.name, t.name`,
      [req.ownerId, month]
    );
    res.json({ month, pending: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load pending payments." });
  }
});

// GET /api/reports/monthly?apartment_id=&month=YYYY-MM
router.get("/monthly", async (req, res) => {
  const { apartment_id, month } = req.query;
  try {
    const params = [req.ownerId];
    let incomeQuery = `SELECT COALESCE(SUM(amount_paid),0) AS income FROM payments WHERE owner_id = $1`;
    let expenseQuery = `SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE owner_id = $1`;

    if (apartment_id) {
      params.push(apartment_id);
      incomeQuery += ` AND apartment_id = $${params.length}`;
      expenseQuery += ` AND apartment_id = $${params.length}`;
    }
    if (month) {
      params.push(month);
      incomeQuery += ` AND month = $${params.length}`;
    }

    const income = await pool.query(incomeQuery, params);
    const expenses = await pool.query(expenseQuery, apartment_id ? [req.ownerId, apartment_id] : [req.ownerId]);

    const totalIncome = Number(income.rows[0].income);
    const totalExpenses = Number(expenses.rows[0].expenses);

    res.json({
      month: month || "current",
      apartment_id: apartment_id || null,
      totalIncome,
      totalExpenses,
      profit: totalIncome - totalExpenses,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate monthly report." });
  }
});

// POST /api/reports/generate — saves a monthly_reports snapshot row
router.post("/generate", async (req, res) => {
  const { apartment_id, month, total_income, total_expenses } = req.body;
  if (!month) return res.status(400).json({ error: "month is required." });
  try {
    const profit = Number(total_income || 0) - Number(total_expenses || 0);
    const result = await pool.query(
      `INSERT INTO monthly_reports (owner_id, apartment_id, month, total_income, total_expenses, profit)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.ownerId, apartment_id || null, month, total_income || 0, total_expenses || 0, profit]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save monthly report." });
  }
});

// GET /api/reports/history — all saved monthly report snapshots
router.get("/history", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, a.name AS apartment_name
       FROM monthly_reports r LEFT JOIN apartments a ON a.id = r.apartment_id
       WHERE r.owner_id = $1 ORDER BY r.generated_at DESC`,
      [req.ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch report history." });
  }
});

module.exports = router;
