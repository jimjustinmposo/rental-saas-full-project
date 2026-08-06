import React from "react";
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

export default function IncomeExpensesChart({ data }) {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const chartData = (data && data.length ? data : []).map((d) => ({
    label: d.label,
    income: Number(d.income || 0),
    expenses: Number(d.expenses || 0),
  }));

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>
        Income vs Expenses
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
