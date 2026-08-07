import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel } from "../utils/month";
import SearchableSelect from "../components/SearchableSelect";

const REPORT_TABS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "total", label: "Total" },
];

// History rows can be a month ("2026-01"), a year ("2026"), or an
// all-time snapshot ("Total"). Format each appropriately.
function formatReportPeriod(value) {
  if (value === "Total") return "Total (All-Time)";
  if (/^\d{4}$/.test(String(value || ""))) return value;
  return formatMonthLabel(value);
}

export default function ReportsPage() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";

  const [apartments, setApartments] = useState([]);
  const [apartmentId, setApartmentId] = useState("");
  const [reportType, setReportType] = useState("month");

  const [months, setMonths] = useState([]);
  const [years, setYears] = useState([]);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const loadHistory = () => {
    apiClient.get("/reports/history").then((res) => setHistory(res.data));
  };

  useEffect(() => {
    apiClient.get("/apartments").then((res) => setApartments(res.data));
    loadHistory();
  }, []);

  // Available months/years always reflect real data for the selected flat
  // (or all flats), so the dropdowns never offer a period with nothing in it.
  useEffect(() => {
    const params = { apartment_id: apartmentId || undefined };
    apiClient.get("/reports/months", { params }).then((res) => setMonths(res.data.months));
    apiClient.get("/reports/years", { params }).then((res) => setYears(res.data.years));
    setMonth("");
    setYear("");
    setResult(null);
  }, [apartmentId]);

  const monthOptions = months.map((m) => ({ value: m, label: formatMonthLabel(m) }));
  const yearOptions = years.map((y) => ({ value: y, label: y }));

  const fetchTotal = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/reports/monthly", {
        params: { apartment_id: apartmentId || undefined },
      });
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (type) => {
    setReportType(type);
    setResult(null);
    if (type === "total") fetchTotal();
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (reportType === "month") {
        if (!month) return;
        // Exact match only — this hits the fixed /monthly route, which now
        // filters expenses by the same month as income (previously it didn't).
        const res = await apiClient.get("/reports/monthly", {
          params: { apartment_id: apartmentId || undefined, month },
        });
        setResult(res.data);
      } else if (reportType === "year") {
        if (!year) return;
        const res = await apiClient.get("/reports/yearly", {
          params: { apartment_id: apartmentId || undefined, year },
        });
        setResult(res.data);
      } else {
        await fetchTotal();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    const period = reportType === "month" ? month : reportType === "year" ? year : "Total";
    await apiClient.post("/reports/generate", {
      apartment_id: apartmentId || null,
      month: period,
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

  const selectedFlatName = apartmentId
    ? apartments.find((a) => a.id === apartmentId)?.name || "this flat"
    : "All Flats";

  const profitColor = result && Number(result.profit) < 0 ? "var(--color-danger)" : "var(--color-success)";

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Flat</label>
          <SearchableSelect
            options={[{ value: "", label: "All Flats" }, ...apartments.map((a) => ({ value: a.id, label: a.name }))]}
            value={apartmentId}
            onChange={(val) => setApartmentId(val)}
            placeholder="Search flats…"
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={reportType === tab.value ? "btn btn-primary" : "btn btn-secondary"}
              style={{ padding: "6px 16px", fontSize: 13 }}
              onClick={() => handleTabChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {reportType === "total" ? (
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Showing all-time totals for {selectedFlatName}.
          </div>
        ) : (
          <form onSubmit={handleGenerate}>
            <div className="form-grid">
              {reportType === "month" ? (
                <div>
                  <label className="field-label">Month</label>
                  <SearchableSelect
                    options={monthOptions}
                    value={month}
                    onChange={(val) => setMonth(val)}
                    placeholder="Search e.g. 2026.Jan…"
                  />
                  {monthOptions.length === 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}>
                      No recorded months for {selectedFlatName} yet.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="field-label">Year</label>
                  <SearchableSelect
                    options={yearOptions}
                    value={year}
                    onChange={(val) => setYear(val)}
                    placeholder="Search year…"
                  />
                  {yearOptions.length === 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}>
                      No recorded years for {selectedFlatName} yet.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              disabled={loading || (reportType === "month" ? !month : !year)}
            >
              {loading ? "Generating…" : "Generate Report"}
            </button>
          </form>
        )}
      </div>

      {result && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>
            {reportType === "month" && formatMonthLabel(month)}
            {reportType === "year" && year}
            {reportType === "total" && "All-Time Total"}
            {` — ${selectedFlatName}`}
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Income</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#000" }}>
                {formatMoney(result.totalIncome, currency)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Expenses</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#000" }}>
                {formatMoney(result.totalExpenses, currency)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Profit</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: profitColor }}>
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
                  <th>Flat</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Period">{formatReportPeriod(r.month)}</td>
                    <td data-label="Flat">{r.apartment_name || "All Flats"}</td>
                    <td data-label="Income" style={{ color: "#000" }}>{formatMoney(r.total_income, currency)}</td>
                    <td data-label="Expenses" style={{ color: "#000" }}>{formatMoney(r.total_expenses, currency)}</td>
                    <td
                      data-label="Profit"
                      style={{ color: Number(r.profit) < 0 ? "var(--color-danger)" : "var(--color-success)" }}
                    >
                      {formatMoney(r.profit, currency)}
                    </td>
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
