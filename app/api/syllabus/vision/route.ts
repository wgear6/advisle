import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooLarge } from "@/lib/rate-limit";
import { parseSyllabusImages } from "@/lib/syllabus-parser";

export async function POST(req: NextRequest) {
  const big = tooLarge(req, 5242880);
  if (big) return big;
  const limited = await rateLimit(req, "syllabus");
  if (limited) return limited;
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
