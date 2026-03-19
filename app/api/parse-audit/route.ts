import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Step 1: Extract text from the PDF using unpdf
    let pdfText: string;
    try {
      const { extractText } = await import("unpdf");
      const uint8Array = new Uint8Array(buffer);
      const { text } = await extractText(uint8Array, { mergePages: true });
      pdfText = text;
    } catch (pdfErr) {
      console.error("pdf-parse error:", pdfErr);
      return NextResponse.json(
        { error: "Could not read PDF." },
        { status: 500 }
      );
    }

    // Step 2: Send extracted text to GPT-4o for structured parsing
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are parsing a UVM (University of Vermont) degree audit document.

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

requirement_category must be one of: "Major Core", "Major Elective", "General Education", "Free Elective", "Other"`,
        },
        {
          role: "user",
          content: pdfText,
        },
      ],
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content ?? "";
    const cleaned = content.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed. GPT output was:", cleaned);
      return NextResponse.json(
        { error: "AI returned invalid JSON. Try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("parse-audit error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to parse degree audit", detail: message },
      { status: 500 }
    );
  }
}
