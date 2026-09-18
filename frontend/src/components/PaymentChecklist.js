import React, { useEffect, useState, useMemo, useCallback } from "react";
import apiClient from "../api/apiClient";
import { cachedGet, invalidate } from "../api/cache";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel, currentMonthValue } from "../utils/month";
import { SkeletonWidget } from "./Skeleton";

export default function PaymentChecklist() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [apartmentFilter, setApartmentFilter] = useState(""); // "" = All
  const [search, setSearch] = useState("");

  const load = useCallback((m) => {
    setLoading(true);
    cachedGet("/reports/checklist", { params: { month: m }, ttl: 15_000 })
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  const handleToggle = async (tenantId, checked) => {
    // Optimistic update — flip the pill immediately, revert on error
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        apartments: prev.apartments.map((apt) => ({
          ...apt,
          tenants: apt.tenants.map((t) =>
            t.tenant_id === tenantId ? { ...t, paid: checked } : t
          ),
        })),
      };
    });
    setTogglingId(tenantId);
    try {
      await apiClient.post("/reports/checklist/toggle", { tenant_id: tenantId, month, checked });
      // Invalidate cache so next open gets fresh data; no full reload needed
      invalidate("/reports/checklist");
      invalidate("/reports/dashboard");
    } finally {
      setTogglingId(null);
    }
  };

  const visibleApartments = useMemo(() => {
    if (!data) return [];
    let apartments = data.apartments;
    if (apartmentFilter) {
      apartments = apartments.filter((apt) => String(apt.apartment_id) === String(apartmentFilter));
    }
    const q = search.trim().toLowerCase();
    if (!q) return apartments;
    return apartments
      .map((apt) => ({
        ...apt,
        tenants: apt.tenants.filter(
          (t) =>
            t.tenant_name?.toLowerCase().includes(q) ||
            apt.apartment_name?.toLowerCase().includes(q)
        ),
      }))
      .filter((apt) => apt.tenants.length > 0);
  }, [data, search, apartmentFilter]);

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

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search tenant or flat…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <SkeletonWidget lines={5} />
      ) : !data || data.apartments.length === 0 ? (
        <div className="empty-state">No active tenants yet.</div>
      ) : visibleApartments.length === 0 ? (
        <div className="empty-state">
          {search.trim() ? "No tenants match your search." : "No active tenants for this flat."}
        </div>
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
