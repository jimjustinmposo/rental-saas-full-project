import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import SearchableSelect from "../components/SearchableSelect";

export default function ReportsPage() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [apartments, setApartments] = useState([]);
  const [history, setHistory] = useState([]);
  const [apartmentId, setApartmentId] = useState("");
  const [month, setMonth] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadHistory = () => {
    apiClient.get("/reports/history").then((res) => setHistory(res.data));
  };

  useEffect(() => {
    apiClient.get("/apartments").then((res) => setApartments(res.data));
    loadHistory();
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.get("/reports/monthly", {
        params: { apartment_id: apartmentId || undefined, month: month || undefined },
      });
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    await apiClient.post("/reports/generate", {
      apartment_id: apartmentId || null,
      month: month || "current",
      total_income: result.totalIncome,
      total_expenses: result.totalExpenses,
    });
    loadHistory();
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Permanently delete ALL saved report history? This cannot be undone.")) return;
    await apiClient.delete("/reports/history");
    loadHistory();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <form onSubmit={handleGenerate} className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div>
            <label className="field-label">Apartment (optional)</label>
            <SearchableSelect
              options={[{ value: "", label: "All apartments" }, ...apartments.map((a) => ({ value: a.id, label: a.name }))]}
              value={apartmentId}
              onChange={(val) => setApartmentId(val)}
              placeholder="Search apartments…"
            />
          </div>
          <div>
            <label className="field-label">Month (e.g. 2026-08)</label>
            <input className="input-field" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-08" />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </button>
      </form>

      {result && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>Report Result</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Income</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{formatMoney(result.totalIncome, currency)}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Expenses</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-danger)" }}>
                {formatMoney(result.totalExpenses, currency)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Profit</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: result.profit >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                {formatMoney(result.profit, currency)}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={handleSave}>
            Save this snapshot
          </button>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div className="card-title">Saved Report History</div>
          {history.length > 0 && (
            <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 13 }} onClick={handleClearHistory}>
              Clear All History
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="empty-state">No saved reports yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Apartment</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Month">{r.month}</td>
                    <td data-label="Apartment">{r.apartment_name || "All"}</td>
                    <td data-label="Income">{formatMoney(r.total_income, currency)}</td>
                    <td data-label="Expenses">{formatMoney(r.total_expenses, currency)}</td>
                    <td data-label="Profit">{formatMoney(r.profit, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
