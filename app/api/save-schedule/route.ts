import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { nanoid } from "nanoid";

const SCHEDULE_TTL = 60 * 60 * 24 * 90; // 90 days

const CLIENT_ID_COOKIE = "advisle_cid";
const CLIENT_ID_TTL_DAYS = 365;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const rateLimitKey = `ratelimit:${ip}`;

    const body = await req.json();
    const { schedule, audit } = body;

    if (!schedule) {
      return NextResponse.json({ error: "No schedule provided" }, { status: 400 });
    }

    // Assign a persistent anonymous client ID (cookie-based, no PII)
    const existingCid = req.cookies.get(CLIENT_ID_COOKIE)?.value;
    const clientId = existingCid ?? nanoid(16);

    // Generate unique ID
    const id = nanoid(10);
    const scheduleData = {
      id,
      client_id: clientId,
      schedule,
      audit: {
        student_name: audit?.student_name ?? null,
        major: audit?.major ?? null,
      },
      created_at: new Date().toISOString(),
    };

    // Save to Redis and maintain a per-client index for retention queries
    await Promise.all([
      redis.set(`schedule:${id}`, scheduleData, { ex: SCHEDULE_TTL }),
      redis.lpush(`client:${clientId}:schedules`, id),
      redis.expire(`client:${clientId}:schedules`, SCHEDULE_TTL),
    ]);

    const response = NextResponse.json({ id, url: `/schedule/${id}` });

    // Set cookie if it didn't already exist
    if (!existingCid) {
      response.cookies.set(CLIENT_ID_COOKIE, clientId, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * CLIENT_ID_TTL_DAYS,
        path: "/",
      });
    }

    return response;
  } catch (err) {
    console.error("save-schedule error:", err);
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
