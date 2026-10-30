// Fixed lists used across the app
export const TYPES={MCQ:"MCQ",AR:"Assertion–Reason",SA:"Short Answer",LA:"Long Answer",CS:"Case Study"};
export const AR_OPTS=["Both A and R are true and R is the correct explanation of A.","Both A and R are true but R is not the correct explanation of A.","A is true but R is false.","A is false but R is true."];
export const SUBJECTS=["Science","Maths","Physics","Chemistry","Biology"];
export const CLASSES=[9,10,11,12];

// Where a question comes from. A question can have several, each with an optional year.
export const SOURCES = ["NCERT", "NCERT Exemplar", "CBSE PYQ", "CBSE Sample Paper", "JEE", "NEET", "Other"];
const SRC_ALIAS = [[/exemplar/i, "NCERT Exemplar"], [/sample\s*paper|\bsqp\b/i, "CBSE Sample Paper"], [/\bpyq\b|cbse|board/i, "CBSE PYQ"],
  [/jee/i, "JEE"], [/neet|aipmt/i, "NEET"], [/ncert/i, "NCERT"], [/other/i, "Other"]];
// "NEET 2019, NCERT Exemplar" -> [{s:"NEET",y:"2019"},{s:"NCERT Exemplar",y:""}]
export function parseSources(text, yearDefault) {
  const out = [];
  for (const part of String(text || "").split(/[,;|]+|\s+&\s+|\s+and\s+/i)) {
    const p = part.trim(); if (!p) continue;
    const hit = SRC_ALIAS.find(([re]) => re.test(p)); if (!hit) continue;
    const y = (p.match(/\b(19|20)\d{2}\b/) || [])[0] || "";
    if (!out.some(x => x.s === hit[1] && x.y === y)) out.push({ s: hit[1], y });
  }
  if (out.length === 1 && !out[0].y && yearDefault && /^(19|20)\d{2}$/.test(String(yearDefault).trim())) out[0].y = String(yearDefault).trim();
  return out;
}
export const srcText = q => (q.src || []).map(x => (x.y ? `${x.s} ${x.y}` : x.s)).join(", ");
