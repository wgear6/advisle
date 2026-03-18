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
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are parsing a UVM (University of Vermont) degree audit document.

Your job: identify every course the student STILL NEEDS to take.

Rules:
- SKIP courses with a letter grade (A, B, C, D, F, W) — already completed or withdrawn
- SKIP courses marked "IP" (in-progress) — currently being taken  
- SKIP courses marked "TR" (transfer credit) — already satisfied
- INCLUDE only courses where you see "Still needed: 1 Class in SUBJ NNNN"
- For "Still needed: 1 Class in MATH 2522 or 2544" — add both as separate entries
- For vague requirements like "N2 lab course" — use subject "GEN_ED", number "N2_LAB", title from the requirement text
- For "Statistics for Engineering" with no specific course — use subject "STAT", number "TBD", title "Statistics for Engineering"

Return ONLY valid JSON — no markdown fences, no explanation, nothing else:
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
      max_tokens: 2000,
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
