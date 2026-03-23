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
const OUTPUT_FILE = "data/curr_enroll_202609.csv";
const DELAY_MS = 400;

const SUBJECTS = [
  "ABIO","ACCT","AGED","AGRI","AGROEC","ANFS","ANTH","AREC","ARIA","ARTH",
  "ARTS","ASTR","BCOR","BIOL","BIOS","BSAD","BUS","CDAE","CE","CED","CEMS",
  "CHEM","CHIN","CIS","CIVL","CJ","CLA","CMPE","CNSC","COCE","COGS",
  "COMM","CS","CSYS","CTLN","DANC","DCIM","ECON","EDCO","EDEC","EDEL",
  "EDFI","EDFS","EDHI","EDML","EDSC","EDSP","EDSS","EDST","EE","ELED",
  "ENGL","ENGS","ENSC","ENVS","FIND","FINN","FREN","GEOG","GEOL","GERM","GREE",
  "GSWS","HEAL","HCOL","HIST","HLTH","HORT","HPSC","HSCI","HUMN","IEGT",
  "INNO","INTL","ITAL","JAPN","JRNL","LASC","LAT","LING","LSP","MATH",
  "MBIO","MCRS","ME","MMG","MPA","MSBA","MUS","NFS","NEUR","NR",
  "NRSC","NS","NURS","PA","PBIO","PHED","PHIL","PHYS","PLS","POLS",
  "PORT","PSYC","RADI","RELI","RUSS","SA","SCIE","SOC","SOWK","SPAN",
  "SPED","SPCH","SS","STAT","THEA","TRC","TS","UEC","WFB","WLPS"
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

  // Step 2: group sections by course code
  const byCourse = {};
  for (const sec of search.results) {
    const code = sec.code; // e.g. "MATH 1248"
    if (!byCourse[code]) byCourse[code] = [];
    byCourse[code].push(sec);
  }

  const rows = [];

  // Step 3: for each course, make ONE detail call with all CRNs in matched
  for (const [code, sections] of Object.entries(byCourse)) {
    await sleep(150);
    try {
      const firstCrn = sections[0].crn;
      const allCrns = sections.map(s => s.crn).join(",");

      const detail = await post(
        `/api/?page=fose&route=details`,
        {
          group: `code:${code}`,
          key: `crn:${firstCrn}`,
          srcdb: TERM,
          matched: allCrns,
        }
      );

      const attributes = parseAttributes(detail?.class_attributes_descr || "");
      const prereqs = parsePrereqs(detail?.description || "");

      // allinGroup has all sections with full data
      const allSections = detail?.allinGroup || sections;

      for (const sec of allSections) {
        const { days, startTime, endTime } = parseMeetingTimes(sec.meetingTimes);
        const [subj, num] = (sec.code || code).split(" ");

        const maxEnroll = parseInt(sec.cap || sec.seats || "0") || 0;
        const curEnroll = parseInt(sec.enrol || sec.act || "0") || 0;

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
          csv(detail?.hours_html || sec.total || "3"),
          csv(""), // building (not in API)
          csv(""), // room
          csv(sec.instr || ""),
          csv(maxEnroll),
          csv(curEnroll),
          csv(attributes),
          csv(prereqs),
        ].join(","));
      }
    } catch (e) {
      // skip failed courses
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
