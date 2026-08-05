import React from "react";

const statusPill = (status) => {
  const cls = status === "Paid" ? "pill-success" : status === "Late" ? "pill-warning" : "pill-danger";
  return <span className={`pill ${cls}`}>{status}</span>;
};

export default function RecentPaymentsTable({ payments }) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>
        Recent Payments
      </div>
      {(!payments || payments.length === 0) && (
        <div className="empty-state">No payments recorded yet.</div>
      )}
      <div className="table-wrap">
        {payments && payments.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Month</th>
                <th>Amount Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td data-label="Tenant">{p.tenant_name || "—"}</td>
                  <td data-label="Month">{p.month}</td>
                  <td data-label="Amount Paid">${Number(p.amount_paid).toLocaleString()}</td>
                  <td data-label="Status">{statusPill(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
