"use client";
import { useState, useCallback } from "react";
import type { ParsedAudit } from "@/lib/audit-schema";

// ─── UNH brand colors ─────────────────────────────────────────────────────────
const UNH_BLUE = "#003C71";
const UNH_GOLD = "#F5A800";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RemainingCourse {
  subject: string;
  number: string;
  title: string;
  credits: number;
  requirement_category: string;
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
  type: string;
  startTime: string;
  endTime: string;
  days: string[];
  credits: number;
  building: string;
  room: string;
  instructor: string;
  requirement_category: string;
  isFull: boolean;
  maxEnrollment?: number;
  currentEnrollment?: number;
  seatsAvailable?: number;
}

interface GeneratedSchedule {
  recommended_schedule: ScheduledCourse[];
  total_credits: number;
  notes: string;
  unscheduled_courses: string[];
}

// ─── Constants & helpers ──────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday",
};

const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const totalMin = 7 * 60 + i * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

const CATEGORY_COLORS: Record<string, string> = {
  "Major Core": "#2563eb",
  "Major Elective": "#7c3aed",
  "General Education": "#059669",
  "Free Elective": "#d97706",
  "Pinned": "#0891b2",
  "Other": "#6b7280",
};

function formatTime(t: string): string {
  if (!t || t === "TBA") return "TBA";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function seatsBadge(
  max?: number, current?: number, seats?: number
): { label: string; bg: string; color: string } | null {
  if (!max || max === 0) return null;
  if (seats === 0) return { label: "Full", bg: "#fee2e2", color: "#dc2626" };
  const pctFull = (current ?? 0) / max;
  if (pctFull >= 0.75) return { label: `${seats} seats left`, bg: "#fff7ed", color: "#c2410c" };
  return { label: `${seats} / ${max} seats`, bg: "#f0fdf4", color: "#15803d" };
}

// ─── ICS Export ───────────────────────────────────────────────────────────────

const DAY_TO_RRULE: Record<string, string> = { M: "MO", T: "TU", W: "WE", R: "TH", F: "FR" };
const DAY_OFFSET: Record<string, number> = { M: 0, T: 1, W: 2, R: 3, F: 4 };

function icsDateLocal(date: Date, timeStr: string): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const [h, m] = timeStr.split(":");
  return `${y}${mo}${d}T${h}${m}00`;
}

function generateICS(schedule: GeneratedSchedule): string {
  // UNH Fall 2026: Aug 31 (Mon) – Dec 11
  const semesterStart = new Date(2026, 7, 31);
  const untilStr = "20261212T000000Z";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advisle//UNH Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Advisle UNH Fall 2026",
    "X-WR-TIMEZONE:America/New_York",
  ];

  for (const course of schedule.recommended_schedule) {
    if (!course.days?.length || !course.startTime || course.startTime === "TBA") continue;
    const sortedDays = [...course.days].sort((a, b) => (DAY_OFFSET[a] ?? 0) - (DAY_OFFSET[b] ?? 0));
    const firstDate = new Date(semesterStart);
    firstDate.setDate(semesterStart.getDate() + (DAY_OFFSET[sortedDays[0]] ?? 0));
    const byday = sortedDays.map((d) => DAY_TO_RRULE[d] ?? d).join(",");
    const location = [course.building, course.room].filter(Boolean).join(" ");
    const description = [
      `Instructor: ${course.instructor || "TBA"}`,
      `CRN: ${course.crn}`,
      `Section: ${course.section}`,
      `Category: ${course.requirement_category}`,
      `Credits: ${course.credits}`,
    ].join("\\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`DTSTART;TZID=America/New_York:${icsDateLocal(firstDate, course.startTime)}`);
    lines.push(`DTEND;TZID=America/New_York:${icsDateLocal(firstDate, course.endTime)}`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${untilStr}`);
    lines.push(`SUMMARY:${course.subject} ${course.number} - ${course.title}`);
    lines.push(`DESCRIPTION:${description}`);
    if (location) lines.push(`LOCATION:${location}`);
    lines.push(`UID:advisle-unh-${course.crn}-fall2026@advisle.com`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(schedule: GeneratedSchedule) {
  const content = generateICS(schedule);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "advisle-unh-fall2026.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: done ? "#059669" : active ? UNH_BLUE : "#e5e7eb",
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UnhScheduler() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [audit, setAudit] = useState<ParsedAudit | null>(null);
  const [remainingCourses, setRemainingCourses] = useState<RemainingCourse[]>([]);
  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Prefs
  const [targetCredits, setTargetCredits] = useState(16);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [blockDay, setBlockDay] = useState("M");
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("17:00");
  const [customNotes, setCustomNotes] = useState("");
  const [pinnedCrns, setPinnedCrns] = useState<string[]>([]);
  const [pinnedCrnInput, setPinnedCrnInput] = useState("");

  // Step 3 inline CRN pinning
  const [step3CrnInput, setStep3CrnInput] = useState("");

  // Report bad schedule
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // RMP ratings
  const [rmpRatings, setRmpRatings] = useState<Record<string, { firstName: string; lastName: string; avgRating: number; avgDifficulty: number; numRatings: number } | null>>({});

  // ── Step 1: Upload ──

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
      const res = await fetch("/api/unh/parse-audit", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Failed to parse PDF");
      const data: ParsedAudit = await res.json();
      setAudit(data);
      setRemainingCourses(data.remaining_courses as RemainingCourse[]);
      setStep(2);
    } catch {
      setError("Could not parse your degree audit. Make sure it's a UNH Degree Works PDF.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Prefs ──

  const removeCourse = (i: number) => {
    setRemainingCourses((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addBlock = () => {
    if (blockStart >= blockEnd) { setError("End time must be after start time."); return; }
    setBlockedTimes((prev) => [...prev, { day: blockDay, startTime: blockStart, endTime: blockEnd }]);
    setError(null);
  };

  const removeBlock = (i: number) => setBlockedTimes((prev) => prev.filter((_, idx) => idx !== i));

  const addPinnedCrn = () => {
    const crn = pinnedCrnInput.trim();
    if (!crn || pinnedCrns.includes(crn)) return;
    setPinnedCrns((prev) => [...prev, crn]);
    setPinnedCrnInput("");
  };

  const removePinnedCrn = (crn: string) => setPinnedCrns((prev) => prev.filter((c) => c !== crn));

  const generateSchedule = async (extraPinnedCrns?: string[]) => {
    if (!audit) return;
    setLoading(true);
    setError(null);
    try {
      const allPinned = extraPinnedCrns ?? pinnedCrns;
      const res = await fetch("/api/unh/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remaining_courses: remainingCourses,
          completed_courses: audit.completed_courses ?? [],
          in_progress_courses: audit.in_progress_courses ?? [],
          blocked_times: blockedTimes,
          pinned_crns: allPinned,
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

      // Fetch RMP ratings in background
      const instructors = [...new Set(
        (data.recommended_schedule as ScheduledCourse[])
          .map((c) => c.instructor)
          .filter((i) => i && i !== "TBA")
      )];
      if (instructors.length > 0) {
        fetch("/api/rmp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instructors, school: "unh" }),
        })
          .then((r) => r.json())
          .then((d) => setRmpRatings(d.ratings ?? {}))
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate schedule");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: inline CRN pin ──

  const addCrnAndRegenerate = () => {
    const crn = step3CrnInput.trim();
    if (!crn || pinnedCrns.includes(crn)) return;
    const updated = [...pinnedCrns, crn];
    setPinnedCrns(updated);
    setStep3CrnInput("");
    setTimeout(() => generateSchedule(updated), 0);
  };

  const removeCourseFromSchedule = (i: number) => {
    if (!schedule) return;
    const updated = schedule.recommended_schedule.filter((_, idx) => idx !== i);
    setSchedule({ ...schedule, recommended_schedule: updated, total_credits: updated.reduce((s, c) => s + c.credits, 0) });
  };

  const submitReport = async () => {
    if (!schedule || !audit) return;
    setReportLoading(true);
    try {
      await fetch("/api/unh/report-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: reportFeedback,
          inputs: {
            target_credits: targetCredits,
            major: audit.major,
            credits_completed: audit.credits_completed,
            custom_notes: customNotes,
            blocked_times: blockedTimes,
            remaining_courses: remainingCourses,
            in_progress_courses: audit.in_progress_courses,
            pinned_crns: pinnedCrns,
          },
          outputs: {
            total_credits: schedule.total_credits,
            recommended_schedule: schedule.recommended_schedule,
            notes: schedule.notes,
            unscheduled_courses: schedule.unscheduled_courses,
          },
          audit_info: {
            student_name: audit.student_name,
            major: audit.major,
          },
        }),
      });
      setReportSubmitted(true);
      setShowReportForm(false);
    } catch {
      // silently fail
    } finally {
      setReportLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#111827" }}>

      {/* Header */}
      <header style={{ background: UNH_BLUE, color: "#fff", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 16, textDecoration: "none", color: "inherit" }}>
          <div style={{ width: 36, height: 36, background: UNH_GOLD, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: UNH_BLUE }}>
            A
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Advisle</h1>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>AI-powered course scheduling for UNH students</p>
          </div>
        </a>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>

        {/* Beta banner */}
        <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#854d0e", textAlign: "center" }}>
          🚧 UNH scheduling is in beta — results may not be perfect. Always verify with your advisor before registering.
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 24, marginBottom: 32, padding: "16px 24px", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <Step n={1} label="Upload Audit" active={step === 1} done={step > 1} />
          <div style={{ width: 40, height: 1, background: "#e5e7eb", alignSelf: "center" }} />
          <Step n={2} label="Preferences" active={step === 2} done={step > 2} />
          <div style={{ width: 40, height: 1, background: "#e5e7eb", alignSelf: "center" }} />
          <Step n={3} label="View Schedule" active={step === 3} done={false} />
        </div>

        {/* Loading spinner */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 16px" }}>
            <div style={{ width: 40, height: 40, border: "4px solid #e5e7eb", borderTop: `4px solid ${UNH_BLUE}`, borderRadius: "50%", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
              {step === 1 ? "Analyzing your degree audit… this takes about 30 seconds" : "Building your schedule… hang tight"}
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error */}
        {error && error !== "unh_coming_soon" && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#dc2626", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: Upload ── */}
        {step === 1 && !loading && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 32 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#111827" }}>Upload Your Degree Audit</h2>
            <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>
              In Degree Works, click the <strong>🖨️ print icon</strong> in the top right → Save as PDF. Then upload that file here.
            </p>
            <a
              href="https://degreeworks.unh.edu"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", marginBottom: 24, padding: "10px 18px",
                background: UNH_BLUE, color: "#fff", borderRadius: 8,
                fontWeight: 600, fontSize: 14, textDecoration: "none",
              }}
            >
              Open UNH Degree Audit →
            </a>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById("unh-file-input")?.click()}
              style={{
                border: `2px dashed ${dragOver ? UNH_BLUE : file ? "#059669" : "#d1d5db"}`,
                borderRadius: 10, padding: "48px 32px", textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "#e8f0fb" : file ? "#f0fdf4" : "#fafafa",
                transition: "all 0.15s", marginBottom: 24,
              }}
            >
              <input
                id="unh-file-input"
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
                  <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#111827" }}>Drop your degree audit PDF here</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>or click to browse</p>
                </>
              )}
            </div>

            <button
              onClick={parseAudit}
              disabled={!file || loading}
              style={{
                width: "100%", padding: 14, borderRadius: 8, border: "none",
                background: file && !loading ? UNH_BLUE : "#e5e7eb",
                color: file && !loading ? "#fff" : "#9ca3af",
                fontWeight: 700, fontSize: 15, cursor: file && !loading ? "pointer" : "not-allowed",
                transition: "background 0.15s",
              }}
            >
              Analyze Degree Audit →
            </button>
          </div>
        )}

        {/* ── STEP 2: Preferences ── */}
        {step === 2 && audit && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Remaining courses */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>
                {audit.student_name ? `${audit.student_name}'s` : "Your"} Remaining Courses
              </h2>
              {audit.major && <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>Major: <strong>{audit.major}</strong></p>}
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
                Remove any courses you&apos;ve already taken, had waived, or no longer need.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {remainingCourses.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                    <span style={{ fontWeight: 700, color: UNH_BLUE, minWidth: 100, fontSize: 14 }}>{c.subject} {c.number}</span>
                    <span style={{ flex: 1, fontSize: 14, color: "#1f2937" }}>{c.title}</span>
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 99, background: (CATEGORY_COLORS[c.requirement_category] ?? "#6b7280") + "20", color: CATEGORY_COLORS[c.requirement_category] ?? "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {c.requirement_category}
                    </span>
                    <span style={{ fontSize: 13, color: "#6b7280", minWidth: 50, textAlign: "right" }}>{c.credits} cr</span>
                    <button
                      onClick={() => removeCourse(i)}
                      title="Remove this course"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
                    >×</button>
                  </div>
                ))}
                {remainingCourses.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No remaining courses — all requirements satisfied!</p>
                )}
              </div>
            </div>

            {/* Target credits */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Target Credit Load</h2>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>How many credits do you want this semester?</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[12, 13, 14, 15, 16, 17, 18, 19, 20].map((c) => (
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
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>Times you can&apos;t have class (work, sports, commuting, etc.)</p>
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
                  <button onClick={() => removeBlock(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d97706", fontSize: 18 }}>×</button>
                </div>
              ))}
              {blockedTimes.length === 0 && <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No blocked times — all slots open.</p>}
            </div>

            {/* Pinned CRNs */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Pin Specific Sections <span style={{ fontSize: 13, fontWeight: 400, color: "#9ca3af" }}>— optional</span></h2>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>
                Have a section you absolutely need? Enter its CRN and the schedule will be built around it.
              </p>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <input type="text" value={pinnedCrnInput} onChange={(e) => setPinnedCrnInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addPinnedCrn(); }}
                  placeholder="e.g. 12345" maxLength={6}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, flex: 1 }} />
                <button onClick={addPinnedCrn}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: UNH_BLUE, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  + Pin Section
                </button>
              </div>
              {pinnedCrns.map((crn) => (
                <div key={crn} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, flex: 1, color: "#1f2937" }}>📌 CRN <strong>{crn}</strong></span>
                  <button onClick={() => removePinnedCrn(crn)} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontSize: 16, padding: "0 4px" }}>×</button>
                </div>
              ))}
              {pinnedCrns.length === 0 && <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No sections pinned — the AI will choose all sections for you.</p>}
            </div>

            {/* Notes */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Anything else to know?</h2>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>
                E.g. &quot;I&apos;m taking MATH 425 so the prereq is satisfied&quot;, &quot;avoid 8am classes&quot;, &quot;I need a light semester&quot;.
              </p>
              <textarea value={customNotes} onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Optional: any notes for the AI scheduler…" rows={3}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, color: "#111827", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {error === "unh_coming_soon" && (
              <div style={{ padding: "16px 20px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12, fontSize: 14, color: "#92400e" }}>
                <strong>UNH schedule generation is coming soon!</strong><br />
                Your audit was parsed successfully — check back soon and we&apos;ll build your full schedule.
              </div>
            )}

            <button onClick={() => generateSchedule()} disabled={loading}
              style={{
                padding: 14, borderRadius: 8, border: "none",
                background: loading ? "#e5e7eb" : UNH_BLUE,
                color: loading ? "#9ca3af" : "#fff",
                fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
              }}>
              Generate My Schedule →
            </button>
          </div>
        )}

        {/* ── STEP 3: Schedule ── */}
        {step === 3 && schedule && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Your Recommended Schedule</h2>
                  <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{schedule.total_credits} credits · Fall 2026</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => downloadICS(schedule)}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Export to Calendar
                  </button>
                  <button onClick={() => generateSchedule()} disabled={loading}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: UNH_BLUE, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    ↺ Regenerate
                  </button>
                  <button onClick={() => { setStep(2); setSchedule(null); }}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, cursor: "pointer" }}>
                    ← Adjust
                  </button>
                </div>
              </div>

              {/* Inline CRN pinning */}
              <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={step3CrnInput}
                  onChange={(e) => setStep3CrnInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCrnAndRegenerate(); }}
                  placeholder="Pin a CRN (e.g. 12345)"
                  maxLength={6}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, width: 200 }}
                />
                <button
                  onClick={addCrnAndRegenerate}
                  disabled={!step3CrnInput.trim()}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !step3CrnInput.trim() ? 0.5 : 1 }}>
                  + Pin & Rebuild
                </button>
                {pinnedCrns.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {pinnedCrns.map((crn) => (
                      <span key={crn} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 20, fontSize: 12, color: "#166534", fontWeight: 600 }}>
                        📌 {crn}
                        <button onClick={() => removePinnedCrn(crn)} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {schedule.total_credits < targetCredits && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", fontSize: 13, color: "#c2410c" }}>
                  <strong>Heads up:</strong> We could only find {schedule.total_credits} credits of non-conflicting courses — {targetCredits - schedule.total_credits} cr short of your {targetCredits}-credit goal. Try removing some blocked times or use the notes field for more flexibility.
                </div>
              )}

              {/* Course cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {schedule.recommended_schedule.map((c, i) => (
                  <div key={i} style={{ borderRadius: 10, border: `1px solid ${(CATEGORY_COLORS[c.requirement_category] ?? "#e5e7eb")}30`, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "stretch" }}>
                      <div style={{ width: 4, background: CATEGORY_COLORS[c.requirement_category] ?? "#6b7280", flexShrink: 0 }} />
                      <div style={{ padding: "14px 16px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, color: UNH_BLUE, fontSize: 15 }}>{c.subject} {c.number}</span>
                            <span style={{ fontSize: 15, marginLeft: 8, color: "#1f2937" }}>{c.title}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                            <span style={{ fontSize: 13, color: "#6b7280" }}>{c.credits} credits</span>
                            <button
                              onClick={() => removeCourseFromSchedule(i)}
                              title="Remove from schedule"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#dc2626")}
                              onMouseLeave={e => (e.currentTarget.style.color = "#d1d5db")}
                            >×</button>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#4b5563" }}>
                          <span>📅 {c.days.map((d) => DAY_LABELS[d]?.slice(0, 3)).join(", ")} · {formatTime(c.startTime)} – {formatTime(c.endTime)}</span>
                          <span>📍 {[c.building, c.room].filter(Boolean).join(" ") || "TBA"}</span>
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
                          <span style={{ color: "#9ca3af" }}>CRN: {c.crn}</span>
                          {(() => {
                            const b = seatsBadge(c.maxEnrollment, c.currentEnrollment, c.seatsAvailable);
                            return b ? <span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span> : null;
                          })()}
                        </div>
                        <div style={{ marginTop: 8 }}>
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
                  <strong>⚠️ Not scheduled:</strong> {schedule.unscheduled_courses.join(", ")}
                  <p style={{ margin: "4px 0 0", fontSize: 13 }}>These courses may not be offered Fall 2026, may have unmet prereqs, or couldn&apos;t fit in your schedule. Check with your advisor.</p>
                </div>
              )}
            </div>

            {/* Summary bar */}
            <div style={{ background: UNH_BLUE, color: "#fff", borderRadius: 12, padding: "16px 24px", display: "flex", gap: 32 }}>
              <div><div style={{ fontSize: 24, fontWeight: 800 }}>{schedule.total_credits}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Total Credits</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800 }}>{schedule.recommended_schedule.length}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Courses</div></div>
              {blockedTimes.length > 0 && <div><div style={{ fontSize: 24, fontWeight: 800 }}>{blockedTimes.length}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Time Blocks Applied</div></div>}
            </div>

            {/* Report bad schedule */}
            {reportSubmitted ? (
              <div style={{ textAlign: "center", fontSize: 14, color: "#059669", padding: "12px 0" }}>
                Report submitted — thanks for the feedback!
              </div>
            ) : showReportForm ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>What went wrong with this schedule?</p>
                <textarea
                  value={reportFeedback}
                  onChange={(e) => setReportFeedback(e.target.value)}
                  placeholder="e.g. Wrong credits, wrong courses recommended, conflict with a class I need, missing required courses..."
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={submitReport}
                    disabled={reportLoading}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: reportLoading ? "not-allowed" : "pointer", opacity: reportLoading ? 0.7 : 1 }}>
                    {reportLoading ? "Sending..." : "Send Report"}
                  </button>
                  <button
                    onClick={() => setShowReportForm(false)}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#6b7280" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center" }}>
                <button
                  onClick={() => setShowReportForm(true)}
                  style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  Report bad schedule
                </button>
              </div>
            )}

          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "24px 16px", color: "#9ca3af", fontSize: 12, marginTop: 40 }}>
        <p style={{ margin: 0 }}>Advisle is a student-built tool and is not affiliated with the University of New Hampshire. Always verify your schedule with your academic advisor before registering.</p>
      </footer>
    </div>
  );
}
