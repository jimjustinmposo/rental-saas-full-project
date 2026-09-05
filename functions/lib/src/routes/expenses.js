const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/expenses?range=month|year|all
// Optional range filter matches the dashboard expenses card exactly, so the
// returned rows always sum to the amount shown on the card being clicked.
router.get("/", async (req, res) => {
  try {
    let rangeCond = "";
    if (req.query.range === "month") rangeCond = " AND date_trunc('month', e.date) = date_trunc('month', CURRENT_DATE)";
    else if (req.query.range === "year") rangeCond = " AND date_trunc('year', e.date) = date_trunc('year', CURRENT_DATE)";
    const result = await pool.query(
      `SELECT e.*, a.name AS apartment_name, u.unit_number
       FROM expenses e
       LEFT JOIN apartments a ON a.id = e.apartment_id
       LEFT JOIN units u ON u.id = e.unit_id
       WHERE e.owner_id = $1
         ${rangeCond}
       ORDER BY e.date DESC NULLS LAST, e.id DESC`,
      [req.ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expenses." });
  }
});

// POST /api/expenses
// Structure per spec: Apartment, Date, Amount, Description. No category.
router.post("/", async (req, res) => {
  const { apartment_id, unit_id, description, amount, date } = req.body;
  if (!apartment_id) {
    return res.status(400).json({ error: "apartment_id is required." });
  }
  if (amount === undefined || amount === null || amount === "") {
    return res.status(400).json({ error: "amount is required." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO expenses (owner_id, apartment_id, unit_id, description, amount, date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.ownerId, apartment_id, unit_id || null, description || null, amount, date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create expense." });
  }
});

// PUT /api/expenses/:id
router.put("/:id", async (req, res) => {
  const { apartment_id, unit_id, description, amount, date } = req.body;
  try {
    const result = await pool.query(
      `UPDATE expenses SET
         apartment_id = COALESCE($1, apartment_id),
         unit_id = COALESCE($2, unit_id),
         description = COALESCE($3, description),
         amount = COALESCE($4, amount),
         date = COALESCE($5, date)
       WHERE id = $6 AND owner_id = $7 RETURNING *`,
      [apartment_id, unit_id, description, amount, date, req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Expense not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update expense." });
  }
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM expenses WHERE id = $1 AND owner_id = $2 RETURNING id",
      [req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Expense not found." });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete expense." });
  }
});

module.exports = router;
