import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useSortableData } from "../hooks/useSortableData";
import { useAuth } from "../api/AuthContext";
import { formatMoney } from "../utils/currency";
import SearchableSelect from "../components/SearchableSelect";

const emptyForm = { apartment_id: "", description: "", amount: "", date: "" };

const RANGE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
];

const RANGE_LABEL = { month: "This month", year: "This year", all: "All time" };

export default function ExpensesPage() {
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [searchParams, setSearchParams] = useSearchParams();
  const [expenses, setExpenses] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Date-range filter, synced with the ?range= URL param. Clicking the
  // dashboard's Total Expenses card lands here pre-filtered so the table
  // shows exactly the records that make up the clicked amount.
  const range = searchParams.get("range") || "all";

  const setRange = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("range");
    else next.set("range", value);
    setSearchParams(next, { replace: true });
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/expenses", { params: range !== "all" ? { range } : undefined }),
      apiClient.get("/apartments"),
    ]).then(([e, a]) => {
      setExpenses(e.data);
      setApartments(a.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await apiClient.put(`/expenses/${editingId}`, form);
    } else {
      await apiClient.post("/expenses", form);
    }
    resetForm();
    load();
  };

  const handleEditClick = (exp) => {
    setEditingId(exp.id);
    setForm({
      apartment_id: exp.apartment_id || "",
      description: exp.description || "",
      amount: exp.amount,
      date: exp.date ? exp.date.slice(0, 10) : "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    await apiClient.delete(`/expenses/${id}`);
    load();
  };

  const filteredExpenses = useMemo(() => {
    if (!search.trim()) return expenses;
    const q = search.toLowerCase();
    return expenses.filter(
      (e) =>
        e.description?.toLowerCase().includes(q) ||
        e.apartment_name?.toLowerCase().includes(q)
    );
  }, [expenses, search]);

  const expenseTotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [filteredExpenses]
  );

  const { sortedItems, requestSort, sortIndicator } = useSortableData(filteredExpenses);

  return (
    <div>
      <div className="page-header">
        <h1>Expenses</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="input-field"
            style={{ width: "auto", padding: "8px 10px" }}
            value={range}
            onChange={(e) => setRange(e.target.value)}
            title="Filter expenses by date range"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
          >
            {showForm ? "Cancel" : "+ Add Expense"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <div>
              <label className="field-label">Apartment</label>
              <SearchableSelect
                options={apartments.map((a) => ({ value: a.id, label: a.name }))}
                value={form.apartment_id}
                onChange={(val) => setForm({ ...form, apartment_id: val })}
                placeholder="Search apartments…"
                required
              />
            </div>
            <div>
              <label className="field-label">Amount ({currency})</label>
              <input
                type="number"
                className="input-field"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Date</label>
              <input
                type="date"
                className="input-field"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Description</label>
              <input
                className="input-field"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Plumbing repair, electric bill, maintenance supplies…"
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            {editingId ? "Save Changes" : "Save Expense"}
          </button>
        </form>
      )}

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search by description or apartment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {range !== "all" && (
        <div
          style={{
            marginBottom: 16,
            fontSize: 13.5,
            color: "var(--color-text-muted)",
          }}
        >
          {RANGE_LABEL[range]} · {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""} · total{" "}
          <strong style={{ color: "var(--color-text)" }}>{formatMoney(expenseTotal, currency)}</strong>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : sortedItems.length === 0 ? (
          <div className="empty-state">
            {search ? "No expenses match your search." : "No expenses logged yet."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => requestSort("apartment_name")}>
                    Apartment{sortIndicator("apartment_name")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("date")}>
                    Date{sortIndicator("date")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("amount")}>
                    Amount{sortIndicator("amount")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("description")}>
                    Description{sortIndicator("description")}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Apartment">{e.apartment_name || "—"}</td>
                    <td data-label="Date">{e.date ? new Date(e.date).toLocaleDateString() : "—"}</td>
                    <td data-label="Amount">{formatMoney(e.amount, currency)}</td>
                    <td data-label="Description">{e.description || "—"}</td>
                    <td data-label="" style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary" style={{ padding: "6px 10px" }} onClick={() => handleEditClick(e)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => handleDelete(e.id)}>
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
