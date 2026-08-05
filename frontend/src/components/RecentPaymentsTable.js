import React from "react";
import { useNavigate } from "react-router-dom";

const statusPill = (status) => {
  const cls = status === "Paid" ? "pill-success" : status === "Late" ? "pill-warning" : "pill-danger";
  return <span className={`pill ${cls}`}>{status}</span>;
};

export default function RecentPaymentsTable({ payments }) {
  const navigate = useNavigate();

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
                <tr
                  key={p.id}
                  className="clickable-row"
                  onClick={() => navigate(`/payments?tenant=${encodeURIComponent(p.tenant_name || "")}`)}
                  title="View this tenant's full payment history"
                >
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
