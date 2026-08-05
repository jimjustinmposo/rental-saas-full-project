import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";

export default function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ apartment_id: "", unit_number: "", current_rent: "", status: "Vacant" });
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([apiClient.get("/units"), apiClient.get("/apartments")]).then(([u, a]) => {
      setUnits(u.data);
      setApartments(a.data);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await apiClient.post("/units", form);
    setForm({ apartment_id: "", unit_number: "", current_rent: "", status: "Vacant" });
    setShowForm(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this unit?")) return;
    await apiClient.delete(`/units/${id}`);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Units</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Add Unit"}
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
                required
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
            Save Unit
          </button>
        </form>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : units.length === 0 ? (
          <div className="empty-state">No units yet. Add a unit to a property above.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Apartment</th>
                  <th>Unit #</th>
                  <th>Rent</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Apartment">{u.apartment_name}</td>
                    <td data-label="Unit #">{u.unit_number}</td>
                    <td data-label="Rent">${Number(u.current_rent).toLocaleString()}</td>
                    <td data-label="Status">
                      <span className={`pill ${u.status === "Occupied" ? "pill-success" : "pill-warning"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td data-label="">
                      <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => handleDelete(u.id)}>
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
