// Strips personal info from degree-audit text BEFORE it is sent to the AI model.
// None of this is needed to build a schedule:
//   student name, student ID / "95/96 number", NetID, GPA figures, advisor names, emails.
// Course history, grades on individual courses, and requirements are kept.
//
// Works on the flattened text unpdf produces from Ellucian Degree Works audits
// (UVM and UNH), e.g.
//   "University of Vermont Gear, William - *****9359 ... Student name Gear, William
//    95/96 number *****9359 ... Overall GPA 3.53 ... NetID wgear Advisors Jane Smith ..."

const R = "[removed]";
const NAME_WORD = "[A-Z][A-Za-z'’.-]+";

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull the student's name from the "Student name Last, First" header field. */
function findStudentName(text: string): { last: string; first: string } | null {
  const m = text.match(
    new RegExp(`Student\\s+name:?\\s+(${NAME_WORD}(?:[ -]${NAME_WORD})*),\\s*(${NAME_WORD}(?:\\s${NAME_WORD})?)`)
  );
  return m ? { last: m[1], first: m[2] } : null;
}

export function redactAudit(text: string): string {
  let out = text;

  // 1. Student name — every form it appears in (Last, First / First Last), anywhere in the text
  const name = findStudentName(out);
  if (name) {
    const first = name.first.split(/\s+/)[0];
    const variants = [
      `${escapeRe(name.last)},\\s*${escapeRe(name.first)}`,
      `${escapeRe(name.last)},\\s*${escapeRe(first)}`,
      `${escapeRe(name.first)}\\s+${escapeRe(name.last)}`,
      `${escapeRe(first)}\\s+${escapeRe(name.last)}`,
    ];
    for (const v of variants) out = out.replace(new RegExp(v, "g"), R);
  }
  out = out.replace(/Student\s+name:?\s+\S+(?:\s+\S+)?(?=\s)/gi, (m) => (m.includes(R) ? m : `Student name ${R}`));

  // 2. Student ID numbers (masked or not)
  out = out.replace(/\b9[56]\/9[56]\s+number:?\s*\S+/gi, `ID ${R}`);
  out = out.replace(/\bStudent\s+ID:?\s*\S+/gi, `Student ID ${R}`);
  out = out.replace(/\*{2,}\d{2,}/g, R); // e.g. *****9359
  out = out.replace(/\b9\d{8}\b/g, R);   // full 9-digit IDs (UVM/UNH style)

  // 3. NetID / username
  out = out.replace(/\b(NetID|Net\s+ID|Username):?\s+\S+/gi, `$1 ${R}`);

  // 4. GPA values (keeps the word so "You meet the minimum GPA requirement" still reads fine)
  out = out.replace(/\b((?:Overall|Cumulative|Institutional|Major|Term)\s+)?GPA:?\s*\d\.\d{1,3}\b/gi, (_m, p1) => `${p1 ?? ""}GPA ${R}`);

  // 5. Advisor names ("Advisors Jane Smith" or "Advisor: Jane Smith, John Doe")
  out = out.replace(
    new RegExp(`\\b(Advisors?):?\\s+${NAME_WORD}\\s+${NAME_WORD}(?:\\s*[,;&]\\s*${NAME_WORD}\\s+${NAME_WORD})*`, "g"),
    `$1 ${R}`
  );

  // 6. Email addresses
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, R);

  return out;
}
