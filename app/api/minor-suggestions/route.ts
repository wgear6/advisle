import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface MinorCourse {
  subject: string;
  number: string;
  title: string;
  credits: number;
}

interface ChooseOneGroup {
  description: string;
  options: MinorCourse[];
}

interface Minor {
  name: string;
  total_credits: number;
  required: MinorCourse[];
  choose_one_groups: ChooseOneGroup[];
  elective_note: string;
}

export interface MinorSuggestion {
  name: string;
  courses_needed: number;
  courses_satisfied: number;
  total_specific_courses: number;
  elective_credits: number;
  missing_required: (MinorCourse & { requirement_category: string })[];
  elective_note: string;
}

interface SimpleCourse {
  subject: string;
  number: string;
  title?: string;
  credits?: number;
}

export async function POST(req: NextRequest) {
  try {
    const {
      completed_courses = [],
      in_progress_courses = [],
    }: {
      completed_courses: SimpleCourse[];
      in_progress_courses: SimpleCourse[];
    } = await req.json();

    const minorsPath = path.join(process.cwd(), "data", "minors.json");
    const minors: Minor[] = JSON.parse(fs.readFileSync(minorsPath, "utf-8"));

    const doneKeys = new Set([
      ...completed_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
      ...in_progress_courses.map((c) => `${c.subject.toUpperCase()} ${c.number}`),
    ]);

    const suggestions: MinorSuggestion[] = minors.map((minor) => {
      let satisfied = 0;
      let total = 0;
      const missing: (MinorCourse & { requirement_category: string })[] = [];

      for (const course of minor.required) {
        total++;
        if (doneKeys.has(`${course.subject.toUpperCase()} ${course.number}`)) {
          satisfied++;
        } else {
          missing.push({ ...course, requirement_category: "Minor" });
        }
      }

      // Track which options have already been used to satisfy a group
      // (so POLS 1200 doesn't satisfy two groups at once)
      const usedKeys = new Set<string>();
      for (const group of minor.choose_one_groups ?? []) {
        total++;
        const satisfyingOption = group.options.find(
          (o) => doneKeys.has(`${o.subject.toUpperCase()} ${o.number}`) && !usedKeys.has(`${o.subject} ${o.number}`)
        );
        if (satisfyingOption) {
          satisfied++;
          usedKeys.add(`${satisfyingOption.subject} ${satisfyingOption.number}`);
        } else {
          // Suggest the first option not already scheduled
          const suggestion = group.options[0];
          // Avoid duplicate suggestions
          const sugKey = `${suggestion.subject} ${suggestion.number}`;
          if (!missing.some((m) => `${m.subject} ${m.number}` === sugKey)) {
            missing.push({ ...suggestion, requirement_category: "Minor" });
          }
        }
      }

      const specificCredits =
        minor.required.reduce((sum, c) => sum + (c.credits ?? 3), 0) +
        (minor.choose_one_groups ?? []).reduce((sum, g) => sum + (g.options[0]?.credits ?? 3), 0);
      const totalElectiveCredits = Math.max(0, (minor.total_credits ?? 0) - specificCredits);
      // Subtract the credits of still-missing required courses so elective_credits
      // reflects what's needed on top of all specific courses (not double-counting them)
      const missingSpecificCredits = missing.reduce((sum, c) => sum + (c.credits ?? 3), 0);
      const electiveCredits = Math.max(0, totalElectiveCredits - missingSpecificCredits);

      return {
        name: minor.name,
        courses_needed: total - satisfied,
        courses_satisfied: satisfied,
        total_specific_courses: total,
        elective_credits: electiveCredits,
        missing_required: missing,
        elective_note: minor.elective_note,
      };
    });

    // Sort by courses_needed, then elective_credits as tiebreaker
    const reachable = suggestions
      .filter((s) => s.courses_needed <= 5)
      .sort((a, b) => a.courses_needed - b.courses_needed || a.elective_credits - b.elective_credits);

    return NextResponse.json({ suggestions: reachable });
  } catch (err) {
    console.error("minor-suggestions error:", err);
    return NextResponse.json({ error: "Failed to compute minor suggestions" }, { status: 500 });
  }
}
