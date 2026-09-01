const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/apartments — list apartments for this owner, with unit counts
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*,
              COUNT(u.id) AS total_units,
              COUNT(u.id) FILTER (WHERE u.status = 'Occupied') AS occupied_units
       FROM apartments a
       LEFT JOIN units u ON u.apartment_id = a.id AND u.owner_id = a.owner_id
       WHERE a.owner_id = $1
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [req.ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch apartments." });
  }
});

// GET /api/apartments/:id
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM apartments WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Apartment not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch apartment." });
  }
});

// POST /api/apartments
router.post("/", async (req, res) => {
  const { name, address, payment_note } = req.body;
  if (!name) return res.status(400).json({ error: "Apartment name is required." });
  try {
    const result = await pool.query(
      `INSERT INTO apartments (owner_id, name, address, payment_note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.ownerId, name, address || null, payment_note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create apartment." });
  }
});

// PUT /api/apartments/:id
router.put("/:id", async (req, res) => {
  const { name, address, payment_note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE apartments SET name = COALESCE($1, name), address = COALESCE($2, address),
         payment_note = COALESCE($3, payment_note)
       WHERE id = $4 AND owner_id = $5 RETURNING *`,
      [name, address, payment_note, req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Apartment not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update apartment." });
  }
});

// DELETE /api/apartments/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM apartments WHERE id = $1 AND owner_id = $2 RETURNING id",
      [req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Apartment not found." });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete apartment." });
  }
});

module.exports = router;
