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
  maxEnrollment?: number;
  currentEnrollment?: number;
  seatsAvailable?: number;
  isFull?: boolean;
}

interface RMPRating {
  firstName: string;
  lastName: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
}

interface SectionOption {
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
  maxEnrollment?: number;
  currentEnrollment?: number;
  seatsAvailable?: number;
  isFull?: boolean;
}

interface GeneratedSchedule {
  recommended_schedule: ScheduledCourse[];
  total_credits: number;
  notes: string;
  unscheduled_courses: string[];
}

interface MinorSuggestion {
  name: string;
  courses_needed: number;
  courses_satisfied: number;
  total_specific_courses: number;
  missing_required: { subject: string; number: string; title: string; credits: number; requirement_category: string }[];
  elective_note: string;
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

function seatsBadge(max?: number, current?: number, seats?: number): { label: string; bg: string; color: string } | null {
  if (!max || max === 0) return null;
  if (seats === 0) return { label: "Full", bg: "#fee2e2", color: "#dc2626" };
  const pctFull = current! / max;
  if (pctFull >= 0.75) return { label: `${seats} seats left`, bg: "#fff7ed", color: "#c2410c" };
  return { label: `${seats} / ${max} seats`, bg: "#f0fdf4", color: "#15803d" };
}

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
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
  // UVM Fall 2026: Aug 31 (Mon) – Dec 11
  const semesterStart = new Date(2026, 7, 31);
  const untilStr = "20261212T000000Z";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advisle//Degree Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Advisle Fall 2026",
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
    lines.push(`UID:advisle-${course.crn}-fall2026@advisle.com`);
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
  a.download = "advisle-fall2026.ics";
  a.click();
  URL.revokeObjectURL(url);
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
  const [targetCredits, setTargetCredits] = useState(15);

  // Section switcher state
  const [switchingCrn, setSwitchingCrn] = useState<string | null>(null);
  const [altSections, setAltSections] = useState<Record<string, SectionOption[]>>({});
  const [loadingAlt, setLoadingAlt] = useState<string | null>(null);

  // Custom notes
  const [customNotes, setCustomNotes] = useState("");

  // Course removal / replacement
  const [excludedCourses, setExcludedCourses] = useState<{ subject: string; number: string }[]>([]);
  const [replacingCourse, setReplacingCourse] = useState(false);

  // Minor explorer
  const [minorSuggestions, setMinorSuggestions] = useState<MinorSuggestion[]>([]);
  const [selectedMinors, setSelectedMinors] = useState<string[]>([]);
  const [minorMissingCourses, setMinorMissingCourses] = useState<Record<string, RemainingCourse[]>>({});

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

      // Fetch minor suggestions in background
      fetch("/api/minor-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed_courses: data.completed_courses ?? [],
          in_progress_courses: data.in_progress_courses ?? [],
        }),
      })
        .then((r) => r.json())
        .then((d) => setMinorSuggestions(d.suggestions ?? []))
        .catch(() => {});
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

  const removeCourse = (i: number) => {
    if (!audit) return;
    setAudit({ ...audit, remaining_courses: audit.remaining_courses.filter((_, idx) => idx !== i) });
  };

  const toggleMinor = (suggestion: MinorSuggestion) => {
    const name = suggestion.name;
    if (selectedMinors.includes(name)) {
      setSelectedMinors((prev) => prev.filter((m) => m !== name));
      setMinorMissingCourses((prev) => { const next = { ...prev }; delete next[name]; return next; });
    } else {
      setSelectedMinors((prev) => [...prev, name]);
      setMinorMissingCourses((prev) => ({
        ...prev,
        [name]: suggestion.missing_required.map((c) => ({
          subject: c.subject,
          number: c.number,
          title: c.title,
          credits: c.credits,
          requirement_category: "Minor",
        })),
      }));
    }
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
          remaining_courses: [
            ...audit.remaining_courses,
            ...Object.values(minorMissingCourses).flat().filter(
              (mc) => !audit.remaining_courses.some((rc) => rc.subject === mc.subject && rc.number === mc.number)
            ),
          ],
          completed_courses: audit.completed_courses ?? [],
          in_progress_courses: audit.in_progress_courses ?? [],
          blocked_times: blockedTimes,
          target_credits: targetCredits,
          credits_completed: audit.credits_completed ?? null,
          major: audit.major ?? null,
          custom_notes: [
            customNotes,
            selectedMinors.length > 0
              ? `Student wants to pursue the following minor(s): ${selectedMinors.join(", ")}. Prioritize scheduling their missing required courses.`
              : "",
          ].filter(Boolean).join(" "),
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

  // ── Section Switcher ──

  const openSectionSwitcher = async (course: ScheduledCourse, index: number) => {
    if (switchingCrn === course.crn) {
      setSwitchingCrn(null);
      return;
    }
    setSwitchingCrn(course.crn);
    if (altSections[course.crn]) return;

    setLoadingAlt(course.crn);
    try {
      const otherScheduled = schedule!.recommended_schedule.filter((_, i) => i !== index);
      const res = await fetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: course.subject,
          number: course.number,
          blocked_times: blockedTimes,
          other_scheduled: otherScheduled,
        }),
      });
      const data = await res.json();
      setAltSections((prev) => ({ ...prev, [course.crn]: data.sections ?? [] }));
    } catch {
      setAltSections((prev) => ({ ...prev, [course.crn]: [] }));
    } finally {
      setLoadingAlt(null);
    }
  };

  const swapSection = (courseIndex: number, newSection: SectionOption) => {
    if (!schedule) return;
    const currentCourse = schedule.recommended_schedule[courseIndex];
    const updated = [...schedule.recommended_schedule];
    updated[courseIndex] = {
      ...newSection,
      requirement_category: currentCourse.requirement_category,
    };
    setSchedule({ ...schedule, recommended_schedule: updated });
    setSwitchingCrn(null);
    setAltSections({});
  };

  const removeCourseFromSchedule = async (courseIndex: number) => {
    if (!schedule || !audit) return;
    const removed = schedule.recommended_schedule[courseIndex];
    const newExcluded = [...excludedCourses, { subject: removed.subject, number: removed.number }];

    const newSchedule = schedule.recommended_schedule.filter((_, i) => i !== courseIndex);
    setSchedule({
      ...schedule,
      recommended_schedule: newSchedule,
      total_credits: newSchedule.reduce((sum, c) => sum + c.credits, 0),
    });
    setExcludedCourses(newExcluded);
    setSwitchingCrn(null);
    setAltSections({});
    setReplacingCourse(true);

    try {
      const res = await fetch("/api/replace-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_schedule: newSchedule,
          remaining_courses: audit.remaining_courses,
          blocked_times: blockedTimes,
          excluded_courses: newExcluded,
          in_progress_courses: audit.in_progress_courses ?? [],
          completed_courses: audit.completed_courses ?? [],
        }),
      });
      const data = await res.json();
      if (data.replacement) {
        setSchedule((prev) => {
          if (!prev) return prev;
          const updated = [...prev.recommended_schedule, data.replacement];
          return { ...prev, recommended_schedule: updated, total_credits: updated.reduce((sum, c) => sum + c.credits, 0) };
        });
      }
    } catch {
      // silently fail — course was already removed
    } finally {
      setReplacingCourse(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#111827" }}>

      {/* Header */}
      <header style={{ background: "#1e3a5f", color: "#fff", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 36, height: 36, background: "#f8b400", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "#1e3a5f" }}>
          A
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>Advisle</h1>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>AI-powered course scheduling for University of Vermont students</p>
        </div>
        <a href="https://www.instagram.com/advisle?igsh=MWZoc3Z1bTU0d2kydw==" target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", color: "#fff", opacity: 0.85, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, textDecoration: "none" }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.85")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          <span style={{ display: "none" }} className="sm-show">Instagram</span>
        </a>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      {/* Beta banner */}
      <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#854d0e", textAlign: "center" }}>
        🚧 Advisle is in beta — we're improving it daily. If something looks off, try again or check back soon!
      </div>

        

        {/* Steps */}
        <div style={{ display: "flex", gap: 24, marginBottom: 32, padding: "16px 24px", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <Step n={1} label="Upload Audit" active={step === 1} done={step > 1} />
          <div style={{ width: 40, height: 1, background: "#e5e7eb", alignSelf: "center" }} />
          <Step n={2} label="Block Times" active={step === 2} done={step > 2} />
          <div style={{ width: 40, height: 1, background: "#e5e7eb", alignSelf: "center" }} />
          <Step n={3} label="View Schedule" active={step === 3} done={false} />
        </div>
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 16px" }}>
          <div style={{ width: 40, height: 40, border: "4px solid #e5e7eb", borderTop: "4px solid #2563eb", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
             {step === 1 ? "Analyzing your degree audit… this takes about 30 seconds" : "Building your schedule… hang tight"}
         </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
      )}
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#dc2626", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 32 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#111827" }}>Upload Your Degree Audit</h2>
            <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: 14 }}>
              Log into myUVM → Student Records → Degree Audit. On the audit page, click the <strong>🖨️ print icon</strong> in the top right corner → Save as PDF. Then upload that file here.
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
                  <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#111827" }}>Drop your degree audit PDF here</p>
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
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
                Remove any courses you{"'"}ve already taken, had waived, or no longer need.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {audit.remaining_courses.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                    <span style={{ fontWeight: 700, color: "#1e3a5f", minWidth: 100, fontSize: 14 }}>{c.subject} {c.number}</span>
                    <span style={{ flex: 1, fontSize: 14, color: "#1f2937" }}>{c.title}</span>
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 99, background: CATEGORY_COLORS[c.requirement_category] + "20", color: CATEGORY_COLORS[c.requirement_category], fontWeight: 600, whiteSpace: "nowrap" }}>
                      {c.requirement_category}
                    </span>
                    <span style={{ fontSize: 13, color: "#6b7280", minWidth: 50, textAlign: "right" }}>{c.credits} cr</span>
                    <button onClick={() => removeCourse(i)} title="Remove this course"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>
                      ×
                    </button>
                  </div>
                ))}
                {audit.remaining_courses.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No remaining courses — all requirements satisfied!</p>
                )}
              </div>
            </div>

            {/* Minor Explorer */}
            {minorSuggestions.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Minor Explorer</h2>
                <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>
                  Based on your completed courses, here are minors sorted by how close you are. Click "Add to plan" to include those courses in your schedule.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {minorSuggestions.map((s) => {
                    const isSelected = selectedMinors.includes(s.name);
                    const isComplete = s.courses_needed === 0;
                    return (
                      <div key={s.name} style={{ borderRadius: 10, border: `1px solid ${isSelected ? "#2563eb" : "#e5e7eb"}`, background: isSelected ? "#eff6ff" : "#fafafa", padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>{s.name} Minor</span>
                              {isComplete ? (
                                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 99, background: "#dcfce7", color: "#15803d", fontWeight: 600 }}>Already complete!</span>
                              ) : (
                                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 99, background: s.courses_needed <= 2 ? "#fef9c3" : "#f1f5f9", color: s.courses_needed <= 2 ? "#854d0e" : "#4b5563", fontWeight: 600 }}>
                                  {s.courses_needed} course{s.courses_needed !== 1 ? "s" : ""} away
                                </span>
                              )}
                            </div>
                            {!isComplete && s.missing_required.length > 0 && (
                              <p style={{ margin: "0 0 2px", fontSize: 13, color: "#374151" }}>
                                <strong>Still need:</strong> {s.missing_required.map((c) => `${c.subject} ${c.number}`).join(", ")}
                              </p>
                            )}
                            {s.elective_note && (
                              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>{s.elective_note}</p>
                            )}
                          </div>
                          {!isComplete && (
                            <button
                              onClick={() => toggleMinor(s)}
                              style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${isSelected ? "#2563eb" : "#d1d5db"}`, background: isSelected ? "#2563eb" : "#fff", color: isSelected ? "#fff" : "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                              {isSelected ? "✓ Added" : "+ Add to plan"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedMinors.length > 0 && (
                  <p style={{ margin: "12px 0 0", fontSize: 13, color: "#2563eb", fontWeight: 500 }}>
                    {selectedMinors.length} minor{selectedMinors.length !== 1 ? "s" : ""} added — missing courses will be prioritized when generating your schedule.
                  </p>
                )}
              </div>
            )}

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

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Target Credit Load</h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7280" }}>
              How many credits do you want to take this semester?
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[12, 13, 14, 15, 16, 17, 18].map((c) => (
                <button key={c} onClick={() => setTargetCredits(c)}
                  style={{ padding: "8px 16px", borderRadius: 8, border: `2px solid ${targetCredits === c ? "#2563eb" : "#e5e7eb"}`, background: targetCredits === c ? "#eff6ff" : "#fff", color: targetCredits === c ? "#2563eb" : "#374151", fontWeight: targetCredits === c ? 700 : 400, fontSize: 14, cursor: "pointer" }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
            
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 24 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Anything else to know?</h2>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>
                Tell the AI about special circumstances — e.g. "I'm currently taking CALC II so CALC III prereq is satisfied", "I transferred in CS 101", "I want to avoid early morning classes", etc.
              </p>
              <textarea
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Optional: any notes for the AI scheduler…"
                rows={3}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, color: "#111827", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
              />
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => downloadICS(schedule)}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Export to Calendar
                  </button>
                  <button
                    onClick={() => { setStep(2); setSchedule(null); setScheduleId(null); }}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, cursor: "pointer" }}>
                    ← Adjust
                  </button>
                </div>
              </div>
              {schedule.total_credits < targetCredits && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", fontSize: 13, color: "#c2410c" }}>
                  <strong>Heads up:</strong> We could only find {schedule.total_credits} credits of non-conflicting courses — {targetCredits - schedule.total_credits} cr short of your {targetCredits}-credit goal. This usually means limited section availability for your remaining requirements. Try removing some blocked times or use the notes field to give the AI more flexibility.
                </div>
              )}
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
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                            <span style={{ fontSize: 13, color: "#6b7280" }}>{c.credits} credits</span>
                            <button
                              onClick={() => removeCourseFromSchedule(i)}
                              disabled={replacingCourse}
                              title="Remove and find replacement"
                              style={{ background: "none", border: "none", cursor: replacingCourse ? "not-allowed" : "pointer", color: "#d1d5db", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
                              onMouseEnter={e => { if (!replacingCourse) e.currentTarget.style.color = "#dc2626"; }}
                              onMouseLeave={e => { e.currentTarget.style.color = "#d1d5db"; }}
                            >×</button>
                          </div>
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
                          {(() => { const b = seatsBadge(c.maxEnrollment, c.currentEnrollment, c.seatsAvailable); return b ? <span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span> : null; })()}
                        </div>
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: (CATEGORY_COLORS[c.requirement_category] ?? "#6b7280") + "15", color: CATEGORY_COLORS[c.requirement_category] ?? "#6b7280", fontWeight: 600 }}>
                            {c.requirement_category}
                          </span>
                          <button
                            onClick={() => openSectionSwitcher(c, i)}
                            style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: switchingCrn === c.crn ? "#eff6ff" : "#fff", color: switchingCrn === c.crn ? "#2563eb" : "#6b7280", cursor: "pointer", fontWeight: 500 }}>
                            {switchingCrn === c.crn ? "▲ Close" : "⇄ Switch section"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Section picker */}
                    {switchingCrn === c.crn && (
                      <div style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc", padding: "12px 16px" }}>
                        {loadingAlt === c.crn ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Loading sections…</p>
                        ) : !altSections[c.crn] || altSections[c.crn].length === 0 ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No other sections available without conflicts.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>Available sections</p>
                            {altSections[c.crn].map((sec) => (
                              <div
                                key={sec.crn}
                                onClick={() => swapSection(i, sec)}
                                style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between",
                                  padding: "8px 12px", borderRadius: 8, border: `1px solid ${sec.crn === c.crn ? "#2563eb" : "#e5e7eb"}`,
                                  background: sec.crn === c.crn ? "#eff6ff" : "#fff",
                                  cursor: sec.crn === c.crn ? "default" : "pointer",
                                  gap: 12,
                                }}>
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flex: 1 }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", minWidth: 28 }}>§{sec.section}</span>
                                  <span style={{ fontSize: 13, color: "#374151" }}>
                                    {sec.days.map((d) => DAY_LABELS[d]?.slice(0, 3)).join(", ")} · {formatTime(sec.startTime)} – {formatTime(sec.endTime)}
                                  </span>
                                  <span style={{ fontSize: 13, color: "#6b7280" }}>{sec.instructor || "TBA"}</span>
                                  <span style={{ fontSize: 12, color: "#9ca3af" }}>CRN {sec.crn}</span>
                                  {(() => { const b = seatsBadge(sec.maxEnrollment, sec.currentEnrollment, sec.seatsAvailable); return b ? <span style={{ padding: "1px 6px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span> : null; })()}
                                </div>
                                {sec.crn === c.crn ? (
                                  <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, flexShrink: 0 }}>Current</span>
                                ) : (
                                  <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, flexShrink: 0 }}>Select →</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {replacingCourse && (
                <div style={{ marginTop: 10, padding: "10px 14px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe", fontSize: 13, color: "#1d4ed8", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 14, height: 14, border: "2px solid #bfdbfe", borderTop: "2px solid #2563eb", borderRadius: "50%", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                  Finding a replacement course…
                </div>
              )}

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
        {/* Footer */}
        <footer style={{ textAlign: "center", padding: "24px 16px", color: "#9ca3af", fontSize: 12 }}>
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 12 }}>
    <a href="https://docs.google.com/forms/d/e/1FAIpQLSeXvQyk9CIsPIAnUdSFGsLS0701bAVXFaaS-Z1wtivma_Um0g/viewform?usp=publish-editor" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "8px 20px", background: "#2563eb", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Give Feedback</a>
    <a href="https://www.instagram.com/advisle?igsh=MWZoc3Z1bTU0d2kydw==" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
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
