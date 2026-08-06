import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";
import { useAuth } from "../api/AuthContext";
import SearchableSelect from "../components/SearchableSelect";

const emptyForm = { name: "", phone: "", unit_id: "", move_in: "", move_out: "", deposit: "", status: "Active" };

export default function TenantsPage() {
  const navigate = useNavigate();
  const { owner } = useAuth();
  const currency = owner?.currency || "USD";
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
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

  const resetForm = () => {
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
    setEditingId(null);
    setShowForm(false);
  };

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
      let image_url;
      if (imageFile) {
        const data = new FormData();
        data.append("image", imageFile);
        const uploadRes = await apiClient.post("/tenants/upload-image", data, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        image_url = uploadRes.data.image_url;
      }
      const payload = { ...form, unit_id: form.unit_id || "" };
      if (image_url) payload.image_url = image_url;

      if (editingId) {
        await apiClient.put(`/tenants/${editingId}`, payload);
      } else {
        await apiClient.post("/tenants", payload);
      }
      resetForm();
      load();
    } finally {
      setUploading(false);
    }
  };

  const handleEditClick = (t) => {
    setEditingId(t.id);
    setForm({
      name: t.name || "",
      phone: t.phone || "",
      unit_id: t.unit_id || "",
      move_in: t.move_in ? t.move_in.slice(0, 10) : "",
      move_out: t.move_out ? t.move_out.slice(0, 10) : "",
      deposit: t.deposit || "",
      status: t.status || "Active",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Permanently delete this tenant record? Consider setting status to Unassigned instead if they just moved out.")) return;
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
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
        >
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
                background: imagePreview
                  ? `url(${imagePreview}) center/cover`
                  : editingId && form.image_url
                  ? `url(${form.image_url}) center/cover`
                  : "var(--color-primary-light)",
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
              <label className="field-label">Tenant photo {editingId && "(leave blank to keep current)"}</label>
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
              <SearchableSelect
                options={[
                  { value: "", label: "Unassigned (no unit)" },
                  ...units.map((u) => ({ value: u.id, label: `${u.apartment_name} — ${u.unit_number}` })),
                ]}
                value={form.unit_id}
                onChange={(val) =>
                  setForm({
                    ...form,
                    unit_id: val,
                    status: val === "" ? "Unassigned" : "Active",
                  })
                }
                placeholder="Search apartment or unit number…"
              />
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
              <label className="field-label">Move-out date</label>
              <input
                type="date"
                className="input-field"
                value={form.move_out}
                onChange={(e) => setForm({ ...form, move_out: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Deposit ({currency})</label>
              <input
                type="number"
                className="input-field"
                value={form.deposit}
                onChange={(e) => setForm({ ...form, deposit: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Status</label>
              <SearchableSelect
                options={[
                  { value: "Active", label: "Active" },
                  { value: "Unassigned", label: "Unassigned (moved out)" },
                ]}
                value={form.status}
                onChange={(val) => setForm({ ...form, status: val })}
                placeholder="Search status…"
              />
            </div>
          </div>
          {editingId && form.status === "Unassigned" && (
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 8 }}>
              Setting status to Unassigned will clear their unit and free it up, unless you also pick a new unit above.
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }} disabled={uploading}>
            {uploading ? "Saving…" : editingId ? "Save Changes" : "Save Tenant"}
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
              style={{ textAlign: "center", position: "relative" }}
              onClick={() => navigate(`/payments?tenant=${encodeURIComponent(t.name)}`)}
              title="View this tenant's payment history"
            >
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: t.status === "Unassigned" ? "var(--color-danger)" : "var(--color-success)",
                }}
                title={t.status === "Unassigned" ? "Unassigned" : "Active"}
              />
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
              <span
                className={`pill ${t.status === "Unassigned" ? "pill-danger" : "pill-success"}`}
                style={{ marginTop: 8, display: "inline-block" }}
              >
                {t.status === "Unassigned" ? "Unassigned" : "Active"}
              </span>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "6px 14px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(t);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  style={{ padding: "6px 14px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(t.id);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
