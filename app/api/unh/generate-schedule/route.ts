import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const UNH_DATA_PATH = path.join(process.cwd(), "data", "unh", "courses_fall.csv");

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawUnhCourse {
  Subj: string;
  "#": string;
  Title: string;
  CRN: string;       // UNH uses "CRN" (UVM uses "Comp Numb")
  Sec: string;
  Type: string;      // UNH uses "Type" (UVM uses "Lec Lab")
  "Start Time": string;
  "End Time": string;
  Days: string;
  Credits: string;
  Building: string;  // UNH uses "Building" (UVM uses "Bldg")
  Room: string;
  Instructor: string;
  "Max Enrollment": string;
  "Current Enrollment": string;
  Attr: string;
  Prerequisites: string;
  [key: string]: string;
}

interface CourseSection {
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

interface BlockedTime {
  day: string;
  startTime: string;
  endTime: string;
}

interface RemainingCourse {
  subject: string;
  number: string;
  title: string;
  credits: number;
  requirement_category: string;
}

interface SimpleCourse {
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

// ─── UNH-specific constants ───────────────────────────────────────────────────

// Discovery Program attribute codes the audit parser emits under subject=DISC_REQ
const DISC_REQ_CODES = new Set([
  "INQ", "DLAB", "PS", "HP", "WC", "FPA", "ETS", "BIOL", "HUM", "SS", "WRIT",
  "WRIT_600", // upper-level writing range requirement
]);

// Audit parser code → CSV attribute code (where they differ)
const DISC_REQ_ATTR_MAP: Record<string, string> = {
  BIOL: "BS",    // Biological Science: audit says "BIOL", CSV uses "BS"
  HUM: "HUMA",  // Humanities: audit says "HUM", CSV uses "HUMA"
};

// Known audit subject name → CSV subject code mismatches for UNH
const SUBJECT_ALIASES: Record<string, string> = {
  // Add entries as mismatches are discovered, e.g.:
  // "ECONOMICS": "ECON",
};

// UNH grad course threshold — courses 800+ are graduate-only
const GRAD_COURSE_THRESHOLD = 800;

// ─── Day / Credit Parsing ─────────────────────────────────────────────────────

function parseDays(daysStr: string): string[] {
  if (!daysStr || daysStr.trim() === "") return [];
  const parts = daysStr.trim().split(/\s+/);
  const valid = ["M", "T", "W", "R", "F", "S"];
  return parts.filter((d) => valid.includes(d));
}

function parseCredits(s: string): number {
  if (!s || s.trim() === "") return 4; // UNH default is 4 credits
  if (s.includes("to")) return parseInt(s.split("to")[0].trim()) || 4;
  const n = parseFloat(s.trim());
  return isNaN(n) || n === 0 ? 4 : n;
}

// ─── Load CSV ─────────────────────────────────────────────────────────────────

let courseCache: CourseSection[] | null = null;
let crnMapCache: Map<string, CourseSection> | null = null;

function parseRawRecord(r: RawUnhCourse): CourseSection {
  const credits = parseCredits(r.Credits ?? "");
  const maxEnrollment = parseInt(r["Max Enrollment"] ?? "0") || 0;
  const currentEnrollment = parseInt(r["Current Enrollment"] ?? "0") || 0;
  const seatsAvailable = Math.max(0, maxEnrollment - currentEnrollment);
  return {
    subject: r.Subj?.trim() ?? "",
    number: r["#"]?.trim() ?? "",
    title: r.Title?.trim() ?? "",
    crn: r.CRN?.trim() ?? "",
    section: r.Sec?.trim() ?? "",
    type: r.Type?.trim() ?? "",
    startTime: r["Start Time"]?.trim() ?? "",
    endTime: r["End Time"]?.trim() ?? "",
    days: parseDays(r.Days ?? ""),
    credits,
    building: r.Building?.trim() ?? "",
    room: r.Room?.trim() ?? "",
    instructor: r.Instructor?.trim() ?? "",
    isFull: maxEnrollment > 0 && seatsAvailable === 0,
    maxEnrollment,
    currentEnrollment,
    seatsAvailable,
    attributes: (r.Attr ?? "").split("|").map((a) => a.trim()).filter(Boolean),
    prereqs: r.Prerequisites?.trim() ?? "",
  };
}

function loadRawRecords(): RawUnhCourse[] {
  const raw = fs.readFileSync(UNH_DATA_PATH, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
}

function loadCrnMap(): Map<string, CourseSection> {
  if (crnMapCache) return crnMapCache;
  crnMapCache = new Map();
  for (const r of loadRawRecords()) {
    const crn = r.CRN?.trim();
    if (crn) crnMapCache.set(crn, parseRawRecord(r));
  }
  return crnMapCache;
}

function loadCourses(): CourseSection[] {
  if (courseCache) return courseCache;
  const records = loadRawRecords();
  courseCache = records
    .filter((r) => {
      const type = r.Type?.trim();
      return type === "LEC" || type === "LAB" || type === "DIS" || type === "SEM";
    })
    .map((r): CourseSection => parseRawRecord(r));
  return courseCache;
}

// ─── Time Helpers ─────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  if (!t || t === "TBA") return -1;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function hasTimeConflict(s: CourseSection, blocked: BlockedTime[]): boolean {
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

function hasScheduleConflict(s: CourseSection, scheduled: CourseSection[]): boolean {
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

function prereqsSatisfied(prereqs: string, doneKeys: Set<string>): boolean {
  if (!prereqs || prereqs.trim() === "") return true;
  const andGroups = prereqs.split(";").map((g) => g.trim()).filter(Boolean);
  return andGroups.every((group) => {
    const codes = [...group.matchAll(/\b([A-Z]{2,5})\s+(\d{3,4})\b/g)].map(
      (m) => `${m[1]} ${m[2]}`
    );
    if (codes.length === 0) return true;
    if (group.toLowerCase().includes(" or ")) {
      return codes.some((c) => doneKeys.has(c));
    }
    return codes.every((c) => doneKeys.has(c));
  });
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
  const doneKeys = new Set(allDone.map((d) => `${d.subject.toUpperCase()} ${d.number}`));

  return allSections.filter((s) => {
    if (course.subject === "DISC_REQ") {
      // Match by attribute code — handle WRIT_600 (range: 600+, attr WRIT)
      const code = course.number;
      if (code === "WRIT_600") {
        if (!s.attributes.some((a) => a === "WRIT")) return false;
        if (parseInt(s.number) < 600) return false;
      } else {
        // Remap audit codes to CSV attribute codes where they differ
        const csvCode = DISC_REQ_ATTR_MAP[code] ?? code;
        if (!s.attributes.some((a) => a === csvCode)) return false;
      }
    } else {
      if (s.subject !== course.subject.toUpperCase()) return false;

      if (course.number.endsWith("+") || course.number.includes("@")) {
        const minLevel = parseInt(course.number.replace("+", "").replace("@", ""));
        if (parseInt(s.number) < minLevel) return false;
      } else if (course.number === "TBD") {
        return false;
      } else {
        if (s.number !== course.number) return false;
      }
    }

    if (s.type !== "LEC" && s.type !== "LAB" && s.type !== "SEM") return false;
    if (!s.startTime || s.startTime === "TBA") return false;
    if (doneKeys.has(`${s.subject.toUpperCase()} ${s.number}`)) return false;
    if (hasTimeConflict(s, blocked)) return false;
    if (hasScheduleConflict(s, scheduled)) return false;

    return true;
  });
}

// ─── AI: Select Which Courses To Take ────────────────────────────────────────

async function selectCoursesWithAI(
  remainingCourses: RemainingCourse[],
  availableCourseKeys: Set<string>,
  prereqMap: Map<string, string>,
  completedCourses: SimpleCourse[],
  inProgressCourses: SimpleCourse[],
  targetCredits: number,
  creditsCompleted: number | null,
  major: string | null,
  customNotes: string,
  includeGradCourses: boolean
): Promise<AISelection> {
  const yearContext = creditsCompleted !== null
    ? creditsCompleted < 30 ? "FRESHMAN (under 30 credits)"
    : creditsCompleted < 60 ? "SOPHOMORE (30–59 credits)"
    : creditsCompleted < 90 ? "JUNIOR (60–89 credits)"
    : "SENIOR (90+ credits)"
    : null;

  const annotatedCourses = remainingCourses.map((c) => {
    const key = `${c.subject.toUpperCase()} ${c.number}`;
    const prereqs = prereqMap.get(key) ?? "";
    return {
      subject: c.subject,
      number: c.number,
      title: c.title,
      credits: c.credits,
      requirement_category: c.requirement_category,
      has_sections: availableCourseKeys.has(key),
      ...(prereqs ? { prereqs } : {}),
    };
  });

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
    max_completion_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a UNH (University of New Hampshire) academic advisor selecting courses for a student's Fall 2026 semester.

Your ONLY job is to return a PRIORITIZED LIST of courses the student should take — do NOT pick sections, times, or CRNs. A separate algorithm will find real conflict-free sections automatically.

TARGET: ${targetCredits} credits. UNH courses are typically 4 credits. Include courses totaling ~${Math.round(targetCredits * 1.4)} credits worth so the algorithm has enough to work with after filtering.

RULES:
1. Only include courses where has_sections=true — others have no available sections
2. NEVER include courses from completed_courses or in_progress_courses
3. in_progress_courses count as satisfied prerequisites for next semester
4. Each course in remaining_courses may have a "prereqs" field showing its actual prerequisite string from the registrar. Use this to check prereq satisfaction. A prereq course is satisfied only if it appears in completed_courses or in_progress_courses. If the prereq course is in remaining_courses (not yet taken), do NOT include the dependent course. For OR prereqs (e.g. "MATH 527 or MATH 528"), at least one option must be satisfied.
5. Do NOT include capstone/senior-only courses for freshmen or sophomores
6. Prioritize strictly: Minor > Major Core > Major Elective > General Education > Free Elective
   — always fill with major courses first. Only add General Education if credits remain after major courses.

7. For DISC_REQ requirements (UNH Discovery Program gen-ed), include them as-is (subject: "DISC_REQ", number: "PS" etc.) — the algorithm picks the actual course
8. STUDENT NOTES override everything — if the student says do not take a course, put it in excluded_courses and NEVER include it in prioritized_courses
${yearContext ? `\nSTUDENT YEAR: ${yearContext}` : ""}${major ? `\nSTUDENT MAJOR: ${major}` : ""}
${includeGradCourses ? `\nGRAD COURSES ENABLED: This student is eligible to take graduate-level (800+) courses. You may include them if they are relevant to the student's major or degree progress.` : ""}
${customNotes ? `\nSTUDENT NOTES (follow carefully — these override all other rules): ${customNotes}` : ""}

Return ONLY valid JSON:
{
  "prioritized_courses": [
    { "subject": "FIN", "number": "701", "requirement_category": "Major Core" },
    { "subject": "DISC_REQ", "number": "PS", "requirement_category": "General Education" }
  ],
  "excluded_courses": [
    { "subject": "ADMN", "number": "910", "requirement_category": "Major Elective" }
  ],
  "notes": "Brief explanation of choices and any important considerations",
  "skipped_courses": ["ADMN 910 - prereq ADMN 850 not yet satisfied"]
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
  let parsed: AISelection;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { prioritized_courses: [], excluded_courses: [], notes: "AI response parse error", skipped_courses: [] };
  }

  // Guard: only keep courses that came from the student's remaining_courses list
  const validKeys = new Set(
    remainingCourses.map((c) => `${c.subject.toUpperCase()} ${c.number}`)
  );
  parsed.prioritized_courses = (parsed.prioritized_courses ?? []).filter(
    (c) => validKeys.has(`${c.subject.toUpperCase()} ${c.number}`)
  );

  return parsed;
}

// ─── Algorithm: Build Conflict-Free Schedule ──────────────────────────────────

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
): { schedule: (CourseSection & { requirement_category: string })[]; totalCredits: number; satisfiedRequirementKeys: Set<string> } {

  const courseMetaMap = new Map<string, RemainingCourse>();
  for (const c of remainingCourses) {
    courseMetaMap.set(`${c.subject.toUpperCase()} ${c.number}`, c);
  }

  const scheduled: (CourseSection & { requirement_category: string })[] = [];
  const scheduledSectionsForConflict: CourseSection[] = [...alreadyScheduled];
  const scheduledKeys = new Set<string>();
  const satisfiedRequirementKeys = new Set<string>();
  let totalCredits = 0;

  const MAX_CREDITS = 20; // UNH max before overload (typically 20)
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
      credits: 4,
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

    const open = candidates.filter((s) => !s.isFull);
    const pool = open.length > 0 ? open : candidates;
    const best = pool.sort((a, b) => {
      if (a.type === "LEC" && b.type !== "LEC") return -1;
      if (b.type === "LEC" && a.type !== "LEC") return 1;
      return b.seatsAvailable - a.seatsAvailable;
    })[0];

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
    satisfiedRequirementKeys.add(key);
    totalCredits += best.credits;
  }

  return { schedule: scheduled, totalCredits, satisfiedRequirementKeys };
}

// ─── Main Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Check data availability
  if (!fs.existsSync(UNH_DATA_PATH) || fs.statSync(UNH_DATA_PATH).size < 100) {
    return NextResponse.json(
      {
        error: "unh_data_unavailable",
        message: "UNH course data is not yet available. We're working on it — check back soon!",
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const {
      remaining_courses,
      completed_courses = [],
      in_progress_courses = [],
      blocked_times = [],
      target_credits = 16,
      credits_completed = null,
      major = null,
      custom_notes = "",
      pinned_crns = [],
      include_grad_courses = false,
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
      include_grad_courses?: boolean;
    } = body;

    if (!remaining_courses || remaining_courses.length === 0) {
      return NextResponse.json({ error: "No remaining courses provided" }, { status: 400 });
    }

    const effective_target = Math.min(target_credits, 20);

    const allSections = loadCourses();
    const crnMap = loadCrnMap();

    // Resolve pinned CRNs
    const pinnedSections: (CourseSection & { requirement_category: string })[] = (pinned_crns as string[])
      .map((crn) => crnMap.get(crn))
      .filter((s): s is CourseSection => s !== undefined)
      .map((s) => ({ ...s, requirement_category: "Pinned" }));

    const pinnedCredits = pinnedSections.reduce((sum, s) => sum + s.credits, 0);

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

    // Build prereq map
    const prereqMap = new Map<string, string>();
    for (const s of allSections) {
      if (s.prereqs) {
        prereqMap.set(`${s.subject.toUpperCase()} ${s.number}`, s.prereqs);
      }
    }

    // Build satisfied-course set
    const satisfiedKeys = new Set([
      ...completed_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
      ...effective_in_progress.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
    ]);

    // Normalize remaining courses: fix DISC_REQ codes and subject aliases
    const normalizedRemaining = remaining_courses.map((c) => {
      // If the audit parser emitted a bare DISC_REQ code in the subject field, fix it
      if (DISC_REQ_CODES.has(c.subject.toUpperCase()))
        return { ...c, subject: "DISC_REQ", number: c.subject.toUpperCase() };
      if (DISC_REQ_CODES.has(c.number.toUpperCase()) && c.subject !== "DISC_REQ")
        return { ...c, subject: "DISC_REQ", number: c.number.toUpperCase() };
      // Apply subject aliases
      const aliasedSubject = SUBJECT_ALIASES[c.subject.toUpperCase()];
      if (aliasedSubject) return { ...c, subject: aliasedSubject };
      return c;
    });

    // Hard prereq filter
    const eligibleCourses = normalizedRemaining.filter((c) => {
      const prereqStr = prereqMap.get(`${c.subject.toUpperCase()} ${c.number}`) ?? "";
      return prereqsSatisfied(prereqStr, satisfiedKeys);
    });

    // Determine which courses have real sections available
    const availableCourseKeys = new Set<string>();
    for (const course of eligibleCourses) {
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

    const scheduling_target = Math.max(0, effective_target - pinnedCredits);

    // Step 1: AI picks priority order
    const aiSelection = await selectCoursesWithAI(
      eligibleCourses,
      availableCourseKeys,
      prereqMap,
      completed_courses,
      effective_in_progress,
      scheduling_target,
      credits_completed,
      major,
      custom_notes,
      include_grad_courses
    );

    // Step 2: Algorithm builds conflict-free schedule
    const { schedule, totalCredits, satisfiedRequirementKeys } = buildSchedule(
      aiSelection.prioritized_courses,
      normalizedRemaining,
      allSections,
      blocked_times,
      effective_in_progress,
      completed_courses,
      scheduling_target,
      crnEnrollmentMap,
      pinnedSections
    );

    let finalSchedule = [...pinnedSections, ...schedule];
    let finalCredits = pinnedCredits + totalCredits;

    // Second pass: try leftover courses the AI didn't pick
    if (finalCredits < effective_target) {
      const firstPassSectionKeys = new Set(finalSchedule.map((c) => `${c.subject.toUpperCase()} ${c.number}`));
      const aiPickedKeys = new Set(aiSelection.prioritized_courses.map((p) => `${p.subject.toUpperCase()} ${p.number}`));
      const excludedKeys = new Set((aiSelection.excluded_courses ?? []).map(
        (p) => `${p.subject.toUpperCase()} ${p.number}`
      ));

      const leftovers: AICoursePick[] = normalizedRemaining
        .filter((c) => {
          const key = `${c.subject.toUpperCase()} ${c.number}`;
          return !aiPickedKeys.has(key) && !firstPassSectionKeys.has(key) && !excludedKeys.has(key) && availableCourseKeys.has(key);
        })
        .map((c) => ({ subject: c.subject, number: c.number, requirement_category: c.requirement_category }));

      if (leftovers.length > 0) {
        const { schedule: extra, totalCredits: extraCredits, satisfiedRequirementKeys: extraKeys } = buildSchedule(
          leftovers,
          normalizedRemaining,
          allSections,
          blocked_times,
          effective_in_progress,
          completed_courses,
          effective_target - finalCredits,
          crnEnrollmentMap,
          finalSchedule
        );
        finalSchedule = [...finalSchedule, ...extra];
        finalCredits += extraCredits;
        for (const k of extraKeys) satisfiedRequirementKeys.add(k);
      }
    }

    // Third pass: filler free electives
    if (finalCredits < effective_target) {
      const scheduledSectionKeys = new Set(finalSchedule.map((s) => `${s.subject.toUpperCase()} ${s.number}`));

      const fillerMinLevel = credits_completed !== null && credits_completed >= 60 ? 600 : 400;
      const fillerPreferredLevel = credits_completed !== null
        ? credits_completed >= 90 ? 700
        : credits_completed >= 60 ? 600
        : credits_completed >= 30 ? 500
        : 400
        : 400;

      const fillerCandidates = allSections.filter((s) => {
        if (s.type !== "LEC" && s.type !== "SEM") return false;
        if (!s.startTime || s.startTime === "TBA") return false;
        const sKey = `${s.subject.toUpperCase()} ${s.number}`;
        if (scheduledSectionKeys.has(sKey)) return false;
        if (satisfiedKeys.has(sKey)) return false;
        const courseNum = parseInt(s.number);
        if (!include_grad_courses && courseNum >= GRAD_COURSE_THRESHOLD) return false;
        if (courseNum < fillerMinLevel) return false;
        if (s.credits > effective_target - finalCredits) return false;
        if (!prereqsSatisfied(s.prereqs, satisfiedKeys)) return false;
        if (hasTimeConflict(s, blocked_times)) return false;
        if (hasScheduleConflict(s, finalSchedule)) return false;
        return true;
      }).sort((a, b) => {
        if (!a.isFull && b.isFull) return -1;
        if (a.isFull && !b.isFull) return 1;
        const aNum = parseInt(a.number);
        const bNum = parseInt(b.number);
        const aPreferred = aNum >= fillerPreferredLevel;
        const bPreferred = bNum >= fillerPreferredLevel;
        if (aPreferred && !bPreferred) return -1;
        if (bPreferred && !aPreferred) return 1;
        return aNum - bNum;
      });

      const addFillerCourses = (pool: typeof fillerCandidates) => {
        for (const s of pool) {
          if (finalCredits >= effective_target) break;
          if (finalCredits + s.credits > effective_target) continue;
          const sKey = `${s.subject.toUpperCase()} ${s.number}`;
          if (scheduledSectionKeys.has(sKey)) continue;
          if (hasScheduleConflict(s, finalSchedule)) continue;
          const enrollment = crnEnrollmentMap.get(s.crn);
          finalSchedule.push({ ...s, requirement_category: "Free Elective", ...(enrollment ?? {}) });
          finalCredits += s.credits;
          scheduledSectionKeys.add(sKey);
        }
      };

      addFillerCourses(fillerCandidates);

      // Fallback: drop level floor as last resort
      if (finalCredits < effective_target && fillerMinLevel > 400) {
        const fallbackPool = allSections.filter((s) => {
          if (s.type !== "LEC" && s.type !== "SEM") return false;
          if (!s.startTime || s.startTime === "TBA") return false;
          const sKey = `${s.subject.toUpperCase()} ${s.number}`;
          if (scheduledSectionKeys.has(sKey)) return false;
          if (satisfiedKeys.has(sKey)) return false;
          const courseNum = parseInt(s.number);
          if ((!include_grad_courses && courseNum >= GRAD_COURSE_THRESHOLD) || courseNum >= fillerMinLevel) return false;
          if (s.credits > effective_target - finalCredits) return false;
          if (!prereqsSatisfied(s.prereqs, satisfiedKeys)) return false;
          if (hasTimeConflict(s, blocked_times)) return false;
          if (hasScheduleConflict(s, finalSchedule)) return false;
          return true;
        }).sort((a, b) => {
          if (!a.isFull && b.isFull) return -1;
          if (a.isFull && !b.isFull) return 1;
          return parseInt(b.number) - parseInt(a.number);
        });
        addFillerCourses(fallbackPool);
      }
    }

    const eligibleKeys = new Set(eligibleCourses.map((c) => `${c.subject.toUpperCase()} ${c.number}`));
    const finalSectionKeys = new Set(finalSchedule.map((c) => `${c.subject.toUpperCase()} ${c.number}`));

    const unscheduled = normalizedRemaining
      .filter((c) => {
        const key = `${c.subject.toUpperCase()} ${c.number}`;
        return !finalSectionKeys.has(key) && !satisfiedRequirementKeys.has(key);
      })
      .map((c) => {
        const key = `${c.subject.toUpperCase()} ${c.number}`;
        if (!eligibleKeys.has(key)) return `${c.subject} ${c.number} (prereq not yet satisfied)`;
        if (!availableCourseKeys.has(key)) return `${c.subject} ${c.number} (not offered Fall 2026)`;
        return `${c.subject} ${c.number} (could not fit in schedule)`;
      });

    return NextResponse.json({
      recommended_schedule: finalSchedule,
      total_credits: finalCredits,
      notes: aiSelection.notes,
      unscheduled_courses: unscheduled,
      available_sections_found: availableCourseKeys.size,
      total_courses_needed: normalizedRemaining.length,
    });
  } catch (err) {
    console.error("[unh/generate-schedule] error:", err);
    return NextResponse.json({ error: "Failed to generate schedule" }, { status: 500 });
  }
}
