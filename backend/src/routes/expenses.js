const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/expenses
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, a.name AS apartment_name, u.unit_number
       FROM expenses e
       LEFT JOIN apartments a ON a.id = e.apartment_id
       LEFT JOIN units u ON u.id = e.unit_id
       WHERE e.owner_id = $1
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
router.post("/", async (req, res) => {
  const { apartment_id, unit_id, category, description, amount, date } = req.body;
  if (!category || amount === undefined) {
    return res.status(400).json({ error: "category and amount are required." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO expenses (owner_id, apartment_id, unit_id, category, description, amount, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.ownerId, apartment_id || null, unit_id || null, category, description || null, amount, date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create expense." });
  }
});

// PUT /api/expenses/:id
router.put("/:id", async (req, res) => {
  const { category, description, amount, date } = req.body;
  try {
    const result = await pool.query(
      `UPDATE expenses SET
         category = COALESCE($1, category),
         description = COALESCE($2, description),
         amount = COALESCE($3, amount),
         date = COALESCE($4, date)
       WHERE id = $5 AND owner_id = $6 RETURNING *`,
      [category, description, amount, date, req.params.id, req.ownerId]
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
