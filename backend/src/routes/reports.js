const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/reports/dashboard — powers the Dashboard summary cards + chart
router.get("/dashboard", async (req, res) => {
  try {
    const ownerId = req.ownerId;

    const totals = await pool.query(
      `SELECT
         COALESCE(SUM(amount_paid) FILTER (WHERE date_trunc('month', payment_date) = date_trunc('month', CURRENT_DATE)), 0) AS income_this_month,
         COALESCE(SUM(amount_paid) FILTER (WHERE payment_date = CURRENT_DATE), 0) AS income_today
       FROM payments WHERE owner_id = $1`,
      [ownerId]
    );

    const expenseTotals = await pool.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)), 0) AS expenses_this_month,
         COALESCE(SUM(amount) FILTER (WHERE date = CURRENT_DATE), 0) AS expenses_today
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

    const incomeThisMonth = Number(totals.rows[0].income_this_month);
    const expensesThisMonth = Number(expenseTotals.rows[0].expenses_this_month);

    res.json({
      totalIncome: incomeThisMonth,
      incomeToday: Number(totals.rows[0].income_today),
      totalExpenses: expensesThisMonth,
      expensesToday: Number(expenseTotals.rows[0].expenses_today),
      netProfit: incomeThisMonth - expensesThisMonth,
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
