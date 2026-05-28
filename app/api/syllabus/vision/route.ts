import { NextRequest, NextResponse } from "next/server";
import { parseSyllabusImages } from "@/lib/syllabus-parser";

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json();
    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }
    const result = await parseSyllabusImages(images);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[syllabus/vision]", err);
    return NextResponse.json({ error: "Failed to process images" }, { status: 500 });
  }
}
