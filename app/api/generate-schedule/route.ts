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
  "Lec Lab": string;
  "Start Time": string;
  "End Time": string;
  Days: string;
  Credits: string;
  Bldg: string;
  Room: string;
  Instructor: string;
  "Max Enrollment": string;
  "Current Enrollment": string;
  Attr: string;
  Prerequisites: string;
  [key: string]: string;
}

export interface CourseSection {
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
  isFull: boolean;
  attributes: string[];
  prereqs: string;
}

export interface BlockedTime {
  day: string;
  startTime: string;
  endTime: string;
}

export interface RemainingCourse {
  subject: string;
  number: string;
  title: string;
  credits: number;
  requirement_category: string;
}

export interface SimpleCourse {
  subject: string;
  number: string;
  title: string;
  credits?: number;
}

// ─── Day Parsing ──────────────────────────────────────────────────────────────

function parseDays(daysStr: string): string[] {
  if (!daysStr || daysStr.trim() === "") return [];
  // New CSV: "M W F" or "T R" — space separated
  const parts = daysStr.trim().split(/\s+/);
  const valid = ["M", "T", "W", "R", "F", "S"];
  return parts.filter((d) => valid.includes(d));
}

function parseCredits(s: string): number {
  if (!s || s.trim() === "") return 3;
  if (s.includes("to")) return parseInt(s.split("to")[0].trim()) || 3;
  const n = parseFloat(s.trim());
  // If parsed value is 0 or 1 for a non-seminar course, default to 3
  // (scraper bug where section count was used instead of credits)
  return isNaN(n) || n === 0 ? 3 : n;
}

// ─── Load CSV ─────────────────────────────────────────────────────────────────

let courseCache: CourseSection[] | null = null;

export function loadCourses(): CourseSection[] {
  if (courseCache) return courseCache;

  const csvPath = path.join(process.cwd(), "data", "curr_enroll_202609.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");

  const records: RawCourse[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  courseCache = records
    .filter((r) => {
      const type = r["Lec Lab"]?.trim();
      return type === "LEC" || type === "LAB" || type === "DIS";
    })
    .map((r): CourseSection => {
      const credits = parseCredits(r.Credits ?? "");
      return {
        subject: r.Subj?.trim() ?? "",
        number: r["#"]?.trim() ?? "",
        title: r.Title?.trim() ?? "",
        crn: r["Comp Numb"]?.trim() ?? "",
        section: r.Sec?.trim() ?? "",
        type: r["Lec Lab"]?.trim() ?? "",
        startTime: r["Start Time"]?.trim() ?? "",
        endTime: r["End Time"]?.trim() ?? "",
        days: parseDays(r.Days ?? ""),
        credits,
        building: r.Bldg?.trim() ?? "",
        room: r.Room?.trim() ?? "",
        instructor: r.Instructor?.trim() ?? "",
        isFull: false, // enrollment data not reliable in scraped CSV
        attributes: (r.Attr ?? "").split("|").map((a) => a.trim()).filter(Boolean),
        prereqs: r.Prerequisites?.trim() ?? "",
      };
    });

  return courseCache;
}

// ─── Time Helpers ─────────────────────────────────────────────────────────────

export function timeToMin(t: string): number {
  if (!t || t === "TBA") return -1;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function hasTimeConflict(s: CourseSection, blocked: BlockedTime[]): boolean {
  if (!s.startTime || s.startTime === "TBA") return false;
  const sStart = timeToMin(s.startTime);
  const sEnd = timeToMin(s.endTime);
  for (const b of blocked) {
    if (!s.days.includes(b.day)) continue;
    const bStart = timeToMin(b.startTime);
    const bEnd = timeToMin(b.endTime);
    if (!(sEnd <= bStart || sStart >= bEnd)) return true;
  }
  return false;
}

export function hasScheduleConflict(s: CourseSection, scheduled: CourseSection[]): boolean {
  for (const ex of scheduled) {
    for (const day of s.days) {
      if (!ex.days.includes(day)) continue;
      const aStart = timeToMin(s.startTime);
      const aEnd = timeToMin(s.endTime);
      const bStart = timeToMin(ex.startTime);
      const bEnd = timeToMin(ex.endTime);
      if (!(aEnd <= bStart || aStart >= bEnd)) return true;
    }
  }
  return false;
}

// ─── Find Available Sections ──────────────────────────────────────────────────

function findAvailableSections(
  course: RemainingCourse,
  allSections: CourseSection[],
  blocked: BlockedTime[],
  scheduled: CourseSection[],
  inProgressCourses: SimpleCourse[],
  completedCourses: SimpleCourse[]
): CourseSection[] {
  const allDone = [...inProgressCourses, ...completedCourses];

  return allSections.filter((s) => {
    // Subject must match (handle GEN_ED separately)
    if (course.subject === "GEN_ED") {
      // Match by attribute
      const attrNeeded = course.number; // e.g. "AH1", "N2_LAB"
      const attrCode = attrNeeded.replace("_LAB", "");
      if (!s.attributes.some((a) => a === attrCode)) return false;
    } else {
      if (s.subject !== course.subject.toUpperCase()) return false;

      // Handle wildcard number like "3000+" or "3@"
      if (course.number.endsWith("+") || course.number.includes("@")) {
        const minLevel = parseInt(course.number.replace("+", "").replace("@", "")) *
          (course.number.includes("@") ? 1000 : 1);
        if (parseInt(s.number) < minLevel) return false;
      } else if (course.number === "TBD") {
        // Can't match TBD courses
        return false;
      } else {
        if (s.number !== course.number) return false;
      }
    }

    // Only schedule lectures
    if (s.type !== "LEC") return false;

    // Skip TBA times
    if (!s.startTime || s.startTime === "TBA") return false;

    // Skip courses already in-progress or completed
    if (allDone.some((d) => d.subject === s.subject && d.number === s.number)) return false;

    // No blocked time conflict
    if (hasTimeConflict(s, blocked)) return false;

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
  completedCourses: SimpleCourse[],
  inProgressCourses: SimpleCourse[],
  targetCredits: number = 15
): Promise<string> {
  const context = {
    remaining_courses: remainingCourses,
    available_sections: availableSectionsMap,
    blocked_times: blockedTimes,
    completed_courses: completedCourses,
    in_progress_courses: inProgressCourses,
    target_credits: targetCredits,
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 3000,
    messages: [
      {
        role: "system",
        content: `You are a UVM academic advisor helping students build their Fall 2026 semester schedule.

Given a list of courses a student still needs and the available sections, recommend the BEST schedule of 4-5 courses, 12-16 credits.

CRITICAL RULES:
1. NEVER schedule a course that appears in in_progress_courses — these are already being taken this semester
2. NEVER schedule a course that appears in completed_courses — already done
3. NEVER schedule two courses that share any day AND have overlapping times. Before returning your answer, go through every pair of courses and verify they don't conflict. Here is how to check: if Course A is on days ["T","R"] from 8:30-9:45, then NO other course can be on T or R between 8:30-9:45. Check every single pair. If you find a conflict, remove the lower priority course and replace it with a different section or different course that fits.
4. For OR alternatives (e.g. "MATH 2522 or 2544" listed as one entry): pick ONE section only, never both
5. PREREQUISITE CHECK: Use your knowledge of UVM prereqs AND the completed_courses list:
   - If a course requires a prereq that is still in remaining_courses (not yet taken), DO NOT schedule it
   - Example: MATH 2522 requires MATH 1248. If MATH 1248 is in remaining_courses, skip MATH 2522
   - Be lenient with transfer credits — if unsure, include the course
6. The student wants ${targetCredits} credits. To account for potential conflicts being removed after scheduling, aim for ${targetCredits + 4} credits initially by selecting MORE courses than needed. This buffer ensures the final schedule hits the target even if 1-2 courses get removed for conflicts.
7. Only include courses that appear in available_sections with a real CRN
8. Prioritize: Major Core > Major Elective > General Education > Free Elective
9. Spread classes across the week — avoid 4+ classes on same day
10. For "3000+" or level requirements: pick ONE good course from available sections, not multiple

IMPORTANT: When you select a real course from available_sections to satisfy a GEN_ED requirement, use that course's actual subject and number in the output — NOT "GEN_ED" or "AH1" etc. For example if ARTH 1010 satisfies an AH1 requirement, output subject: "ARTH", number: "1010", not subject: "GEN_ED", number: "AH1".

Return ONLY valid JSON, no markdown:
{
  "recommended_schedule": [
    {
      "subject": "MATH",
      "number": "1248",
      "title": "Calculus II",
      "crn": "92906",
      "section": "A",
      "days": ["M", "W", "F"],
      "startTime": "08:30",
      "endTime": "09:20",
      "instructor": "D. Hathaway",
      "credits": 4,
      "building": "",
      "room": "",
      "requirement_category": "Major Core"
    }
  ],
  "total_credits": 15,
  "notes": "Brief explanation of choices",
  "unscheduled_courses": ["MATH 2522 - prereq MATH 1248 not yet completed"]
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
      in_progress_courses = [],
      blocked_times = [],
      target_credits = 15,
}: {
      remaining_courses: RemainingCourse[];
      completed_courses: SimpleCourse[];
      in_progress_courses: SimpleCourse[];
      blocked_times: BlockedTime[];
      target_credits?: number;
} = body;

    if (!remaining_courses || remaining_courses.length === 0) {
      return NextResponse.json({ error: "No remaining courses provided" }, { status: 400 });
    }

    const allSections = loadCourses();
    const scheduled: CourseSection[] = [];
    const availableSectionsMap: Record<string, CourseSection[]> = {};

    for (const course of remaining_courses) {
      const key = `${course.subject} ${course.number}`;
      const available = findAvailableSections(
        course,
        allSections,
        blocked_times,
        scheduled,
        in_progress_courses,
        completed_courses
      );
      if (available.length > 0) {
        availableSectionsMap[key] = available;
      }
    }

    const rawResponse = await generateScheduleWithAI(
      remaining_courses,
      availableSectionsMap,
      blocked_times,
      completed_courses,
      in_progress_courses,
      target_credits
    );

    const cleaned = rawResponse.replace(/```json|```/g, "").trim();
    const schedule = JSON.parse(cleaned);

    // Post-process: remove any conflicting courses GPT snuck in
const validSchedule: typeof schedule.recommended_schedule = [];
for (const course of schedule.recommended_schedule) {
  const days: string[] = Array.isArray(course.days)
    ? course.days
    : (course.days ?? "").split("").filter((d: string) => ["M","T","W","R","F"].includes(d));
  const startMin = timeToMin(course.startTime);
  const endMin = timeToMin(course.endTime);

  const hasConflict = validSchedule.some(existing => {
    const existingDays: string[] = Array.isArray(existing.days)
      ? existing.days
      : (existing.days ?? "").split("").filter((d: string) => ["M","T","W","R","F"].includes(d));
    const sharedDay = existingDays.some((d: string) => days.includes(d));
    if (!sharedDay) return false;
    const eStart = timeToMin(existing.startTime);
    const eEnd = timeToMin(existing.endTime);
    return !(endMin <= eStart || startMin >= eEnd);
  });

  if (!hasConflict) validSchedule.push(course);
}
schedule.recommended_schedule = validSchedule;
schedule.total_credits = validSchedule.reduce((sum: number, c: {credits: number}) => sum + (c.credits || 0), 0);

    return NextResponse.json({
      ...schedule,
      available_sections_found: Object.keys(availableSectionsMap).length,
      total_courses_needed: remaining_courses.length,
      });
      } catch (err) {
      console.error("generate-schedule error:", err);
      return NextResponse.json({ error: "Failed to generate schedule" }, { status: 500 });
  }
}
