import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";

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

const RANGE_LABEL = { month: "This month", year: "This year", all: "All time" };

export default function SummaryCards({ summary }) {
  const navigate = useNavigate();
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  if (!summary) return null;
  const occupancyPct =
    summary.totalUnits > 0 ? Math.round((summary.occupiedUnits / summary.totalUnits) * 100) : 0;
  const rangeLabel = RANGE_LABEL[summary.range] || "This month";

  return (
    <div className="summary-cards-grid">
      <Card
        label="Total Income"
        value={formatMoney(summary.totalIncome, currency)}
        sublabel={`${rangeLabel} · view payments`}
        onClick={() => navigate("/payments")}
      />
      <Card
        label="Total Expenses"
        value={formatMoney(summary.totalExpenses, currency)}
        sublabel={`${rangeLabel} · view expenses`}
        tone="danger"
        onClick={() => navigate("/expenses")}
      />
      <Card
        label="Net Profit"
        value={formatMoney(summary.netProfit, currency)}
        sublabel={`${rangeLabel} · view reports`}
        tone={summary.netProfit >= 0 ? "success" : "danger"}
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
