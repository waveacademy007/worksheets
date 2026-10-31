// Syllabus: subjects for each class, chapters for each subject, concepts for each chapter.
// Saved online in meta/syllabus as
//   { s: { "9": [{n:"Maths"}, {n:"Physics", h:true}] },                 h = hidden from teachers
//     c: { "9|Maths": [{n:"Number Systems", k:[{n:"Irrational numbers"}]}] } }   k = concepts
// Until the admin changes anything, the NCERT list below is used.

const ORDER_LOW = ["Maths", "Physics", "Chemistry", "Biology"];     // Class IX, X
const ORDER_HIGH = ["Physics", "Chemistry", "Maths", "Biology"];    // Class XI, XII

const NCERT = {
  "9|Maths": ["Number Systems", "Polynomials", "Coordinate Geometry", "Linear Equations in Two Variables", "Introduction to Euclid's Geometry", "Lines and Angles", "Triangles", "Quadrilaterals", "Circles", "Heron's Formula", "Surface Areas and Volumes", "Statistics"],
  "9|Physics": ["Motion", "Force and Laws of Motion", "Gravitation", "Work and Energy", "Sound"],
  "9|Chemistry": ["Matter in Our Surroundings", "Is Matter Around Us Pure?", "Atoms and Molecules", "Structure of the Atom"],
  "9|Biology": ["The Fundamental Unit of Life", "Tissues", "Improvement in Food Resources"],
  "10|Maths": ["Real Numbers", "Polynomials", "Pair of Linear Equations in Two Variables", "Quadratic Equations", "Arithmetic Progressions", "Triangles", "Coordinate Geometry", "Introduction to Trigonometry", "Some Applications of Trigonometry", "Circles", "Areas Related to Circles", "Surface Areas and Volumes", "Statistics", "Probability"],
  "10|Physics": ["Light – Reflection and Refraction", "The Human Eye and the Colourful World", "Electricity", "Magnetic Effects of Electric Current"],
  "10|Chemistry": ["Chemical Reactions and Equations", "Acids, Bases and Salts", "Metals and Non-metals", "Carbon and its Compounds"],
  "10|Biology": ["Life Processes", "Control and Coordination", "How do Organisms Reproduce?", "Heredity", "Our Environment"],
  "11|Physics": ["Units and Measurements", "Motion in a Straight Line", "Motion in a Plane", "Laws of Motion", "Work, Energy and Power", "System of Particles and Rotational Motion", "Gravitation", "Mechanical Properties of Solids", "Mechanical Properties of Fluids", "Thermal Properties of Matter", "Thermodynamics", "Kinetic Theory", "Oscillations", "Waves"],
  "11|Chemistry": ["Some Basic Concepts of Chemistry", "Structure of Atom", "Classification of Elements and Periodicity in Properties", "Chemical Bonding and Molecular Structure", "Thermodynamics", "Equilibrium", "Redox Reactions", "Organic Chemistry – Some Basic Principles and Techniques", "Hydrocarbons"],
  "11|Maths": ["Sets", "Relations and Functions", "Trigonometric Functions", "Complex Numbers and Quadratic Equations", "Linear Inequalities", "Permutations and Combinations", "Binomial Theorem", "Sequences and Series", "Straight Lines", "Conic Sections", "Introduction to Three Dimensional Geometry", "Limits and Derivatives", "Statistics", "Probability"],
  "11|Biology": ["The Living World", "Biological Classification", "Plant Kingdom", "Animal Kingdom", "Morphology of Flowering Plants", "Anatomy of Flowering Plants", "Structural Organisation in Animals", "Cell: The Unit of Life", "Biomolecules", "Cell Cycle and Cell Division", "Photosynthesis in Higher Plants", "Respiration in Plants", "Plant Growth and Development", "Breathing and Exchange of Gases", "Body Fluids and Circulation", "Excretory Products and their Elimination", "Locomotion and Movement", "Neural Control and Coordination", "Chemical Coordination and Integration"],
  "12|Physics": ["Electric Charges and Fields", "Electrostatic Potential and Capacitance", "Current Electricity", "Moving Charges and Magnetism", "Magnetism and Matter", "Electromagnetic Induction", "Alternating Current", "Electromagnetic Waves", "Ray Optics and Optical Instruments", "Wave Optics", "Dual Nature of Radiation and Matter", "Atoms", "Nuclei", "Semiconductor Electronics"],
  "12|Chemistry": ["Solutions", "Electrochemistry", "Chemical Kinetics", "The d- and f-Block Elements", "Coordination Compounds", "Haloalkanes and Haloarenes", "Alcohols, Phenols and Ethers", "Aldehydes, Ketones and Carboxylic Acids", "Amines", "Biomolecules"],
  "12|Maths": ["Relations and Functions", "Inverse Trigonometric Functions", "Matrices", "Determinants", "Continuity and Differentiability", "Application of Derivatives", "Integrals", "Application of Integrals", "Differential Equations", "Vector Algebra", "Three Dimensional Geometry", "Linear Programming", "Probability"],
  "12|Biology": ["Sexual Reproduction in Flowering Plants", "Human Reproduction", "Reproductive Health", "Principles of Inheritance and Variation", "Molecular Basis of Inheritance", "Evolution", "Human Health and Disease", "Microbes in Human Welfare", "Biotechnology: Principles and Processes", "Biotechnology and its Applications", "Organisms and Populations", "Ecosystem", "Biodiversity and Conservation"]
};

export const CLASS_LIST = [9, 10, 11, 12];

export function defaultSyllabus() {
  const s = {}, c = {};
  for (const cls of CLASS_LIST) {
    s[cls] = (cls < 11 ? ORDER_LOW : ORDER_HIGH).map(n => ({ n }));
    for (const sub of s[cls]) c[cls + "|" + sub.n] = (NCERT[cls + "|" + sub.n] || []).map(n => ({ n, k: [] }));
  }
  return { s, c };
}

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
export const findItem = (list, name) => (list || []).find(x => same(x.n, name));

// Make sure every subject/chapter that already has questions appears in the syllabus.
// Subjects that are not in the syllabus (like the old "Science") come in hidden, so the admin decides.
export function mergeChapterMap(syl, chapterMap) {
  for (const [k, chs] of Object.entries(chapterMap || {})) {
    const [cls, subject] = k.split("|"); if (!cls || !subject) continue;
    const subs = (syl.s[cls] ??= []);
    if (!findItem(subs, subject)) subs.push({ n: subject, h: true, old: true });
    const list = (syl.c[k] ??= []);
    for (const ch of chs || []) if (!findItem(list, ch)) list.push({ n: ch, k: [] });
  }
  return syl;
}

// Add any new subject / chapter / concept used by these questions. Returns true if something was added.
export function addFromQuestions(syl, qs) {
  let changed = false;
  for (const q of qs) {
    const subs = (syl.s[q.cls] ??= []);
    if (!findItem(subs, q.subject)) { subs.push({ n: q.subject }); changed = true; }
    const list = (syl.c[q.cls + "|" + q.subject] ??= []);
    let ch = findItem(list, q.chapter);
    if (!ch) { ch = { n: q.chapter, k: [] }; list.push(ch); changed = true; }
    if (q.concept && !findItem(ch.k ??= [], q.concept)) { ch.k.push({ n: q.concept }); changed = true; }
  }
  return changed;
}

// Copy without the in-memory "old" markers, ready to save
export function cleanSyllabus(syl) {
  const strip = x => { const o = { n: x.n }; if (x.h) o.h = true; if (x.k) o.k = x.k.map(strip); return o; };
  const s = {}, c = {};
  for (const [k, v] of Object.entries(syl.s)) s[k] = v.map(strip);
  for (const [k, v] of Object.entries(syl.c)) if (k.split("|")[1] && (syl.s[k.split("|")[0]] || []).some(x => x.n === k.split("|")[1])) c[k] = v.map(strip);
  return { s, c };
}
