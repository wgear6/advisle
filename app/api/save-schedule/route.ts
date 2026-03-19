import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { nanoid } from "nanoid";

const SCHEDULE_TTL = 60 * 60 * 24 * 90; // 90 days

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const rateLimitKey = `ratelimit:${ip}`;

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


    return NextResponse.json({ id, url: `/schedule/${id}` });
  } catch (err) {
    console.error("save-schedule error:", err);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
