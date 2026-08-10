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

// Every amount in the database is stored in AED (confirmed as the actual
// currency all rent/payment/expense figures were entered in). Everything
// below converts FROM AED into the selected display currency — the raw
// stored number is never changed, only how it's shown.
export const BASE_CURRENCY = "AED";

// Fixed, approximate rates (units of target currency per 1 AED), roughly
// anchored to AED's USD peg (~3.6725 AED = 1 USD) as of mid-2026. These do
// NOT update automatically — good for a quick sense of scale, not for
// anything that needs to be penny-accurate against a live rate.
export const EXCHANGE_RATES_FROM_AED = {
  AED: 1,
  USD: 0.2723,
  EUR: 0.2505,
  GBP: 0.2124,
  SAR: 1.0213,
  PHP: 15.79,
  INR: 23.7,
  CAD: 0.373,
  AUD: 0.414,
  SGD: 0.365,
  JPY: 41.1,
  CNY: 1.96,
  ZAR: 5.04,
  NGN: 422,
  KES: 35.1,
};

export function convertFromAED(amount, currencyCode) {
  const rate = EXCHANGE_RATES_FROM_AED[currencyCode] ?? 1;
  return Number(amount || 0) * rate;
}

// Formats a number as money in the given currency code, using the
// browser's Intl API so symbol placement/spacing is locale-correct.
// Falls back to "CODE 1,234" for any currency Intl doesn't recognize.
// `amount` is always assumed to be an AED figure (the base currency) and
// gets converted into `currencyCode` before formatting.
export function formatMoney(amount, currencyCode = "USD") {
  const value = convertFromAED(amount, currencyCode);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${currencyCode} ${value.toLocaleString()}`;
  }
}
