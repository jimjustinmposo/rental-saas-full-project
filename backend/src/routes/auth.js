const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();

const ADMIN_CONTACT_MSG =
  "Incorrect admin password. Contact Jim Justin M. Poso, webapp dev, @ +971 501905318 (call or WhatsApp) to get access to the webapp.";

// ------------------------------------------------------------------
// POST /api/auth/verify-admin-password
// Gate shown BEFORE the create-account form is displayed on the frontend.
// The real password lives only in the backend env var (ADMIN_SIGNUP_PASSWORD),
// never shipped in frontend code.
// ------------------------------------------------------------------
router.post("/verify-admin-password", (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_SIGNUP_PASSWORD || "fmc10123";

  if (password === adminPassword) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: ADMIN_CONTACT_MSG });
});

// ------------------------------------------------------------------
// POST /api/auth/signup
// Body: { adminPassword, name, email, password, confirmPassword }
// Creates a new owner. Never touches other owners' data.
// ------------------------------------------------------------------
router.post("/signup", async (req, res) => {
  const { adminPassword, name, email, password, confirmPassword } = req.body;
  const requiredAdminPassword = process.env.ADMIN_SIGNUP_PASSWORD || "fmc10123";

  if (adminPassword !== requiredAdminPassword) {
    return res.status(401).json({ error: ADMIN_CONTACT_MSG });
  }

  if (!name || !email || !password || !confirmPassword) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const existing = await pool.query("SELECT id FROM owners WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO owners (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash]
    );

    const owner = result.rows[0];
    const token = jwt.sign(
      { owner_id: owner.id, email: owner.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ token, owner });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating account." });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/login
// Body: { email, password }
// ------------------------------------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await pool.query("SELECT * FROM owners WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    const owner = result.rows[0];
    if (!owner) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, owner.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign(
      { owner_id: owner.id, email: owner.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      owner: { id: owner.id, name: owner.name, email: owner.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error logging in." });
  }
});

// ------------------------------------------------------------------
// GET /api/auth/me — returns the logged-in owner's profile
// ------------------------------------------------------------------
const { requireAuth } = require("../middleware/auth");
router.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, created_at FROM owners WHERE id = $1",
    [req.ownerId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Owner not found." });
  res.json(result.rows[0]);
});

module.exports = router;
