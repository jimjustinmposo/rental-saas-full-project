/**
 * CSS-only shimmer skeleton components.
 * No layout shift — every skeleton reserves the same space as the real content.
 */
import React from "react";

/** Single shimmer bar */
export function SkeletonBar({ width = "100%", height = 16, radius = 6, style = {} }) {
  return (
    <div
      className="skeleton-bar"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** A shimmer "card" that looks like a summary card */
export function SkeletonCard({ style = {} }) {
  return (
    <div className="card" style={{ ...style }}>
      <SkeletonBar width="55%" height={13} style={{ marginBottom: 12 }} />
      <SkeletonBar width="70%" height={28} style={{ marginBottom: 8 }} />
      <SkeletonBar width="45%" height={11} />
    </div>
  );
}

/** 3-column summary cards skeleton (mirrors SummaryCards grid) */
export function SkeletonSummaryCards() {
  return (
    <div className="summary-cards-grid">
      {[...Array(6)].map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Table skeleton — shows n shimmer rows */
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card">
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* fake header */}
        <div style={{ display: "flex", gap: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>
          {[...Array(cols)].map((_, i) => (
            <SkeletonBar key={i} width={`${60 + (i * 17) % 40}%`} height={11} />
          ))}
        </div>
        {[...Array(rows)].map((_, r) => (
          <div
            key={r}
            style={{ display: "flex", gap: 12, padding: "12px 12px", borderBottom: "1px solid var(--color-border)" }}
          >
            {[...Array(cols)].map((_, c) => (
              <SkeletonBar key={c} width={`${50 + ((r + c) * 13) % 45}%`} height={14} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tenant card grid skeleton */
export function SkeletonTenantCards({ count = 6 }) {
  return (
    <div className="tenant-cards-grid">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="card" style={{ textAlign: "center" }}>
          <div
            className="skeleton-bar"
            style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 12px" }}
          />
          <SkeletonBar width="60%" height={14} style={{ margin: "0 auto 8px" }} />
          <SkeletonBar width="80%" height={11} style={{ margin: "0 auto 6px" }} />
          <SkeletonBar width="50%" height={11} style={{ margin: "0 auto 12px" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <SkeletonBar width={60} height={30} radius={8} />
            <SkeletonBar width={60} height={30} radius={8} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dashboard widget skeleton (card with a title bar + content lines) */
export function SkeletonWidget({ lines = 4, style = {} }) {
  return (
    <div className="card" style={style}>
      <SkeletonBar width="40%" height={16} style={{ marginBottom: 16 }} />
      {[...Array(lines)].map((_, i) => (
        <SkeletonBar
          key={i}
          width={`${55 + (i * 19) % 40}%`}
          height={13}
          style={{ marginBottom: 12 }}
        />
      ))}
    </div>
  );
}

/** Chart area skeleton */
export function SkeletonChart() {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <SkeletonBar width="30%" height={16} />
        <SkeletonBar width="22%" height={28} radius={8} />
      </div>
      <div className="skeleton-bar chart-container" style={{ borderRadius: 12 }} />
    </div>
  );
}