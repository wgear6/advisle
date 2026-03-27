import { NextRequest, NextResponse } from "next/server";

// ─── UNH Schedule Generator ───────────────────────────────────────────────────
// This route is structurally identical to the UVM generate-schedule route but
// uses UNH-specific course data, gen-ed codes, and subject mappings.
//
// STATUS: Awaiting UNH course data (scraper in progress).
// Once data/unh/courses_fall.csv is populated this route will be fully enabled.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const UNH_DATA_PATH = path.join(process.cwd(), "data", "unh", "courses_fall.csv");

export async function POST(_req: NextRequest) {
  // Check if UNH course data has been loaded yet
  if (!fs.existsSync(UNH_DATA_PATH) || fs.statSync(UNH_DATA_PATH).size < 100) {
    return NextResponse.json(
      {
        error: "unh_data_unavailable",
        message: "UNH course data is not yet available. We're working on it — check back soon!",
      },
      { status: 503 }
    );
  }

  // TODO: implement full UNH schedule generation once course data is available.
  // Will mirror the UVM generate-schedule route with UNH-specific:
  //   - CSV column mapping (UNH SOC format TBD from scraper)
  //   - Discovery Program gen-ed codes: INQ, DLAB, PS, HP, WC, FPA, ETS, BIOL, HUM, SS, WRIT
  //   - Subject alias map for audit → CSV name mismatches
  //   - DISC_REQ subject handling (equivalent to UVM's GEN_ED)
  //   - Course number range: 3-digit (400-799)

  return NextResponse.json(
    { error: "not_implemented", message: "UNH schedule generation coming soon." },
    { status: 503 }
  );
}
