import OpenAI from "openai";
import { PDFDocument } from "pdf-lib";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MINI_MODEL = process.env.OPENAI_AUDIT_MINI_MODEL ?? "gpt-5.5";
const VISION_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";

export interface SyllabusEvent {
  id: string;
  title: string;
  type: "homework" | "exam" | "quiz" | "project" | "reading" | "lab" | "other";
  date: string; // YYYY-MM-DD
  recurrence?: { frequency: "weekly" | "biweekly"; endDate: string };
  description?: string;
}

export interface SyllabusResult {
  courseName: string;
  courseCode: string;
  semesterStart: string | null;
  semesterEnd: string | null;
  events: SyllabusEvent[];
}

const TODAY = new Date().toISOString().split("T")[0];

const EXTRACTION_PROMPT = `Extract graded deadlines and performance dates from this course syllabus. Today: ${TODAY}.

INCLUDE (things the student must submit, perform, or complete for a grade):
- Speeches, presentations, performances
- Exams and quizzes
- Papers, projects, written assignments due
- Readings or homework listed as assignments (in an "Assignment" or "Due" column)
- Any item that appears in a graded category on the syllabus

DO NOT INCLUDE:
- Lecture topics or class discussion content
- Chapter readings listed only as "what we cover in class" (not graded separately)
- Course policies, instructor info, or grading breakdowns
- Anything that is not an action the student must complete by a date

SCHEDULE TABLES: If there is a Week/Date/Topic/Assignment table, only extract items from the Assignment or Notes column — not the Topic column (unless the topic IS the graded event, like "Oral Interpretation Speech").

RECURRING events ("HW due every Sunday", "weekly quiz", "readings each class"):
  recurrence.frequency = "weekly" | "biweekly"
  recurrence.endDate = last day of class or last listed occurrence
  date = first occurrence only

ONE-TIME events: omit recurrence entirely.

DATE RULES:
- Use exact dates when shown. Output YYYY-MM-DD always.
- Week numbers (Week 3, Tue): count from the semester start date in the syllabus.
- If year is missing, infer from semester context and today (${TODAY}).
- Skip anything with no determinable date.

Respond with ONLY a JSON object — no markdown, no extra text:
{
  "courseName": "string",
  "courseCode": "string",
  "semesterStart": "YYYY-MM-DD or null",
  "semesterEnd": "YYYY-MM-DD or null",
  "events": [
    { "id": "e1", "title": "Introductory Speech", "type": "project", "date": "2026-01-15" },
    { "id": "e2", "title": "Chapter Readings Due", "type": "reading", "date": "2026-01-22" }
  ]
}

type must be one of: homework, exam, quiz, project, reading, lab, other`;

const EMPTY: SyllabusResult = { courseName: "", courseCode: "", semesterStart: null, semesterEnd: null, events: [] };

function parseJSON(raw: string): SyllabusResult {
  // Strip markdown fences, then find the first { in case model adds prose before JSON
  const stripped = raw.replace(/^```json\s*|^```\s*|```\s*$/gm, "").trim();
  const start = stripped.indexOf("{");
  const cleaned = start > 0 ? stripped.slice(start) : stripped;

  try {
    const parsed = JSON.parse(cleaned);
    return {
      courseName: parsed.courseName ?? "",
      courseCode: parsed.courseCode ?? "",
      semesterStart: parsed.semesterStart ?? null,
      semesterEnd: parsed.semesterEnd ?? null,
      events: Array.isArray(parsed.events)
        ? parsed.events.filter((e: SyllabusEvent) => e.id && e.title && e.date)
        : [],
    };
  } catch {
    // Truncated JSON: find the last complete event object and close the array
    const match = cleaned.match(/"events"\s*:\s*(\[[\s\S]*)/);
    if (match) {
      try {
        let partial = match[1];
        const lastClose = partial.lastIndexOf("}");
        if (lastClose !== -1) partial = partial.slice(0, lastClose + 1) + "]";
        const events = JSON.parse(partial);
        return { ...EMPTY, events: Array.isArray(events) ? events.filter((e: SyllabusEvent) => e.id && e.title && e.date) : [] };
      } catch { /* ignore */ }
    }
    return EMPTY;
  }
}

async function callModel(
  messages: OpenAI.ChatCompletionMessageParam[],
  model: string
): Promise<SyllabusResult> {
  const response = await openai.chat.completions.create({
    model,
    max_completion_tokens: 4000,
    messages,
  });
  const raw = response.choices[0].message.content ?? "";
  return parseJSON(raw);
}

export async function parseSyllabusText(text: string): Promise<SyllabusResult> {
  return callModel(
    [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: text.slice(0, 16000) },
    ],
    MINI_MODEL
  );
}

export async function parseSyllabusPDF(pdfBytes: Uint8Array): Promise<SyllabusResult> {
  // Trim to first 10 pages to keep payload size reasonable
  let bytes = pdfBytes;
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    if (doc.getPageCount() > 10) {
      const trimmed = await PDFDocument.create();
      const pages = await trimmed.copyPages(doc, Array.from({ length: 10 }, (_, i) => i));
      pages.forEach((p) => trimmed.addPage(p));
      bytes = await trimmed.save();
    }
  } catch { /* use original bytes if pdf-lib fails */ }

  const base64 = Buffer.from(bytes).toString("base64");
  const content: OpenAI.ChatCompletionContentPart[] = [
    { type: "text", text: EXTRACTION_PROMPT },
    {
      type: "file",
      file: { filename: "syllabus.pdf", file_data: `data:application/pdf;base64,${base64}` },
    } as OpenAI.ChatCompletionContentPart,
  ];
  return callModel([{ role: "user", content }], VISION_MODEL);
}

export async function parseSyllabusImages(images: string[]): Promise<SyllabusResult> {
  const content: OpenAI.ChatCompletionContentPart[] = [
    { type: "text", text: EXTRACTION_PROMPT },
    ...images.slice(0, 8).map((img): OpenAI.ChatCompletionContentPart => ({
      type: "image_url",
      image_url: { url: img, detail: "high" },
    })),
  ];
  return callModel([{ role: "user", content }], VISION_MODEL);
}
