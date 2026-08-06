import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { currentMonthValue } from "../utils/month";

export default function PendingPayments() {
  const navigate = useNavigate();
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get("/reports/pending", { params: { month: currentMonthValue() } })
      .then((res) => setPending(res.data.pending))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>
        Pending Payments This Month
      </div>
      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="empty-state">Everyone's paid up for this month 🎉</div>
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
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.tenant_name}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  {t.apartment_name ? `${t.apartment_name} · ${t.unit_number}` : "No unit assigned"}
                </div>
              </div>
              <span className="pill pill-danger">{formatMoney(t.current_rent, currency)} due</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
