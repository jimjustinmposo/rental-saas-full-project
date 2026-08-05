import React from "react";
import { useNavigate } from "react-router-dom";

function Card({ label, value, sublabel, tone, onClick }) {
  const toneColor =
    tone === "danger" ? "var(--color-danger)" : tone === "success" ? "var(--color-success)" : "var(--color-text)";
  return (
    <div className="card clickable-card" onClick={onClick} title="Click to view details">
      <div style={{ color: "var(--color-text-muted)", fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: toneColor }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-faint)", marginTop: 4 }}>{sublabel}</div>
    </div>
  );
}

const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function SummaryCards({ summary }) {
  const navigate = useNavigate();
  if (!summary) return null;
  const occupancyPct =
    summary.totalUnits > 0 ? Math.round((summary.occupiedUnits / summary.totalUnits) * 100) : 0;

  return (
    <div className="summary-cards-grid">
      <Card
        label="Total Income"
        value={fmt(summary.totalIncome)}
        sublabel="This month · view payments"
        onClick={() => navigate("/payments")}
      />
      <Card
        label="Total Expenses"
        value={fmt(summary.totalExpenses)}
        sublabel="This month · view expenses"
        tone="danger"
        onClick={() => navigate("/expenses")}
      />
      <Card
        label="Net Profit"
        value={fmt(summary.netProfit)}
        sublabel="This month · view reports"
        tone="success"
        onClick={() => navigate("/reports")}
      />
      <Card
        label="Occupied Units"
        value={`${summary.occupiedUnits} / ${summary.totalUnits}`}
        sublabel={`${occupancyPct}% occupied · view units`}
        onClick={() => navigate("/units")}
      />
    </div>
  );
}
