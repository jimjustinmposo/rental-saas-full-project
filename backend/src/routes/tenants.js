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

// POST /api/tenants
router.post("/", async (req, res) => {
  const { name, phone, unit_id, move_in, move_out, deposit, image_url, status } = req.body;
  if (!name) return res.status(400).json({ error: "Tenant name is required." });
  try {
    const result = await pool.query(
      `INSERT INTO tenants (owner_id, name, phone, unit_id, move_in, move_out, deposit, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.ownerId,
        name,
        phone || null,
        unit_id || null,
        move_in || null,
        move_out || null,
        deposit || 0,
        image_url || null,
        status === "Unassigned" ? "Unassigned" : "Active",
      ]
    );

    if (unit_id) {
      // Rule: one active tenant per unit — moving a new tenant in
      // automatically moves the previous occupant out.
      await pool.query(
        `UPDATE tenants SET status = 'Unassigned', unit_id = NULL
         WHERE unit_id = $1 AND owner_id = $2 AND status = 'Active' AND id <> $3`,
        [unit_id, req.ownerId, result.rows[0].id]
      );
      await pool.query(
        "UPDATE units SET status = 'Occupied' WHERE id = $1 AND owner_id = $2",
        [unit_id, req.ownerId]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create tenant." });
  }
});

// PUT /api/tenants/:id
// When status is set to "Unassigned" (tenant moved out), we automatically
// clear their unit assignment and flip that unit back to Vacant — unless
// the caller explicitly passed a new unit_id in the same request.
router.put("/:id", async (req, res) => {
  const { name, phone, unit_id, move_in, move_out, deposit, image_url, status } = req.body;
  try {
    const existing = await pool.query(
      "SELECT * FROM tenants WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.ownerId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Tenant not found." });
    const previousUnitId = existing.rows[0].unit_id;

    // Figure out the tenant's next unit_id: explicit value wins, otherwise
    // "Unassigned" clears it, otherwise it stays whatever it already was.
    let nextUnitId = previousUnitId;
    let unitIdChanged = false;
    if (unit_id !== undefined) {
      nextUnitId = unit_id === "" ? null : unit_id;
      unitIdChanged = true;
    } else if (status === "Unassigned") {
      nextUnitId = null;
      unitIdChanged = true;
    }

    // Keep status and unit assignment in sync when the caller only changed
    // one of the two: clearing the unit implies the tenant moved out;
    // assigning a unit implies they're active.
    let resolvedStatus = status;
    if (resolvedStatus === undefined && unitIdChanged) {
      resolvedStatus = nextUnitId === null ? "Unassigned" : "Active";
    }

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
    if (unitIdChanged) set("unit_id", nextUnitId);
    if (move_in !== undefined) set("move_in", move_in);
    if (move_out !== undefined) set("move_out", move_out);
    if (deposit !== undefined) set("deposit", deposit);
    if (image_url !== undefined) set("image_url", image_url);
    if (status !== undefined) set("status", status);
    else if (resolvedStatus !== undefined) set("status", resolvedStatus);

    if (fields.length === 0) {
      return res.json(existing.rows[0]); // nothing to update
    }

    values.push(req.params.id, req.ownerId);
    const result = await pool.query(
      `UPDATE tenants SET ${fields.join(", ")} WHERE id = $${i} AND owner_id = $${i + 1} RETURNING *`,
      values
    );

    // Free up the old unit if the tenant no longer occupies it.
    if (unitIdChanged && previousUnitId && String(nextUnitId) !== String(previousUnitId)) {
      await pool.query(
        "UPDATE units SET status = 'Vacant' WHERE id = $1 AND owner_id = $2",
        [previousUnitId, req.ownerId]
      );
    }
    // Mark the new unit occupied if one was assigned.
    if (unitIdChanged && nextUnitId) {
      // Rule: one active tenant per unit — assigning this tenant here
      // automatically moves out whoever else was active in that unit.
      await pool.query(
        `UPDATE tenants SET status = 'Unassigned', unit_id = NULL
         WHERE unit_id = $1 AND owner_id = $2 AND status = 'Active' AND id <> $3`,
        [nextUnitId, req.ownerId, req.params.id]
      );
      await pool.query(
        "UPDATE units SET status = 'Occupied' WHERE id = $1 AND owner_id = $2",
        [nextUnitId, req.ownerId]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update tenant." });
  }
});

// DELETE /api/tenants/:id
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM tenants WHERE id = $1 AND owner_id = $2 RETURNING id",
      [req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant not found." });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete tenant." });
  }
});

module.exports = router;
