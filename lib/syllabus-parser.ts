import OpenAI from "openai";

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

const EXTRACTION_PROMPT = `You extract academic calendar events from a course syllabus. Today: ${TODAY}.

Find ALL dates for:
- Homework / assignment due dates
- Exams (midterms, finals, in-class tests)
- Quizzes (pop quizzes, scheduled quizzes)
- Projects, papers, presentations due
- Reading assignments due
- Lab reports due
- Any other academic deadline

RECURRING events (e.g. "HW due every Sunday", "quiz every Friday", "weekly problem set"):
- Set recurrence.frequency: "weekly" | "biweekly"
- Set recurrence.endDate: last day of classes or last known occurrence
- date = first occurrence

ONE-TIME events: no recurrence field.

DATE RESOLUTION:
- If exact dates are given, use them as-is
- If only week numbers (Week 1, Week 3): calculate from the semester start date in the syllabus
- If semester year is not specified, infer from today (${TODAY})
- Always output YYYY-MM-DD

Return JSON only — no markdown, no explanation:
{
  "courseName": "Medical Biostatistics & Epidemiology",
  "courseCode": "STAT 3000",
  "semesterStart": "2026-01-13",
  "semesterEnd": "2026-05-08",
  "events": [
    {
      "id": "e1",
      "title": "Homework 1 Due",
      "type": "homework",
      "date": "2026-01-27",
      "description": "optional context"
    },
    {
      "id": "e2",
      "title": "Weekly Homework Due",
      "type": "homework",
      "date": "2026-01-19",
      "recurrence": { "frequency": "weekly", "endDate": "2026-04-28" }
    }
  ]
}

type must be one of: homework, exam, quiz, project, reading, lab, other
Only include events with a determinable date. Skip anything where the date is unknown.`;

async function callModel(
  messages: OpenAI.ChatCompletionMessageParam[],
  model: string
): Promise<SyllabusResult> {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
    messages,
  });
  const raw = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  return {
    courseName: parsed.courseName ?? "",
    courseCode: parsed.courseCode ?? "",
    semesterStart: parsed.semesterStart ?? null,
    semesterEnd: parsed.semesterEnd ?? null,
    events: Array.isArray(parsed.events) ? parsed.events : [],
  };
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

export async function parseSyllabusImages(images: string[]): Promise<SyllabusResult> {
  const content: OpenAI.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: "Extract all academic calendar events from these syllabus pages.\n\n" + EXTRACTION_PROMPT,
    },
    ...images.slice(0, 8).map((img): OpenAI.ChatCompletionContentPart => ({
      type: "image_url",
      image_url: { url: img, detail: "high" },
    })),
  ];
  return callModel([{ role: "user", content }], VISION_MODEL);
}
