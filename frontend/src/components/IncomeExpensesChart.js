import React, { useEffect, useState } from "react";
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
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel } from "../utils/month";

const VIEW_OPTIONS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "all", label: "Overall" },
];

// This component now owns its data fetching instead of relying on a
// pre-aggregated prop. That's what makes Month/Year/Overall and the
// per-flat filter always match the real totals: every view calls
// /reports/trend, which sums the FULL matching date range server-side
// (no artificial row limit, no client-side re-bucketing that can drift
// from the real numbers).
export default function IncomeExpensesChart({ apartments = [] }) {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [view, setView] = useState("month");
  const [apartmentId, setApartmentId] = useState("");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get("/reports/trend", { params: { view, apartment_id: apartmentId || undefined } })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data.data || []).map((d) => ({
          label: view === "month" ? formatMonthLabel(d.label) : d.label,
          income: Number(d.income || 0),
          expenses: Number(d.expenses || 0),
        }));
        setChartData(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, apartmentId]);

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

      <div style={{ marginBottom: 12, maxWidth: 220 }}>
        <select
          className="input-field"
          value={apartmentId}
          onChange={(e) => setApartmentId(e.target.value)}
        >
          <option value="">All Flats</option>
          {apartments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="chart-container">
        {loading ? (
          <div className="empty-state">Loading chart…</div>
        ) : chartData.length === 0 ? (
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
