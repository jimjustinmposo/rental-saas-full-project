import React from "react";
import { useNavigate } from "react-router-dom";

export default function LatestExpensesTable({ expenses }) {
  const navigate = useNavigate();

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>
        Latest Expenses
      </div>
      {(!expenses || expenses.length === 0) && (
        <div className="empty-state">No expenses logged yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {expenses &&
          expenses.map((e, i) => (
            <div
              key={e.id}
              onClick={() => navigate("/expenses")}
              title="View all expenses"
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 4px",
                borderBottom: i < expenses.length - 1 ? "1px solid var(--color-border)" : "none",
                cursor: "pointer",
                borderRadius: 8,
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--color-primary-light)")}
              onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{e.category}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  {e.apartment_name || "General"}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: "var(--color-danger)" }}>
                ${Number(e.amount).toLocaleString()}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
