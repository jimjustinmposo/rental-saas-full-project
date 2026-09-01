import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      // A response from the API means we can show its error message.
      // No response (network error, mixed content, CORS, API down) needs a clearer hint.
      setError(
        err.response?.data?.error ||
          "Cannot reach the server. Check your internet connection and try again."
      );
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
      <div
        className="card"
        style={{ width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 34 }}>🏘️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-primary-dark)", marginTop: 6 }}>
            FlatOwner Webapp
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13.5, marginTop: 4 }}>
            Log in to manage your properties
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field-label">Email</label>
          <input
            type="email"
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ marginBottom: 14 }}
            placeholder="you@example.com"
          />

          <label className="field-label">Password</label>
          <input
            type="password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ marginBottom: 14 }}
            placeholder="••••••••"
          />

          {error && (
            <div style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 13.5, marginTop: 18, color: "var(--color-text-muted)" }}>
          New owner?{" "}
          <Link to="/create-account" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
