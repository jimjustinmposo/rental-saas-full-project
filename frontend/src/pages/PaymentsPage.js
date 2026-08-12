import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useSortableData } from "../hooks/useSortableData";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel, parseMonthInput, MONTH_INPUT_EXAMPLE, MONTH_INPUT_ERROR } from "../utils/month";
import SearchableSelect from "../components/SearchableSelect";

const emptyForm = {
  tenant_id: "",
  unit_id: "",
  apartment_id: "",
  month: "",
  amount_due: "",
  amount_paid: "",
  payment_date: "",
  note: "",
};

export default function PaymentsPage() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("tenant") || "");
  const [monthError, setMonthError] = useState("");

  const load = () => {
    Promise.all([apiClient.get("/payments"), apiClient.get("/tenants")]).then(([p, t]) => {
      setPayments(p.data);
      setTenants(t.data);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setMonthError("");
  };

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
    const storedMonth = parseMonthInput(form.month);
    if (!storedMonth) {
      setMonthError(MONTH_INPUT_ERROR);
      return;
    }
    setMonthError("");

    if (editingId) {
      await apiClient.put(`/payments/${editingId}`, {
        amount_due: form.amount_due,
        amount_paid: form.amount_paid,
        payment_date: form.payment_date,
        month: storedMonth,
        note: form.note,
      });
    } else {
      // POST upserts by tenant+month on the backend — this naturally
      // enforces "one payment per tenant per month."
      await apiClient.post("/payments", { ...form, month: storedMonth });
    }
    resetForm();
    load();
  };

  const handleEditClick = (p) => {
    setEditingId(p.id);
    setMonthError("");
    setForm({
      tenant_id: p.tenant_id,
      unit_id: p.unit_id || "",
      apartment_id: p.apartment_id || "",
      month: formatMonthLabel(p.month), // show as 2026.Jan in the input
      amount_due: p.amount_due,
      amount_paid: p.amount_paid,
      payment_date: p.payment_date ? p.payment_date.slice(0, 10) : "",
      note: p.note || "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  // Search matches tenant name, or the formatted month label — so "show
  // all payments for a particular tenant" is just typing their name here.
  const filteredPayments = useMemo(() => {
    if (!search.trim()) return payments;
    const q = search.toLowerCase();
    return payments.filter(
      (p) =>
        p.tenant_name?.toLowerCase().includes(q) ||
        p.apartment_name?.toLowerCase().includes(q) ||
        p.unit_number?.toLowerCase().includes(q) ||
        p.month?.toLowerCase().includes(q) ||
        formatMonthLabel(p.month).toLowerCase().includes(q) ||
        p.note?.toLowerCase().includes(q)
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
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
        >
          {showForm ? "Cancel" : "+ Record Payment"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
          {!editingId && (
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 12 }}>
              Only one payment record is kept per tenant per month — recording again for the
              same month updates that record instead of creating a duplicate.
            </div>
          )}
          <div className="form-grid">
            <div>
              <label className="field-label">Tenant</label>
              <SearchableSelect
                options={tenants.map((t) => ({ value: t.id, label: t.name }))}
                value={form.tenant_id}
                onChange={(val) => handleTenantSelect(val)}
                placeholder="Search tenants…"
                required
                disabled={!!editingId}
              />
            </div>
            <div>
              <label className="field-label">Month (e.g. {MONTH_INPUT_EXAMPLE})</label>
              <input
                className="input-field"
                value={form.month}
                onChange={(e) => {
                  setForm({ ...form, month: e.target.value });
                  if (monthError) setMonthError("");
                }}
                placeholder={MONTH_INPUT_EXAMPLE}
                required
              />
              {monthError && (
                <div style={{ color: "var(--color-danger)", fontSize: 12.5, marginTop: 6 }}>
                  {monthError}
                </div>
              )}
            </div>
            <div>
              <label className="field-label">Amount due ({currency})</label>
              <input
                type="number"
                className="input-field"
                value={form.amount_due}
                onChange={(e) => setForm({ ...form, amount_due: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Amount paid ({currency})</label>
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
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Note (optional)</label>
              <textarea
                className="input-field"
                rows={3}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="e.g. Paid partial amount, will settle balance next week…"
                style={{ resize: "vertical" }}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            {editingId ? "Save Changes" : "Save Payment"}
          </button>
        </form>
      )}

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search by tenant, apartment, unit, month, or note…"
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
          <strong style={{ color: "var(--color-text)" }}>{formatMoney(tenantTotal, currency)}</strong>
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
                    <td data-label="Month">{formatMonthLabel(p.month)}</td>
                    <td data-label="Due">{formatMoney(p.amount_due, currency)}</td>
                    <td data-label="Paid">{formatMoney(p.amount_paid, currency)}</td>
                    <td data-label="Balance">{formatMoney(p.balance, currency)}</td>
                    <td data-label="Status">{statusPill(p.status)}</td>
                    <td data-label="" style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary" style={{ padding: "6px 10px" }} onClick={() => handleEditClick(p)}>
                        Edit
                      </button>
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