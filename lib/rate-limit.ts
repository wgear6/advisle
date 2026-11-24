import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

// Fixed-window rate limits, stored in the existing Upstash Redis.
//
// Counted per BROWSER (anonymous `advisle_cid` cookie set by proxy.ts), not per IP,
// because everyone on campus Wi-Fi can share one public IP. A much higher per-IP
// ceiling stays as a backstop against scripts that rotate/drop cookies, and a
// site-wide daily cap bounds total AI spend no matter what.
//
// Fails OPEN: if Redis is unreachable the request is allowed, so an outage
// never takes the site down. The OpenAI dashboard budget cap is the backstop.

const HOUR = 60 * 60;

export const LIMITS = {
  //          per browser   per IP (shared Wi-Fi safe)   cookieless clients, per IP
  audit:    { browser: 20,  ip: 400,  noCookie: 30,  windowSec: HOUR }, // audit PDF parses (UVM + UNH)
  schedule: { browser: 40,  ip: 800,  noCookie: 60,  windowSec: HOUR }, // schedule generations
  syllabus: { browser: 30,  ip: 500,  noCookie: 40,  windowSec: HOUR }, // syllabus extract + vision
  save:     { browser: 60,  ip: 1000, noCookie: 80,  windowSec: HOUR }, // saved/shared schedules
  report:   { browser: 10,  ip: 150,  noCookie: 15,  windowSec: HOUR }, // "report bad schedule"
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

function clientId(req: NextRequest): string | null {
  const cid = req.cookies.get("advisle_cid")?.value;
  return cid && /^[A-Za-z0-9_-]{10,64}$/.test(cid) ? cid : null;
}

const limitedResponse = (message: string, retryAfter?: number) =>
  NextResponse.json(
    { error: "rate_limited", message },
    { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined }
  );

/**
 * Returns a 429 response if the caller is over the limit, otherwise null.
 * Usage: `const limited = await rateLimit(req, "audit"); if (limited) return limited;`
 */
export async function rateLimit(req: NextRequest, name: LimitName): Promise<NextResponse | null> {
  const { browser, ip: ipMax, noCookie, windowSec } = LIMITS[name];
  const ip = clientIp(req);
  const cid = clientId(req);
  try {
    const window = Math.floor(Date.now() / 1000 / windowSec);
    const tooMany = "You're doing that a lot — please wait a bit and try again.";

    if (cid) {
      const [perBrowser, perIp] = await Promise.all([
        hit(`rl:${name}:c:${cid}:${window}`, windowSec),
        hit(`rl:${name}:ip:${ip}:${window}`, windowSec),
      ]);
      if (perBrowser > browser || perIp > ipMax) return limitedResponse(tooMany, windowSec);
    } else {
      // No cookie (scripts, curl, cookies blocked): tighter per-IP bucket
      const n = await hit(`rl:${name}:nc:${ip}:${window}`, windowSec);
      if (n > noCookie) return limitedResponse(tooMany, windowSec);
    }

    if (AI_LIMITS.includes(name)) {
      const day = new Date().toISOString().slice(0, 10);
      const total = await hit(`rl:ai-daily:${day}`, 60 * 60 * 26);
      if (total > AI_DAILY_LIMIT) {
        console.error(`[rate-limit] site-wide AI daily cap hit (${AI_DAILY_LIMIT})`);
        return limitedResponse("Advisle is getting a lot of traffic right now — please try again later.");
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
