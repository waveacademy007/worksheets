// Fixed lists used across the app
// Internal codes stay short; VSA / SA / LA are the old names of 2 / 3 / 5 Marker, so old questions keep working
export const TYPES={MCQ:"MCQ",MCQJ:"MCQ – JEE/NEET",FB:"Fill in the Blanks",TF:"True / False",AR:"Assertion / Reason",GR:"Give Reason",NUM:"Numerical Type",
  M1:"1 Marker",VSA:"2 Marker",SA:"3 Marker",PR:"Proof",CS:"Case Study",LA:"5 Marker"};
export const TYPE_ORDER=["MCQ","MCQJ","FB","TF","AR","GR","NUM","M1","VSA","SA","PR","CS","LA"];
export const DEF_MARKS={MCQ:1,MCQJ:4,FB:1,TF:1,AR:1,GR:1,NUM:4,M1:1,VSA:2,SA:3,PR:3,CS:4,LA:5};
// answers short enough for the answer-key table
export const KEY_TABLE=new Set(["MCQ","MCQJ","FB","TF","AR","NUM"]);
export const isMCQ=t=>t==="MCQ"||t==="MCQJ";
// proving questions never appear in the answer key (old ones were tagged, new ones are type PR)
export const isProof=q=>q.type==="PR"||!!q.proof;
// "t", "true", "T" -> "True"
export const tfAns=a=>/^\s*t(rue)?\s*$/i.test(a||"")?"True":/^\s*f(alse)?\s*$/i.test(a||"")?"False":(a||"");
export const AR_OPTS=["Both A and R are true and R is the correct explanation of A.","Both A and R are true but R is not the correct explanation of A.","A is true but R is false.","A is false but R is true."];
export const CLASSES=[9,10,11,12];

// Where a question comes from. A question can have several, each with an optional year.
export const SOURCES = ["NCERT", "NCERT Exemplar", "CBSE PYQ", "CBSE Sample Paper", "JEE Main", "JEE Advanced", "JEE", "NEET", "Other"];
const SRC_ALIAS = [[/exemplar/i, "NCERT Exemplar"], [/sample\s*paper|\bsqp\b/i, "CBSE Sample Paper"], [/\bpyq\b|cbse|board/i, "CBSE PYQ"],
  [/jee\s*adv|\badvanced\b|iit\s*jee/i, "JEE Advanced"], [/jee\s*mains?\b|\bmains?\b/i, "JEE Main"], [/jee/i, "JEE"], [/neet|aipmt/i, "NEET"], [/ncert/i, "NCERT"], [/other/i, "Other"]];
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
