#!/usr/bin/env node
/**
 * UNH Schedule of Classes scraper
 * API: https://wapi.unh.edu/dhub/api/courses/all/{termcode}
 * No auth token needed — just Origin/Referer headers pointing to courses.unh.edu
 *
 * Usage: node scripts/scrape-unh-courses.mjs [termcode]
 * Default termcode: 202610 (Fall 2026)
 *
 * Output: data/unh/courses_fall.csv
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TERM_CODE = process.argv[2] ?? "202610";
const PAGE_LIMIT = 100;
const BASE_URL = `https://wapi.unh.edu/dhub/api/courses/all/${TERM_CODE}`;
const OUT_PATH = path.join(__dirname, "..", "data", "unh", "courses_fall.csv");

const HEADERS = {
  "Origin": "https://courses.unh.edu",
  "Referer": "https://courses.unh.edu/",
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; schedule-scraper/1.0)",
};

// Map UNH schedule type codes → our CSV Type values
const SCHD_TYPE_MAP = {
  LEC: "LEC",
  LAB: "LAB",
  DIS: "DIS",
  SEM: "SEM",
  CLL: "LEC", // "Classroom Lecture" — treat as LEC
  ONL: "LEC", // Online
  HYB: "LEC", // Hybrid
  STU: "LAB", // Studio
  CLI: "LAB", // Clinical
  FLD: "LAB", // Field
  REC: "DIS", // Recitation
  IND: "LEC", // Independent study
};

function parseAmPm(t) {
  // e.g. "8:10am" or "9:00pm" → "08:10" / "21:00"
  if (!t) return "TBA";
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!m) return t.trim();
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function formatTime(rawTime) {
  if (!rawTime || rawTime === "TBA" || rawTime.trim() === "") return "TBA";
  return rawTime.trim();
}

// Parse "8:10am - 9:00am" → { start: "08:10", end: "09:00" }
function parseCombinedTime(timeStr) {
  if (!timeStr || timeStr.trim() === "" || timeStr.trim() === "TBA") {
    return { start: "TBA", end: "TBA" };
  }
  const parts = timeStr.split("-").map((s) => s.trim());
  if (parts.length === 2) {
    return { start: parseAmPm(parts[0]), end: parseAmPm(parts[1]) };
  }
  return { start: timeStr.trim(), end: "TBA" };
}

function formatDays(rawDays) {
  if (!rawDays || rawDays.trim() === "") return "TBA";
  return rawDays.trim();
}

function mapScheduleType(code) {
  if (!code) return "LEC";
  return SCHD_TYPE_MAP[code.trim().toUpperCase()] ?? code.trim();
}

function buildInstructor(instructors) {
  if (!instructors || instructors.length === 0) return "TBA";
  return instructors
    .map((i) => {
      const parts = [i.LAST_NAME, i.FIRST_NAME, i.MI].filter(Boolean);
      if (parts.length === 0) return "TBA";
      const first = [i.FIRST_NAME, i.MI].filter(Boolean).join(" ");
      return first ? `${i.LAST_NAME}, ${first}` : i.LAST_NAME;
    })
    .join("; ");
}

function buildAttributes(attributes) {
  if (!attributes) return "";
  // API shape: { ATTRS: [{ ATTR: "Writing Intensive Course", CODE: "WRIT" }, ...] }
  let arr;
  if (Array.isArray(attributes)) {
    arr = attributes;
  } else if (attributes.ATTRS && Array.isArray(attributes.ATTRS)) {
    arr = attributes.ATTRS;
  } else {
    arr = Object.values(attributes);
  }
  return arr
    .map((a) => (typeof a === "string" ? a : a.CODE ?? a.ATTR_CODE ?? a.code ?? ""))
    .filter(Boolean)
    .join("|");
}

function stripHtml(str) {
  if (!str) return "";
  // Remove HTML tags, decode common entities
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function csvField(val) {
  const s = String(val ?? "");
  // Escape quotes and wrap in quotes if needed
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

function courseToRow(course) {
  const meetings = course.MEETINGS ?? [];
  const meeting = meetings[0] ?? {};

  const subj = course.SYVSCHD_SUBJ_CODE ?? "";
  const num = course.SYVSCHD_CRSE_NUMB ?? "";
  const title = course.SYVSCHD_CRSE_LONG_TITLE ?? course.TITLE ?? "";
  const crn = course.SYVSCHD_CRN ?? "";
  const sec = course.SYVSCHD_SEQ_NUMB ?? "";
  const type = mapScheduleType(course.SYVSCHD_SCHD_CODE);
  const { start: startTime, end: endTime } = parseCombinedTime(
    meeting.TIME ?? meeting.BEGIN_TIME ?? meeting.START_TIME ?? ""
  );
  const days = formatDays(meeting.DAYS ?? meeting.SYVSCHD_DAYS ?? "");
  const credits = course.SYVSCHD_CREDIT_HR_LOW ?? course.CREDITS_HRS ?? course.CREDIT_HRS ?? "";
  const building = meeting.BUILDING ?? meeting.BLDG ?? "";
  const room = meeting.ROOM ?? "";
  const instructor = buildInstructor(course.INSTRUCTORS);
  const maxEnroll = course.SYVSCHD_MAX_ENRL ?? "";
  const curEnroll = course.SYVSCHD_ENRL ?? "";
  const attr = buildAttributes(course.ATTRIBUTES);
  const prereq = stripHtml(course.PRE_REQ ?? course.PREREQUISITES ?? "");

  return [
    subj, num, title, crn, sec, type,
    startTime, endTime, days, credits,
    building, room, instructor,
    maxEnroll, curEnroll, attr, prereq,
  ].map(csvField).join(",");
}

async function fetchPage(offset) {
  const url = `${BASE_URL}?termcode=${TERM_CODE}&page[offset]=${offset}&page[limit]=${PAGE_LIMIT}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} at offset ${offset}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log(`Scraping UNH SOC for term ${TERM_CODE}...`);

  // Ensure output directory exists
  const outDir = path.dirname(OUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Write CSV header
  const CSV_HEADER = [
    "Subj", "#", "Title", "CRN", "Sec", "Type",
    "Start Time", "End Time", "Days", "Credits",
    "Building", "Room", "Instructor",
    "Max Enrollment", "Current Enrollment", "Attr", "Prerequisites",
  ].map(csvField).join(",");

  const out = fs.createWriteStream(OUT_PATH, { encoding: "utf8" });
  out.write(CSV_HEADER + "\n");

  let offset = 0;
  let total = null;
  let written = 0;

  while (true) {
    process.stdout.write(`  Fetching offset ${offset}...`);
    let data;
    try {
      data = await fetchPage(offset);
    } catch (err) {
      console.error(`\nFailed at offset ${offset}:`, err.message);
      process.exit(1);
    }

    // Discover total on first page
    if (total === null) {
      total = data["total-count"] ?? data.total ?? data.TOTAL_COUNT ?? null;
      console.log(` total: ${total ?? "unknown"}`);
    } else {
      console.log(" ok");
    }

    // Extract course records — API may nest under different keys
    const courses =
      data.data ??
      data.COURSE_DATA ??
      data.courses ??
      data.results ??
      [];

    if (!Array.isArray(courses) || courses.length === 0) {
      console.log("No courses returned — done.");
      break;
    }

    for (const course of courses) {
      // Some APIs wrap each record in a COURSE_DATA key
      const c = course.COURSE_DATA ?? course;
      const row = courseToRow(c);
      out.write(row + "\n");
      written++;
    }

    offset += PAGE_LIMIT;

    // Stop if we've fetched everything or got a short page
    if (total !== null && offset >= total) break;
    if (courses.length < PAGE_LIMIT) break;

    // Small delay to be polite
    await new Promise((r) => setTimeout(r, 150));
  }

  await new Promise((resolve, reject) => {
    out.end((err) => (err ? reject(err) : resolve()));
  });

  console.log(`\nDone. Wrote ${written} rows to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
