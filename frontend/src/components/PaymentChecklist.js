import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel, currentMonthValue } from "../utils/month";

export default function PaymentChecklist() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [apartmentFilter, setApartmentFilter] = useState(""); // "" = All

  const load = (m) => {
    setLoading(true);
    apiClient
      .get("/reports/checklist", { params: { month: m } })
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  };

  // Changing the month re-fetches from scratch — checkboxes reflect
  // whatever's actually saved for that specific month, nothing is reset
  // in the database, only the on-screen selection moves to a new month.
  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const handleToggle = async (tenantId, checked) => {
    setTogglingId(tenantId);
    try {
      await apiClient.post("/reports/checklist/toggle", { tenant_id: tenantId, month, checked });
      load(month);
    } finally {
      setTogglingId(null);
    }
  };

  const visibleApartments = data
    ? apartmentFilter
      ? data.apartments.filter((apt) => String(apt.apartment_id) === String(apartmentFilter))
      : data.apartments
    : [];

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="card-title">Paid Tenant Checklist</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            className="input-field"
            style={{ width: "auto", padding: "6px 10px" }}
            value={apartmentFilter}
            onChange={(e) => setApartmentFilter(e.target.value)}
          >
            <option value="">All Flats</option>
            {(data?.apartments || []).map((apt) => (
              <option key={apt.apartment_id} value={apt.apartment_id}>
                {apt.apartment_name}
              </option>
            ))}
          </select>
          <input
            type="month"
            className="input-field"
            style={{ width: "auto", padding: "6px 10px" }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : !data || data.apartments.length === 0 ? (
        <div className="empty-state">No active tenants yet.</div>
      ) : visibleApartments.length === 0 ? (
        <div className="empty-state">No active tenants for this flat.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {visibleApartments.map((apt) => (
            <div key={apt.apartment_id}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                {apt.apartment_name} — {formatMonthLabel(month)}
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Rent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apt.tenants.map((t) => (
                      <tr key={t.tenant_id}>
                        <td data-label="Tenant">{t.tenant_name}</td>
                        <td data-label="Rent">{formatMoney(t.current_rent, currency)}</td>
                        <td data-label="Status">
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={t.paid}
                              disabled={togglingId === t.tenant_id}
                              onChange={(e) => handleToggle(t.tenant_id, e.target.checked)}
                            />
                            <span className={`pill ${t.paid ? "pill-success" : "pill-danger"}`}>
                              {t.paid ? "Paid" : "Not Paid"}
                            </span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
