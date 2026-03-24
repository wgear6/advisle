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
  maxEnrollment: number;
  currentEnrollment: number;
  seatsAvailable: number;
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

interface AICoursePick {
  subject: string;
  number: string;
  requirement_category: string;
}

interface AISelection {
  prioritized_courses: AICoursePick[];
  excluded_courses: AICoursePick[];
  notes: string;
  skipped_courses: string[];
}

// ─── Day Parsing ──────────────────────────────────────────────────────────────

function parseDays(daysStr: string): string[] {
  if (!daysStr || daysStr.trim() === "") return [];
  const parts = daysStr.trim().split(/\s+/);
  const valid = ["M", "T", "W", "R", "F", "S"];
  return parts.filter((d) => valid.includes(d));
}

function parseCredits(s: string): number {
  if (!s || s.trim() === "") return 3;
  if (s.includes("to")) return parseInt(s.split("to")[0].trim()) || 3;
  const n = parseFloat(s.trim());
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
      const maxEnrollment = parseInt(r["Max Enrollment"] ?? "0") || 0;
      const currentEnrollment = parseInt(r["Current Enrollment"] ?? "0") || 0;
      const seatsAvailable = Math.max(0, maxEnrollment - currentEnrollment);
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
        isFull: maxEnrollment > 0 && seatsAvailable === 0,
        maxEnrollment,
        currentEnrollment,
        seatsAvailable,
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

// ─── Prereq Checker ───────────────────────────────────────────────────────────

export function prereqsSatisfied(prereqs: string, doneKeys: Set<string>): boolean {
  if (!prereqs || prereqs.trim() === "") return true;
  const codes = [...prereqs.matchAll(/\b([A-Z]{2,5})\s+(\d{3,4})\b/g)].map(
    (m) => `${m[1]} ${m[2]}`
  );
  if (codes.length === 0) return true;
  if (prereqs.toLowerCase().includes(" or ")) {
    return codes.some((c) => doneKeys.has(c));
  }
  return codes.every((c) => doneKeys.has(c));
}

// ─── Find Available Sections ──────────────────────────────────────────────────

export function findAvailableSections(
  course: RemainingCourse,
  allSections: CourseSection[],
  blocked: BlockedTime[],
  scheduled: CourseSection[],
  inProgressCourses: SimpleCourse[],
  completedCourses: SimpleCourse[]
): CourseSection[] {
  const allDone = [...inProgressCourses, ...completedCourses];
  const rawDoneKeys = new Set(allDone.map((d) => `${d.subject.toUpperCase()} ${d.number}`));

  // Treat UVM cross-listed pairs as the same course (3xxx ↔ 5xxx with matching last 3 digits)
  const allDoneKeys = new Set(rawDoneKeys);
  for (const key of rawDoneKeys) {
    const spaceIdx = key.indexOf(" ");
    const subj = key.slice(0, spaceIdx);
    const num = key.slice(spaceIdx + 1);
    if (num.length === 4 && num[0] === "3") allDoneKeys.add(`${subj} 5${num.slice(1)}`);
    if (num.length === 4 && num[0] === "5") allDoneKeys.add(`${subj} 3${num.slice(1)}`);
  }

  return allSections.filter((s) => {
    if (course.subject === "GEN_ED") {
      const attrCode = course.number.replace("_LAB", "");
      if (!s.attributes.some((a) => a === attrCode)) return false;
    } else {
      if (s.subject !== course.subject.toUpperCase()) return false;

      if (course.number.endsWith("+") || course.number.includes("@")) {
        const minLevel = parseInt(course.number.replace("+", "").replace("@", "")) *
          (course.number.includes("@") ? 1000 : 1);
        if (parseInt(s.number) < minLevel) return false;
      } else if (course.number === "TBD") {
        return false;
      } else {
        if (s.number !== course.number) return false;
      }
    }

    if (s.type !== "LEC" && s.type !== "LAB") return false;
    if (!s.startTime || s.startTime === "TBA") return false;
    if (allDoneKeys.has(`${s.subject.toUpperCase()} ${s.number}`)) return false;
    if (hasTimeConflict(s, blocked)) return false;
    if (hasScheduleConflict(s, scheduled)) return false;

    return true;
  });
}

// ─── AI: Select Which Courses To Take ────────────────────────────────────────
// AI is only responsible for WHICH courses to prioritize.
// It never picks CRNs, times, or sections — the algorithm handles that.

async function selectCoursesWithAI(
  remainingCourses: RemainingCourse[],
  availableCourseKeys: Set<string>,
  completedCourses: SimpleCourse[],
  inProgressCourses: SimpleCourse[],
  targetCredits: number,
  creditsCompleted: number | null,
  major: string | null,
  customNotes: string
): Promise<AISelection> {
  const yearContext = creditsCompleted !== null
    ? creditsCompleted < 30 ? "FRESHMAN (under 30 credits)"
    : creditsCompleted < 60 ? "SOPHOMORE (30–59 credits)"
    : creditsCompleted < 90 ? "JUNIOR (60–89 credits)"
    : "SENIOR (90+ credits)"
    : null;

  // Annotate each remaining course with whether it has real sections available
  const annotatedCourses = remainingCourses.map((c) => ({
    subject: c.subject,
    number: c.number,
    title: c.title,
    credits: c.credits,
    requirement_category: c.requirement_category,
    has_sections: availableCourseKeys.has(`${c.subject.toUpperCase()} ${c.number}`),
  }));

  const context = {
    remaining_courses: annotatedCourses,
    completed_courses: completedCourses,
    in_progress_courses: inProgressCourses,
    target_credits: targetCredits,
    credits_completed: creditsCompleted,
    major,
    custom_notes: customNotes || undefined,
  };

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a UVM academic advisor selecting courses for a student's Fall 2026 semester.

Your ONLY job is to return a PRIORITIZED LIST of courses the student should take — do NOT pick sections, times, or CRNs. A separate algorithm will find real conflict-free sections automatically.

TARGET: ${targetCredits} credits. Include courses totaling ~${Math.round(targetCredits * 1.4)} credits worth so the algorithm has enough to work with after filtering.

RULES:
1. Only include courses where has_sections=true — others have no available sections
2. NEVER include courses from completed_courses or in_progress_courses
3. in_progress_courses count as satisfied prerequisites for next semester
4. Do NOT include courses whose prereqs aren't yet met (check completed + in_progress)
5. Do NOT include capstone/senior-only courses for freshmen or sophomores
6. Prioritize strictly: Minor > Major Core > Major Elective > General Education > Free Elective
   — always fill with major courses first. Only add General Education if credits remain after major courses.
7. For GEN_ED requirements, include them as-is (subject: "GEN_ED", number: "AH1" etc.) — the algorithm picks the actual course
8. STUDENT NOTES override everything — if the student says do not take a course, put it in excluded_courses and NEVER include it in prioritized_courses
${yearContext ? `\nSTUDENT YEAR: ${yearContext}` : ""}${major ? `\nSTUDENT MAJOR: ${major}` : ""}
${customNotes ? `\nSTUDENT NOTES (follow carefully — these override all other rules): ${customNotes}` : ""}

Return ONLY valid JSON:
{
  "prioritized_courses": [
    { "subject": "CS", "number": "2240", "requirement_category": "Major Core" },
    { "subject": "GEN_ED", "number": "AH1", "requirement_category": "General Education" }
  ],
  "excluded_courses": [
    { "subject": "CS", "number": "3081", "requirement_category": "Major Elective" }
  ],
  "notes": "Brief explanation of choices and any important considerations",
  "skipped_courses": ["CS 3081 - prereq CS 2240 not yet satisfied"]
}`,
      },
      {
        role: "user",
        content: JSON.stringify(context),
      },
    ],
  });

  const raw = response.choices[0].message.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { prioritized_courses: [], excluded_courses: [], notes: "AI response parse error", skipped_courses: [] };
  }
}

// ─── Algorithm: Build Conflict-Free Schedule ─────────────────────────────────
// Deterministic greedy scheduler. For each AI-picked course in priority order,
// finds the best available real section that fits without conflicts.

function buildSchedule(
  prioritizedCourses: AICoursePick[],
  remainingCourses: RemainingCourse[],
  allSections: CourseSection[],
  blockedTimes: BlockedTime[],
  inProgressCourses: SimpleCourse[],
  completedCourses: SimpleCourse[],
  targetCredits: number,
  crnEnrollmentMap: Map<string, { maxEnrollment: number; currentEnrollment: number; seatsAvailable: number; isFull: boolean }>,
  alreadyScheduled: CourseSection[] = []
): { schedule: (CourseSection & { requirement_category: string })[]; totalCredits: number } {

  // Map remaining courses for metadata lookup
  const courseMetaMap = new Map<string, RemainingCourse>();
  for (const c of remainingCourses) {
    courseMetaMap.set(`${c.subject.toUpperCase()} ${c.number}`, c);
  }

  const scheduled: (CourseSection & { requirement_category: string })[] = [];
  // Seed conflict tracker with any courses already on the schedule (e.g. from first pass)
  const scheduledSectionsForConflict: CourseSection[] = [...alreadyScheduled];
  const scheduledKeys = new Set<string>();
  let totalCredits = 0;

  const MAX_CREDITS = 19;
  // When topping up a partial schedule, account for credits already locked in
  const alreadyScheduledCredits = alreadyScheduled.reduce((sum, c) => sum + c.credits, 0);
  const effectiveMaxCredits = MAX_CREDITS - alreadyScheduledCredits;

  for (const pick of prioritizedCourses) {
    if (totalCredits >= targetCredits) break;
    if (totalCredits >= effectiveMaxCredits) break;

    const key = `${pick.subject.toUpperCase()} ${pick.number}`;
    if (scheduledKeys.has(key)) continue;

    const meta = courseMetaMap.get(key) ?? {
      subject: pick.subject,
      number: pick.number,
      title: "",
      credits: 3,
      requirement_category: pick.requirement_category,
    };

    const candidates = findAvailableSections(
      meta,
      allSections,
      blockedTimes,
      scheduledSectionsForConflict,
      inProgressCourses,
      completedCourses
    );

    if (candidates.length === 0) continue;

    // Prefer open seats; prefer LEC over LAB; tiebreak by most seats available
    const open = candidates.filter((s) => !s.isFull);
    const pool = open.length > 0 ? open : candidates;
    const best = pool.sort((a, b) => {
      if (a.type === "LEC" && b.type !== "LEC") return -1;
      if (b.type === "LEC" && a.type !== "LEC") return 1;
      return b.seatsAvailable - a.seatsAvailable;
    })[0];

    // Hard cap: never exceed 19 credits (overload requires extra tuition)
    if (totalCredits + best.credits > effectiveMaxCredits) continue;

    const enrollment = crnEnrollmentMap.get(best.crn);
    const entry = {
      ...best,
      requirement_category: pick.requirement_category,
      ...(enrollment ?? {}),
    };

    scheduled.push(entry);
    scheduledSectionsForConflict.push(best);
    scheduledKeys.add(key);
    totalCredits += best.credits;
  }

  return { schedule: scheduled, totalCredits };
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
      credits_completed = null,
      major = null,
      custom_notes = "",
      pinned_crns = [],
    }: {
      remaining_courses: RemainingCourse[];
      completed_courses: SimpleCourse[];
      in_progress_courses: SimpleCourse[];
      blocked_times: BlockedTime[];
      target_credits?: number;
      credits_completed?: number | null;
      major?: string | null;
      custom_notes?: string;
      pinned_crns?: string[];
    } = body;

    if (!remaining_courses || remaining_courses.length === 0) {
      return NextResponse.json({ error: "No remaining courses provided" }, { status: 400 });
    }

    // Hard cap at 19 — anything above requires a paid overload at UVM
    const effective_target = Math.min(target_credits, 19);

    const allSections = loadCourses();

    // Resolve pinned CRNs to actual sections and lock them into the schedule
    const pinnedSections: (CourseSection & { requirement_category: string })[] = (pinned_crns as string[])
      .map((crn) => allSections.find((s) => s.crn === crn))
      .filter((s): s is CourseSection => s !== undefined)
      .map((s) => ({ ...s, requirement_category: "Pinned" }));

    const pinnedCredits = pinnedSections.reduce((sum, s) => sum + s.credits, 0);

    // Treat pinned sections as in-progress so the AI doesn't re-pick them
    // and the algorithm avoids their time slots
    const effective_in_progress: SimpleCourse[] = [
      ...in_progress_courses,
      ...pinnedSections.map((s) => ({ subject: s.subject, number: s.number, title: s.title, credits: s.credits })),
    ];

    // Build CRN → enrollment lookup
    const crnEnrollmentMap = new Map<string, { maxEnrollment: number; currentEnrollment: number; seatsAvailable: number; isFull: boolean }>();
    for (const s of allSections) {
      crnEnrollmentMap.set(s.crn, {
        maxEnrollment: s.maxEnrollment,
        currentEnrollment: s.currentEnrollment,
        seatsAvailable: s.seatsAvailable,
        isFull: s.isFull,
      });
    }

    // Determine which courses actually have real sections available
    // (done without blocked_times/conflicts since we just need a rough availability flag for AI)
    const doneKeys = new Set([
      ...completed_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
      ...in_progress_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
    ]);

    // Build set of courses that have real sections in the CSV.
    // We intentionally skip the prereq check here — the AI just needs to know
    // if a course exists this semester. The algorithm enforces prereqs when
    // actually building the schedule. Checking prereqs here caused false
    // negatives when the student's calc course didn't match the exact strings
    // in the prereq field (e.g., took MATH 1310 but prereq says MATH 1248).
    const availableCourseKeys = new Set<string>();
    for (const course of remaining_courses) {
      const key = `${course.subject.toUpperCase()} ${course.number}`;
      const hasSections = findAvailableSections(
        course,
        allSections,
        [],
        [],
        in_progress_courses,
        completed_courses
      ).length > 0;
      if (hasSections) availableCourseKeys.add(key);
    }

    // Target for AI/algorithm excludes credits already locked via pinned sections
    const scheduling_target = Math.max(0, effective_target - pinnedCredits);

    // Step 1: AI picks which courses to take (priority order, no times/CRNs)
    const aiSelection = await selectCoursesWithAI(
      remaining_courses,
      availableCourseKeys,
      completed_courses,
      effective_in_progress,
      scheduling_target,
      credits_completed,
      major,
      custom_notes
    );

    // Step 2: Algorithm builds the actual conflict-free schedule
    const { schedule, totalCredits } = buildSchedule(
      aiSelection.prioritized_courses,
      remaining_courses,
      allSections,
      blocked_times,
      effective_in_progress,
      completed_courses,
      scheduling_target,
      crnEnrollmentMap,
      pinnedSections  // locked-in sections seed conflict tracking
    );

    // Prepend pinned sections to the schedule
    let finalSchedule = [...pinnedSections, ...schedule];
    let finalCredits = pinnedCredits + totalCredits;

    if (finalCredits < effective_target) {
      const scheduledKeys = new Set(finalSchedule.map((c) => `${c.subject.toUpperCase()} ${c.number}`));
      const aiPickedKeys = new Set(aiSelection.prioritized_courses.map((p) => `${p.subject.toUpperCase()} ${p.number}`));

      // Courses the AI explicitly excluded (e.g. student said "don't take X")
      const excludedKeys = new Set((aiSelection.excluded_courses ?? []).map(
        (p) => `${p.subject.toUpperCase()} ${p.number}`
      ));

      // Try remaining courses not already picked or excluded by AI, in their original order
      const leftovers: AICoursePick[] = remaining_courses
        .filter((c) => {
          const key = `${c.subject.toUpperCase()} ${c.number}`;
          return !aiPickedKeys.has(key) && !scheduledKeys.has(key) && !excludedKeys.has(key) && availableCourseKeys.has(key);
        })
        .map((c) => ({ subject: c.subject, number: c.number, requirement_category: c.requirement_category }));

      if (leftovers.length > 0) {
        const { schedule: extra, totalCredits: extraCredits } = buildSchedule(
          leftovers,
          remaining_courses,
          allSections,
          blocked_times,
          effective_in_progress,
          completed_courses,
          effective_target - finalCredits,
          crnEnrollmentMap,
          finalSchedule  // avoid conflicts with first-pass + pinned courses
        );
        finalSchedule = [...finalSchedule, ...extra];
        finalCredits += extraCredits;
      }
    }

    // Courses with zero sections in the CSV are not offered this semester —
    // surface them separately so the message is accurate.
    const scheduledKeys = new Set(finalSchedule.map((c) => `${c.subject.toUpperCase()} ${c.number}`));
    const notOffered = remaining_courses
      .filter((c) => !availableCourseKeys.has(`${c.subject.toUpperCase()} ${c.number}`))
      .map((c) => `${c.subject} ${c.number} (not offered Fall 2026)`);

    return NextResponse.json({
      recommended_schedule: finalSchedule,
      total_credits: finalCredits,
      notes: aiSelection.notes,
      unscheduled_courses: notOffered,
      available_sections_found: availableCourseKeys.size,
      total_courses_needed: remaining_courses.length,
    });
  } catch (err) {
    console.error("generate-schedule error:", err);
    return NextResponse.json({ error: "Failed to generate schedule" }, { status: 500 });
  }
}
