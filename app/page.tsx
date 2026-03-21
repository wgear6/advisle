export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#111827" }}>

      {/* Header */}
      <header style={{ background: "#1e3a5f", color: "#fff", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 36, height: 36, background: "#f8b400", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "#1e3a5f" }}>
          A
        </div>
        <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" }}>Advisle</span>
        <a
          href="https://www.instagram.com/advisle?igsh=MWZoc3Z1bTU0d2kydw=="
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: "auto", color: "#fff", opacity: 0.8, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, textDecoration: "none" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
        </a>
      </header>

      {/* Hero */}
      <section style={{ background: "#1e3a5f", color: "#fff", padding: "96px 24px 112px", textAlign: "center" }}>
        <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f8b400", opacity: 0.9 }}>
          Built for UVM students
        </p>
        <h1 style={{ margin: "0 0 20px", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, letterSpacing: "-1px", lineHeight: 1.1, maxWidth: 700, marginLeft: "auto", marginRight: "auto" }}>
          Stop stressing about your schedule.
        </h1>
        <p style={{ margin: "0 auto 40px", fontSize: "clamp(15px, 2vw, 18px)", opacity: 0.75, maxWidth: 520, lineHeight: 1.65 }}>
          Advisle reads your degree audit and builds a conflict-free semester schedule in seconds — completely free, no account needed.
        </p>
        <a
          href="/scheduler"
          style={{ display: "inline-block", padding: "16px 36px", background: "#f8b400", color: "#1e3a5f", borderRadius: 10, fontWeight: 800, fontSize: 16, textDecoration: "none", letterSpacing: "-0.2px" }}
        >
          Build My Schedule →
        </a>
      </section>

      {/* Wave divider */}
      <div style={{ background: "#1e3a5f", lineHeight: 0 }}>
        <svg viewBox="0 0 1440 48" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", width: "100%" }}>
          <path d="M0,48 C360,0 1080,0 1440,48 L1440,48 L0,48 Z" fill="#f8fafc" />
        </svg>
      </div>

      {/* How it works */}
      <section style={{ padding: "80px 24px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", margin: "0 0 56px", fontSize: 26, fontWeight: 800, color: "#1e3a5f", letterSpacing: "-0.5px" }}>
          How it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 32 }}>
          {[
            {
              step: "1",
              title: "Upload your degree audit",
              desc: "Log into myUVM, download your degree audit as a PDF, and drop it in.",
            },
            {
              step: "2",
              title: "Block off your time",
              desc: "Mark times you're unavailable — work, practice, sleep — and we'll work around them.",
            },
            {
              step: "3",
              title: "Get your schedule",
              desc: "AI picks the best sections for you: no conflicts, right credit load, degree progress first.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: "28px 24px" }}>
              <div style={{ width: 36, height: 36, background: "#f8b400", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 16 }}>
                {step}
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#1e3a5f" }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section style={{ background: "#fff", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "72px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 800, color: "#1e3a5f", letterSpacing: "-0.4px" }}>
            Free — because it should be.
          </h2>
          <p style={{ margin: 0, fontSize: 16, color: "#6b7280", lineHeight: 1.7 }}>
            Advisle was built by UVM students who were tired of spending hours manually cross-referencing course catalogs, RateMyProfessors, and degree audits. We built the tool we wished existed — and we're keeping it free for every student who needs it.
          </p>
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ padding: "72px 24px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, color: "#1e3a5f", letterSpacing: "-0.4px" }}>
          Ready to build your schedule?
        </h2>
        <p style={{ margin: "0 0 28px", fontSize: 15, color: "#6b7280" }}>Takes about 60 seconds.</p>
        <a
          href="/scheduler"
          style={{ display: "inline-block", padding: "14px 32px", background: "#1e3a5f", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: "none" }}
        >
          Get Started →
        </a>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "32px 24px", textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSeXvQyk9CIsPIAnUdSFGsLS0701bAVXFaaS-Z1wtivma_Um0g/viewform?usp=publish-editor"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", padding: "8px 20px", background: "#2563eb", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            Give Feedback
          </a>
          <a
            href="https://www.instagram.com/advisle?igsh=MWZoc3Z1bTU0d2kydw=="
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            Follow us
          </a>
        </div>
        <p style={{ margin: 0 }}>Advisle is a student-built tool and is not affiliated with the University of Vermont. Always verify your schedule with your academic advisor before registering.</p>
      </footer>

    </div>
  );
}
