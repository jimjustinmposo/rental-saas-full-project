import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useSortableData } from "../hooks/useSortableData";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import { formatMonthLabel, parseMonthInput, currentMonthValue, MONTH_INPUT_EXAMPLE, MONTH_INPUT_ERROR } from "../utils/month";
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

const RANGE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
];

const RANGE_LABEL = { month: "This month", year: "This year", all: "All time" };

export default function PaymentsPage() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [searchParams, setSearchParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("tenant") || "");
  const [monthError, setMonthError] = useState("");
  const [pendingList, setPendingList] = useState([]);
  const navigate = useNavigate();

  // Date-range filter, synced with the ?range= URL param. Clicking the
  // dashboard's Total Income / Paid cards lands here pre-filtered so the
  // table shows exactly the records that make up the clicked amount.
  const range = searchParams.get("range") || "all";

  // ?pending=1 -> "Not Paid — This Month" drill-down: shows every active tenant
  // still owing for the current month with their exact outstanding amount.
  const pendingMode = searchParams.get("pending") === "1";
  // ?unpaid=1 -> "Pending Payments" drill-down: restrict the table to records
  // with an outstanding balance (the total line below equals the row clicked).
  const unpaidOnly = searchParams.get("unpaid") === "1";
  // ?tenant_id= -> restrict to a single tenant. Uses the id (not the name) so
  // it survives same-route navigations without remounting the page.
  const tenantIdFilter = searchParams.get("tenant_id") || "";
  const pendingMonth = currentMonthValue();

  const setRange = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("range");
    else next.set("range", value);
    setSearchParams(next, { replace: true });
  };

  const load = () => {
    setLoading(true);
    if (pendingMode) {
      apiClient
        .get("/reports/pending", { params: { month: pendingMonth } })
        .then((res) => setPendingList(res.data.pending || []))
        .catch(() => setPendingList([]))
        .finally(() => setLoading(false));
      return;
    }
    Promise.all([
      apiClient.get("/payments", { params: range !== "all" ? { range } : undefined }),
      apiClient.get("/tenants"),
    ]).then(([p, t]) => {
      setPayments(p.data);
      setTenants(t.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, pendingMode]);

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
  // When landed from the Pending Payments card (?tenant_id=…&unpaid=1) the
  // list restricts to that single tenant and only rows with an outstanding
  // balance, so the total line below equals the amount on the row clicked.
  const filteredPayments = useMemo(() => {
    let rows = payments;
    if (tenantIdFilter) {
      rows = rows.filter((p) => String(p.tenant_id) === String(tenantIdFilter));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.tenant_name?.toLowerCase().includes(q) ||
          p.apartment_name?.toLowerCase().includes(q) ||
          p.unit_number?.toLowerCase().includes(q) ||
          p.month?.toLowerCase().includes(q) ||
          formatMonthLabel(p.month).toLowerCase().includes(q) ||
          p.note?.toLowerCase().includes(q)
      );
    }
    if (unpaidOnly) {
      rows = rows.filter((p) => Number(p.balance || 0) > 0);
    }
    return rows;
  }, [payments, search, unpaidOnly, tenantIdFilter]);

  const { sortedItems, requestSort, sortIndicator } = useSortableData(filteredPayments);

  // Shows the running total whenever a date range, the unpaid filter, or a
  // search is active — e.g. landing from the dashboard cards with ?range=…
  // or ?unpaid=1, the sum below always equals the amount on the card clicked.
  const rangeActive = unpaidOnly || range !== "all" || !!search.trim();
  const visibleTotal = useMemo(() => {
    if (!rangeActive) return null;
    return filteredPayments.reduce(
      (sum, p) => sum + Number(unpaidOnly ? p.balance : p.amount_paid || 0),
      0
    );
  }, [filteredPayments, rangeActive, unpaidOnly]);

  const pendingTotal = useMemo(
    () => pendingList.reduce((sum, t) => sum + Number(t.pending_amount || 0), 0),
    [pendingList]
  );

  return (
    <div>
      <div className="page-header">
        <h1>Payments</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {pendingMode ? (
            <span className="pill pill-danger">{formatMonthLabel(pendingMonth)} · Not Paid</span>
          ) : (
            <select
              className="input-field"
              style={{ width: "auto", padding: "8px 10px" }}
              value={range}
              onChange={(e) => setRange(e.target.value)}
              title="Filter payments by date range"
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          <button
            className="btn btn-primary"
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
          >
            {showForm ? "Cancel" : "+ Record Payment"}
          </button>
        </div>
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
                placeholder="e.g. saan nag bayad if BDO, GCASH, Resibo. or pag ka may pending payment etc…"
                style={{ resize: "vertical" }}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            {editingId ? "Save Changes" : "Save Payment"}
          </button>
        </form>
      )}

      {!pendingMode && (
        <div className="search-bar">
          <span>🔍</span>
          <input
            placeholder="Search by tenant, apartment, unit, month, or note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {pendingMode ? (
        <div style={{ marginBottom: 16, fontSize: 13.5, color: "var(--color-text-muted)" }}>
          {formatMonthLabel(pendingMonth)} · {pendingList.length} tenant{pendingList.length !== 1 ? "s" : ""} not paid yet · total pending{" "}
          <strong style={{ color: "var(--color-text)" }}>{formatMoney(pendingTotal, currency)}</strong>
        </div>
      ) : (
        visibleTotal !== null && (
          <div style={{ marginBottom: 16, fontSize: 13.5, color: "var(--color-text-muted)" }}>
            {unpaidOnly
              ? `Pending balance · ${filteredPayments.length} record${filteredPayments.length !== 1 ? "s" : ""} · total owed `
              : `${RANGE_LABEL[range]} · ${filteredPayments.length} record${filteredPayments.length !== 1 ? "s" : ""} · total paid `}
            <strong style={{ color: "var(--color-text)" }}>{formatMoney(visibleTotal, currency)}</strong>
          </div>
        )
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : pendingMode ? (
          pendingList.length === 0 ? (
            <div className="empty-state">No outstanding payments this month 🎉</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Apartment / Unit</th>
                    <th>Status</th>
                    <th>Pending Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingList.map((t) => (
                    <tr
                      key={t.tenant_id}
                      className="clickable-row"
                      onClick={() => navigate(`/payments?tenant_id=${t.tenant_id}&unpaid=1`)}
                      title={`View ${t.tenant_name}'s unpaid records`}
                    >
                      <td data-label="Tenant">{t.tenant_name}</td>
                      <td data-label="Apartment / Unit">
                        {t.apartment_name ? `${t.apartment_name} · ${t.unit_number}` : "—"}
                      </td>
                      <td data-label="Status"><span className="pill pill-danger">Not Paid</span></td>
                      <td data-label="Pending Amount">{formatMoney(t.pending_amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : sortedItems.length === 0 ? (
          <div className="empty-state">
            {unpaidOnly
              ? "No outstanding balances 🎉"
              : search
              ? "No payments match your search."
              : "No payments recorded yet."}
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
                  <th>Note</th>
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
                    <td data-label="Note" style={{ maxWidth: 220, whiteSpace: "pre-line" }}>
                      {p.note || "—"}
                    </td>
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