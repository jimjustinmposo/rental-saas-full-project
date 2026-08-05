import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";

export default function TenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", unit_id: "", move_in: "", deposit: "" });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = () => {
    Promise.all([apiClient.get("/tenants"), apiClient.get("/units")]).then(([t, u]) => {
      setTenants(t.data);
      setUnits(u.data);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      let image_url = null;
      if (imageFile) {
        const data = new FormData();
        data.append("image", imageFile);
        const uploadRes = await apiClient.post("/tenants/upload-image", data, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        image_url = uploadRes.data.image_url;
      }
      await apiClient.post("/tenants", { ...form, image_url });
      setForm({ name: "", phone: "", unit_id: "", move_in: "", deposit: "" });
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      load();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this tenant?")) return;
    await apiClient.delete(`/tenants/${id}`);
    load();
  };

  const filteredTenants = useMemo(() => {
    if (!search.trim()) return tenants;
    const q = search.toLowerCase();
    return tenants.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q) ||
        t.apartment_name?.toLowerCase().includes(q) ||
        t.unit_number?.toLowerCase().includes(q)
    );
  }, [tenants, search]);

  return (
    <div>
      <div className="page-header">
        <h1>Tenants</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Add Tenant"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: imagePreview ? `url(${imagePreview}) center/cover` : "var(--color-primary-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                flexShrink: 0,
              }}
            >
              {!imagePreview && "👤"}
            </div>
            <div>
              <label className="field-label">Tenant photo</label>
              <input type="file" accept="image/*" onChange={handleImageChange} />
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label className="field-label">Full name</label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input
                className="input-field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Unit</label>
              <select
                className="input-field"
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Unassigned</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.apartment_name} — {u.unit_number}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Move-in date</label>
              <input
                type="date"
                className="input-field"
                value={form.move_in}
                onChange={(e) => setForm({ ...form, move_in: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Deposit ($)</label>
              <input
                type="number"
                className="input-field"
                value={form.deposit}
                onChange={(e) => setForm({ ...form, deposit: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }} disabled={uploading}>
            {uploading ? "Saving…" : "Save Tenant"}
          </button>
        </form>
      )}

      <div className="search-bar">
        <span>🔍</span>
        <input
          placeholder="Search by name, phone, apartment, or unit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : filteredTenants.length === 0 ? (
        <div className="card empty-state">
          {search ? "No tenants match your search." : "No tenants yet. Add your first tenant above."}
        </div>
      ) : (
        <div className="tenant-cards-grid">
          {filteredTenants.map((t) => (
            <div
              className="card clickable-card"
              key={t.id}
              style={{ textAlign: "center" }}
              onClick={() => navigate(`/payments?tenant=${encodeURIComponent(t.name)}`)}
              title="View this tenant's payment history"
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  margin: "0 auto 10px",
                  background: t.image_url
                    ? `url(${t.image_url}) center/cover`
                    : "var(--color-primary-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}
              >
                {!t.image_url && "👤"}
              </div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{t.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 2 }}>
                {t.apartment_name ? `${t.apartment_name} · ${t.unit_number}` : "No unit assigned"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--color-text-faint)", marginTop: 2 }}>{t.phone}</div>
              <button
                className="btn btn-danger"
                style={{ marginTop: 12, padding: "6px 14px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(t.id);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
