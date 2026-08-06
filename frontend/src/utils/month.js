const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2026-08" -> "2026.Aug". Falls back to the raw string if it doesn't
// match the expected YYYY-MM shape (e.g. already-formatted or malformed).
export function formatMonthLabel(monthStr) {
  if (!monthStr) return "";
  const match = /^(\d{4})-(\d{1,2})$/.exec(monthStr.trim());
  if (!match) return monthStr;
  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return monthStr;
  return `${year}.${MONTH_ABBR[monthIndex]}`;
}

// Returns the current month as "YYYY-MM", matching backend's default.
export function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
