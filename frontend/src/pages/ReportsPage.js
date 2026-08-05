import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";

export default function ReportsPage() {
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

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <form onSubmit={handleGenerate} className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div>
            <label className="field-label">Apartment (optional)</label>
            <select className="input-field" value={apartmentId} onChange={(e) => setApartmentId(e.target.value)}>
              <option value="">All apartments</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
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
              <div style={{ fontSize: 22, fontWeight: 800 }}>${result.totalIncome.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Expenses</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-danger)" }}>
                ${result.totalExpenses.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Profit</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-success)" }}>
                ${result.profit.toLocaleString()}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={handleSave}>
            Save this snapshot
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Saved Report History</div>
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
                    <td data-label="Income">${Number(r.total_income).toLocaleString()}</td>
                    <td data-label="Expenses">${Number(r.total_expenses).toLocaleString()}</td>
                    <td data-label="Profit">${Number(r.profit).toLocaleString()}</td>
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
