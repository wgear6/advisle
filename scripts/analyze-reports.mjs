#!/usr/bin/env node
/**
 * Reads bad schedule reports from Redis and runs Claude headless to analyze
 * patterns and suggest code fixes.
 *
 * Usage:  node scripts/analyze-reports.mjs
 * Output: scripts/report-analysis.md (overwritten each run)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ── Redis REST API ────────────────────────────────────────────────────────────

const REDIS_URL   = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

if (!REDIS_URL || !REDIS_TOKEN) {
  // Try loading from .env.local
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const [key, ...rest] = line.split("=");
      const val = rest.join("=").replace(/^"|"$/g, "");
      if (key === "KV_REST_API_URL")   process.env.KV_REST_API_URL   = val;
      if (key === "KV_REST_API_TOKEN") process.env.KV_REST_API_TOKEN = val;
    }
  }
}

async function redisGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const json = await res.json();
  return json.result ? JSON.parse(json.result) : null;
}

async function redisList(key, start = 0, stop = 49) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/lrange/${encodeURIComponent(key)}/${start}/${stop}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const json = await res.json();
  return json.result ?? [];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[analyze-reports] Fetching recent reports from Redis...");

  const ids = await redisList("reports:index", 0, 19); // last 20 reports
  if (ids.length === 0) {
    console.log("[analyze-reports] No reports found yet — nothing to analyze.");
    return;
  }

  const reports = (await Promise.all(ids.map((id) => redisGet(`report:${id}`)))).filter(Boolean);
  console.log(`[analyze-reports] Got ${reports.length} reports`);

  // Format reports for Claude
  const reportSummary = reports.map((r, i) => `
### Report ${i + 1} — ${r.created_at}
**Feedback:** ${r.feedback || "(none)"}
**Major:** ${r.audit_info?.major || "unknown"}
**Target credits:** ${r.inputs?.target_credits}
**Credits completed:** ${r.inputs?.credits_completed ?? "unknown"}
**Blocked times:** ${r.inputs?.blocked_times?.length ?? 0}
**Courses scheduled:** ${r.outputs?.course_count ?? 0} (${r.outputs?.total_credits ?? 0} credits)
**Unscheduled:** ${r.outputs?.unscheduled?.join(", ") || "none"}
**AI notes:** ${r.outputs?.notes || "none"}
**Remaining courses sent:** ${r.inputs?.remaining_courses?.length ?? 0}
**Schedule:** ${(r.outputs?.schedule ?? []).map((c) => `${c.subject} ${c.number} (${c.credits}cr)`).join(", ") || "empty"}
`).join("\n---\n");

  const prompt = `You are analyzing bug reports from Advisle, a UVM degree scheduler web app.

The app works like this:
1. Student uploads a UVM degree audit PDF
2. AI picks which courses to take (returns prioritized list)
3. Deterministic algorithm picks conflict-free sections from a CSV of Fall 2026 sections

Here are the ${reports.length} most recent bad schedule reports from real users:

${reportSummary}

The main source file is app/api/generate-schedule/route.ts. Read it, then:
1. Identify the most common failure patterns across these reports
2. Pinpoint the likely root cause in the code for each pattern
3. Suggest specific, concrete code fixes with line numbers where possible
4. Flag any reports that look like data issues (missing CSV sections) vs logic bugs

Be specific and actionable. Output as markdown.`;

  // Write prompt to temp file so it doesn't get mangled by shell escaping
  const promptFile = path.join(ROOT, "scripts", ".analysis-prompt.txt");
  fs.writeFileSync(promptFile, prompt);

  console.log("[analyze-reports] Running Claude headless analysis...");

  const outputFile = path.join(ROOT, "scripts", "report-analysis.md");

  try {
    const result = execSync(
      `claude -p "$(cat scripts/.analysis-prompt.txt)" --output-format text`,
      { cwd: ROOT, encoding: "utf-8", timeout: 120000 }
    );
    fs.writeFileSync(outputFile, `# Schedule Report Analysis\n_Generated ${new Date().toISOString()}_\n\n${result}`);
    console.log(`[analyze-reports] Analysis written to scripts/report-analysis.md`);
  } catch (err) {
    console.error("[analyze-reports] Claude failed:", err.message);
  } finally {
    fs.unlinkSync(promptFile);
  }
}

main().catch(console.error);
