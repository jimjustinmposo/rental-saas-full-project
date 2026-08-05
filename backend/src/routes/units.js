const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/units?apartment_id=
router.get("/", async (req, res) => {
  const { apartment_id } = req.query;
  try {
    const params = [req.ownerId];
    let query = `SELECT u.*, a.name AS apartment_name
                 FROM units u
                 JOIN apartments a ON a.id = u.apartment_id
                 WHERE u.owner_id = $1`;
    if (apartment_id) {
      params.push(apartment_id);
      query += ` AND u.apartment_id = $${params.length}`;
    }
    query += " ORDER BY u.created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch units." });
  }
});

// POST /api/units
router.post("/", async (req, res) => {
  const { apartment_id, unit_number, current_rent, status } = req.body;
  if (!apartment_id || !unit_number) {
    return res.status(400).json({ error: "apartment_id and unit_number are required." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO units (owner_id, apartment_id, unit_number, current_rent, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.ownerId, apartment_id, unit_number, current_rent || 0, status || "Vacant"]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create unit." });
  }
});

// PUT /api/units/:id  (also logs rent changes into rent_increase_history)
router.put("/:id", async (req, res) => {
  const { unit_number, current_rent, status } = req.body;
  try {
    const existing = await pool.query(
      "SELECT * FROM units WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.ownerId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Unit not found." });

    const oldRent = Number(existing.rows[0].current_rent);
    const result = await pool.query(
      `UPDATE units SET
         unit_number = COALESCE($1, unit_number),
         current_rent = COALESCE($2, current_rent),
         status = COALESCE($3, status)
       WHERE id = $4 AND owner_id = $5 RETURNING *`,
      [unit_number, current_rent, status, req.params.id, req.ownerId]
    );

    if (current_rent !== undefined && Number(current_rent) !== oldRent) {
      await pool.query(
        `INSERT INTO rent_increase_history (owner_id, unit_id, old_rent, new_rent)
         VALUES ($1, $2, $3, $4)`,
        [req.ownerId, req.params.id, oldRent, current_rent]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update unit." });
  }
});

// DELETE /api/units/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM units WHERE id = $1 AND owner_id = $2 RETURNING id",
      [req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Unit not found." });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete unit." });
  }
});

module.exports = router;
