import React from "react";

export default function LatestExpensesTable({ expenses }) {
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
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: i < expenses.length - 1 ? "1px solid var(--color-border)" : "none",
              }}
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
