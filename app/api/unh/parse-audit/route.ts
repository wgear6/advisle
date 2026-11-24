import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooLarge, MAX_AUDIT_CHARS } from "@/lib/rate-limit";
import { parseUnhAudit } from "@/lib/unh-audit-parser";

export async function POST(req: NextRequest) {
  const big = tooLarge(req, 5242880);
  if (big) return big;
  const limited = await rateLimit(req, "audit");
  if (limited) return limited;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    let pdfText: string;
    try {
      const bytes = await file.arrayBuffer();
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
      pdfText = text.slice(0, MAX_AUDIT_CHARS);
    } catch (err) {
      console.error("[unh/parse-audit] PDF extraction failed:", err);
      return NextResponse.json({ error: "Could not read PDF." }, { status: 500 });
    }

    const result = await parseUnhAudit(pdfText);

    const headers = new Headers({
      "X-Audit-Model": result.model,
      "X-Audit-Fallback": String(result.fallback),
      "X-Audit-Latency-Ms": String(result.latencyMs),
    });

    return NextResponse.json(result.data, { headers });
  } catch (err) {
    console.error("[unh/parse-audit] error:", err);
    return NextResponse.json({ error: "Failed to parse degree audit" }, { status: 500 });
  }
}
