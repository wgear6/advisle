import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

const UVM_SCHOOL_ID = "U2Nob29sLTEzMjA=";
const UNH_SCHOOL_ID = "U2Nob29sLTEyMzE="; // University of New Hampshire (all campuses)
const RMP_URL = "https://www.ratemyprofessors.com/graphql";
const AUTH = "Basic dGVzdDp0ZXN0";
const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days

export interface RMPRating {
  firstName: string;
  lastName: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
}

async function fetchRatingFromRMP(lastName: string, schoolId: string): Promise<RMPRating | null> {
  try {
    const res = await fetch(RMP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: AUTH },
      body: JSON.stringify({
        query: `{ newSearch { teachers(query: { text: "${lastName}", schoolID: "${schoolId}" }) { edges { node { firstName lastName avgRating avgDifficulty numRatings } } } } }`,
      }),
    });
    const data = await res.json();
    const edges = data?.data?.newSearch?.teachers?.edges ?? [];
    if (edges.length === 0) return null;
    return edges[0].node as RMPRating;
  } catch {
    return null;
  }
}

async function getRating(name: string, schoolId: string): Promise<RMPRating | null> {
  if (!name || name === "TBA" || name === ".. Staff") return null;

  let lastName = name;
  if (name.includes(",")) lastName = name.split(",")[0].trim();
  else if (name.includes(" ")) lastName = name.split(" ").pop() ?? name;

  const cacheKey = `rmp:${schoolId}:${lastName.toLowerCase()}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached === "null") return null;
    if (cached) return cached as RMPRating;
  } catch { /* fall through */ }

  const rating = await fetchRatingFromRMP(lastName, schoolId);

  try {
    await redis.set(cacheKey, rating ?? "null", {
      ex: rating ? CACHE_TTL : 60 * 60 * 24,
    });
  } catch { /* ignore */ }

  return rating;
}

export async function POST(req: NextRequest) {
  try {
    const { instructors, school } = await req.json();
    if (!instructors || !Array.isArray(instructors)) {
      return NextResponse.json({ error: "No instructors" }, { status: 400 });
    }

    const schoolId = school === "unh" ? UNH_SCHOOL_ID : UVM_SCHOOL_ID;

    const ratings: Record<string, RMPRating | null> = {};
    await Promise.all(
      instructors.map(async (name: string) => {
        ratings[name] = await getRating(name, schoolId);
      })
    );

    return NextResponse.json({ ratings });
  } catch (err) {
    console.error("rmp error:", err);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
