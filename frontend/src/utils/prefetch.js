/**
 * Route-level chunk prefetching.
 *
 * React.lazy() deduplicates dynamic imports — a second import() of the same
 * module resolves from the module registry without hitting the network. So
 * calling prefetchRoute() on hover/focus is free, while it warms the chunk
 * *before* the click lands: the click becomes "render only" instead of
 * "download + parse + render".
 *
 * Only routes that App.js actually lazy-loads are listed here; keep this map in
 * sync with the React.lazy() calls there.
 */
export const PREFETCH_MAP = {
  "/dashboard": () => import("../pages/DashboardPage"),
  "/apartments": () => import("../pages/ApartmentsPage"),
  "/units": () => import("../pages/UnitsPage"),
  "/tenants": () => import("../pages/TenantsPage"),
  "/payments": () => import("../pages/PaymentsPage"),
  "/expenses": () => import("../pages/ExpensesPage"),
  "/reports": () => import("../pages/ReportsPage"),
  "/settings": () => import("../pages/SettingsPage"),
  "/contact": () => import("../pages/ContactWebDevPage"),
};

/**
 * Warm the JS chunk for a route path.
 * Failures are swallowed on purpose: a missing chunk will simply be fetched
 * again by the real navigation, and we don't want a hover to throw.
 */
export function prefetchRoute(to) {
  const load = PREFETCH_MAP[to];
  if (!load) return;
  load().catch(() => {
    /* ignore — React.lazy() will retry on navigation */
  });
}