import { NextRequest, NextResponse } from "next/server";
import {
  loadCourses,
  hasTimeConflict,
  hasScheduleConflict,
  prereqsSatisfied,
  CourseSection,
  BlockedTime,
  RemainingCourse,
  SimpleCourse,
} from "../generate-schedule/route";

interface ScheduledCourse {
  subject: string;
  number: string;
  crn: string;
  days: string[];
  startTime: string;
  endTime: string;
  credits: number;
  requirement_category: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const {
      current_schedule,
      remaining_courses,
      blocked_times = [],
      excluded_courses = [],
      in_progress_courses = [],
      completed_courses = [],
    }: {
      current_schedule: ScheduledCourse[];
      remaining_courses: RemainingCourse[];
      blocked_times: BlockedTime[];
      excluded_courses: SimpleCourse[];
      in_progress_courses: SimpleCourse[];
      completed_courses: SimpleCourse[];
    } = await req.json();

    const allSections = loadCourses();
    const scheduledSections = current_schedule as unknown as CourseSection[];

    const scheduledKeys = new Set(
      current_schedule.map((c) => `${c.subject.toUpperCase()} ${c.number}`)
    );
    const excludedKeys = new Set(
      excluded_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`)
    );
    const allDoneKeys = new Set([
      ...in_progress_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
      ...completed_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
    ]);
    const prereqDoneKeys = new Set([
      ...completed_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
      ...in_progress_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
    ]);

    for (const course of remaining_courses) {
      const key = `${course.subject.toUpperCase()} ${course.number}`;
      if (scheduledKeys.has(key) || excludedKeys.has(key) || allDoneKeys.has(key)) continue;

      const candidates = allSections.filter((s) => {
        if (course.subject === "GEN_ED") {
          const attrCode = course.number.replace("_LAB", "");
          if (!s.attributes.some((a) => a === attrCode)) return false;
        } else {
          if (s.subject !== course.subject.toUpperCase()) return false;
          if (course.number.endsWith("+") || course.number.includes("@")) {
            const minLevel =
              parseInt(course.number.replace("+", "").replace("@", "")) *
              (course.number.includes("@") ? 1000 : 1);
            if (parseInt(s.number) < minLevel) return false;
          } else if (course.number === "TBD") {
            return false;
          } else {
            if (s.number !== course.number) return false;
          }
        }

        if (s.type !== "LEC") return false;
        if (!s.startTime || s.startTime === "TBA") return false;
        if (hasTimeConflict(s, blocked_times)) return false;
        if (hasScheduleConflict(s, scheduledSections)) return false;
        if (!prereqsSatisfied(s.prereqs, prereqDoneKeys)) return false;

        return true;
      });

      if (candidates.length > 0) {
        const nonFull = candidates.filter((s) => !s.isFull);
        const best = nonFull.length > 0 ? nonFull[0] : candidates[0];
        return NextResponse.json({
          replacement: { ...best, requirement_category: course.requirement_category },
        });
      }
    }

    return NextResponse.json({ replacement: null });
  } catch (err) {
    console.error("replace-course error:", err);
    return NextResponse.json({ error: "Failed to find replacement" }, { status: 500 });
  }
}
