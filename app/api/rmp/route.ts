import { NextRequest, NextResponse } from "next/server";

const UVM_SCHOOL_ID = "U2Nob29sLTEzMjA=";
const RMP_URL = "https://www.ratemyprofessors.com/graphql";
const AUTH = "Basic dGVzdDp0ZXN0";

export interface RMPRating {
  firstName: string;
  lastName: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
}

async function fetchRating(lastName: string): Promise<RMPRating | null> {
  try {
    const res = await fetch(RMP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH,
      },
      body: JSON.stringify({
        query: `{ newSearch { teachers(query: { text: "${lastName}", schoolID: "${UVM_SCHOOL_ID}" }) { edges { node { firstName lastName avgRating avgDifficulty numRatings } } } } }`,
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

export async function POST(req: NextRequest) {
  try {
    const { instructors } = await req.json();

    if (!instructors || !Array.isArray(instructors)) {
      return NextResponse.json({ error: "No instructors provided" }, { status: 400 });
    }

    const ratings: Record<string, RMPRating | null> = {};

    // Fetch all instructors in parallel
    await Promise.all(
      instructors.map(async (name: string) => {
        if (!name || name === "TBA" || name === ".. Staff") {
          ratings[name] = null;
          return;
        }
        // Extract last name — handle "D. Hathaway" or "Hathaway, Daniel"
        let lastName = name;
        if (name.includes(",")) {
          lastName = name.split(",")[0].trim();
        } else if (name.includes(" ")) {
          lastName = name.split(" ").pop() ?? name;
        }
        ratings[name] = await fetchRating(lastName);
      })
    );

    return NextResponse.json({ ratings });
  } catch (err) {
    console.error("rmp error:", err);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
