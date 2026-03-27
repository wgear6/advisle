import { NextRequest, NextResponse } from "next/server";
import { parseUnhAudit } from "@/lib/unh-audit-parser";

export async function POST(req: NextRequest) {
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
      pdfText = text;
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to parse degree audit", detail: message },
      { status: 500 }
    );
  }
}
