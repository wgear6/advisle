import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { nanoid } from "nanoid";

const REPORT_TTL = 60 * 60 * 24 * 180; // 180 days

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { feedback, inputs, outputs, audit_info } = body;

    const id = nanoid(10);
    const report = {
      id,
      created_at: new Date().toISOString(),
      feedback: feedback ?? "",
      inputs: {
        target_credits: inputs?.target_credits,
        major: inputs?.major,
        credits_completed: inputs?.credits_completed,
        custom_notes: inputs?.custom_notes,
        blocked_times: inputs?.blocked_times ?? [],
        remaining_courses: inputs?.remaining_courses ?? [],
        in_progress_courses: inputs?.in_progress_courses ?? [],
      },
      outputs: {
        total_credits: outputs?.total_credits,
        course_count: outputs?.recommended_schedule?.length ?? 0,
        notes: outputs?.notes,
        schedule: outputs?.recommended_schedule ?? [],
        unscheduled: outputs?.unscheduled_courses ?? [],
      },
      audit_info: {
        student_name: audit_info?.student_name ?? null,
        major: audit_info?.major ?? null,
      },
    };

    await redis.set(`report:${id}`, report, { ex: REPORT_TTL });

    // Also push to a list so we can paginate reports easily
    await redis.lpush("reports:index", id);

    return NextResponse.json({ id });
  } catch (err) {
    console.error("report-schedule error:", err);
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}
