require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const { runMigrations } = require("./db");

const authRoutes = require("./routes/auth");
const apartmentRoutes = require("./routes/apartments");
const unitRoutes = require("./routes/units");
const tenantRoutes = require("./routes/tenants");
const paymentRoutes = require("./routes/payments");
const expenseRoutes = require("./routes/expenses");
const reportRoutes = require("./routes/reports");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/apartments", apartmentRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/reports", reportRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found." }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

const PORT = process.env.PORT || 5000;

runMigrations()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("[db] migration failed:", err);
    process.exit(1);
  });
