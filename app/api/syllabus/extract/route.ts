import { NextRequest, NextResponse } from "next/server";
import { parseSyllabusText, parseSyllabusPDF } from "@/lib/syllabus-parser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = await file.arrayBuffer();

    // Slice a copy for text extraction — unpdf may transfer/detach the buffer
    const { extractText } = await import("unpdf");
    const { text } = await extractText(new Uint8Array(buffer.slice(0)), { mergePages: true });

    // Good text: fast + cheap text path
    if (text.trim().length >= 300) {
      return NextResponse.json(await parseSyllabusText(text));
    }

    // Sparse/scanned PDF: send raw bytes directly to the model as a file
    return NextResponse.json(await parseSyllabusPDF(new Uint8Array(buffer)));
  } catch (err) {
    console.error("[syllabus/extract]", err);
    return NextResponse.json({ error: "Failed to process syllabus" }, { status: 500 });
  }
}
