import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawCourse {
  Subj: string;
  "#": string;
  Title: string;
  "Comp Numb": string;
  Sec: string;
  Ptrm: string;
  "Lec Lab": string;
  Attr: string;
  "Camp Code": string;
  "Coll Code": string;
  "Max Enrollment": string;
  "Current Enrollment": string;
  "True Max": string;
  "Start Time": string;
  "End Time": string;
  Days: string;
  Credits: string;
  Bldg: string;
  Room: string;
  "GP Ind": string;
  Instructor: string;
  NetId: string;
  Email: string;
  Fees: string;
  XListings: string;
}

export interface CourseSection {
  subject: string;
  number: string;
  title: string;
  crn: string;
  section: string;
  type: string; // LEC, LAB, DIS, etc.
  startTime: string; // "11:40"
  endTime: string; // "12:55"
  days: string[]; // ["M", "W", "F"]
  credits: number;
  building: string;
  room: string;
  instructor: string;
  maxEnrollment: number;
  currentEnrollment: number;
  isFull: boolean;
}

export interface BlockedTime {
  day: string; // "M", "T", "W", "R", "F"
  startTime: string; // "09:00"
  endTime: string; // "17:00"
}

export interface RemainingCourse {
  subject: string;
  number: string;
  title: string;
  credits: number;
  requirement_category: string;
}

// ─── Day Parsing ──────────────────────────────────────────────────────────────
// The Days field is positional: "M T W R F S  "
//                                 0123456789...
// Position 0 = M, 1 = (space), 2 = T, 3 = (space), 4 = W, 5 = (space), 6 = R, ...

function parseDays(daysStr: string): string[] {
  if (!daysStr || daysStr.trim() === "") return [];
  // New CSV format: "M W F" or "T R" or "M T W F"
  const parts = daysStr.trim().split(/\s+/);
  const validDays = ["M", "T", "W", "R", "F", "S"];
  return parts.filter(d => validDays.includes(d));
}

function parseCredits(creditStr: string): number {
  if (!creditStr || creditStr.trim() === "") return 3;
  // Handle ranges like "1 to 18"
  if (creditStr.includes("to")) {
    const parts = creditStr.split("to");
    return parseInt(parts[0].trim(), 10) || 3;
  }
  return parseFloat(creditStr.trim()) || 3;
}

// ─── Load & Parse Course CSV ──────────────────────────────────────────────────

let courseCache: CourseSection[] | null = null;

function loadCourses(): CourseSection[] {
  if (courseCache) return courseCache;

  const csvPath = path.join(process.cwd(), "data", "curr_enroll_202609.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");

  // csv-parse handles quoted fields correctly
  const records: RawCourse[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  courseCache = records
    .filter((r) => r["Lec Lab"] === "LEC" || r["Lec Lab"] === "LAB" || r["Lec Lab"] === "DIS")
    .map((r): CourseSection => ({
      subject: r.Subj?.trim() ?? "",
      number: r["#"]?.trim() ?? "",
      title: r.Title?.trim() ?? "",
      crn: r["Comp Numb"]?.trim() ?? "",
      section: r.Sec?.trim() ?? "",
      type: r["Lec Lab"]?.trim() ?? "",
      startTime: r["Start Time"]?.trim() ?? "",
      endTime: r["End Time"]?.trim() ?? "",
      days: parseDays(r.Days ?? ""),
      credits: parseCredits(r.Credits ?? ""),
      building: r.Bldg?.trim() ?? "",
      room: r.Room?.trim() ?? "",
      instructor: r.Instructor?.trim() ?? "",
      maxEnrollment: parseInt(r["Max Enrollment"] ?? "0", 10),
      currentEnrollment: parseInt(r["Current Enrollment"] ?? "0", 10),
      isFull: false,
    }));

  return courseCache;
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  if (!t || t === "TBA") return -1;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function hasTimeConflict(
  section: CourseSection,
  blockedTimes: BlockedTime[]
): boolean {
  if (!section.startTime || section.startTime === "TBA") return false;
  const sStart = timeToMinutes(section.startTime);
  const sEnd = timeToMinutes(section.endTime);

  for (const block of blockedTimes) {
    if (!section.days.includes(block.day)) continue;
    const bStart = timeToMinutes(block.startTime);
    const bEnd = timeToMinutes(block.endTime);
    // Overlap if not (sEnd <= bStart || sStart >= bEnd)
    if (!(sEnd <= bStart || sStart >= bEnd)) return true;
  }
  return false;
}

function hasScheduleConflict(
  section: CourseSection,
  scheduled: CourseSection[]
): boolean {
  for (const existing of scheduled) {
    for (const day of section.days) {
      if (!existing.days.includes(day)) continue;
      const aStart = timeToMinutes(section.startTime);
      const aEnd = timeToMinutes(section.endTime);
      const bStart = timeToMinutes(existing.startTime);
      const bEnd = timeToMinutes(existing.endTime);
      if (!(aEnd <= bStart || aStart >= bEnd)) return true;
    }
  }
  return false;
}

// ─── Find Available Sections ──────────────────────────────────────────────────

function findAvailableSections(
  course: RemainingCourse,
  allSections: CourseSection[],
  blockedTimes: BlockedTime[],
  scheduled: CourseSection[]
): CourseSection[] {
  return allSections.filter((s) => {
    // Match subject + number
    if (s.subject !== course.subject.toUpperCase()) return false;
    if (s.number !== course.number) return false;
    // Only lectures for main scheduling
    if (s.type !== "LEC") return false;
    // Skip TBA
    if (!s.startTime || s.startTime === "TBA") return false;
    // Not full
    if (s.isFull) return false;
    // No blocked time conflict
    if (hasTimeConflict(s, blockedTimes)) return false;
    // No conflict with already scheduled courses
    if (hasScheduleConflict(s, scheduled)) return false;
    return true;
  });
}

// ─── AI Schedule Generator ────────────────────────────────────────────────────

async function generateScheduleWithAI(
  remainingCourses: RemainingCourse[],
  availableSectionsMap: Record<string, CourseSection[]>,
  blockedTimes: BlockedTime[],
  completedCourses: { subject: string; number: string; title: string }[]
): Promise<string> {
  const context = {
    remaining_courses: remainingCourses,
    available_sections: availableSectionsMap,
    blocked_times: blockedTimes,
    completed_courses: completedCourses,
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are a UVM academic advisor helping students build their semester schedule.

Given a list of courses a student needs and the available sections (with no time conflicts already filtered out), 
recommend the BEST schedule — typically 4-5 courses, 12-16 credits.

Prioritize:
1. Required/core courses over electives
2. Spreading classes across the week (avoid 4+ classes on one day)
3. Reasonable start times (avoid very early morning if possible)
4. Manageable credit load
5. For General Education requirements (AH1, AH2, N1, N2, D1, D2, QD, MA, SU, GC):
   - Match courses using the Attr field in available_sections
   - Only recommend a course for a Gen Ed slot if its Attr field contains the required attribute code
   - Never use GEN_ED placeholder courses — always pick a real course from available_sections

PREREQUISITE CHECKING (very important):
- Use your knowledge of UVM course prerequisites to verify the student has completed all prereqs
- The student's completed courses are included in the request as "completed_courses"
- If a student has not completed the prereqs for a course, add it to "unscheduled_courses" with a note explaining which prereq is missing
- Example: if MATH 2522 requires MATH 1248, and MATH 1248 is not in completed_courses, exclude it

IMPORTANT RULES:
- When a student needs "MATH 2522 OR MATH 2544" (alternative courses), schedule ONLY ONE of them, not both
- Similarly for any "or" choices — pick the best single option, never schedule both
- For prereqs: MATH 2522 and MATH 2544 both require MATH 1248 (Calculus II). If MATH 1248 is in remaining_courses (meaning not yet completed), do NOT schedule MATH 2522 or MATH 2544 this semester
- General rule: if Course A is in remaining_courses AND Course B requires Course A as a prereq, don't schedule Course B in the same semester
- Never recommend a course unless it appears in available_sections with a real CRN
- If no real course satisfies a Gen Ed requirement, add it to unscheduled_courses instead of making one up

Return ONLY valid JSON, no markdown, no explanation:
{
  "recommended_schedule": [
    {
      "subject": "CS",
      "number": "2100", 
      "title": "Intro to Data Structures",
      "crn": "12345",
      "section": "A",
      "days": ["M", "W", "F"],
      "startTime": "10:00",
      "endTime": "10:50",
      "instructor": "Smith, John",
      "credits": 3,
      "building": "VOTEY",
      "room": "207",
      "requirement_category": "Major Core"
    }
  ],
  "total_credits": 15,
  "notes": "Brief explanation of choices made",
  "unscheduled_courses": ["MATH 2522 - missing prereq: MATH 1248 (Calculus II)"]
}`,
      },
      {
        role: "user",
        content: JSON.stringify(context),
      },
    ],
  });

  return response.choices[0].message.content ?? "{}";
}

// ─── Main Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
  remaining_courses,
  completed_courses = [],
  blocked_times = [],
  max_credits = 16,
}: {
  remaining_courses: RemainingCourse[];
  completed_courses: { subject: string; number: string; title: string }[];
  blocked_times: BlockedTime[];
  max_credits?: number | undefined;
} = body;

    if (!remaining_courses || remaining_courses.length === 0) {
      return NextResponse.json(
        { error: "No remaining courses provided" },
        { status: 400 }
      );
    }

    // Load course catalog
    const allSections = loadCourses();

    // For each remaining course, find available conflict-free sections
    const scheduled: CourseSection[] = [];
    const availableSectionsMap: Record<string, CourseSection[]> = {};

    for (const course of remaining_courses) {
      const key = `${course.subject} ${course.number}`;
      const available = findAvailableSections(
        course,
        allSections,
        blocked_times,
        scheduled
      );
      if (available.length > 0) {
        availableSectionsMap[key] = available;
      }
    }

    // Use AI to pick the best combination
    const rawResponse = await generateScheduleWithAI(
      remaining_courses,
      availableSectionsMap,
      blocked_times,
      completed_courses
    );

    const cleaned = rawResponse.replace(/```json|```/g, "").trim();
    const schedule = JSON.parse(cleaned);

    return NextResponse.json({
      ...schedule,
      available_sections_found: Object.keys(availableSectionsMap).length,
      total_courses_needed: remaining_courses.length,
    });
  } catch (err) {
    console.error("generate-schedule error:", err);
    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 }
    );
  }
}
