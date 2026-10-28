import { notFound } from "next/navigation";
import redis from "@/lib/redis";
import { colors, radius, shadow } from "@/lib/theme";

const CATEGORY_COLORS: Record<string, string> = {
  "Major Core": "#2563eb",
  "Major Elective": "#7c3aed",
  "General Education": "#059669",
  "Free Elective": "#d97706",
  Other: "#6b7280",
};

const DAY_LABELS: Record<string, string> = {
  M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday",
};

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
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

interface SavedSchedule {
  id: string;
  schedule: {
    recommended_schedule: ScheduledCourse[];
    total_credits: number;
    notes: string;
  };
  audit: {
    student_name: string | null;
    major: string | null;
  };
  created_at: string;
}

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log("Looking for schedule:", id);
  const data = await redis.get<SavedSchedule>(`schedule:${id}`);
  console.log("Redis result:", data);

  if (!data) notFound();

  const { schedule, audit, created_at } = data;
  const date = new Date(created_at).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(30,58,95,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        color: "#fff", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <a href="/scheduler" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 32, height: 32, background: colors.accent, borderRadius: radius.sm, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: colors.ink }}>
            A
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 650, color: "#fff", letterSpacing: "-0.3px" }}>Advisle</h1>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.65, color: "#fff" }}>AI-powered course scheduling for University of Vermont students</p>
          </div>
        </a>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
        {/* Schedule header */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: shadow.sm, padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>
                {audit.student_name ? `${audit.student_name}'s Schedule` : "Shared Schedule"}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
                {schedule.total_credits} credits · Spring 2027
                {audit.major && ` · ${audit.major}`}
                {" · "} Generated {date}
              </p>
            </div>
            <a
              href="/scheduler"
              className="adv-btn"
              style={{ padding: "8px 16px", borderRadius: radius.pill, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", textDecoration: "none" }}
            >
              Make My Own →
            </a>
          </div>

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
                      <span>👤 {c.instructor || "TBA"}</span>
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
        </div>

        {/* Summary */}
        <div style={{ background: colors.ink, color: "#fff", borderRadius: radius.sm + 2, padding: "16px 24px", display: "flex", gap: 32, boxShadow: shadow.glow }}>
          <div><div style={{ fontSize: 24, fontWeight: 800 }}>{schedule.total_credits}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Total Credits</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800 }}>{schedule.recommended_schedule.length}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Courses</div></div>
        </div>
      </main>
    </div>
  );
}
