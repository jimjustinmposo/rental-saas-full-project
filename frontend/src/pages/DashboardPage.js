import React, { useEffect, useState } from "react";
import apiClient from "../api/apiClient";
import SummaryCards from "../components/SummaryCards";
import ApartmentsOverview from "../components/ApartmentsOverview";
import IncomeExpensesChart from "../components/IncomeExpensesChart";
import RecentPaymentsTable from "../components/RecentPaymentsTable";
import LatestExpensesTable from "../components/LatestExpensesTable";
import MonthlyReportSummary from "../components/MonthlyReportSummary";
import { useAuth } from "../api/AuthContext";

export default function DashboardPage() {
  const { owner } = useAuth();
  const [summary, setSummary] = useState(null);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiClient.get("/reports/dashboard"), apiClient.get("/apartments")])
      .then(([reportRes, apartmentsRes]) => {
        setSummary(reportRes.data);
        setApartments(apartmentsRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Welcome back, {owner?.name?.split(" ")[0] || "Owner"} 👋</h1>
      </div>

      {loading ? (
        <div className="empty-state">Loading your dashboard…</div>
      ) : (
        <>
          <SummaryCards summary={summary} />

          <div className="dashboard-row-3">
            <IncomeExpensesChart data={summary?.monthlyTrend} />
            <ApartmentsOverview apartments={apartments} />
            <MonthlyReportSummary summary={summary} />
          </div>

          <div className="dashboard-row-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <RecentPaymentsTable payments={summary?.recentPayments} />
            <LatestExpensesTable expenses={summary?.latestExpenses} />
          </div>
        </>
      )}
    </div>
  );
}
