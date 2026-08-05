import React from "react";

export default function ApartmentsOverview({ apartments }) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 14 }}>
        Apartments Overview
      </div>
      {(!apartments || apartments.length === 0) && (
        <div className="empty-state">No apartments yet. Add your first property to get started.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {apartments &&
          apartments.slice(0, 4).map((apt) => (
            <div
              key={apt.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--color-primary-light)",
                borderRadius: 12,
                padding: "10px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-accent-pink))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                  }}
                >
                  🏢
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{apt.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    {apt.total_units || 0} Units · {apt.occupied_units || 0} Occupied
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
