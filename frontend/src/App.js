import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./api/AuthContext";

import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";

// Route-level code splitting: each page is fetched ONLY when that route is
// first visited, so the browser downloads and parses far less JavaScript
// before first paint, and heavier dependencies stay in their own lazy chunk.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const CreateAccountPage = lazy(() => import("./pages/CreateAccountPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ApartmentsPage = lazy(() => import("./pages/ApartmentsPage"));
const UnitsPage = lazy(() => import("./pages/UnitsPage"));
const TenantsPage = lazy(() => import("./pages/TenantsPage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ContactWebDevPage = lazy(() => import("./pages/ContactWebDevPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function ProtectedLayout({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <MobileNav />
      <main className="main-area">{children}</main>
    </div>
  );
}

// Shown briefly while a lazily-loaded page chunk is being fetched. Uses the
// app's existing empty-state style so it matches the look & feel everywhere
// (works on both the public login pages and the protected app pages).
function LoadingFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="empty-state">Loading app…</div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/create-account" element={<CreateAccountPage />} />

        <Route path="/dashboard" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/apartments" element={<ProtectedLayout><ApartmentsPage /></ProtectedLayout>} />
        <Route path="/units" element={<ProtectedLayout><UnitsPage /></ProtectedLayout>} />
        <Route path="/tenants" element={<ProtectedLayout><TenantsPage /></ProtectedLayout>} />
        <Route path="/payments" element={<ProtectedLayout><PaymentsPage /></ProtectedLayout>} />
        <Route path="/expenses" element={<ProtectedLayout><ExpensesPage /></ProtectedLayout>} />
        <Route path="/reports" element={<ProtectedLayout><ReportsPage /></ProtectedLayout>} />
        <Route path="/contact" element={<ProtectedLayout><ContactWebDevPage /></ProtectedLayout>} />
        <Route path="/settings" element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
