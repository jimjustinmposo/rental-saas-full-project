import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";

const VIEW_OPTIONS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "all", label: "Overall" },
];

// Pulls a 4-digit year out of a trend point's label (e.g. "2026.Jan",
// "2026-01") so we can group by year without needing a separate API call.
function extractYear(point) {
  if (point.year) return String(point.year);
  const match = String(point.label || "").match(/\d{4}/);
  return match ? match[0] : "Unknown";
}

function buildChartData(data, view) {
  const source = data && data.length ? data : [];

  if (view === "month") {
    return source.map((d) => ({
      label: d.label,
      income: Number(d.income || 0),
      expenses: Number(d.expenses || 0),
    }));
  }

  if (view === "year") {
    const byYear = {};
    source.forEach((d) => {
      const year = extractYear(d);
      if (!byYear[year]) byYear[year] = { label: year, income: 0, expenses: 0 };
      byYear[year].income += Number(d.income || 0);
      byYear[year].expenses += Number(d.expenses || 0);
    });
    return Object.values(byYear).sort((a, b) => a.label.localeCompare(b.label));
  }

  // view === "all"
  const totals = source.reduce(
    (acc, d) => {
      acc.income += Number(d.income || 0);
      acc.expenses += Number(d.expenses || 0);
      return acc;
    },
    { income: 0, expenses: 0 }
  );
  return [{ label: "All Time", ...totals }];
}

export default function IncomeExpensesChart({ data }) {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [view, setView] = useState("month");

  const chartData = useMemo(() => buildChartData(data, view), [data, view]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div className="card-title">Income vs Expenses</div>
        <div style={{ display: "flex", gap: 6 }}>
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setView(opt.value)}
              className={view === opt.value ? "btn btn-primary" : "btn btn-secondary"}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-container">
        {chartData.length === 0 ? (
          <div className="empty-state">No payment or expense history yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ece9f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#9b98b5" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#9b98b5" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => formatMoney(value, currency)} />
              <Bar dataKey="income" fill="#5b3df0" radius={[6, 6, 0, 0]} barSize={18} />
              <Bar dataKey="expenses" fill="#d946ef" radius={[6, 6, 0, 0]} barSize={18} />
              <Line type="monotone" dataKey="income" stroke="#3f27a8" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}