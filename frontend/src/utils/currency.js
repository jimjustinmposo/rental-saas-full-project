// Supported currencies. Keep this list in sync with ALLOWED_CURRENCIES
// in backend/src/routes/auth.js.
export const CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "AED", label: "UAE Dirham", symbol: "AED" },
  { code: "SAR", label: "Saudi Riyal", symbol: "SAR" },
  { code: "PHP", label: "Philippine Peso", symbol: "₱" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh" },
];

// Every amount in the database is stored as a plain number (no currency
// conversion applied). Changing the currency only changes how numbers are
// LABELED (symbol/code) — the underlying figure is never multiplied or
// converted. AED 1,250 and USD 1,250 represent the exact same stored value.
export const BASE_CURRENCY = "AED";

// Cached Intl.NumberFormat instances, keyed by currency + fraction digits.
// formatMoney() is called once per table cell / chart tick, so reusing the
// formatter avoids constructing a new Intl.NumberFormat on every single call
// (building one is surprisingly expensive, e.g. hundreds of rows at once).
const _formatterCache = new Map();

function getCurrencyFormatter(currencyCode, maximumFractionDigits) {
  const key = `${currencyCode}\u0000${maximumFractionDigits}`;
  let formatter = _formatterCache.get(key);
  if (formatter === undefined) {
    try {
      formatter = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits,
      });
    } catch {
      formatter = null; // unsupported currency code -> caller falls back
    }
    _formatterCache.set(key, formatter);
  }
  return formatter;
}

// Formats a number as money in the given currency code, using the
// browser's Intl API so symbol placement/spacing is locale-correct.
// Falls back to "CODE 1,234" for any currency Intl doesn't recognize.
// No conversion happens here — `amount` is used exactly as stored.
export function formatMoney(amount, currencyCode = "USD") {
  const value = Number(amount || 0);
  const formatter = getCurrencyFormatter(currencyCode || "USD", Number.isInteger(value) ? 0 : 2);
  if (formatter) return formatter.format(value);
  return `${currencyCode} ${value.toLocaleString()}`;
}
