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
  total_credits_needed: number;
  total_credits: number;
  missing_required: (MinorCourse & { requirement_category: string })[];
  elective_note: string;
  requirements: MinorRequirementStatus[];
}

export interface MinorRequirementStatus {
  label: string;
  done: boolean;
  satisfied_by: string | null;
  options: string[];
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
      major = null,
      all = false,
    }: {
      completed_courses: SimpleCourse[];
      in_progress_courses: SimpleCourse[];
      major?: string | null;
      all?: boolean;
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
      const requirements: MinorRequirementStatus[] = [];

      for (const course of minor.required) {
        total++;
        const key = `${course.subject.toUpperCase()} ${course.number}`;
        const done = doneKeys.has(key);
        requirements.push({ label: `${key} — ${course.title}`, done, satisfied_by: done ? key : null, options: [key] });
        if (done) {
          satisfied++;
        } else {
          missing.push({ ...course, requirement_category: "Minor" });
        }
      }

      // Track which options have already been used to satisfy a group
      // (so POLS 1200 doesn't satisfy two groups at once)
      const usedKeys = new Set<string>();
      let unsuggestedCredits = 0;
      for (const group of minor.choose_one_groups ?? []) {
        total++;
        const satisfyingOption = group.options.find(
          (o) => doneKeys.has(`${o.subject.toUpperCase()} ${o.number}`) && !usedKeys.has(`${o.subject} ${o.number}`)
        );
        requirements.push({
          label: group.description,
          done: !!satisfyingOption,
          satisfied_by: satisfyingOption ? `${satisfyingOption.subject} ${satisfyingOption.number}` : null,
          options: group.options.map((o) => `${o.subject} ${o.number}`),
        });
        if (satisfyingOption) {
          satisfied++;
          usedKeys.add(`${satisfyingOption.subject} ${satisfyingOption.number}`);
        } else {
          // Suggest the first option not already suggested/used, so groups that share an
          // option list (e.g. "choose 1 different") each get their own course and credits.
          const taken = (o: MinorCourse) =>
            usedKeys.has(`${o.subject} ${o.number}`) ||
            missing.some((m) => m.subject === o.subject && m.number === o.number);
          const suggestion = group.options.find((o) => !taken(o));
          if (suggestion) {
            missing.push({ ...suggestion, requirement_category: "Minor" });
          } else {
            unsuggestedCredits += group.options[0]?.credits ?? 3;
          }
        }
      }

      const specificCredits =
        minor.required.reduce((sum, c) => sum + (c.credits ?? 3), 0) +
        (minor.choose_one_groups ?? []).reduce((sum, g) => sum + (g.options[0]?.credits ?? 3), 0);
      const electiveCredits = Math.max(0, (minor.total_credits ?? 0) - specificCredits);

      const totalCreditsNeeded =
        missing.reduce((sum, c) => sum + (c.credits ?? 3), 0) + unsuggestedCredits + electiveCredits;

      return {
        name: minor.name,
        courses_needed: total - satisfied,
        courses_satisfied: satisfied,
        total_specific_courses: total,
        elective_credits: electiveCredits,
        total_credits_needed: totalCreditsNeeded,
        total_credits: minor.total_credits ?? 0,
        missing_required: missing,
        elective_note: minor.elective_note,
        requirements,
      };
    });

    // Filter out the student's own major, then sort by total credits needed
    const majorLower = major?.toLowerCase() ?? "";
    const reachable = suggestions
      .filter((s) => all || s.courses_needed <= 5)
      .filter((s) => !majorLower || !s.name.toLowerCase().includes(majorLower))
      .sort((a, b) => a.total_credits_needed - b.total_credits_needed);

    return NextResponse.json({ suggestions: reachable });
  } catch (err) {
    console.error("minor-suggestions error:", err);
    return NextResponse.json({ error: "Failed to compute minor suggestions" }, { status: 500 });
  }
}
