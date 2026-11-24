"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { colors, radius, shadow } from "@/lib/theme";

const RATE_LIMIT_MSG = "You've hit the hourly limit — please wait a bit and try again.";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditCourse {
  subject: string;
  number: string;
  title: string;
  credits?: number;
}

interface ParsedAudit {
  remaining_courses: (AuditCourse & { credits: number; requirement_category: string })[];
  in_progress_courses: AuditCourse[];
  completed_courses: AuditCourse[];
  student_name: string | null;
  major: string | null;
  credits_completed: number | null;
  credits_remaining: number | null;
}

interface RequirementStatus {
  label: string;
  done: boolean;
  satisfied_by: string | null;
  options: string[];
}

interface MinorSuggestion {
  name: string;
  courses_needed: number;
  courses_satisfied: number;
  total_specific_courses: number;
  elective_credits: number;
  total_credits_needed: number;
  total_credits: number;
  missing_required: { subject: string; number: string; title: string; credits: number; requirement_category: string }[];
  elective_note: string;
  requirements: RequirementStatus[];
}

type Filter = "all" | "close" | "started";

// Shared with app/scheduler/page.tsx — hands the parsed audit + chosen minors over
// so the student doesn't have to re-upload their PDF.
const HANDOFF_KEY = "advisle:pathfinder-handoff";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isComplete(s: MinorSuggestion) {
  return s.courses_needed === 0 && s.elective_credits === 0;
}
function isClose(s: MinorSuggestion) {
  return !isComplete(s) && s.total_credits_needed <= 9;
}
function progressPct(s: MinorSuggestion) {
  if (isComplete(s)) return 100;
  if (!s.total_credits) return 0;
  const pct = Math.round(((s.total_credits - s.total_credits_needed) / s.total_credits) * 100);
  return Math.max(0, Math.min(99, pct));
}

function IconCompass() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PathfinderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<ParsedAudit | null>(null);
  const [results, setResults] = useState<MinorSuggestion[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const handleFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-audit", { method: "POST", body: fd });
      if (res.status === 429) throw new Error(RATE_LIMIT_MSG);
      if (!res.ok) throw new Error("parse failed");
      const data: ParsedAudit = await res.json();

      const mres = await fetch("/api/minor-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed_courses: data.completed_courses ?? [],
          in_progress_courses: data.in_progress_courses ?? [],
          major: data.major ?? null,
          all: true,
        }),
      });
      if (!mres.ok) throw new Error("minors failed");
      const m = await mres.json();
      setAudit(data);
      setResults(m.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error && e.message === RATE_LIMIT_MSG ? RATE_LIMIT_MSG : "Could not read your degree audit. Make sure it's a UVM degree audit PDF.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setAudit(null);
    setResults(null);
    setSelected([]);
    setExpanded(null);
    setQuery("");
    setFilter("all");
  };

  const toggleSelect = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const planIt = () => {
    if (!audit || !results) return;
    const minors = results.filter((r) => selected.includes(r.name));
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ audit, minors, at: Date.now() }));
    } catch {
      // storage blocked — scheduler will just ask for the PDF again
    }
    window.location.href = "/scheduler";
  };

  const counts = useMemo(() => {
    const r = results ?? [];
    return {
      complete: r.filter(isComplete).length,
      close: r.filter(isClose).length,
      started: r.filter((s) => s.courses_satisfied > 0 && !isComplete(s)).length,
    };
  }, [results]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (results ?? [])
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .filter((s) => {
        if (filter === "close") return isClose(s) || isComplete(s);
        if (filter === "started") return s.courses_satisfied > 0;
        return true;
      });
  }, [results, query, filter]);

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(30,58,95,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", gap: 14,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <div style={{ width: 32, height: 32, background: colors.accent, borderRadius: radius.sm, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: colors.ink }}>
            A
          </div>
          <span style={{ fontWeight: 650, fontSize: 17, letterSpacing: "-0.3px", color: "#fff" }}>Advisle</span>
        </Link>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 20 }}>·</span>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Pathfinder</span>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 16px 72px" }}>
        {/* ── Upload state ── */}
        {!results && (
          <>
            <div className="fade-up" style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ width: 52, height: 52, margin: "0 auto 18px", borderRadius: radius.md, background: `${colors.accent}22`, color: colors.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconCompass />
              </div>
              <h1 style={{ margin: "0 0 12px", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 650, color: colors.ink, letterSpacing: "-0.8px", lineHeight: 1.15 }}>
                You might be closer to a minor than you think.
              </h1>
              <p style={{ margin: "0 auto", maxWidth: 560, fontSize: 16, color: colors.textMuted, lineHeight: 1.65 }}>
                Pathfinder checks your degree audit against every UVM minor and shows exactly how far you are from each one — what counts, what&rsquo;s left, and how many credits it&rsquo;d take. Use it any time of year.
              </p>
            </div>

            <div className="fade-up" style={{ background: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.md, padding: 24, animationDelay: "0.08s" }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => document.getElementById("pf-file")?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "#2563eb" : file ? "#059669" : "#d1d5db"}`,
                  background: dragOver ? "#eff6ff" : file ? "#f0fdf4" : "#fafafa",
                  borderRadius: radius.md, padding: "40px 20px", textAlign: "center", cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <input id="pf-file" type="file" accept="application/pdf" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {file ? (
                  <>
                    <div style={{ fontWeight: 650, color: "#059669", fontSize: 15 }}>{file.name}</div>
                    <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>Click to choose a different file</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 650, color: colors.ink, fontSize: 15 }}>Drop your UVM degree audit PDF here</div>
                    <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>or click to browse</div>
                  </>
                )}
              </div>

              {error && <p style={{ margin: "14px 0 0", color: "#dc2626", fontSize: 14 }}>{error}</p>}

              <button
                onClick={run}
                disabled={!file || loading}
                className="adv-btn"
                style={{
                  marginTop: 18, width: "100%", padding: "14px", border: "none", borderRadius: radius.pill,
                  background: file && !loading ? colors.ink : "#cbd5e1", color: "#fff", fontWeight: 650, fontSize: 15,
                  cursor: file && !loading ? "pointer" : "not-allowed", boxShadow: file ? shadow.glow : "none",
                }}
              >
                {loading ? "Reading your audit…" : "Find my paths →"}
              </button>

              <p style={{ margin: "14px 0 0", fontSize: 12, color: colors.textFaint, textAlign: "center", lineHeight: 1.6 }}>
                In myUVM: Degree Audit → run your audit → Save as PDF. Your audit is only used to compute results and isn&rsquo;t stored.
              </p>
            </div>
          </>
        )}

        {/* ── Results ── */}
        {results && (
          <div className="fade-up">
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
              <div>
                <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 650, color: colors.ink, letterSpacing: "-0.6px" }}>Your paths</h1>
                <p style={{ margin: 0, fontSize: 14, color: colors.textMuted }}>
                  {audit?.major ? `${audit.major} · ` : ""}Sorted by fewest credits to finish
                </p>
              </div>
              <button onClick={reset} style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0 }}>
                Upload a different audit
              </button>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
              {[
                { n: counts.complete, label: "Already complete", color: "#15803d" },
                { n: counts.close, label: "Within 9 credits", color: "#b45309" },
                { n: counts.started, label: "In progress", color: colors.ink },
              ].map((t) => (
                <div key={t.label} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "16px 18px", boxShadow: shadow.sm }}>
                  <div style={{ fontSize: 26, fontWeight: 650, color: t.color }}>{t.n}</div>
                  <div style={{ fontSize: 13, color: colors.textMuted }}>{t.label}</div>
                </div>
              ))}
            </div>

            {/* Search + filters */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search minors…"
                style={{ flex: "1 1 220px", minWidth: 0, padding: "10px 14px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, fontSize: 14, background: colors.surface, color: colors.text }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  ["all", "All"],
                  ["close", "Within reach"],
                  ["started", "Started"],
                ] as [Filter, string][]).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    style={{
                      padding: "8px 14px", borderRadius: radius.pill, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${filter === k ? colors.ink : colors.border}`,
                      background: filter === k ? colors.ink : colors.surface, color: filter === k ? "#fff" : "#374151",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Minor list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: selected.length ? 90 : 0 }}>
              {visible.length === 0 && (
                <p style={{ textAlign: "center", color: colors.textFaint, fontSize: 14, padding: 24 }}>No minors match.</p>
              )}
              {visible.map((s) => {
                const done = isComplete(s);
                const close = isClose(s);
                const pct = progressPct(s);
                const open = expanded === s.name;
                const isSel = selected.includes(s.name);
                return (
                  <div key={s.name} style={{
                    background: colors.surface, borderRadius: radius.md, boxShadow: shadow.sm,
                    border: `1px solid ${isSel ? "#2563eb" : colors.border}`,
                  }}>
                    <div
                      onClick={() => setExpanded(open ? null : s.name)}
                      style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          <span style={{ fontWeight: 650, fontSize: 15, color: colors.ink }}>{s.name}</span>
                          {done ? (
                            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: radius.pill, background: "#dcfce7", color: "#15803d", fontWeight: 600 }}>Complete — declare it!</span>
                          ) : (
                            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: radius.pill, background: close ? "#fef3c7" : "#f1f5f9", color: close ? "#92400e" : "#4b5563", fontWeight: 600 }}>
                              ~{s.total_credits_needed} cr to go
                            </span>
                          )}
                          {!done && (
                            <span style={{ fontSize: 12, fontWeight: 650, color: close ? "#92400e" : colors.textMuted }}>
                              {pct}% done
                            </span>
                          )}
                        </div>
                        <div style={{ height: 6, background: "#eef2f7", borderRadius: radius.pill, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: done ? "#16a34a" : close ? colors.accent : colors.ink, borderRadius: radius.pill, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: colors.textMuted }}>
                          {s.total_specific_courses > 0
                            ? `${s.courses_satisfied} of ${s.total_specific_courses} specific requirements met`
                            : "Elective-based minor"}
                          {s.elective_credits > 0 ? ` · ${s.elective_credits} elective cr.` : ""}
                        </div>
                      </div>
                      <span style={{ color: colors.textFaint, fontSize: 14, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>›</span>
                    </div>

                    {open && (
                      <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${colors.border}` }}>
                        <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                          {s.requirements.map((r, i) => (
                            <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                              <span style={{
                                width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: r.done ? "#dcfce7" : "#f1f5f9", color: r.done ? "#15803d" : colors.textFaint,
                                border: r.done ? "none" : `1px solid ${colors.border}`,
                              }}>
                                {r.done && <IconCheck />}
                              </span>
                              <div style={{ color: r.done ? colors.textMuted : colors.text }}>
                                <div style={{ fontWeight: 550 }}>{r.label}</div>
                                {r.done && r.satisfied_by && r.options.length > 1 && (
                                  <div style={{ fontSize: 12, color: "#15803d" }}>Met by {r.satisfied_by}</div>
                                )}
                                {!r.done && r.options.length > 1 && (
                                  <div style={{ fontSize: 12, color: colors.textMuted }}>Options: {r.options.join(", ")}</div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                        {s.elective_note && (
                          <p style={{ margin: "12px 0 0", fontSize: 12, color: colors.textMuted, lineHeight: 1.6 }}>{s.elective_note}</p>
                        )}
                        {!done && (
                          <button
                            onClick={() => toggleSelect(s.name)}
                            className="adv-btn"
                            style={{
                              marginTop: 14, padding: "8px 16px", borderRadius: radius.pill, fontWeight: 600, fontSize: 13, cursor: "pointer",
                              border: `1px solid ${isSel ? "#2563eb" : "#d1d5db"}`, background: isSel ? "#2563eb" : "#fff", color: isSel ? "#fff" : "#374151",
                            }}>
                            {isSel ? "✓ Added to plan" : "+ Add to my schedule plan"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p style={{ margin: "24px 0 0", fontSize: 12, color: colors.textFaint, textAlign: "center", lineHeight: 1.6 }}>
              Estimates based on UVM catalog requirements. Some minors have extra rules (level, residency, GPA) — confirm with your advisor before declaring.
            </p>
          </div>
        )}
      </div>

      {/* Sticky plan bar */}
      {results && selected.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, padding: "12px 16px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderTop: `1px solid ${colors.border}` }}>
          <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: colors.ink, fontWeight: 550 }}>
              {selected.length} minor{selected.length !== 1 ? "s" : ""} selected
            </span>
            <button onClick={planIt} className="adv-btn" style={{ padding: "11px 22px", border: "none", borderRadius: radius.pill, background: colors.accent, color: colors.ink, fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: shadow.md }}>
              Build a schedule with {selected.length === 1 ? "it" : "them"} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
