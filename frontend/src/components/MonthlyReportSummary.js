import React from "react";

const Row = ({ label, value, tone }) => (
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
      ${Number(value || 0).toLocaleString()}
    </div>
  </div>
);

export default function MonthlyReportSummary({ summary }) {
  if (!summary) return null;
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 6 }}>
        Monthly Report
      </div>
      <Row label="Income" value={summary.totalIncome} />
      <Row label="Expenses" value={summary.totalExpenses} tone="danger" />
      <div style={{ paddingTop: 4 }}>
        <Row label="Net Profit" value={summary.netProfit} tone="success" />
      </div>
    </div>
  );
}
