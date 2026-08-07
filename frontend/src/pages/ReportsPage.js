import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel, parseMonthInput, MONTH_INPUT_EXAMPLE, MONTH_INPUT_ERROR } from "../utils/month";
import SearchableSelect from "../components/SearchableSelect";

// Reasonable spread of selectable years: a few years back through a couple ahead.
// Also folds in any years already present in saved history so old snapshots
// always show up as a valid option even if they fall outside the default range.
function buildYearOptions(history) {
  const now = new Date().getFullYear();
  const years = new Set();
  for (let y = now - 6; y <= now + 1; y++) years.add(y);
  history.forEach((r) => {
    const y = String(r.month || "").slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(Number(y));
  });
  return Array.from(years)
    .sort((a, b) => b - a)
    .map((y) => ({ value: String(y), label: String(y) }));
}

// History rows can represent either a month snapshot ("2026-01") or a
// full-year snapshot ("2026"). Format each appropriately.
function formatReportPeriod(monthValue) {
  if (/^\d{4}$/.test(String(monthValue || ""))) return monthValue;
  return formatMonthLabel(monthValue);
}

export default function ReportsPage() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [apartments, setApartments] = useState([]);
  const [history, setHistory] = useState([]);
  const [apartmentId, setApartmentId] = useState("");
  const [reportType, setReportType] = useState("month"); // "month" | "year"
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [monthError, setMonthError] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadHistory = () => {
    apiClient.get("/reports/history").then((res) => setHistory(res.data));
  };

  useEffect(() => {
    apiClient.get("/apartments").then((res) => setApartments(res.data));
    loadHistory();
  }, []);

  const handleTypeChange = (type) => {
    setReportType(type);
    setMonthError("");
    setResult(null);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (reportType === "month") {
      // Month is optional here (empty = no month filter), but if the person
      // typed something, it has to be valid YYYY.Mon.
      let storedMonth;
      if (month.trim()) {
        storedMonth = parseMonthInput(month);
        if (!storedMonth) {
          setMonthError(MONTH_INPUT_ERROR);
          return;
        }
      }
      setMonthError("");
      setLoading(true);
      try {
        const res = await apiClient.get("/reports/monthly", {
          params: { apartment_id: apartmentId || undefined, month: storedMonth },
        });
        setResult(res.data);
      } finally {
        setLoading(false);
      }
      return;
    }

    // reportType === "year"
    if (!year) {
      setMonthError("Please select a year.");
      return;
    }
    setMonthError("");
    setLoading(true);
    try {
      const res = await apiClient.get("/reports/yearly", {
        params: { apartment_id: apartmentId || undefined, year },
      });
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    const period =
      reportType === "year" ? year : month.trim() ? parseMonthInput(month) : null;
    await apiClient.post("/reports/generate", {
      apartment_id: apartmentId || null,
      month: period || "current",
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
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={reportType === "month" ? "btn btn-primary" : "btn btn-secondary"}
            style={{ padding: "6px 16px", fontSize: 13 }}
            onClick={() => handleTypeChange("month")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={reportType === "year" ? "btn btn-primary" : "btn btn-secondary"}
            style={{ padding: "6px 16px", fontSize: 13 }}
            onClick={() => handleTypeChange("year")}
          >
            Yearly
          </button>
        </div>

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

          {reportType === "month" ? (
            <div>
              <label className="field-label">Month (e.g. {MONTH_INPUT_EXAMPLE})</label>
              <input
                className="input-field"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  if (monthError) setMonthError("");
                }}
                placeholder={MONTH_INPUT_EXAMPLE}
              />
            </div>
          ) : (
            <div>
              <label className="field-label">Year</label>
              <SearchableSelect
                options={buildYearOptions(history)}
                value={year}
                onChange={(val) => {
                  setYear(val);
                  if (monthError) setMonthError("");
                }}
                placeholder="Search year…"
              />
            </div>
          )}
        </div>

        {monthError && (
          <div style={{ color: "var(--color-danger)", fontSize: 12.5, marginTop: 8 }}>
            {monthError}
          </div>
        )}

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
                  <th>Period</th>
                  <th>Apartment</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Period">{formatReportPeriod(r.month)}</td>
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