import React from "react";
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

export default function Sidebar() {
  const { owner, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px 22px" }}>
        <div style={{ fontSize: 22 }}>🏘️</div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>RentalOS</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 14px",
              borderRadius: 10,
              fontSize: 14.5,
              fontWeight: 600,
              color: isActive ? "#3f27a8" : "rgba(255,255,255,0.85)",
              background: isActive ? "white" : "transparent",
            })}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 14 }}>
        <div style={{ fontSize: 13, opacity: 0.85, padding: "0 10px 10px" }}>
          {owner?.name}
        </div>
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.12)",
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "10px 14px",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13.5,
          }}
        >
          🔒 Log out
        </button>
      </div>
    </aside>
  );
}
