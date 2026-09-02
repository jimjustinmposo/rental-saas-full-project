import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";
import SummaryCards from "../components/SummaryCards";
import ApartmentsOverview from "../components/ApartmentsOverview";
import RecentPaymentsTable from "../components/RecentPaymentsTable";
import LatestExpensesTable from "../components/LatestExpensesTable";
import MonthlyReportSummary from "../components/MonthlyReportSummary";
import PaymentChecklist from "../components/PaymentChecklist";
import PendingPayments from "../components/PendingPayments";
import { useAuth } from "../api/AuthContext";

const RANGE_OPTIONS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "all", label: "Overall Total" },
];

export default function DashboardPage() {
  const { owner } = useAuth();
  const [range, setRange] = useState("month");
  const [summary, setSummary] = useState(null);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // The apartment list only needs to be fetched once per page visit — it does
  // not change when the summary range (month/year/all) is switched, so it is
  // kept in its own effect instead of being re-requested on every range change.
  useEffect(() => {
    apiClient
      .get("/apartments")
      .then((res) => setApartments(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get("/reports/dashboard", { params: { range } })
      .then((res) => setSummary(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div>
      <div className="page-header">
        <h1>Welcome back, {owner?.name?.split(" ")[0] || "Owner"} 👋</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={range === opt.value ? "btn btn-primary" : "btn btn-secondary"}
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading your dashboard…</div>
      ) : (
        <>
          <SummaryCards summary={summary} />

          <div style={{ marginTop: 20 }}>
            <PaymentChecklist />
          </div>

          <div className="dashboard-row-3" style={{ marginTop: 20, gridTemplateColumns: "1fr 1fr" }}>
            <ApartmentsOverview apartments={apartments} />
            <MonthlyReportSummary summary={summary} />
          </div>

          <div className="dashboard-row-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <RecentPaymentsTable payments={summary?.recentPayments} />
            <LatestExpensesTable expenses={summary?.latestExpenses} />
          </div>

          <div style={{ marginTop: 20 }}>
            <PendingPayments />
          </div>
        </>
      )}
    </div>
  );
}
