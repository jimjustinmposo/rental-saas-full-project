import React, { useEffect, useState, useMemo } from "react";
import apiClient from "../api/apiClient";
import { useSortableData } from "../hooks/useSortableData";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ apartment_id: "", category: "", description: "", amount: "", date: "" });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = () => {
    Promise.all([apiClient.get("/expenses"), apiClient.get("/apartments")]).then(([e, a]) => {
      setExpenses(e.data);
      setApartments(a.data);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await apiClient.post("/expenses", form);
    setForm({ apartment_id: "", category: "", description: "", amount: "", date: "" });
    setShowForm(false);
    load();
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
        e.category?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.apartment_name?.toLowerCase().includes(q)
    );
  }, [expenses, search]);

  const { sortedItems, requestSort, sortIndicator } = useSortableData(filteredExpenses);

  return (
    <div>
      <div className="page-header">
        <h1>Expenses</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Add Expense"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <div>
              <label className="field-label">Apartment</label>
              <select
                className="input-field"
                value={form.apartment_id}
                onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}
              >
                <option value="">General / Unassigned</option>
                {apartments.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Category</label>
              <input
                className="input-field"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Plumbing Repair"
                required
              />
            </div>
            <div>
              <label className="field-label">Amount ($)</label>
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
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            Save Expense
          </button>
        </form>
      )}

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search by category, description, or apartment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
                  <th className="sortable" onClick={() => requestSort("category")}>
                    Category{sortIndicator("category")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("apartment_name")}>
                    Apartment{sortIndicator("apartment_name")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("amount")}>
                    Amount{sortIndicator("amount")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("date")}>
                    Date{sortIndicator("date")}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Category">{e.category}</td>
                    <td data-label="Apartment">{e.apartment_name || "General"}</td>
                    <td data-label="Amount">${Number(e.amount).toLocaleString()}</td>
                    <td data-label="Date">{e.date ? new Date(e.date).toLocaleDateString() : "—"}</td>
                    <td data-label="">
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
