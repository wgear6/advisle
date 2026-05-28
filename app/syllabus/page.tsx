"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyllabusEvent {
  id: string;
  title: string;
  type: "homework" | "exam" | "quiz" | "project" | "reading" | "lab" | "other";
  date: string;
  recurrence?: { frequency: "weekly" | "biweekly"; endDate: string };
  description?: string;
}

interface SyllabusResult {
  courseName: string;
  courseCode: string;
  semesterStart: string | null;
  semesterEnd: string | null;
  events: SyllabusEvent[];
}

interface ExpandedEvent {
  id: string;
  title: string;
  type: SyllabusEvent["type"];
  date: string;
  description?: string;
  courseCode: string;
  courseName: string;
  courseColor: string;
}

interface CourseInfo {
  code: string;
  name: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COURSE_PALETTE = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#db2777"];

const EVENT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  homework: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  exam:     { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  quiz:     { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },
  project:  { bg: "#faf5ff", text: "#7c3aed", border: "#e9d5ff" },
  reading:  { bg: "#ecfeff", text: "#0891b2", border: "#a5f3fc" },
  lab:      { bg: "#f0fdf4", text: "#059669", border: "#bbf7d0" },
  other:    { bg: "#f9fafb", text: "#6b7280", border: "#e5e7eb" },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expandEvents(result: SyllabusResult, courseColor: string): ExpandedEvent[] {
  const expanded: ExpandedEvent[] = [];
  const DAY_MS = 86_400_000;

  for (const ev of result.events) {
    const base: Omit<ExpandedEvent, "date" | "id"> = {
      title: ev.title,
      type: ev.type,
      description: ev.description,
      courseCode: result.courseCode,
      courseName: result.courseName,
      courseColor,
    };

    if (!ev.recurrence) {
      expanded.push({ ...base, id: ev.id, date: ev.date });
      continue;
    }

    const step = ev.recurrence.frequency === "weekly" ? 7 * DAY_MS : 14 * DAY_MS;
    const end = new Date(ev.recurrence.endDate + "T12:00:00").getTime();
    let cur = new Date(ev.date + "T12:00:00").getTime();
    let idx = 1;

    while (cur <= end) {
      expanded.push({ ...base, id: `${ev.id}-${idx}`, date: new Date(cur).toISOString().split("T")[0] });
      cur += step;
      idx++;
    }
  }

  return expanded.sort((a, b) => a.date.localeCompare(b.date));
}

function generateICS(events: ExpandedEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advisle//Syllabus Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const ev of events) {
    const ds = ev.date.replace(/-/g, "");
    const nextDay = new Date(ev.date + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const de = nextDay.toISOString().split("T")[0].replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${ds}`,
      `DTEND;VALUE=DATE:${de}`,
      `SUMMARY:${ev.courseCode ? `[${ev.courseCode}] ` : ""}${ev.title}`,
      `UID:advisle-${ev.id}-${ds}@advisle.app`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ─── Month Calendar ───────────────────────────────────────────────────────────

function MonthCalendar({
  year,
  month,
  events,
  onEventClick,
}: {
  year: number;
  month: number;
  events: ExpandedEvent[];
  onEventClick: (ev: ExpandedEvent) => void;
}) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDate: Record<string, ExpandedEvent[]> = {};
  for (const ev of events) {
    if (!byDate[ev.date]) byDate[ev.date] = [];
    byDate[ev.date].push(ev);
  }

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {DOW_LABELS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9ca3af", padding: "4px 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "#e5e7eb", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {cells.map((day, idx) => {
          const dateStr = day
            ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            : null;
          const dayEvents = dateStr ? (byDate[dateStr] ?? []) : [];
          const isToday = dateStr === todayStr;

          return (
            <div
              key={idx}
              style={{
                background: day ? "#fff" : "#f9fafb",
                minHeight: 88,
                padding: "6px 4px 4px",
              }}
            >
              {day && (
                <>
                  <div style={{
                    fontSize: 12, fontWeight: isToday ? 800 : 400,
                    color: isToday ? "#fff" : "#374151",
                    background: isToday ? "#1e3a5f" : "transparent",
                    width: 22, height: 22, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 3, flexShrink: 0,
                  }}>
                    {day}
                  </div>

                  {dayEvents.slice(0, 3).map((ev) => {
                    const s = EVENT_STYLES[ev.type] ?? EVENT_STYLES.other;
                    return (
                      <div
                        key={ev.id}
                        onClick={() => onEventClick(ev)}
                        title={ev.title}
                        style={{
                          background: s.bg, color: s.text, border: `1px solid ${s.border}`,
                          borderRadius: 3, fontSize: 10, padding: "1px 5px",
                          marginBottom: 2, cursor: "pointer",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          lineHeight: 1.5, fontWeight: 500,
                        }}
                      >
                        {ev.title}
                      </div>
                    );
                  })}

                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: 10, color: "#9ca3af", paddingLeft: 2, fontWeight: 500 }}>
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SyllabusCalendarPage() {
  const [allEvents, setAllEvents] = useState<ExpandedEvent[]>([]);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedEvent, setSelectedEvent] = useState<ExpandedEvent | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoNavigated = useRef(false);

  const hasEvents = allEvents.length > 0;

  useEffect(() => {
    if (allEvents.length > 0 && !hasAutoNavigated.current) {
      hasAutoNavigated.current = true;
      const [y, m] = allEvents[0].date.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [allEvents]);

  const applyResult = useCallback((result: SyllabusResult, fileName: string) => {
    if (!result.events || result.events.length === 0) {
      setError(
        "No events found in this syllabus. The PDF may not contain extractable dates. " +
        "Try downloading the actual syllabus file from your course rather than printing from Brightspace/Canvas."
      );
      return;
    }

    setCourses((prev) => {
      const color = COURSE_PALETTE[prev.length % COURSE_PALETTE.length];
      const courseCode = result.courseCode || fileName.replace(/\.pdf$/i, "").slice(0, 20);
      const courseName = result.courseName || courseCode;
      const expanded = expandEvents({ ...result, courseCode, courseName }, color);
      setAllEvents((evs) => [...evs, ...expanded].sort((a, b) => a.date.localeCompare(b.date)));
      return [...prev, { code: courseCode, name: courseName, color }];
    });
  }, []);

  const handleFile = useCallback(async (file: File, label?: string) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError(`${file.name} is not a PDF — skipped.`);
      return;
    }

    setError(null);
    setLoadingPhase(label ?? "Analyzing your syllabus...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/syllabus/extract", { method: "POST", body: formData });

      // Read as text first so we never get a raw browser JSON.parse error
      const body = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(body);
      } catch {
        if (res.status === 413) throw new Error("PDF is too large. Try a version under 4 MB.");
        throw new Error("Request timed out. Try again — it usually works on the second attempt once the server is warm.");
      }
      if (!res.ok) throw new Error((data.error as string) ?? "Extraction failed");

      applyResult(data, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoadingPhase(null);
    }
  }, [applyResult]);

  const addToQueue = useCallback((incoming: File[]) => {
    const pdfs = incoming.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) { setError("Please upload PDF files only."); return; }
    setError(null);
    setPendingFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...pdfs.filter(f => !existing.has(f.name))];
    });
  }, []);

  const handleScanAll = useCallback(async () => {
    const files = [...pendingFiles];
    setPendingFiles([]);
    for (let i = 0; i < files.length; i++) {
      await handleFile(files[i], files.length > 1 ? `Analyzing ${i + 1} of ${files.length}…` : undefined);
    }
  }, [pendingFiles, handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addToQueue(Array.from(e.dataTransfer.files));
  }, [addToQueue]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addToQueue(Array.from(e.target.files ?? []));
    e.target.value = "";
  }, [addToQueue]);

  const exportICS = () => {
    const ics = generateICS(allEvents);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "syllabus-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthEvents = allEvents.filter((ev) => ev.date.startsWith(monthPrefix));

  const todayStr = new Date().toISOString().split("T")[0];
  const upcoming = allEvents.filter((ev) => ev.date >= todayStr).slice(0, 6);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#111827" }}>
      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <header style={{ background: "#1e3a5f", color: "#fff", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <div style={{ width: 36, height: 36, background: "#f8b400", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "#1e3a5f" }}>
            A
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px", color: "#fff" }}>Advisle</span>
        </a>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 20 }}>·</span>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>Syllabus Calendar</span>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 24px 64px" }}>

        {/* Hero (only when empty) */}
        {!hasEvents && !loadingPhase && (
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f8b400" }}>
              New Feature
            </p>
            <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 800, color: "#1e3a5f", letterSpacing: "-0.5px" }}>
              Turn any syllabus into a calendar
            </h1>
            <p style={{ margin: 0, fontSize: 15, color: "#6b7280", maxWidth: 480, marginLeft: "auto", marginRight: "auto", lineHeight: 1.65 }}>
              Drop your course syllabus PDF and AI will pull every homework, exam, quiz, and deadline — including recurring ones — into a calendar you can export.
            </p>
          </div>
        )}

        {/* Upload zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !loadingPhase && inputRef.current?.click()}
          style={{
            background: dragOver ? "#eff6ff" : "#fff",
            border: `2px dashed ${dragOver ? "#2563eb" : "#d1d5db"}`,
            borderRadius: 14,
            padding: hasEvents ? "20px 24px" : "44px 24px",
            textAlign: "center",
            cursor: loadingPhase ? "default" : "pointer",
            transition: "all 0.15s",
            marginBottom: 24,
          }}
        >
          <input ref={inputRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={handleChange} />

          {loadingPhase ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <div style={{ width: 22, height: 22, border: "2.5px solid #e5e7eb", borderTopColor: "#1e3a5f", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{loadingPhase}</p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: hasEvents ? 24 : 40, marginBottom: hasEvents ? 6 : 14 }}>📄</div>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: hasEvents ? 14 : 16, color: "#1e3a5f" }}>
                {hasEvents ? "Add more courses" : "Drop your syllabus PDFs here"}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                {hasEvents ? "or click to browse · multiple PDFs at once" : "or click to browse · multiple PDFs at once · supports scanned pages"}
              </p>
            </div>
          )}
        </div>

        {/* Pending queue + scan button */}
        {pendingFiles.length > 0 && !loadingPhase && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "16px 20px", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e3a5f" }}>
                {pendingFiles.length} syllabus{pendingFiles.length !== 1 ? "es" : ""} queued
              </p>
              <button
                onClick={handleScanAll}
                style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                Scan {pendingFiles.length > 1 ? `all ${pendingFiles.length}` : ""} →
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pendingFiles.map((f, i) => (
                <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <span style={{ fontSize: 13, color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <button
                    onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 20px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <p style={{ margin: 0, fontSize: 14, color: "#dc2626", lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {/* Calendar */}
        {hasEvents && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 24 }}>

            {/* Calendar toolbar */}
            <div style={{ background: "#1e3a5f", padding: "18px 24px" }}>
              {/* Course chips */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {courses.map((c) => (
                  <span key={c.code} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "rgba(255,255,255,0.12)", color: "#fff",
                    fontSize: 12, fontWeight: 600, padding: "3px 10px",
                    borderRadius: 99, border: `1.5px solid ${c.color}`,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    {c.code}
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                {/* Month nav */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={prevMonth} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ‹
                  </button>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#fff", minWidth: 210, textAlign: "center" }}>
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </h2>
                  <button onClick={nextMonth} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ›
                  </button>
                </div>

                {/* Export */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <button
                    onClick={exportICS}
                    style={{ background: "#f8b400", color: "#1e3a5f", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    ↓ Export to Calendar (.ics)
                  </button>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {allEvents.length} events across {courses.length} course{courses.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Calendar grid */}
            <div style={{ padding: "16px 20px" }}>
              <MonthCalendar year={viewYear} month={viewMonth} events={monthEvents} onEventClick={setSelectedEvent} />
              {monthEvents.length === 0 && (
                <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 14, marginTop: 40, marginBottom: 8 }}>
                  No events this month
                </p>
              )}
            </div>

            {/* Legend */}
            <div style={{ padding: "4px 20px 18px", display: "flex", gap: 14, flexWrap: "wrap" }}>
              {Object.entries(EVENT_STYLES).map(([type, s]) => (
                <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6b7280" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0 }} />
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming events */}
        {upcoming.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: "20px 24px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#1e3a5f" }}>
              Upcoming
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {upcoming.map((ev) => {
                const s = EVENT_STYLES[ev.type] ?? EVENT_STYLES.other;
                const d = new Date(ev.date + "T12:00:00");
                const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", padding: "4px 0" }}
                  >
                    <span style={{ fontSize: 12, color: "#6b7280", minWidth: 96 }}>{label}</span>
                    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, borderRadius: 5, fontSize: 13, padding: "2px 10px", fontWeight: 500 }}>
                      {ev.title}
                    </span>
                    {ev.courseCode && (
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{ev.courseCode}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
          >
            {(() => {
              const s = EVENT_STYLES[selectedEvent.type] ?? EVENT_STYLES.other;
              const d = new Date(selectedEvent.date + "T12:00:00");
              const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, borderRadius: 6, fontSize: 12, padding: "3px 10px", fontWeight: 600, textTransform: "capitalize" }}>
                      {selectedEvent.type}
                    </span>
                    <button onClick={() => setSelectedEvent(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
                  </div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#1e3a5f", lineHeight: 1.3 }}>
                    {selectedEvent.title}
                  </h3>
                  <p style={{ margin: "0 0 4px", fontSize: 14, color: "#374151" }}>{label}</p>
                  {selectedEvent.courseCode && (
                    <p style={{ margin: "0 0 0", fontSize: 13, color: "#9ca3af" }}>
                      {selectedEvent.courseName || selectedEvent.courseCode}
                    </p>
                  )}
                  {selectedEvent.description && (
                    <p style={{ margin: "14px 0 0", fontSize: 14, color: "#374151", lineHeight: 1.6, borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
                      {selectedEvent.description}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
