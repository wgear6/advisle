import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

// Fixed-window per-IP rate limits, stored in the existing Upstash Redis.
// Fails OPEN: if Redis is unreachable the request is allowed, so an outage
// never takes the site down. The OpenAI dashboard budget cap is the backstop.

export const LIMITS = {
  audit:    { max: 20, windowSec: 60 * 60 }, // audit PDF parses (UVM + UNH share this)
  schedule: { max: 40, windowSec: 60 * 60 }, // schedule generations
  syllabus: { max: 30, windowSec: 60 * 60 }, // syllabus extract + vision
  save:     { max: 60, windowSec: 60 * 60 }, // saved/shared schedules
  report:   { max: 10, windowSec: 60 * 60 }, // "report bad schedule"
} as const;

export type LimitName = keyof typeof LIMITS;

// Site-wide cap on AI-backed requests per UTC day — stops a distributed attack
// (many IPs) from running up the bill. Override with AI_DAILY_LIMIT env var.
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 5000);
const AI_LIMITS: LimitName[] = ["audit", "schedule", "syllabus"];

export function clientIp(req: NextRequest): string {
  // On Vercel the first x-forwarded-for entry is the real client IP (set by the platform).
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

async function hit(key: string, windowSec: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  return count;
}

/**
 * Returns a 429 response if the caller is over the limit, otherwise null.
 * Usage: `const limited = await rateLimit(req, "audit"); if (limited) return limited;`
 */
export async function rateLimit(req: NextRequest, name: LimitName): Promise<NextResponse | null> {
  const { max, windowSec } = LIMITS[name];
  const ip = clientIp(req);
  try {
    const window = Math.floor(Date.now() / 1000 / windowSec);
    const count = await hit(`rl:${name}:${ip}:${window}`, windowSec);
    if (count > max) {
      return NextResponse.json(
        { error: "rate_limited", message: "You're doing that a lot — please wait a bit and try again." },
        { status: 429, headers: { "Retry-After": String(windowSec) } }
      );
    }
    if (AI_LIMITS.includes(name)) {
      const day = new Date().toISOString().slice(0, 10);
      const total = await hit(`rl:ai-daily:${day}`, 60 * 60 * 26);
      if (total > AI_DAILY_LIMIT) {
        console.error(`[rate-limit] site-wide AI daily cap hit (${AI_DAILY_LIMIT})`);
        return NextResponse.json(
          { error: "rate_limited", message: "Advisle is getting a lot of traffic right now — please try again later." },
          { status: 429 }
        );
      }
    }
  } catch (err) {
    console.error("[rate-limit] redis unavailable, allowing request:", err);
  }
  return null;
}

/** Reject request bodies larger than `maxBytes` (based on Content-Length). */
export function tooLarge(req: NextRequest, maxBytes: number): NextResponse | null {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) {
    return NextResponse.json({ error: "too_large", message: "Request is too large." }, { status: 413 });
  }
  return null;
}

/** Max characters of audit text sent to the model (~25k tokens). Real audits are far smaller. */
export const MAX_AUDIT_CHARS = 100_000;
