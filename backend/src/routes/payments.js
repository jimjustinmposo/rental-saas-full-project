const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function computeStatus(amountDue, amountPaid) {
  if (amountPaid >= amountDue) return "Paid";
  if (amountPaid > 0) return "Late";
  return "Unpaid";
}

// GET /api/payments
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, t.name AS tenant_name, u.unit_number, a.name AS apartment_name
       FROM payments p
       LEFT JOIN tenants t ON t.id = p.tenant_id
       LEFT JOIN units u ON u.id = p.unit_id
       LEFT JOIN apartments a ON a.id = p.apartment_id
       WHERE p.owner_id = $1
       ORDER BY p.payment_date DESC NULLS LAST, p.id DESC`,
      [req.ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch payments." });
  }
});

// POST /api/payments
router.post("/", async (req, res) => {
  const { tenant_id, unit_id, apartment_id, month, amount_due, amount_paid, payment_date } =
    req.body;
  if (!tenant_id || !month) {
    return res.status(400).json({ error: "tenant_id and month are required." });
  }
  const due = Number(amount_due) || 0;
  const paid = Number(amount_paid) || 0;
  const balance = due - paid;
  const status = computeStatus(due, paid);

  try {
    const result = await pool.query(
      `INSERT INTO payments
         (owner_id, tenant_id, unit_id, apartment_id, month, amount_due, amount_paid, balance, status, payment_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.ownerId, tenant_id, unit_id || null, apartment_id || null, month, due, paid, balance, status, payment_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record payment." });
  }
});

// PUT /api/payments/:id
router.put("/:id", async (req, res) => {
  const { amount_due, amount_paid, payment_date, month } = req.body;
  try {
    const existing = await pool.query(
      "SELECT * FROM payments WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.ownerId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Payment not found." });

    const due = amount_due !== undefined ? Number(amount_due) : Number(existing.rows[0].amount_due);
    const paid = amount_paid !== undefined ? Number(amount_paid) : Number(existing.rows[0].amount_paid);
    const balance = due - paid;
    const status = computeStatus(due, paid);

    const result = await pool.query(
      `UPDATE payments SET
         amount_due = $1, amount_paid = $2, balance = $3, status = $4,
         payment_date = COALESCE($5, payment_date), month = COALESCE($6, month)
       WHERE id = $7 AND owner_id = $8 RETURNING *`,
      [due, paid, balance, status, payment_date, month, req.params.id, req.ownerId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update payment." });
  }
});

// DELETE /api/payments/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM payments WHERE id = $1 AND owner_id = $2 RETURNING id",
      [req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Payment not found." });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete payment." });
  }
});

module.exports = router;
