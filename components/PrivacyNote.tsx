// Shown right under every "upload your audit" button.
// Keep this text TRUE — it reflects lib/audit-redact.ts (strips name, ID, NetID,
// GPA, advisors before the AI sees the audit) and save-schedule (name is opt-in).

export default function PrivacyNote({ login = "NetID" }: { login?: string }) {
  return (
    <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "center", textAlign: "left", fontSize: 12.5, lineHeight: 1.55, color: "#4b5563" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>
        <strong style={{ color: "#166534" }}>We never ask for your {login} or password.</strong>{" "}
        Your name, student ID, and GPA are removed from your audit before our AI reads it.
      </span>
    </div>
  );
}
