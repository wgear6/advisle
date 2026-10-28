import { colors, radius, shadow } from "@/lib/theme";

function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z" />
    </svg>
  );
}
function IconInstagram() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text }}>

      {/* Header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "rgba(30,58,95,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          color: "#fff", padding: "16px 28px", display: "flex", alignItems: "center", gap: 14,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ width: 32, height: 32, background: colors.accent, borderRadius: radius.sm, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: colors.ink }}>
          A
        </div>
        <span style={{ fontWeight: 650, fontSize: 17, letterSpacing: "-0.3px" }}>Advisle</span>
        <a
          href="https://www.instagram.com/advisle?igsh=MWZoc3Z1bTU0d2kydw=="
          target="_blank"
          rel="noopener noreferrer"
          className="adv-fade"
          style={{ marginLeft: "auto", color: "#fff", opacity: 0.7, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, textDecoration: "none", transition: "opacity 0.2s" }}
        >
          <IconInstagram />
        </a>
      </header>

      {/* Hero */}
      <section style={{ position: "relative", background: `linear-gradient(165deg, ${colors.ink} 0%, #16304d 55%, #0f2238 100%)`, color: "#fff", padding: "108px 24px 128px", textAlign: "center", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: "-20%", left: "50%", transform: "translateX(-50%)",
          width: 900, height: 500, background: `radial-gradient(closest-side, ${colors.accent}22, transparent)`,
          pointerEvents: "none",
        }} />

        <div className="fade-up" style={{ position: "relative" }}>
          <p style={{ margin: "0 0 18px", fontSize: 12, fontWeight: 650, letterSpacing: "0.14em", textTransform: "uppercase", color: colors.accentSoft, opacity: 0.95 }}>
            Free AI schedule builder
          </p>
          <h1 style={{ margin: "0 0 22px", fontSize: "clamp(34px, 5.2vw, 58px)", fontWeight: 650, letterSpacing: "-1.5px", lineHeight: 1.08, maxWidth: 760, marginLeft: "auto", marginRight: "auto" }}>
            Stop stressing about your schedule.
          </h1>
          <p style={{ margin: "0 auto 52px", fontSize: "clamp(16px, 1.8vw, 19px)", opacity: 0.72, maxWidth: 520, lineHeight: 1.65, fontWeight: 400 }}>
            Advisle reads your degree audit and builds a conflict-free semester schedule in seconds — completely free, no account needed.
          </p>
        </div>

        {/* School selector */}
        <div className="fade-up" style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", position: "relative", animationDelay: "0.1s" }}>
          <a href="/scheduler" style={{ textDecoration: "none" }}>
            <div className="adv-card" style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: radius.lg, padding: "28px 40px", cursor: "pointer", minWidth: 210,
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399", margin: "0 auto 14px", boxShadow: "0 0 0 4px rgba(52,211,153,0.15)" }} />
              <div style={{ fontWeight: 650, fontSize: 19, color: "#fff", marginBottom: 4, letterSpacing: "-0.2px" }}>UVM</div>
              <div style={{ fontSize: 13, opacity: 0.6, color: "#fff" }}>University of Vermont</div>
              <div style={{ marginTop: 18, display: "inline-block", padding: "9px 22px", background: colors.accent, color: colors.ink, borderRadius: radius.pill, fontWeight: 650, fontSize: 14 }}>
                Build My Schedule →
              </div>
            </div>
          </a>

          <a href="/unh" style={{ textDecoration: "none" }}>
            <div className="adv-card" style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: radius.lg, padding: "28px 40px", cursor: "pointer", minWidth: 210,
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#60a5fa", margin: "0 auto 14px", boxShadow: "0 0 0 4px rgba(96,165,250,0.15)" }} />
              <div style={{ fontWeight: 650, fontSize: 19, color: "#fff", marginBottom: 4, letterSpacing: "-0.2px" }}>UNH</div>
              <div style={{ fontSize: 13, opacity: 0.6, color: "#fff" }}>University of New Hampshire</div>
              <div style={{ marginTop: 18, display: "inline-block", padding: "9px 22px", background: colors.unhAccent, color: colors.unh, borderRadius: radius.pill, fontWeight: 650, fontSize: 14 }}>
                Build My Schedule →
              </div>
            </div>
          </a>
        </div>

        {/* Syllabus Calendar tool */}
        <div className="fade-up" style={{ marginTop: 36, position: "relative", animationDelay: "0.2s" }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 650, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
            Also from Advisle
          </p>
          <a href="/syllabus" style={{ textDecoration: "none", display: "block", maxWidth: 460, margin: "0 auto" }}>
            <div className="adv-card" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${colors.accent}3d`, borderRadius: radius.lg, padding: "20px 28px", display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: radius.sm, background: "rgba(248,180,0,0.14)", display: "flex", alignItems: "center", justifyContent: "center", color: colors.accentSoft, flexShrink: 0 }}>
                <IconCalendar />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 650, fontSize: 15, color: "#fff" }}>Syllabus Calendar</span>
                  <span style={{ background: colors.accent, color: colors.ink, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: radius.pill, letterSpacing: "0.05em" }}>NEW</span>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.58)", lineHeight: 1.5 }}>
                  Drop any syllabus PDF — AI extracts every due date, exam, and quiz into an exportable calendar.
                </div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, flexShrink: 0 }}>→</div>
            </div>
          </a>
        </div>
      </section>

      {/* Example Schedule Preview */}
      <section style={{ padding: "88px 24px 72px", maxWidth: 780, margin: "0 auto" }}>
        <p style={{ textAlign: "center", margin: "0 0 10px", fontSize: 12, fontWeight: 650, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.accent }}>
          Example Output
        </p>
        <h2 style={{ textAlign: "center", margin: "0 0 36px", fontSize: 28, fontWeight: 650, color: colors.ink, letterSpacing: "-0.6px" }}>
          Here&rsquo;s what your schedule looks like
        </h2>

        <div style={{ background: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, padding: 26, boxShadow: shadow.lg }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 650, color: "#111827" }}>Your Recommended Schedule</h3>
            <p style={{ margin: 0, fontSize: 14, color: colors.textMuted }}>15 credits · Spring 2027</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { subj: "STAT", num: "3310", title: "Applied Regression Analysis", cat: "Major Core", catColor: "#2563eb", days: "Mon, Wed, Fri", time: "10:50 – 11:40 AM", loc: "Innovation E210", instructor: "S. Ramler", rating: 4.4, diff: 3.1, numRatings: 58, seats: 12 },
              { subj: "STAT", num: "2430", title: "Applied Probability", cat: "Major Core", catColor: "#2563eb", days: "Tue, Thu", time: "11:40 AM – 1:00 PM", loc: "Kalkin 325", instructor: "J. Watts", rating: 4.2, diff: 3.4, numRatings: 41, seats: 20 },
              { subj: "CS",   num: "2100", title: "Computing with Data Structures", cat: "Major Elective", catColor: "#7c3aed", days: "Tue, Thu", time: "2:50 – 4:05 PM", loc: "Votey 254", instructor: "C. Vaccaro", rating: 4.1, diff: 3.6, numRatings: 33, seats: 8 },
              { subj: "ENGS", num: "1570", title: "Written Expression", cat: "General Education", catColor: "#059669", days: "Mon, Wed, Fri", time: "1:15 – 2:05 PM", loc: "Wheeler 301", instructor: "M. Chen", rating: 4.6, diff: 2.2, numRatings: 27, seats: 14 },
              { subj: "MATH", num: "2500", title: "Calculus III", cat: "General Education", catColor: "#059669", days: "Mon, Wed, Fri", time: "8:30 – 9:20 AM", loc: "Lord House 100", instructor: "T. Demir", rating: 3.9, diff: 3.8, numRatings: 62, seats: 5 },
            ].map((c) => (
              <div key={c.num} style={{ borderRadius: radius.sm + 2, border: `1px solid ${c.catColor}26`, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  <div style={{ width: 3, background: c.catColor, flexShrink: 0 }} />
                  <div style={{ padding: "14px 16px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 650, color: colors.ink, fontSize: 15 }}>{c.subj} {c.num}</span>
                        <span style={{ fontSize: 15, marginLeft: 8, color: "#1f2937" }}>{c.title}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: radius.pill, background: `${c.catColor}12`, color: c.catColor, fontWeight: 600 }}>{c.cat}</span>
                        <span style={{ fontSize: 13, color: colors.textMuted }}>3 cr</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#4b5563", alignItems: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><IconCalendar /> {c.days} · {c.time}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><IconPin /> {c.loc}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <IconUser /> {c.instructor}
                        <span style={{ marginLeft: 4, display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <span style={{ background: c.rating >= 4 ? "#dcfce7" : "#fef9c3", color: c.rating >= 4 ? "#166534" : "#854d0e", padding: "1px 6px", borderRadius: radius.pill, fontSize: 12, fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <IconStar /> {c.rating.toFixed(1)}
                          </span>
                          <span style={{ color: colors.textFaint, fontSize: 12 }}>{c.diff.toFixed(1)} diff · {c.numRatings} ratings</span>
                        </span>
                      </span>
                      <span style={{ color: c.seats <= 5 ? "#dc2626" : colors.textMuted, fontWeight: c.seats <= 5 ? 600 : 400 }}>
                        {c.seats <= 5 ? `${c.seats} seats left` : `${c.seats} seats open`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary bar */}
          <div style={{ marginTop: 20, background: colors.ink, color: "#fff", borderRadius: radius.sm + 2, padding: "16px 22px", display: "flex", gap: 36 }}>
            <div><div style={{ fontSize: 23, fontWeight: 650 }}>15</div><div style={{ fontSize: 12, opacity: 0.65 }}>Total Credits</div></div>
            <div><div style={{ fontSize: 23, fontWeight: 650 }}>5</div><div style={{ fontSize: 12, opacity: 0.65 }}>Courses</div></div>
            <div><div style={{ fontSize: 23, fontWeight: 650 }}>0</div><div style={{ fontSize: 12, opacity: 0.65 }}>Time Conflicts</div></div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 32, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/scheduler" className="adv-btn" style={{ display: "inline-block", padding: "13px 30px", background: colors.accent, color: colors.ink, borderRadius: radius.pill, fontWeight: 700, fontSize: 15, textDecoration: "none", boxShadow: shadow.md }}>
            UVM →
          </a>
          <a href="/unh" className="adv-btn" style={{ display: "inline-block", padding: "13px 30px", background: colors.unh, color: "#fff", borderRadius: radius.pill, fontWeight: 700, fontSize: 15, textDecoration: "none", boxShadow: shadow.md }}>
            UNH →
          </a>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "88px 24px", maxWidth: 940, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", margin: "0 0 60px", fontSize: 30, fontWeight: 650, color: colors.ink, letterSpacing: "-0.7px" }}>
          How it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 28 }}>
          {[
            { step: "1", title: "Upload your degree audit", desc: "Log into myUVM, download your degree audit as a PDF, and drop it in." },
            { step: "2", title: "Block off your time", desc: "Mark times you're unavailable — work, practice, sleep — and we'll work around them." },
            { step: "3", title: "Get your schedule", desc: "AI picks the best sections for you: no conflicts, right credit load, degree progress first." },
          ].map(({ step, title, desc }) => (
            <div key={step} className="adv-card" style={{ background: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, padding: "30px 26px", boxShadow: shadow.sm }}>
              <div style={{ width: 34, height: 34, background: colors.accent, borderRadius: radius.sm, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, color: colors.ink, marginBottom: 18 }}>
                {step}
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 650, color: colors.ink }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: colors.textMuted, lineHeight: 1.65 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section style={{ background: colors.surface, borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: "84px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 18px", fontSize: 27, fontWeight: 650, color: colors.ink, letterSpacing: "-0.5px" }}>
            Free — because it should be.
          </h2>
          <p style={{ margin: 0, fontSize: 16, color: colors.textMuted, lineHeight: 1.75 }}>
            Advisle was built by UVM students who were tired of spending hours manually cross-referencing course catalogs, RateMyProfessors, and degree audits. We built the tool we wished existed — and we&rsquo;re keeping it free for every student who needs it.
          </p>
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ padding: "84px 24px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 25, fontWeight: 650, color: colors.ink, letterSpacing: "-0.5px" }}>
          Ready to build your schedule?
        </h2>
        <p style={{ margin: "0 0 30px", fontSize: 15, color: colors.textMuted }}>Takes about 60 seconds.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/scheduler" className="adv-btn" style={{ display: "inline-block", padding: "15px 34px", background: colors.ink, color: "#fff", borderRadius: radius.pill, fontWeight: 650, fontSize: 15, textDecoration: "none", boxShadow: shadow.glow }}>
            UVM →
          </a>
          <a href="/unh" className="adv-btn" style={{ display: "inline-block", padding: "15px 34px", background: colors.unh, color: "#fff", borderRadius: radius.pill, fontWeight: 650, fontSize: 15, textDecoration: "none", boxShadow: shadow.md }}>
            UNH →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${colors.border}`, padding: "36px 24px", textAlign: "center", color: colors.textFaint, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSeXvQyk9CIsPIAnUdSFGsLS0701bAVXFaaS-Z1wtivma_Um0g/viewform?usp=publish-editor"
            target="_blank"
            rel="noopener noreferrer"
            className="adv-btn"
            style={{ display: "inline-block", padding: "9px 20px", background: "#2563eb", color: "#fff", borderRadius: radius.pill, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            Give Feedback
          </a>
          <a
            href="https://www.instagram.com/advisle?igsh=MWZoc3Z1bTU0d2kydw=="
            target="_blank"
            rel="noopener noreferrer"
            className="adv-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", color: "#fff", borderRadius: radius.pill, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            <IconInstagram />
            Follow us
          </a>
        </div>
        <p style={{ margin: 0 }}>Advisle is a student-built tool and is not affiliated with the University of Vermont. Always verify your schedule with your academic advisor before registering.</p>
      </footer>

    </div>
  );
}
