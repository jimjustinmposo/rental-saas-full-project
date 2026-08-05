import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useSortableData } from "../hooks/useSortableData";

export default function UnitsPage() {
  const [searchParams] = useSearchParams();
  const [units, setUnits] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ apartment_id: "", unit_number: "", current_rent: "", status: "Vacant" });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("apartment") || "");

  const load = () => {
    Promise.all([apiClient.get("/units"), apiClient.get("/apartments")]).then(([u, a]) => {
      setUnits(u.data);
      setApartments(a.data);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm({ apartment_id: "", unit_number: "", current_rent: "", status: "Vacant" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await apiClient.put(`/units/${editingId}`, {
        unit_number: form.unit_number,
        current_rent: form.current_rent,
        status: form.status,
      });
    } else {
      await apiClient.post("/units", form);
    }
    resetForm();
    load();
  };

  const handleEditClick = (unit) => {
    setEditingId(unit.id);
    setForm({
      apartment_id: unit.apartment_id,
      unit_number: unit.unit_number,
      current_rent: unit.current_rent,
      status: unit.status,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this unit?")) return;
    await apiClient.delete(`/units/${id}`);
    load();
  };

  const filteredUnits = useMemo(() => {
    if (!search.trim()) return units;
    const q = search.toLowerCase();
    return units.filter(
      (u) =>
        u.apartment_name?.toLowerCase().includes(q) ||
        u.unit_number?.toLowerCase().includes(q) ||
        u.status?.toLowerCase().includes(q)
    );
  }, [units, search]);

  const { sortedItems, requestSort, sortIndicator } = useSortableData(filteredUnits);

  return (
    <div>
      <div className="page-header">
        <h1>Units</h1>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
        >
          {showForm ? "Cancel" : "+ Add Unit"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
          {editingId && (
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
              Editing unit — changing the rent here is automatically logged as a rent increase/decrease.
            </div>
          )}
          <div className="form-grid">
            <div>
              <label className="field-label">Apartment</label>
              <select
                className="input-field"
                value={form.apartment_id}
                onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}
                required
                disabled={!!editingId}
              >
                <option value="">Select apartment…</option>
                {apartments.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Unit number</label>
              <input
                className="input-field"
                value={form.unit_number}
                onChange={(e) => setForm({ ...form, unit_number: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Monthly rent ($)</label>
              <input
                type="number"
                className="input-field"
                value={form.current_rent}
                onChange={(e) => setForm({ ...form, current_rent: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Status</label>
              <select
                className="input-field"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="Vacant">Vacant</option>
                <option value="Occupied">Occupied</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            {editingId ? "Save Changes" : "Save Unit"}
          </button>
        </form>
      )}

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search by apartment, unit #, or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : sortedItems.length === 0 ? (
          <div className="empty-state">
            {search ? "No units match your search." : "No units yet. Add a unit to a property above."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => requestSort("apartment_name")}>
                    Apartment{sortIndicator("apartment_name")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("unit_number")}>
                    Unit #{sortIndicator("unit_number")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("current_rent")}>
                    Rent{sortIndicator("current_rent")}
                  </th>
                  <th className="sortable" onClick={() => requestSort("status")}>
                    Status{sortIndicator("status")}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Apartment">{u.apartment_name}</td>
                    <td data-label="Unit #">{u.unit_number}</td>
                    <td data-label="Rent">${Number(u.current_rent).toLocaleString()}</td>
                    <td data-label="Status">
                      <span className={`pill ${u.status === "Occupied" ? "pill-success" : "pill-warning"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td data-label="" style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: "6px 10px" }}
                        onClick={() => handleEditClick(u)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: "6px 10px" }}
                        onClick={() => handleDelete(u.id)}
                      >
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
