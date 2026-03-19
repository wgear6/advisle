"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RemainingCourse {
  subject: string;
  number: string;
  title: string;
  credits: number;
  requirement_category: string;
}

interface ParsedAudit {
  remaining_courses: RemainingCourse[];
  in_progress_courses: { subject: string; number: string; title: string; credits: number }[];
  completed_courses: { subject: string; number: string; title: string; credits?: number }[];
  student_name: string | null;
  major: string | null;
  credits_completed: number | null;
  credits_remaining: number | null;
}

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
  days: string[];
  startTime: string;
  endTime: string;
  instructor: string;
  credits: number;
  building: string;
  room: string;
  requirement_category: string;
}

interface RMPRating {
  firstName: string;
  lastName: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
}

interface GeneratedSchedule {
  recommended_schedule: ScheduledCourse[];
  total_credits: number;
  notes: string;
  unscheduled_courses: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["M", "T", "W", "R", "F"];
const DAY_LABELS: Record<string, string> = {
  M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday",
};

const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const totalMin = 7 * 60 + i * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}); // 07:00 – 20:30 in 30-min steps

const CATEGORY_COLORS: Record<string, string> = {
  "Major Core": "#2563eb",
  "Major Elective": "#7c3aed",
  "General Education": "#059669",
  "Free Elective": "#d97706",
  Other: "#6b7280",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ─── Components ───────────────────────────────────────────────────────────────

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: done ? "#059669" : active ? "#2563eb" : "#e5e7eb",
        color: done || active ? "#fff" : "#9ca3af",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, flexShrink: 0,
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? "#111" : "#6b7280" }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [audit, setAudit] = useState<ParsedAudit | null>(null);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [rmpRatings, setRmpRatings] = useState<Record<string, RMPRating | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Blocked time form state
  const [blockDay, setBlockDay] = useState("M");
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("17:00");

  // ── Step 1: Upload & Parse ──

  const handleFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const parseAudit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-audit", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Failed to parse PDF");
      const data: ParsedAudit = await res.json();
      setAudit(data);
      setStep(2);
    } catch (e) {
      setError("Could not parse your degree audit. Make sure it's a UVM audit PDF.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Block Times ──

  const addBlock = () => {
    if (blockStart >= blockEnd) {
      setError("End time must be after start time.");
      return;
    }
    setBlockedTimes((prev) => [...prev, { day: blockDay, startTime: blockStart, endTime: blockEnd }]);
    setError(null);
  };

  const removeBlock = (i: number) => {
    setBlockedTimes((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ── Step 3: Generate Schedule ──

  const generateSchedule = async () => {
    if (!audit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remaining_courses: audit.remaining_courses,
          completed_courses: audit.completed_courses ?? [],
          in_progress_courses: audit.in_progress_courses ?? [],
          blocked_times: blockedTimes,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate schedule");
      const data: GeneratedSchedule = await res.json();
      setSchedule(data);
      setStep(3);

      // Save schedule to get shareable link
      fetch("/api/save-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: data, audit }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.id) setScheduleId(d.id); })
        .catch(() => {});

      // Fetch RMP ratings for all instructors in background
      const instructors = [...new Set(
        data.recommended_schedule
          .map((c) => c.instructor)
          .filter((i) => i && i !== "TBA" && i !== ".. Staff")
      )];
      if (instructors.length > 0) {
        fetch("/api/rmp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instructors }),
        })
          .then((r) => r.json())
          .then((d) => setRmpRatings(d.ratings ?? {}))
          .catch(() => {});
      }
    } catch (e) {
      setError("Could not generate schedule. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <header style={{ background: "#1e3a5f", color: "#fff", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 36, height: 36, background: "#f8b400", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "#1e3a5f" }}>
          A
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Advisle</h1>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>AI-powered course scheduling for University of Vermont students</p>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>

        {/* Steps */}
        <div style={{ display: "flex", gap: 24, marginBottom: 32, padding: "16px 24px", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <Step n={1} label="Upload Audit" active={step === 1} done={step > 1} />
          <div style={{ width: 40, height: 1, background: "#e5e7eb", alignSelf: "center" }} />
          <Step n={2} label="Block Times" active={step === 2} done={step > 2} />
          <div style={{ width: 40, height: 1, background: "#e5e7eb", alignSelf: "center" }} />
          <Step n={3} label="View Schedule" active={step === 3} done={false} />
        </div>

        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#dc2626", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 32 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Upload Your Degree Audit</h2>
            <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: 14 }}>
              Log into myUVM → Student Records → Degree Audit → Print/Export as PDF. Then upload it here.
            </p>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById("file-input")?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#2563eb" : file ? "#059669" : "#d1d5db"}`,
                borderRadius: 10,
                padding: "48px 32px",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "#eff6ff" : file ? "#f0fdf4" : "#fafafa",
                transition: "all 0.15s",
                marginBottom: 24,
              }}
            >
              <input
                id="file-input"
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div style={{ fontSize: 36, marginBottom: 12 }}>{file ? "✅" : "📄"}</div>
              {file ? (
                <>
                  <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#059669" }}>{file.name}</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Click to choose a different file</p>
                </>
              ) : (
                <>
                  <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Drop your degree audit PDF here</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>or click to browse</p>
                </>
              )}
            </div>

            <button
              onClick={parseAudit}
              disabled={!file || loading}
              style={{
                width: "100%", padding: "14px", borderRadius: 8, border: "none",
                background: file && !loading ? "#2563eb" : "#e5e7eb",
                color: file && !loading ? "#fff" : "#9ca3af",
                fontWeight: 700, fontSize: 15, cursor: file && !loading ? "pointer" : "not-allowed",
                transition: "background 0.15s",
              }}
            >
              {loading ? "Analyzing your degree audit…" : "Analyze Degree Audit →"}
            </button>
          </div>
        )}

        {/* ── STEP 2: Block Times ── */}
        {step === 2 && audit && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Audit summary */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>
                {audit.student_name ? `${audit.student_name}'s` : "Your"} Remaining Courses
              </h2>
              {audit.major && <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>Major: <strong>{audit.major}</strong></p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {audit.remaining_courses.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                    <span style={{ fontWeight: 700, color: "#1e3a5f", minWidth: 100, fontSize: 14 }}>{c.subject} {c.number}</span>
                    <span style={{ flex: 1, fontSize: 14, color: "#1f2937" }}>{c.title}</span>
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 99, background: CATEGORY_COLORS[c.requirement_category] + "20", color: CATEGORY_COLORS[c.requirement_category], fontWeight: 600, whiteSpace: "nowrap" }}>
                      {c.requirement_category}
                    </span>
                    <span style={{ fontSize: 13, color: "#6b7280", minWidth: 50, textAlign: "right" }}>{c.credits} cr</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Block times */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Block Off Unavailable Times</h2>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>
                Add times when you can't take classes (work, commute, appointments, etc.)
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <select value={blockDay} onChange={(e) => setBlockDay(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, background: "#fff" }}>
                  {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                </select>
                <select value={blockStart} onChange={(e) => setBlockStart(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, background: "#fff" }}>
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
                <span style={{ alignSelf: "center", color: "#6b7280", fontSize: 14 }}>to</span>
                <select value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, background: "#fff" }}>
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
                <button onClick={addBlock}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  + Add Block
                </button>
              </div>

              {blockedTimes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {blockedTimes.map((b, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#fef3c7", borderRadius: 8, border: "1px solid #fde68a" }}>
                      <span style={{ fontSize: 14, flex: 1, color: "#1f2937" }}>
                        🚫 <strong>{DAY_LABELS[b.day]}</strong> · {formatTime(b.startTime)} – {formatTime(b.endTime)}
                      </span>
                      <button onClick={() => removeBlock(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#d97706", fontSize: 16, padding: "0 4px" }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {blockedTimes.length === 0 && (
                <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No blocked times added — all time slots are open.</p>
              )}
            </div>

            <button
              onClick={generateSchedule}
              disabled={loading}
              style={{
                padding: "14px", borderRadius: 8, border: "none",
                background: loading ? "#e5e7eb" : "#1e3a5f",
                color: loading ? "#9ca3af" : "#fff",
                fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Building your schedule…" : "Generate My Schedule →"}
            </button>
          </div>
        )}

        {/* ── STEP 3: Schedule ── */}
        {step === 3 && schedule && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Your Recommended Schedule</h2>
                  <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{schedule.total_credits} credits · Fall 2026</p>
                </div>
                <button
                  onClick={() => { setStep(2); setSchedule(null); setScheduleId(null); }}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, cursor: "pointer" }}>
                  ← Adjust
                </button>
              </div>
              {scheduleId && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#166534" }}>🔗 Share this schedule:</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                    <code style={{ fontSize: 12, color: "#166534", background: "#dcfce7", padding: "2px 8px", borderRadius: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      advisle.com/schedule/{scheduleId}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`https://advisle.com/schedule/${scheduleId}`)}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {schedule.recommended_schedule.map((c, i) => (
                  <div key={i} style={{ borderRadius: 10, border: `1px solid ${CATEGORY_COLORS[c.requirement_category] ?? "#e5e7eb"}30`, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "stretch" }}>
                      <div style={{ width: 4, background: CATEGORY_COLORS[c.requirement_category] ?? "#6b7280", flexShrink: 0 }} />
                      <div style={{ padding: "14px 16px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, color: "#1e3a5f", fontSize: 15 }}>{c.subject} {c.number}</span>
                            <span style={{ fontSize: 15, marginLeft: 8, color: "#1f2937" }}>{c.title}</span>
                          </div>
                          <span style={{ fontSize: 13, color: "#6b7280", flexShrink: 0, marginLeft: 12 }}>{c.credits} credits</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#4b5563" }}>
                          <span>📅 {c.days.map((d) => DAY_LABELS[d]?.slice(0, 3)).join(", ")} · {formatTime(c.startTime)} – {formatTime(c.endTime)}</span>
                          <span>📍 {c.building} {c.room}</span>
                          <span>👤 {c.instructor || "TBA"}
                            {rmpRatings[c.instructor] && (
                              <span style={{ marginLeft: 8, display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <span style={{ background: rmpRatings[c.instructor]!.avgRating >= 4 ? "#dcfce7" : rmpRatings[c.instructor]!.avgRating >= 3 ? "#fef9c3" : "#fee2e2", color: rmpRatings[c.instructor]!.avgRating >= 4 ? "#166534" : rmpRatings[c.instructor]!.avgRating >= 3 ? "#854d0e" : "#991b1b", padding: "1px 6px", borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                                  ⭐ {rmpRatings[c.instructor]!.avgRating.toFixed(1)}
                                </span>
                                <span style={{ color: "#9ca3af", fontSize: 12 }}>
                                  😅 {rmpRatings[c.instructor]!.avgDifficulty.toFixed(1)} · {rmpRatings[c.instructor]!.numRatings} ratings
                                </span>
                              </span>
                            )}
                          </span>
                          <span style={{ color: "#6b7280" }}>CRN: {c.crn}</span>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: (CATEGORY_COLORS[c.requirement_category] ?? "#6b7280") + "15", color: CATEGORY_COLORS[c.requirement_category] ?? "#6b7280", fontWeight: 600 }}>
                            {c.requirement_category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {schedule.notes && (
                <div style={{ marginTop: 16, padding: "12px 16px", background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd", fontSize: 14, color: "#0369a1" }}>
                  💡 {schedule.notes}
                </div>
              )}

              {schedule.unscheduled_courses?.length > 0 && (
                <div style={{ marginTop: 12, padding: "12px 16px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", fontSize: 14, color: "#9a3412" }}>
                  <strong>⚠️ Could not schedule:</strong> {schedule.unscheduled_courses.join(", ")}
                  <p style={{ margin: "4px 0 0", fontSize: 13 }}>These courses may have no available sections that fit your blocked times, or may not be offered this semester.</p>
                </div>
              )}
            </div>

            {/* Summary bar */}
            <div style={{ background: "#1e3a5f", color: "#fff", borderRadius: 12, padding: "16px 24px", display: "flex", gap: 32 }}>
              <div><div style={{ fontSize: 24, fontWeight: 800 }}>{schedule.total_credits}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Total Credits</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800 }}>{schedule.recommended_schedule.length}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Courses</div></div>
              {blockedTimes.length > 0 && <div><div style={{ fontSize: 24, fontWeight: 800 }}>{blockedTimes.length}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Time Blocks Applied</div></div>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
