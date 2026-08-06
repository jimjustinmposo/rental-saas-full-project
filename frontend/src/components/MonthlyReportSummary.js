import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";

const Row = ({ label, value, currency, tone }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "12px 0",
      borderBottom: "1px solid var(--color-border)",
    }}
  >
    <div style={{ color: "var(--color-text-muted)", fontSize: 14 }}>{label}</div>
    <div
      style={{
        fontWeight: 800,
        fontSize: 15,
        color: tone === "danger" ? "var(--color-danger)" : tone === "success" ? "var(--color-success)" : "var(--color-text)",
      }}
    >
      {formatMoney(value, currency)}
    </div>
  </div>
);

export default function MonthlyReportSummary({ summary }) {
  const navigate = useNavigate();
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  if (!summary) return null;
  return (
    <div
      className="card clickable-card"
      onClick={() => navigate("/reports")}
      title="View full reports"
    >
      <div className="card-title" style={{ marginBottom: 6 }}>
        Monthly Report
      </div>
      <Row label="Income" value={summary.totalIncome} currency={currency} />
      <Row label="Expenses" value={summary.totalExpenses} currency={currency} tone="danger" />
      <div style={{ paddingTop: 4 }}>
        <Row label="Net Profit" value={summary.netProfit} currency={currency} tone={summary.netProfit >= 0 ? "success" : "danger"} />
      </div>
    </div>
  );
}
