import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useSortableData } from "../hooks/useSortableData";

export default function PaymentsPage() {
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    tenant_id: "",
    unit_id: "",
    apartment_id: "",
    month: "",
    amount_due: "",
    amount_paid: "",
    payment_date: "",
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("tenant") || "");

  const load = () => {
    Promise.all([apiClient.get("/payments"), apiClient.get("/tenants")]).then(([p, t]) => {
      setPayments(p.data);
      setTenants(t.data);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleTenantSelect = (tenantId) => {
    const tenant = tenants.find((t) => String(t.id) === String(tenantId));
    setForm({
      ...form,
      tenant_id: tenantId,
      unit_id: tenant?.unit_id || "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await apiClient.post("/payments", form);
    setForm({ tenant_id: "", unit_id: "", apartment_id: "", month: "", amount_due: "", amount_paid: "", payment_date: "" });
    setShowForm(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this payment record?")) return;
    await apiClient.delete(`/payments/${id}`);
    load();
  };

  const statusPill = (status) => {
    const cls = status === "Paid" ? "pill-success" : status === "Late" ? "pill-warning" : "pill-danger";
    return <span className={`pill ${cls}`}>{status}</span>;
  };

  // Search matches tenant name — so "show all payments for a particular
  // tenant" is just typing their name here.
  const filteredPayments = useMemo(() => {
    if (!search.trim()) return payments;
    const q = search.toLowerCase();
    return payments.filter(
      (p) =>
        p.tenant_name?.toLowerCase().includes(q) ||
        p.apartment_name?.toLowerCase().includes(q) ||
        p.unit_number?.toLowerCase().includes(q) ||
        p.month?.toLowerCase().includes(q)
    );
  }, [payments, search]);

  const { sortedItems, requestSort, sortIndicator } = useSortableData(filteredPayments);

  const tenantTotal = useMemo(() => {
    if (!search.trim()) return null;
    return filteredPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  }, [filteredPayments, search]);

  return (
    <div>
      <div className="page-header">
        <h1>Payments</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Record Payment"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <div>
              <label className="field-label">Tenant</label>
              <select
                className="input-field"
                value={form.tenant_id}
                onChange={(e) => handleTenantSelect(e.target.value)}
                required
              >
                <option value="">Select tenant…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Month (e.g. 2026-08)</label>
              <input
                className="input-field"
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
                placeholder="2026-08"
                required
              />
            </div>
            <div>
              <label className="field-label">Amount due ($)</label>
              <input
                type="number"
                className="input-field"
                value={form.amount_due}
                onChange={(e) => setForm({ ...form, amount_due: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Amount paid ($)</label>
              <input
                type="number"
                className="input-field"
                value={form.amount_paid}
                onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Payment date</label>
              <input
                type="date"
                className="input-field"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            Save Payment
          </button>
        </form>
      )}

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search by tenant, apartment, unit, or month…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {tenantTotal !== null && (
        <div
          style={{
            marginBottom: 16,
            fontSize: 13.5,
            color: "var(--color-text-muted)",
          }}
        >
          {filteredPayments.length} matching record{filteredPayments.length !== 1 ? "s" : ""} · total paid{" "}
          <strong style={{ color: "var(--color-text)" }}>${tenantTotal.toLocaleString()}</strong>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : sortedItems.length === 0 ? (
          <div className="empty-state">
            {search ? "No payments match your search." : "No payments recorded yet."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => requestSort("tenant_name")}>
                    Tenant{sortIndicator("tenant_name")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("month")}>
                    Month{sortIndicator("month")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("amount_due")}>
                    Due{sortIndicator("amount_due")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("amount_paid")}>
                    Paid{sortIndicator("amount_paid")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("balance")}>
                    Balance{sortIndicator("balance")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("status")}>
                    Status{sortIndicator("status")}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Tenant">{p.tenant_name}</td>
                    <td data-label="Month">{p.month}</td>
                    <td data-label="Due">${Number(p.amount_due).toLocaleString()}</td>
                    <td data-label="Paid">${Number(p.amount_paid).toLocaleString()}</td>
                    <td data-label="Balance">${Number(p.balance).toLocaleString()}</td>
                    <td data-label="Status">{statusPill(p.status)}</td>
                    <td data-label="">
                      <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => handleDelete(p.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
