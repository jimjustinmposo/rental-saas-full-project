import React, { useState, useRef, useEffect, useMemo } from "react";

// Lightweight fuzzy scorer — higher is better, null means "no match at all".
// Exact prefix / substring matches always outrank subsequence matches, so
// typing "803" surfaces "Unit 803" before some unrelated fuzzy hit, and
// "joh" surfaces "John" first.
function fuzzyScore(query, text) {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  if (t.includes(q)) return 600 - t.indexOf(q);

  // Subsequence match: every character of q appears in t, in order,
  // possibly with gaps. Score rewards tight, early matches.
  let ti = 0;
  let firstMatch = -1;
  let spread = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return null;
    if (firstMatch === -1) firstMatch = idx;
    spread = idx - firstMatch;
    ti = idx + 1;
  }
  return 300 - firstMatch - spread * 0.5;
}

export default function SearchableSelect({
  options, // [{ value, label }]
  value,
  onChange,
  placeholder = "Search…",
  required = false,
  disabled = false,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const scored = options
      .map((o) => ({ ...o, _score: fuzzyScore(query, o.label) }))
      .filter((o) => o._score !== null);
    scored.sort((a, b) => b._score - a._score);
    return scored;
  }, [options, query]);

  const handleSelect = (opt) => {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        className="input-field"
        placeholder={placeholder}
        value={open ? query : selectedOption?.label || ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        required={required && !value}
        disabled={disabled}
        autoComplete="off"
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--color-surface)",
            border: "1.5px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-card-hover)",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 13.5, color: "var(--color-text-faint)" }}>
              No matches
            </div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt)}
                style={{
                  padding: "9px 14px",
                  fontSize: 14,
                  cursor: "pointer",
                  background: String(opt.value) === String(value) ? "var(--color-primary-light)" : "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-light)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    String(opt.value) === String(value) ? "var(--color-primary-light)" : "transparent")
                }
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
