import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./api/AuthContext";

import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";

import LoginPage from "./pages/LoginPage";
import CreateAccountPage from "./pages/CreateAccountPage";
import DashboardPage from "./pages/DashboardPage";
import ApartmentsPage from "./pages/ApartmentsPage";
import UnitsPage from "./pages/UnitsPage";
import TenantsPage from "./pages/TenantsPage";
import PaymentsPage from "./pages/PaymentsPage";
import ExpensesPage from "./pages/ExpensesPage";
import ReportsPage from "./pages/ReportsPage";
import ContactWebDevPage from "./pages/ContactWebDevPage";
import SettingsPage from "./pages/SettingsPage";

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

function AppRoutes() {
  return (
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
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
