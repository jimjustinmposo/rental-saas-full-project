import React, { useState } from "react";
import { useAuth } from "../api/AuthContext";
import { CURRENCIES, formatMoney } from "../utils/currency";
import SearchableSelect from "../components/SearchableSelect";

export default function SettingsPage() {
  const { owner, updateCurrency } = useAuth();
  const [selected, setSelected] = useState(owner?.currency || "USD");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateCurrency(selected);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || "Could not update currency.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>
          Currency
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 18 }}>
          Choose the currency used across your dashboard — summary cards, payments,
          expenses, rent amounts, and reports will all update to match.
        </p>

        <form onSubmit={handleSave}>
          <label className="field-label">Currency</label>
          <SearchableSelect
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.label} (${c.code}) — ${c.symbol}` }))}
            value={selected}
            onChange={(val) => setSelected(val)}
            placeholder="Search currencies…"
          />

          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
            Preview: <strong style={{ color: "var(--color-text)" }}>{formatMoney(1250, selected)}</strong>
          </div>

          {error && (
            <div style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}
          {saved && (
            <div style={{ color: "var(--color-success)", fontSize: 13, marginBottom: 12 }}>
              Currency updated ✓
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save Currency"}
          </button>
        </form>
      </div>
    </div>
  );
}
