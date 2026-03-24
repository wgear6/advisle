import OpenAI from "openai";
import { z } from "zod";
import { ParsedAuditSchema } from "./audit-schema";
import type { ParsedAudit } from "./audit-schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MINI_MODEL = process.env.OPENAI_AUDIT_MINI_MODEL ?? "gpt-4o-mini";
const FULL_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4";

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are parsing a UVM (University of Vermont) degree audit document.

Extract three lists of courses from the audit:

1. remaining_courses: courses the student STILL NEEDS to take
2. in_progress_courses: courses marked "IP" (currently being taken this semester)
3. completed_courses: courses already finished (have a letter grade A/B/C/D/F or marked TR)

RULES for remaining_courses:
- ONLY include courses where you see "Still needed: 1 Class in SUBJ NNNN"
- SKIP anything with a letter grade, TR, or IP
- For OR choices like "MATH 2522 or 2544": create ONE entry using the first option's number, title should say "Linear Algebra (MATH 2522 or 2544)"
- For level requirements like "3 Credits in STAT 3@ or 4@ or 5@": use number "3000+", title "Statistics Elective (3000-level or above)", credits 3
- For vague requirements with no course number: use subject "GEN_ED", number based on attribute (e.g. "AH1", "N2_LAB"), title from requirement text
- For "Statistics for Engineering" with no specific course number: SKIP it (cannot match to a specific course)
- For "CEMS 1500": include it
- Credits: always include the actual credit value (1, 2, 3, 4). If unknown, use 3.

RULES for in_progress_courses:
- Include ALL courses marked "IP" — these are being taken RIGHT NOW and should NOT be scheduled again
- These satisfy requirements partially — note how many credits they cover

RULES for completed_courses:
- Include ALL courses with letter grades (A, B, C, D, F) or TR (transfer)
- Include the subject and number so prereq checking works

Return ONLY valid JSON:
{
  "remaining_courses": [
    {
      "subject": "MATH",
      "number": "1248",
      "title": "Calculus II",
      "credits": 4,
      "requirement_category": "Major Core"
    }
  ],
  "in_progress_courses": [
    {
      "subject": "STAT",
      "number": "3870",
      "title": "Data Science I - Pinnacle",
      "credits": 3,
      "requirement_category": "Major Core"
    }
  ],
  "completed_courses": [
    {
      "subject": "MATH",
      "number": "1234",
      "title": "Calculus I",
      "credits": 4
    }
  ],
  "student_name": "string or null",
  "major": "string or null",
  "credits_completed": number or null,
  "credits_remaining": number or null
}

requirement_category must be one of: "Major Core", "Major Elective", "General Education", "Free Elective", "Other"`;

// ─── Quality Check ────────────────────────────────────────────────────────────

function checkQuality(data: ParsedAudit): { ok: boolean; reason?: string } {
  if (data.remaining_courses.length === 0) {
    return { ok: false, reason: "no remaining courses extracted" };
  }
  const badCourse = data.remaining_courses.find((c) => !c.subject || !c.number);
  if (badCourse) {
    return { ok: false, reason: `course missing subject/number: ${JSON.stringify(badCourse)}` };
  }
  // If the audit has no completed AND no in-progress courses it's almost certainly
  // a partial parse (every real student has at least some course history).
  if (data.completed_courses.length === 0 && data.in_progress_courses.length === 0) {
    return { ok: false, reason: "no completed or in-progress courses — likely incomplete parse" };
  }
  return { ok: true };
}

// ─── Single Model Call ────────────────────────────────────────────────────────

async function callModel(
  model: string,
  pdfText: string
): Promise<{ data: ParsedAudit; usage: OpenAI.CompletionUsage | null }> {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 3000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: pdfText },
    ],
  });

  const raw = response.choices[0].message.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model returned non-JSON: ${cleaned.slice(0, 200)}`);
  }

  const data = ParsedAuditSchema.parse(json); // throws ZodError if invalid
  return { data, usage: response.usage ?? null };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AuditParseResult {
  data: ParsedAudit;
  model: string;
  fallback: boolean;
  latencyMs: number;
  usage: OpenAI.CompletionUsage | null;
}

export async function parseAudit(pdfText: string): Promise<AuditParseResult> {
  const start = Date.now();

  // ── First pass: cheap model ──
  try {
    const { data, usage } = await callModel(MINI_MODEL, pdfText);
    const quality = checkQuality(data);

    if (quality.ok) {
      const latencyMs = Date.now() - start;
      console.log(
        `[audit-parser] mini OK | model=${MINI_MODEL} | remaining=${data.remaining_courses.length} | completed=${data.completed_courses.length} | latency=${latencyMs}ms | tokens=${usage?.total_tokens ?? "?"}`
      );
      return { data, model: MINI_MODEL, fallback: false, latencyMs, usage };
    }

    console.warn(
      `[audit-parser] mini quality fail | reason="${quality.reason}" | model=${MINI_MODEL} | latency=${Date.now() - start}ms — falling back`
    );
  } catch (err) {
    const reason = err instanceof z.ZodError
      ? `schema validation: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`
      : err instanceof Error ? err.message : String(err);
    console.warn(
      `[audit-parser] mini error | reason="${reason}" | model=${MINI_MODEL} | latency=${Date.now() - start}ms — falling back`
    );
  }

  // ── Fallback: full model ──
  const { data, usage } = await callModel(FULL_MODEL, pdfText);
  const latencyMs = Date.now() - start;
  console.log(
    `[audit-parser] fallback OK | model=${FULL_MODEL} | remaining=${data.remaining_courses.length} | completed=${data.completed_courses.length} | latency=${latencyMs}ms | tokens=${usage?.total_tokens ?? "?"}`
  );
  return { data, model: FULL_MODEL, fallback: true, latencyMs, usage };
}
