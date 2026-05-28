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

const EXTRACTION_PROMPT = `Extract all academic deadlines from this course syllabus. Today: ${TODAY}.

Capture every:
- Homework / assignment due date
- Exam (midterm, final, in-class test)
- Quiz (scheduled or pop)
- Project, paper, or presentation due date
- Lab report due date
- Any other graded deadline

RECURRING events ("HW due every Sunday", "weekly quiz", "problem set each Friday"):
  recurrence.frequency = "weekly" | "biweekly"
  recurrence.endDate = last day of class or last occurrence
  date = first occurrence only

ONE-TIME events: omit the recurrence field entirely.

DATE RULES:
- Use exact dates when given. Output YYYY-MM-DD always.
- Week numbers (Week 3): count from the semester start date in the syllabus.
- If the year is missing, infer it from the semester context and today (${TODAY}).
- Skip any event where no date can be determined.

The syllabus may use tables, bullet lists, or paragraph form — read all of it.

Respond with ONLY a JSON object, no markdown fences:
{
  "courseName": "string",
  "courseCode": "string",
  "semesterStart": "YYYY-MM-DD or null",
  "semesterEnd": "YYYY-MM-DD or null",
  "events": [
    { "id": "e1", "title": "Exam 1", "type": "exam", "date": "2026-02-20" },
    { "id": "e2", "title": "Weekly HW Due", "type": "homework", "date": "2026-01-18",
      "recurrence": { "frequency": "weekly", "endDate": "2026-04-26" } }
  ]
}

type must be one of: homework, exam, quiz, project, reading, lab, other`;

const EMPTY: SyllabusResult = { courseName: "", courseCode: "", semesterStart: null, semesterEnd: null, events: [] };

function parseJSON(raw: string): SyllabusResult {
  const cleaned = raw.replace(/^```json\s*|^```\s*|```\s*$/gm, "").trim();
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
    // Attempt recovery: find the events array even if the outer JSON is truncated
    const match = cleaned.match(/"events"\s*:\s*(\[[\s\S]*)/);
    if (match) {
      try {
        // Close any open structures so JSON.parse has a chance
        let partial = match[1];
        // Find the last complete event object
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
