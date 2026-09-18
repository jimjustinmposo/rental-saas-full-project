import React, { useEffect, useState, useCallback } from "react";
import { cachedGet, invalidate } from "../api/cache";
import SummaryCards from "../components/SummaryCards";
import ApartmentsOverview from "../components/ApartmentsOverview";
import RecentPaymentsTable from "../components/RecentPaymentsTable";
import LatestExpensesTable from "../components/LatestExpensesTable";
import MonthlyReportSummary from "../components/MonthlyReportSummary";
import PaymentChecklist from "../components/PaymentChecklist";
import PendingPayments from "../components/PendingPayments";
import { useAuth } from "../api/AuthContext";
import {
  SkeletonSummaryCards,
  SkeletonWidget,
  SkeletonTable,
  SkeletonChart,
} from "../components/Skeleton";

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
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingApartments, setLoadingApartments] = useState(true);

  useEffect(() => {
    cachedGet("/apartments", { ttl: 60_000 })
      .then((data) => setApartments(data))
      .catch(() => {})
      .finally(() => setLoadingApartments(false));
  }, []);

  useEffect(() => {
    setLoadingSummary(true);
    cachedGet("/reports/dashboard", { params: { range }, ttl: 20_000 })
      .then((data) => setSummary(data))
      .catch(() => {})
      .finally(() => setLoadingSummary(false));
  }, [range]);

  // Prefetch adjacent ranges in the background after first paint
  useEffect(() => {
    const id = requestIdleCallback
      ? requestIdleCallback(() => {
          cachedGet("/reports/dashboard", { params: { range: "year" }, ttl: 20_000 }).catch(() => {});
          cachedGet("/reports/dashboard", { params: { range: "all"  }, ttl: 20_000 }).catch(() => {});
        }, { timeout: 3000 })
      : setTimeout(() => {
          cachedGet("/reports/dashboard", { params: { range: "year" }, ttl: 20_000 }).catch(() => {});
          cachedGet("/reports/dashboard", { params: { range: "all"  }, ttl: 20_000 }).catch(() => {});
        }, 2000);
    return () => (requestIdleCallback ? cancelIdleCallback(id) : clearTimeout(id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-fade-in">
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

      {/* Summary cards — show skeleton while first load, then real data */}
      {loadingSummary && !summary ? (
        <SkeletonSummaryCards />
      ) : (
        <SummaryCards summary={summary} />
      )}

      <div style={{ marginTop: 20 }}>
        <PaymentChecklist />
      </div>

      <div className="dashboard-row-2" style={{ marginTop: 20 }}>
        {loadingApartments && apartments.length === 0 ? (
          <SkeletonWidget lines={3} />
        ) : (
          <ApartmentsOverview apartments={apartments} />
        )}
        {loadingSummary && !summary ? (
          <SkeletonWidget lines={3} />
        ) : (
          <MonthlyReportSummary summary={summary} />
        )}
      </div>

      <div className="dashboard-row-2">
        {loadingSummary && !summary ? (
          <SkeletonTable rows={4} cols={4} />
        ) : (
          <RecentPaymentsTable payments={summary?.recentPayments} />
        )}
        {loadingSummary && !summary ? (
          <SkeletonWidget lines={4} />
        ) : (
          <LatestExpensesTable expenses={summary?.latestExpenses} />
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <PendingPayments />
      </div>
    </div>
  );
}
