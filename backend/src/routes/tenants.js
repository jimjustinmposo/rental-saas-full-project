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
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.unit_number, a.name AS apartment_name
       FROM tenants t
       LEFT JOIN units u ON u.id = t.unit_id
       LEFT JOIN apartments a ON a.id = u.apartment_id
       WHERE t.owner_id = $1
       ORDER BY t.created_at DESC`,
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
  const { name, phone, unit_id, move_in, deposit, image_url } = req.body;
  if (!name) return res.status(400).json({ error: "Tenant name is required." });
  try {
    const result = await pool.query(
      `INSERT INTO tenants (owner_id, name, phone, unit_id, move_in, deposit, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.ownerId, name, phone || null, unit_id || null, move_in || null, deposit || 0, image_url || null]
    );

    if (unit_id) {
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
router.put("/:id", async (req, res) => {
  const { name, phone, unit_id, move_in, deposit, image_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tenants SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         unit_id = COALESCE($3, unit_id),
         move_in = COALESCE($4, move_in),
         deposit = COALESCE($5, deposit),
         image_url = COALESCE($6, image_url)
       WHERE id = $7 AND owner_id = $8 RETURNING *`,
      [name, phone, unit_id, move_in, deposit, image_url, req.params.id, req.ownerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Tenant not found." });
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
