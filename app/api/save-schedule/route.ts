import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { nanoid } from "nanoid";

const SCHEDULE_TTL = 60 * 60 * 24 * 90; // 90 days
const RATE_LIMIT_TTL = 60 * 60 * 24; // 24 hours
const MAX_SCHEDULES_PER_DAY = 5;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const rateLimitKey = `ratelimit:${ip}`;

    // Check rate limit
    try {
      const count = await redis.get<number>(rateLimitKey);
      if (count && count >= MAX_SCHEDULES_PER_DAY) {
        return NextResponse.json(
          { error: `You've generated ${MAX_SCHEDULES_PER_DAY} schedules today. Come back tomorrow!` },
          { status: 429 }
        );
      }
    } catch { /* ignore redis errors */ }

    const body = await req.json();
    const { schedule, audit } = body;

    if (!schedule) {
      return NextResponse.json({ error: "No schedule provided" }, { status: 400 });
    }

    // Generate unique ID
    const id = nanoid(10);
    const scheduleData = {
      id,
      schedule,
      audit: {
        student_name: audit?.student_name ?? null,
        major: audit?.major ?? null,
      },
      created_at: new Date().toISOString(),
    };

    // Save to Redis
    await redis.set(`schedule:${id}`, scheduleData, { ex: SCHEDULE_TTL });

    // Increment rate limit counter
    try {
      const current = await redis.get<number>(rateLimitKey) ?? 0;
      await redis.set(rateLimitKey, current + 1, { ex: RATE_LIMIT_TTL });
    } catch { /* ignore */ }

    return NextResponse.json({ id, url: `/schedule/${id}` });
  } catch (err) {
    console.error("save-schedule error:", err);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
