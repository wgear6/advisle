"use client";
import { useState, useCallback, useRef } from "react";
import type { ParsedAudit } from "@/lib/audit-schema";

// ─── UNH brand colors ─────────────────────────────────────────────────────────
const UNH_BLUE = "#003C71";
const UNH_GOLD = "#F5A800";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockedTime {
  day: string;
  startTime: string;
  endTime: string;
}

interface ScheduledCourse {
  subject: string;
  number: string;
  title: string;
  crn: string;
  section: string;
  type: string;
  startTime: string;
  endTime: string;
  days: string[];
  credits: number;
  instructor: string;
  requirement_category: string;
  isFull: boolean;
  seatsAvailable: number;
}

interface GeneratedSchedule {
  recommended_schedule: ScheduledCourse[];
  total_credits: number;
  notes: string;
  unscheduled_courses: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = { M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday" };
const TIME_SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"];
const formatTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h > 12 ? h - 12 : h || 12}:${m.toString().padStart(2, "0")} ${suffix}`;
};

const CATEGORY_COLORS: Record<string, string> = {
  "Major Core": "#2563eb",
  "Major Elective": "#7c3aed",
  "General Education": "#059669",
  "Free Elective": "#d97706",
  "Pinned": "#0891b2",
  "Other": "#6b7280",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnhScheduler() {
  const [step, setStep] = useState(1);
  const [audit, setAudit] = useState<ParsedAudit | null>(null);
  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 options
  const [targetCredits, setTargetCredits] = useState(15);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [blockDay, setBlockDay] = useState("M");
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("10:00");
  const [customNotes, setCustomNotes] = useState("");
  const [pinnedCrns, setPinnedCrns] = useState<string[]>([]);
  const [pinnedCrnInput, setPinnedCrnInput] = useState("");

  // ── Upload ──
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/unh/parse-audit", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to parse audit");
      }
      const data: ParsedAudit = await res.json();
      setAudit(data);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read audit");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Blocked times ──
  const addBlock = () => {
    if (blockStart >= blockEnd) return;
    setBlockedTimes((prev) => [...prev, { day: blockDay, startTime: blockStart, endTime: blockEnd }]);
  };
  const removeBlock = (i: number) => setBlockedTimes((prev) => prev.filter((_, idx) => idx !== i));

  // ── Pinned CRNs ──
  const addPinnedCrn = () => {
    const crn = pinnedCrnInput.trim();
    if (!crn || pinnedCrns.includes(crn)) return;
    setPinnedCrns((prev) => [...prev, crn]);
    setPinnedCrnInput("");
  };

  // ── Generate ──
  const generateSchedule = async () => {
    if (!audit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/unh/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remaining_courses: audit.remaining_courses,
          completed_courses: audit.completed_courses ?? [],
          in_progress_courses: audit.in_progress_courses ?? [],
          blocked_times: blockedTimes,
          pinned_crns: pinnedCrns,
          target_credits: targetCredits,
          credits_completed: audit.credits_completed ?? null,
          major: audit.major ?? null,
          custom_notes: customNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "unh_data_unavailable") {
          setError("unh_coming_soon");
        } else {
          throw new Error(data.message ?? "Failed to generate schedule");
        }
        return;
      }
      setSchedule(data);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate schedule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#111827" }}>

      {/* Header */}
      <header style={{ background: UNH_BLUE, color: "#fff", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "#fff" }}>
          <div style={{ width: 32, height: 32, background: UNH_GOLD, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: UNH_BLUE }}>A</div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Advisle</span>
        </a>
        <span style={{ fontSize: 13, opacity: 0.7, marginLeft: 4 }}>for UNH</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 24, fontSize: 13, opacity: 0.8 }}>
          {step >= 1 && <span style={{ fontWeight: step === 1 ? 700 : 400, opacity: step === 1 ? 1 : 0.6 }}>1. Upload Audit</span>}
          {step >= 2 && <span style={{ fontWeight: step === 2 ? 700 : 400, opacity: step === 2 ? 1 : 0.6 }}>2. Preferences</span>}
          {step >= 3 && <span style={{ fontWeight: step === 3 ? 700 : 400, opacity: step === 3 ? 1 : 0.6 }}>3. Schedule</span>}
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800, color: UNH_BLUE }}>Build your UNH schedule</h1>
              <p style={{ margin: 0, fontSize: 15, color: "#6b7280" }}>
                Upload your UNH degree audit PDF and we&apos;ll build a conflict-free Fall 2026 schedule.
              </p>
              <a
                href="https://my.unh.edu"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: UNH_BLUE, opacity: 0.8, textDecoration: "underline" }}
              >
                Get your degree audit from myUNH →
              </a>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? UNH_BLUE : "#d1d5db"}`,
                borderRadius: 16, padding: "56px 24px", textAlign: "center",
                background: dragOver ? "#eff6ff" : "#fff", cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {loading ? (
                <p style={{ margin: 0, fontSize: 15, color: "#6b7280" }}>Reading your audit…</p>
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                  <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "#1f2937" }}>
                    Drop your degree audit PDF here
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>or click to browse</p>
                </>
              )}
            </div>

            {error && (
              <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 14, color: "#dc2626" }}>
                {error}
              </div>
            )}
          </>
        )}

        {/* ── STEP 2: Preferences ── */}
        {step === 2 && audit && (
          <>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 20 }}>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
                Parsed audit for <strong style={{ color: "#111827" }}>{audit.student_name ?? "you"}</strong>
                {audit.major && <> · <strong style={{ color: "#111827" }}>{audit.major}</strong></>}
                {audit.credits_completed !== null && <> · <strong style={{ color: "#111827" }}>{audit.credits_completed} credits completed</strong></>}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9ca3af" }}>
                {audit.remaining_courses.length} courses remaining · {audit.in_progress_courses.length} in progress
              </p>
            </div>

            {/* Target credits */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Target Credit Load</h2>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>How many credits do you want this semester?</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[12, 13, 14, 15, 16, 17, 18].map((c) => (
                  <button key={c} onClick={() => setTargetCredits(c)}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `2px solid ${targetCredits === c ? UNH_BLUE : "#e5e7eb"}`, background: targetCredits === c ? "#e8f0fb" : "#fff", color: targetCredits === c ? UNH_BLUE : "#374151", fontWeight: targetCredits === c ? 700 : 400, fontSize: 14, cursor: "pointer" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Blocked times */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Block Off Times <span style={{ fontSize: 13, fontWeight: 400, color: "#9ca3af" }}>— optional</span></h2>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>Times you can&apos;t have class (work, sports, etc.)</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <select value={blockDay} onChange={(e) => setBlockDay(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}>
                  {Object.entries(DAY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={blockStart} onChange={(e) => setBlockStart(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}>
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
                <span style={{ alignSelf: "center", color: "#6b7280", fontSize: 14 }}>to</span>
                <select value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}>
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
                <button onClick={addBlock}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: UNH_BLUE, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  + Add Block
                </button>
              </div>
              {blockedTimes.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, flex: 1 }}>🚫 <strong>{DAY_LABELS[b.day]}</strong> · {formatTime(b.startTime)} – {formatTime(b.endTime)}</span>
                  <button onClick={() => removeBlock(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d97706", fontSize: 16 }}>×</button>
                </div>
              ))}
              {blockedTimes.length === 0 && <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No blocked times — all slots open.</p>}
            </div>

            {/* Pinned CRNs */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Pin Specific Sections <span style={{ fontSize: 13, fontWeight: 400, color: "#9ca3af" }}>— optional</span></h2>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>Have a section you need? Enter its CRN.</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input type="text" value={pinnedCrnInput} onChange={(e) => setPinnedCrnInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addPinnedCrn(); }}
                  placeholder="e.g. 12345" maxLength={6}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, flex: 1 }} />
                <button onClick={addPinnedCrn}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: UNH_BLUE, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  + Pin
                </button>
              </div>
              {pinnedCrns.map((crn) => (
                <div key={crn} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, flex: 1 }}>📌 CRN {crn}</span>
                  <button onClick={() => setPinnedCrns((p) => p.filter((c) => c !== crn))} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Anything else to know?</h2>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>
                E.g. &quot;I&apos;m taking MATH 425 so that prereq is satisfied&quot;, &quot;avoid 8am classes&quot;, etc.
              </p>
              <textarea value={customNotes} onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Optional notes for the AI…" rows={3}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {error === "unh_coming_soon" && (
              <div style={{ padding: "16px 20px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12, fontSize: 14, color: "#92400e", lineHeight: 1.6 }}>
                <strong>UNH schedule generation is coming soon!</strong><br />
                We&apos;re working on loading UNH course data. Your audit was parsed successfully — check back soon and we&apos;ll be able to build your full schedule.
              </div>
            )}

            {error && error !== "unh_coming_soon" && (
              <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 14, color: "#dc2626" }}>{error}</div>
            )}

            <button onClick={generateSchedule} disabled={loading}
              style={{ padding: 14, borderRadius: 8, border: "none", background: loading ? "#e5e7eb" : UNH_BLUE, color: loading ? "#9ca3af" : "#fff", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Building your schedule…" : "Generate My Schedule →"}
            </button>
          </>
        )}

        {/* ── STEP 3: Schedule ── */}
        {step === 3 && schedule && (
          <>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Your Recommended Schedule</h2>
                  <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{schedule.total_credits} credits · Fall 2026</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setSchedule(null); generateSchedule(); }} disabled={loading}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: UNH_BLUE, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    ↺ Regenerate
                  </button>
                  <button onClick={() => { setStep(2); setSchedule(null); }}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, cursor: "pointer" }}>
                    ← Adjust
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {schedule.recommended_schedule.map((c, i) => (
                  <div key={i} style={{ borderRadius: 10, border: `1px solid ${CATEGORY_COLORS[c.requirement_category] ?? "#e5e7eb"}30`, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "stretch" }}>
                      <div style={{ width: 4, background: CATEGORY_COLORS[c.requirement_category] ?? "#6b7280", flexShrink: 0 }} />
                      <div style={{ padding: "14px 16px", flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{c.subject} {c.number}</span>
                            <span style={{ marginLeft: 10, fontSize: 13, color: "#6b7280" }}>{c.credits} cr</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${CATEGORY_COLORS[c.requirement_category] ?? "#6b7280"}18`, color: CATEGORY_COLORS[c.requirement_category] ?? "#6b7280" }}>
                            {c.requirement_category}
                          </span>
                        </div>
                        <p style={{ margin: "4px 0 6px", fontSize: 14, color: "#374151" }}>{c.title}</p>
                        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                          {c.days?.join(" ") || "TBA"} · {c.startTime && c.startTime !== "TBA" ? `${formatTime(c.startTime)} – ${formatTime(c.endTime)}` : "TBA"}
                          {c.instructor && c.instructor !== ".. Staff" && <> · {c.instructor}</>}
                          <span style={{ marginLeft: 8, color: "#9ca3af" }}>CRN {c.crn}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {schedule.unscheduled_courses?.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 20 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#374151" }}>Courses not scheduled</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {schedule.unscheduled_courses.map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#6b7280", padding: "6px 10px", background: "#f9fafb", borderRadius: 6 }}>• {c}</div>
                  ))}
                </div>
              </div>
            )}

            {schedule.notes && (
              <div style={{ background: "#f0f9ff", borderRadius: 12, border: "1px solid #bae6fd", padding: 20 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#0369a1" }}>Advisor Notes</h3>
                <p style={{ margin: 0, fontSize: 14, color: "#0c4a6e", lineHeight: 1.6 }}>{schedule.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
