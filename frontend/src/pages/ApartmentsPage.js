import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";

export default function ApartmentsPage() {
  const [apartments, setApartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [loading, setLoading] = useState(true);

  const load = () => {
    apiClient.get("/apartments").then((res) => setApartments(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await apiClient.post("/apartments", form);
    setForm({ name: "", address: "" });
    setShowForm(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this apartment? This cannot be undone.")) return;
    await apiClient.delete(`/apartments/${id}`);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Apartments</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Add Apartment"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <div>
              <label className="field-label">Apartment name</label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Address</label>
              <input
                className="input-field"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            Save Apartment
          </button>
        </form>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : apartments.length === 0 ? (
        <div className="card empty-state">No apartments yet. Click "Add Apartment" to create your first property.</div>
      ) : (
        <div className="tenant-cards-grid">
          {apartments.map((apt) => (
            <div className="card" key={apt.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{apt.name}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {apt.address || "No address set"}
                  </div>
                </div>
                <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => handleDelete(apt.id)}>
                  Delete
                </button>
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <span className="pill pill-success">{apt.occupied_units || 0} occupied</span>
                <span className="pill" style={{ background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>
                  {apt.total_units || 0} units total
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
