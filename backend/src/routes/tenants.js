const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ---- image upload setup -------------------------------------------------
const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

// Recomputes a unit's Occupied/Vacant status from whether any Active
// tenant actually references it — the single source of truth, rather than
// something toggled by hand in multiple places and prone to drifting.
async function recomputeUnitStatus(unitId, ownerId) {
  if (!unitId) return;
  await pool.query(
    `UPDATE units SET status = CASE
       WHEN EXISTS (SELECT 1 FROM tenants WHERE tenants.unit_id = units.id AND tenants.status = 'Active')
       THEN 'Occupied' ELSE 'Vacant' END
     WHERE id = $1 AND owner_id = $2`,
    [unitId, ownerId]
  );
}

// POST /api/tenants/upload-image — returns a URL to use as image_url
router.post("/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });
  const base = process.env.PUBLIC_BASE_URL || "";
  res.json({ image_url: `${base}/uploads/${req.file.filename}` });
});

// GET /api/tenants
// Active tenants always come first; Unassigned (moved-out) tenants sink
// to the bottom automatically — no manual sort needed on the frontend.
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.unit_number, a.name AS apartment_name
       FROM tenants t
       LEFT JOIN units u ON u.id = t.unit_id
       LEFT JOIN apartments a ON a.id = u.apartment_id
       WHERE t.owner_id = $1
       ORDER BY (t.status = 'Unassigned') ASC, t.created_at DESC`,
      [req.ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tenants." });
  }
});

// ---------------------------------------------------------------------
// Status rule (the single source of truth, enforced on every write):
//   move_out empty  -> status = 'Active'
//   move_out filled -> status = 'Unassigned', and unit_id is cleared
// A client-supplied `status` value is never trusted directly — it's
// always re-derived from move_out so the two can never conflict.
// ---------------------------------------------------------------------

// POST /api/tenants
router.post("/", async (req, res) => {
  const { name, phone, unit_id, move_in, move_out, deposit, image_url } = req.body;
  if (!name) return res.status(400).json({ error: "Tenant name is required." });

  const hasMoveOut = !!move_out;
  const status = hasMoveOut ? "Unassigned" : "Active";
  const finalUnitId = hasMoveOut ? null : unit_id || null;

  try {
    const result = await pool.query(
      `INSERT INTO tenants (owner_id, name, phone, unit_id, move_in, move_out, deposit, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.ownerId, name, phone || null, finalUnitId, move_in || null, move_out || null, deposit || 0, image_url || null, status]
    );

    if (finalUnitId) {
      // Rule: one active tenant per unit — moving a new tenant in
      // automatically moves the previous occupant out, with a real
      // move-out date recorded.
      await pool.query(
        `UPDATE tenants SET status = 'Unassigned', unit_id = NULL,
           move_out = COALESCE(move_out, CURRENT_DATE)
         WHERE unit_id = $1 AND owner_id = $2 AND status = 'Active' AND id <> $3`,
        [finalUnitId, req.ownerId, result.rows[0].id]
      );
      await recomputeUnitStatus(finalUnitId, req.ownerId);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create tenant." });
  }
});

// PUT /api/tenants/:id
router.put("/:id", async (req, res) => {
  const { name, phone, unit_id, move_in, move_out, deposit, image_url } = req.body;
  try {
    const existing = await pool.query(
      "SELECT * FROM tenants WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.ownerId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Tenant not found." });
    const before = existing.rows[0];
    const previousUnitId = before.unit_id;

    // Resolve the final move_out value for this update, then derive
    // status and unit_id from it — move_out is always the deciding field.
    const finalMoveOut = move_out !== undefined ? (move_out || null) : before.move_out;
    const hasMoveOut = !!finalMoveOut;
    const finalStatus = hasMoveOut ? "Unassigned" : "Active";
    const finalUnitId = hasMoveOut
      ? null
      : unit_id !== undefined
      ? unit_id || null
      : previousUnitId;

    const fields = [];
    const values = [];
    let i = 1;
    const set = (col, val) => {
      fields.push(`${col} = $${i}`);
      values.push(val);
      i++;
    };
    if (name !== undefined) set("name", name);
    if (phone !== undefined) set("phone", phone);
    set("unit_id", finalUnitId);
    if (move_in !== undefined) set("move_in", move_in);
    set("move_out", finalMoveOut);
    if (deposit !== undefined) set("deposit", deposit);
    if (image_url !== undefined) set("image_url", image_url);
    set("status", finalStatus);

    values.push(req.params.id, req.ownerId);
    const result = await pool.query(
      `UPDATE tenants SET ${fields.join(", ")} WHERE id = $${i} AND owner_id = $${i + 1} RETURNING *`,
      values
    );

    // If this tenant is newly occupying a unit, bump out whoever else was
    // active there (one active tenant per unit), with a real move-out date.
    if (finalUnitId && String(finalUnitId) !== String(previousUnitId)) {
      await pool.query(
        `UPDATE tenants SET status = 'Unassigned', unit_id = NULL,
           move_out = COALESCE(move_out, CURRENT_DATE)
         WHERE unit_id = $1 AND owner_id = $2 AND status = 'Active' AND id <> $3`,
        [finalUnitId, req.ownerId, req.params.id]
      );
    }

    // Recompute both the old and new unit's occupancy — single source of
    // truth, always derived from actual tenant rows rather than toggled.
    if (previousUnitId) await recomputeUnitStatus(previousUnitId, req.ownerId);
    if (finalUnitId) await recomputeUnitStatus(finalUnitId, req.ownerId);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update tenant." });
  }
});

// DELETE /api/tenants/:id
router.delete("/:id", async (req, res) => {
  try {
    const existing = await pool.query(
      "SELECT unit_id FROM tenants WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.ownerId]
    );
    const result = await pool.query(
      "DELETE FROM tenants WHERE id = $1 AND owner_id = $2 RETURNING id",
      [req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant not found." });
    if (existing.rows[0]?.unit_id) {
      await recomputeUnitStatus(existing.rows[0].unit_id, req.ownerId);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete tenant." });
  }
});

module.exports = router;
