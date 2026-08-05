import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/apartments", label: "Apartments", icon: "🏢" },
  { to: "/units", label: "Units", icon: "🚪" },
  { to: "/tenants", label: "Tenants", icon: "👤" },
  { to: "/payments", label: "Payments", icon: "💳" },
  { to: "/expenses", label: "Expenses", icon: "🧾" },
  { to: "/reports", label: "Reports", icon: "📊" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mobile-nav">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 16 }}>
          🏘️ RentalOS
        </div>
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
          style={{ background: "transparent", border: "none", color: "white", fontSize: 24, cursor: "pointer" }}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div style={{ background: "#3f27a8", padding: "6px 12px 16px" }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 12px",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                color: isActive ? "#3f27a8" : "white",
                background: isActive ? "white" : "transparent",
                marginBottom: 4,
              })}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            style={{
              width: "100%",
              marginTop: 8,
              background: "rgba(255,255,255,0.15)",
              color: "white",
              border: "none",
              borderRadius: 10,
              padding: "12px 14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🔒 Log out
          </button>
        </div>
      )}
    </div>
  );
}
