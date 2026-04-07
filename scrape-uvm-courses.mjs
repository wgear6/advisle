/**
 * UVM Fall 2026 Course Scraper
 * Uses soc.uvm.edu's internal FOSE API
 *
 * Usage:  node scrape-uvm-courses.mjs
 * Output: data/curr_enroll_202609.csv
 */

import fs from "fs";
import https from "https";

const TERM = "202609";
const OUTPUT_FILE = "data/curr_enroll_fall.csv";
const DELAY_MS = 400;

const SUBJECTS = [
  "ABIO","ALE","ANPS","ANTH","ARTH","ARTS","ASCI","ASL","ASTR","BCOR",
  "BHSC","BIOC","BIOE","BIOL","BME","BUS","CALS","CAS","CDAE","CEE",
  "CEMS","CHEM","CHIN","CIS","CLAS","CLBI","CMPE","CNCR","CNSL","COMU",
  "CRES","CS","CSCS","CSD","CSYS","CTS","DNCE","DPT","ECLD","ECON",
  "ECSP","EDCI","EDEC","EDEL","EDFS","EDHE","EDHI","EDLI","EDLP","EDLT",
  "EDML","EDPE","EDRM","EDSC","EDSP","EDTE","EE","EMED","EMGT","ENGL",
  "ENGR","ENSC","ENVS","EXSC","FOR","FREN","FS","FTS","GEOG","GEOL",
  "GERM","GNRL","GRAD","GRK","GRNS","GRS","GSWS","GU","HCOL","HDF",
  "HEBR","HLTH","HP","HSCI","HSOC","HST","IHS","ITAL","JAPN","JS",
  "LAT","LING","MATH","MATS","MBA","ME","MED","MLS","MMG","MPBP",
  "MS","MU","MUE","MUL","NFS","NH","NR","NSCI","NURS","OBGY",
  "ORTH","OSSP","OT","PA","PATH","PBIO","PEAC","PH","PHIL","PHRM",
  "PHYS","POLS","PRNU","PRT","PSYS","RADT","REL","RMS","RUSS","SEP",
  "SOA","SOC","SPAN","SPCH","STAT","SURG","SWSS","THE","WFB","WLIT"
];

// ── HTTP ──────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "soc.uvm.edu",
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json",
          "Origin": "https://soc.uvm.edu",
          "Referer": "https://soc.uvm.edu/",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Parsers ───────────────────────────────────────────────────────────────────

const DAY_MAP = { "0":"M","1":"T","2":"W","3":"R","4":"F","5":"S" };

function parseMeetingTimes(str) {
  if (!str) return { days: "", startTime: "TBA", endTime: "TBA" };
  try {
    const times = JSON.parse(str);
    if (!times?.length) return { days: "", startTime: "TBA", endTime: "TBA" };
    const dayOrder = ["M","T","W","R","F","S"];
    const days = [...new Set(times.map(t => DAY_MAP[t.meet_day]).filter(Boolean))]
      .sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    return {
      days: days.join(" "),
      startTime: fmtTime(times[0].start_time),
      endTime: fmtTime(times[0].end_time),
    };
  } catch { return { days: "", startTime: "TBA", endTime: "TBA" }; }
}

function fmtTime(t) {
  if (!t || t === "0" || t === "") return "TBA";
  const s = t.toString().padStart(4, "0");
  return `${s.slice(0,2)}:${s.slice(2)}`;
}

function parseAttributes(html) {
  if (!html) return "";
  return (html.match(/\(([^)]+)\)/g) || [])
    .map(m => m.replace(/[()]/g, "").trim())
    .join("|");
}

function parseSeats(html) {
  if (!html) return { maxEnroll: 0, seatsAvail: 0 };
  const maxMatch = html.match(/seats_max">(\d+)</);
  const availMatch = html.match(/seats_avail">(\d+)</);
  const max = maxMatch ? parseInt(maxMatch[1]) : 0;
  const avail = availMatch ? parseInt(availMatch[1]) : 0;
  return { maxEnroll: max, seatsAvail: avail };
}

function parsePrereqs(desc) {
  if (!desc) return "";
  const text = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const m = text.match(/[Pp]rerequisite[s]?:\s*([^.]+)\./);
  return m ? m[1].trim() : "";
}

const SCHD_MAP = { L:"LEC",B:"LAB",D:"DIS",I:"IND",S:"SEM",C:"CLI",P:"PRA",T:"TD" };

function csv(val) {
  return `"${String(val ?? "").replace(/"/g,'""')}"`;
}

// ── Scrape ────────────────────────────────────────────────────────────────────

async function scrapeSubject(subject) {
  // Step 1: search — returns ALL sections for the subject
  const search = await post(
    `/api/?page=fose&route=search&subject=${subject}`,
    { other: { srcdb: TERM }, criteria: [{ field: "subject", value: subject }] }
  );
  if (!search?.results?.length) return [];

  // Step 2: group sections by course code (to share one attrs/prereqs fetch)
  const byCourse = {};
  for (const sec of search.results) {
    const code = sec.code;
    if (!byCourse[code]) byCourse[code] = [];
    byCourse[code].push(sec);
  }

  const rows = [];

  // Step 3: for each course, fetch attrs/prereqs once, then per-section enrollment
  for (const [code, sections] of Object.entries(byCourse)) {
    await sleep(150);

    // One call to get attributes + prereqs for the course
    let attributes = "";
    let prereqs = "";
    let hoursHtml = "";
    try {
      const firstCrn = sections[0].crn;
      const allCrns = sections.map(s => s.crn).join(",");
      const courseDetail = await post(
        `/api/?page=fose&route=details`,
        { group: `code:${code}`, key: `crn:${firstCrn}`, srcdb: TERM, matched: allCrns }
      );
      attributes = parseAttributes(courseDetail?.class_attributes_descr || "");
      prereqs = parsePrereqs(courseDetail?.description || "");
      hoursHtml = courseDetail?.hours_html || "";

      // Use allInGroup sections if available (more complete meeting data)
      if (courseDetail?.allInGroup?.length) {
        sections.splice(0, sections.length, ...courseDetail.allInGroup);
      }
    } catch (e) { /* use search data as fallback */ }

    // Per-section detail call to get accurate enrollment
    for (const sec of sections) {
      await sleep(100);
      let maxEnroll = 0, curEnroll = 0;
      try {
        const secDetail = await post(
          `/api/?page=fose&route=details`,
          { group: `code:${code}`, key: `crn:${sec.crn}`, srcdb: TERM, matched: sec.crn }
        );
        const { maxEnroll: max, seatsAvail } = parseSeats(secDetail?.seats || "");
        maxEnroll = max;
        curEnroll = max - seatsAvail;
        if (!hoursHtml) hoursHtml = secDetail?.hours_html || "";
      } catch (e) { /* leave as 0 */ }

      const { days, startTime, endTime } = parseMeetingTimes(sec.meetingTimes);
      const [subj, num] = (sec.code || code).split(" ");

      rows.push([
        csv(subj || subject),
        csv(num || ""),
        csv(sec.title || ""),
        csv(sec.crn || ""),
        csv(sec.no || "A"),
        csv(SCHD_MAP[sec.schd] || sec.schd || "LEC"),
        csv(startTime),
        csv(endTime),
        csv(days),
        csv(hoursHtml || sec.total || "3"),
        csv(""), // building (not in API)
        csv(""), // room
        csv(sec.instr || ""),
        csv(maxEnroll),
        csv(curEnroll),
        csv(attributes),
        csv(prereqs),
      ].join(","));
    }
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Scraping UVM Fall 2026 courses...\n");
  if (!fs.existsSync("data")) fs.mkdirSync("data");

  const headers = [
    "Subj","#","Title","Comp Numb","Sec","Lec Lab",
    "Start Time","End Time","Days","Credits",
    "Bldg","Room","Instructor","Max Enrollment","Current Enrollment",
    "Attr","Prerequisites",
  ].map(h => `"${h}"`).join(",");

  const out = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf-8" });
  out.write(headers + "\n");

  let totalRows = 0;
  let totalSubjects = 0;

  for (let i = 0; i < SUBJECTS.length; i++) {
    const subject = SUBJECTS[i];
    process.stdout.write(`  [${i+1}/${SUBJECTS.length}] ${subject}... `);

    try {
      const rows = await scrapeSubject(subject);
      rows.forEach(r => out.write(r + "\n"));
      totalRows += rows.length;
      if (rows.length > 0) totalSubjects++;
      console.log(`✓ ${rows.length}`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }

    await sleep(DELAY_MS);
  }

  out.end();
  console.log(`\n✅ Done! ${totalRows} sections across ${totalSubjects} subjects`);
  console.log(`   Output: ${OUTPUT_FILE}`);
}

main().catch(console.error);
