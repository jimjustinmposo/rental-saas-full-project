import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";

const emptyForm = { name: "", address: "", payment_note: "" };

export default function ApartmentsPage() {
  const navigate = useNavigate();
  const [apartments, setApartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = () => {
    apiClient.get("/apartments").then((res) => setApartments(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await apiClient.put(`/apartments/${editingId}`, form);
    } else {
      await apiClient.post("/apartments", form);
    }
    resetForm();
    load();
  };

  const handleEditClick = (apt) => {
    setEditingId(apt.id);
    setForm({
      name: apt.name || "",
      address: apt.address || "",
      payment_note: apt.payment_note || "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this apartment? This cannot be undone.")) return;
    await apiClient.delete(`/apartments/${id}`);
    load();
  };

  const filteredApartments = useMemo(() => {
    if (!search.trim()) return apartments;
    const q = search.toLowerCase();
    return apartments.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.address?.toLowerCase().includes(q) ||
        a.payment_note?.toLowerCase().includes(q)
    );
  }, [apartments, search]);

  return (
    <div>
      <div className="page-header">
        <h1>Apartments</h1>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
        >
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
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Payment note</label>
              <textarea
                className="input-field"
                rows={4}
                value={form.payment_note}
                onChange={(e) => setForm({ ...form, payment_note: e.target.value })}
                placeholder={"1st payment 15000\n2nd payment 12000\n3rd payment 15000\n4th payment 15000"}
                style={{ resize: "vertical" }}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }}>
            {editingId ? "Save Changes" : "Save Apartment"}
          </button>
        </form>
      )}

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search by name, address, or payment note…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : filteredApartments.length === 0 ? (
        <div className="card empty-state">
          {search ? "No apartments match your search." : 'No apartments yet. Click "Add Apartment" to create your first property.'}
        </div>
      ) : (
        <div className="tenant-cards-grid">
          {filteredApartments.map((apt) => (
            <div
              className="card clickable-card"
              key={apt.id}
              onClick={() => navigate(`/units?apartment=${encodeURIComponent(apt.name)}`)}
              title="View units for this apartment"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{apt.name}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {apt.address || "No address set"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "6px 10px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(apt);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "6px 10px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(apt.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {apt.payment_note && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-faint)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Payment note
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--color-text)", whiteSpace: "pre-line", marginTop: 4 }}>
                    {apt.payment_note}
                  </div>
                </div>
              )}

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
