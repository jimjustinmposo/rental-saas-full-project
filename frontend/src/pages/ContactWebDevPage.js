import React, { useState } from "react";
import SearchableSelect from "../components/SearchableSelect";

const WHATSAPP_NUMBER = "971501905318"; // no +, no spaces, no leading 00

export default function ContactWebDevPage() {
  const [form, setForm] = useState({ name: "", concern: "", message: "" });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSend = (e) => {
    e.preventDefault();

    const text =
      `New message from FlatOwner Webapp Contact page:%0A%0A` +
      `Name: ${encodeURIComponent(form.name)}%0A` +
      `Concern: ${encodeURIComponent(form.concern)}%0A` +
      `Message: ${encodeURIComponent(form.message)}`;

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <div className="page-header">
        <h1>Contact Web Developer</h1>
      </div>

      <div
        className="dashboard-row-3"
        style={{ gridTemplateColumns: "1fr 1.2fr", alignItems: "start" }}
      >
        {/* ---------- Developer info card ---------- */}
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, var(--color-primary), var(--color-accent-pink))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 800,
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              JP
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>
                Jim Justin M. Poso
              </div>
              <div style={{ fontSize: 13.5, color: "var(--color-text-muted)" }}>
                WebApp Developer
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>
                Phone / WhatsApp
              </span>
              <span style={{ fontWeight: 700 }}>+971 501905318</span>
            </div>
          </div>

          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 20,
              textDecoration: "none",
            }}
          >
            💬 Chat directly on WhatsApp
          </a>

          <p
            style={{
              fontSize: 12.5,
              color: "var(--color-text-faint)",
              marginTop: 12,
              textAlign: "center",
            }}
          >
            Available for support, feature requests, and bug reports.
          </p>
        </div>

        {/* ---------- Contact form ---------- */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>
            Send a message
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              marginBottom: 18,
            }}
          >
            Fill this in and it'll open WhatsApp with your message ready to
            send.
          </p>

          <form onSubmit={handleSend}>
            <label className="field-label">Your name</label>
            <input
              className="input-field"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              style={{ marginBottom: 14 }}
            />

            <label className="field-label">Concern</label>
            <SearchableSelect
              options={[
                { value: "Bug report", label: "Bug report" },
                { value: "Feature request", label: "Feature request" },
                { value: "Account access", label: "Account access" },
                { value: "Billing question", label: "Billing question" },
                { value: "Other", label: "Other" },
              ]}
              value={form.concern}
              onChange={(val) => setForm({ ...form, concern: val })}
              placeholder="Search topics…"
              required
            />

            <label className="field-label">Message</label>
            <textarea
              className="input-field"
              name="message"
              value={form.message}
              onChange={handleChange}
              required
              rows={5}
              style={{ marginBottom: 16, resize: "vertical" }}
            />

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Send via WhatsApp
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
