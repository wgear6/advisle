import { NextRequest, NextResponse } from "next/server";
import { parseSyllabusText } from "@/lib/syllabus-parser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const { extractText } = await import("unpdf");
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });

    if (text.trim().length < 300) {
      return NextResponse.json({ needsVision: true });
    }

    const result = await parseSyllabusText(text);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[syllabus/extract]", err);
    return NextResponse.json({ error: "Failed to process syllabus" }, { status: 500 });
  }
}
