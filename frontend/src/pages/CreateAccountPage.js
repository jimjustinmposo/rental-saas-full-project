import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";
import apiClient from "../api/apiClient";

export default function CreateAccountPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [checkingAdmin, setCheckingAdmin] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setAdminError("");
    setCheckingAdmin(true);
    try {
      await apiClient.post("/auth/verify-admin-password", { password: adminPassword });
      setAdminUnlocked(true);
    } catch (err) {
      setAdminError(
        err.response?.data?.message ||
          "Incorrect admin password. Contact Jim Justin M. Poso, webapp dev, @ +971 501905318 (call or WhatsApp) to get access to the webapp."
      );
    } finally {
      setCheckingAdmin(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (form.password !== form.confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await signup({ adminPassword, ...form });
      navigate("/dashboard");
    } catch (err) {
      setFormError(err.response?.data?.error || "Could not create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #5b3df0 0%, #3f27a8 60%, #d946ef 130%)",
        padding: 16,
      }}
    >
      {!adminUnlocked ? (
        // ---------- Admin password gate popup ----------
        <div
          className="card"
          style={{ width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        >
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 30 }}>🔐</div>
          </div>
          <h2 style={{ textAlign: "center", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
            Enter Admin Password to proceed
          </h2>
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--color-text-muted)", marginBottom: 18 }}>
            Account creation is invite-only. Enter the admin password to continue.
          </p>
          <form onSubmit={handleAdminSubmit}>
            <input
              type="password"
              className="input-field"
              placeholder="Admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              style={{ marginBottom: 14 }}
            />
            {adminError && (
              <div style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                {adminError}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={checkingAdmin}
            >
              {checkingAdmin ? "Checking…" : "Continue"}
            </button>
          </form>
          <p style={{ textAlign: "center", fontSize: 13, marginTop: 16, color: "var(--color-text-muted)" }}>
            <Link to="/login" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
              Back to log in
            </Link>
          </p>
        </div>
      ) : (
        // ---------- Create-account form ----------
        <div className="card" style={{ width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: "var(--color-primary-dark)" }}>
            Create your owner account
          </h2>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 18 }}>
            You'll get your own private dashboard — your data is never shared with other owners.
          </p>
          <form onSubmit={handleFormSubmit}>
            <label className="field-label">Owner name</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              style={{ marginBottom: 14 }}
            />
            <label className="field-label">Owner email</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              style={{ marginBottom: 14 }}
            />
            <label className="field-label">Owner password</label>
            <input
              type="password"
              className="input-field"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              style={{ marginBottom: 14 }}
            />
            <label className="field-label">Confirm password</label>
            <input
              type="password"
              className="input-field"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
              style={{ marginBottom: 14 }}
            />
            {formError && (
              <div style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12 }}>{formError}</div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
