import React, { useEffect } from "react";
import { formatMoney } from "../utils/currency";

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function Avatar({ t, size }) {
  if (t.image_url) {
    return (
      <img
        src={t.image_url}
        alt={t.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--color-primary-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: size / 2.4,
      }}
    >
      {initial(t.name)}
    </div>
  );
}
// CSP-safe: all interaction via React props (addEventListener under the
// hood). No inline on* attributes, no dangerouslySetInnerHTML.
export default function UnitsHistoryModal({ open, unit, history, loading, currency, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !unit) return null;

  const rows = Array.isArray(history) ? history : [];
  const current = rows.filter((t) => !t.move_out);
  const past = rows.filter((t) => t.move_out);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,10,40,0.55)",
        zIndex: 150,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto", margin: 0 }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--color-text-faint)" }}>{unit.apartment_name || "Unit"}</div>
            <h2 style={{ margin: "2px 0 4px" }}>Unit {unit.unit_number}</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700 }}>{formatMoney(unit.current_rent, currency)}</span>
              <span className={`pill ${unit.status === "Occupied" ? "pill-success" : "pill-warning"}`}>
                {unit.status || (current.length > 0 ? "Occupied" : "Vacant")}
              </span>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: "6px 12px" }}>
            X
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading tenant history...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No tenant history yet for this unit.</div>
        ) : (
          <>
            {current.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="field-label">Current tenant</div>
                {current.map((t) => (
                  <div key={t.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0" }}>
                    <Avatar t={t} size={44} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                        {t.phone || "No phone"} | since {fmtDate(t.move_in)}
                      </div>
                    </div>
                    <span className="pill pill-success">Active</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 18 }}>
              <div className="field-label">
                Past tenants{past.length > 0 ? ` (${past.length})` : ""}
              </div>
              {past.length === 0 ? (
                <div style={{ fontSize: 13.5, color: "var(--color-text-faint)", padding: "6px 0" }}>
                  No past tenants recorded.
                </div>
              ) : (
                past.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 0",
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    <Avatar t={t} size={40} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                        {fmtDate(t.move_in)} to {fmtDate(t.move_out)}
                        {t.deposit ? ` | deposit ${formatMoney(t.deposit, currency)}` : ""}
                      </div>
                    </div>
                    <span className="pill pill-warning">Moved out</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

