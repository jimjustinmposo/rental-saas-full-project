import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel } from "../utils/month";

export default function PendingPayments() {
  const navigate = useNavigate();
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get("/reports/pending-all")
      .then((res) => setPending(res.data.pending))
      .finally(() => setLoading(false));
  }, []);

  const grandTotal = pending.reduce((sum, p) => sum + Number(p.total_pending || 0), 0);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div className="card-title">Pending Payments — All Time</div>
        {pending.length > 0 && (
          <span className="pill pill-danger">{formatMoney(grandTotal, currency)} total owed</span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 12 }}>
        Every unpaid or partially-paid balance on record, across all months — not just this month.
      </p>
      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="empty-state">No outstanding balances anywhere 🎉</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {pending.map((t, i) => (
            <div
              key={t.tenant_id}
              onClick={() => navigate(`/payments?tenant=${encodeURIComponent(t.tenant_name)}`)}
              title="View this tenant's payment history"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 4px",
                borderBottom: i < pending.length - 1 ? "1px solid var(--color-border)" : "none",
                cursor: "pointer",
                borderRadius: 8,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-light)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {t.tenant_name}
                  {t.tenant_status === "Unassigned" && (
                    <span style={{ fontWeight: 500, color: "var(--color-text-faint)" }}> (moved out)</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  {t.apartment_name ? `${t.apartment_name} · ${t.unit_number}` : "No unit assigned"} ·{" "}
                  {t.unpaid_months} month{t.unpaid_months !== 1 ? "s" : ""} unpaid
                  {t.unpaid_month_list && t.unpaid_month_list.length > 0 && (
                    <> ({t.unpaid_month_list.map(formatMonthLabel).join(", ")})</>
                  )}
                </div>
              </div>
              <span className="pill pill-danger">{formatMoney(t.total_pending, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
