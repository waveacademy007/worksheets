// Wave Worksheets — main app
import { createApi, DEMO } from "./api.js?v=3.5";
import { APP, MODE } from "./config.js";
const OFFLINE = MODE === "offline";
// Inside the Android app (APK) the page talks to the phone through this bridge
const BRIDGE = window.AndroidBridge || null;
const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
import { TYPES, TYPE_ORDER, DEF_MARKS, KEY_TABLE, isMCQ, isProof, tfAns, AR_OPTS, CLASSES, SOURCES, parseSources, srcText } from "./constants.js?v=3.5";
import { SAMPLE } from "./sample-questions.js?v=3.5";
import { defaultSyllabus, mergeChapterMap, addFromQuestions, cleanSyllabus, findItem } from "./syllabus.js?v=3.5";
// App version: change it (here, in index.html and in version.json) with every update
const APP_VERSION = "3.5";
const APP_DATE = "31 Oct 2026";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Maths is kept inside $…$ (LaTeX) in question text and drawn with KaTeX; the rest is plain text
const MATH_RE = /\$([^$\n]+)\$/g;
const hasMath = s => /\$[^$\n]+\$/.test(String(s || ""));
function texHTML(tex) {
  if (!window.katex) return esc(tex);
  // newlines inside KaTeX's drawings (√, vector arrows) must not turn into <br> later
  try { return katex.renderToString(tex, { throwOnError: false, strict: "ignore", output: "html" }).replace(/\n/g, " "); } catch (e) { return esc(tex); }
}
// text with maths -> HTML (newlines are left to the caller)
function mt(s) {
  s = String(s ?? ""); let out = "", last = 0;
  for (const m of s.matchAll(MATH_RE)) {
    out += esc(s.slice(last, m.index)); last = m.index + m[0].length;
    const punct = (s.slice(last).match(/^[.,;:!?)\]]+/) || [""])[0]; last += punct.length;   // keep "." or "," on the same line as the equation
    out += punct ? `<span class="mx">${texHTML(m[1])}${esc(punct)}</span>` : texHTML(m[1]);
  }
  return out + esc(s.slice(last));
}
// rough one-line version of the maths, for places that need plain text
const TEX_SYM = { times: "×", cdot: "·", pm: "±", mp: "∓", approx: "≈", propto: "∝", neq: "≠", ne: "≠", leq: "≤", le: "≤", geq: "≥", ge: "≥", infty: "∞", circ: "°", degree: "°", angle: "∠", perp: "⊥", parallel: "∥",
  rightarrow: "→", to: "→", Rightarrow: "⇒", rightleftharpoons: "⇌", therefore: "∴", because: "∵", hbar: "ℏ", int: "∫", oint: "∮", iint: "∬", sum: "Σ", prod: "Π", partial: "∂", Delta: "Δ", nabla: "∇",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", nu: "ν", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", omega: "ω", Omega: "Ω", Phi: "Φ", Sigma: "Σ", Lambda: "Λ", Theta: "Θ", Gamma: "Γ", eta: "η", chi: "χ", psi: "ψ", kappa: "κ", zeta: "ζ", xi: "ξ",
  sin: "sin ", cos: "cos ", tan: "tan ", cot: "cot ", sec: "sec ", csc: "cosec ", log: "log ", ln: "ln ", lim: "lim ", equiv: "≡", sim: "~", square: "□" };
function texPlain(t) {
  let s = t;
  for (let k = 0; k < 4; k++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => `${a.length > 1 ? "(" + a + ")" : a}/${b.length > 1 ? "(" + b + ")" : b}`)
    .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, "$1√($2)").replace(/\\sqrt\{([^{}]*)\}/g, "√($1)").replace(/\\(vec|hat|bar|overline|dot|ddot|tilde|text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, (m, c, a) => a + ({ vec: "⃗", hat: "̂", bar: "̄", overline: "̄", dot: "̇", ddot: "̈", tilde: "̃" }[c] || ""));
  return s.replace(/\\(left|right|big|Big|bigg|Bigg)\b/g, "").replace(/\\begin\{[a-z]*\}|\\end\{[a-z]*\}/g, "").replace(/\\\\/g, "; ").replace(/&/g, " ")
    .replace(/\\([a-zA-Z]+)/g, (m, n) => TEX_SYM[n] ?? n).replace(/\\[,;! ]/g, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}
const plain = s => String(s ?? "").replace(MATH_RE, (m, t) => texPlain(t));
const roman = c => ({ 9: "IX", 10: "X", 11: "XI", 12: "XII" }[c] || c);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
};
const fmtDate = ms => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const DAY = 86400000;

const FONTS = {
  garamond: { fam: '"EB Garamond", Garamond, Georgia, serif', size: 14.6 },
  stix: { fam: '"STIX Two Text", "Times New Roman", serif', size: 13.6 },
  source: { fam: '"Source Serif 4", "Bookman Old Style", Georgia, serif', size: 13.4 }
};
const DEFAULTS = { academy: "", teacher: "", phone: "", wm: "", logo: "", logoSize: 25, cls: "", topic: "",
  group: false, marks: false, key: true, wmOn: true, srcOn: false, font: "garamond", imgSizes: {},
  tp: false, tpTime: "", tpMM: "", tpIns: "", tpNeg: "1", tpAns: true, tpEval: true };
// Test paper: default instructions (teacher can change them; empty = no box)
const TP_INS = "All questions are compulsory.\nMarks for each question are shown against it.\nUse of calculator is not allowed.";
DEFAULTS.tpIns = TP_INS;

let api, user = null, profile = null;
let settings = { ...DEFAULTS };          // branding + worksheet options, saved to the teacher's account
let chapterMap = {};                     // "10|Physics" -> [chapters that have questions]
let syllabus = defaultSyllabus();        // subjects, chapters, concepts (see syllabus.js)
let fConcept = "";                       // concept filter on the questions screen ("" all, "\u0000" none)
let current = [];                        // questions of the chapter on screen
let picked = new Map();                  // ticked questions (any chapter), kept on this device
const imgCache = {};                     // question id -> diagram data URL
let loadToken = 0;
const curFont = () => FONTS[settings.font] || FONTS.garamond;
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const subjList = (cls, all) => (syllabus.s[cls] || []).filter(x => all || !x.h);
const chapList = (cls, subj, all) => (syllabus.c[cls + "|" + subj] || []).filter(x => all || !x.h);
const conList = (cls, subj, ch, all) => ((findItem(syllabus.c[cls + "|" + subj], ch) || {}).k || []).filter(x => all || !x.h);
async function loadSyllabus() {
  let saved = null;
  try { saved = await api.syllabus(); } catch (e) { saved = null; }
  syllabus = mergeChapterMap(saved && saved.s ? JSON.parse(JSON.stringify(saved)) : defaultSyllabus(), chapterMap);
  for (const c of CLASSES) syllabus.s[c] ??= [];
}
async function saveSyllabus() { await api.saveSyllabus(cleanSyllabus(syllabus)); }

function fillSel(el, vals, allLabel) {
  el.innerHTML = (allLabel ? `<option value="">${esc(allLabel)}</option>` : "") +
    vals.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
}
let tt;
function toast(m, ms = 2600) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, ms); }
function screen(name) { for (const s of ["scrLoading", "scrLogin", "scrPending", "scrApp"]) $(s).hidden = s !== name; }

// ================= Sign in =================
const AUTH_ERRORS = {
  "auth/invalid-credential": "Email or password is wrong. Try again or reset your password.",
  "auth/wrong-password": "Email or password is wrong. Try again or reset your password.",
  "auth/user-not-found": "No account with this email. Tap “Create account” to make one.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups and try again.",
  "auth/network-request-failed": "No internet connection. Check your network and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/unauthorized-domain": "This website address is not allowed yet. Add it in Firebase > Authentication > Settings > Authorized domains."
};
const authErr = e => AUTH_ERRORS[e && e.code] || (e && e.message) || "Something went wrong. Try again.";
let authMode = "signin";
function setAuthMode(m) {
  authMode = m;
  $("nameL").hidden = m !== "signup";
  $("passL").hidden = m === "reset";
  $("authGo").textContent = { signin: "Sign in", signup: "Create account", reset: "Send reset link" }[m];
  $("authPass").autocomplete = m === "signup" ? "new-password" : "current-password";
  $("toSignup").hidden = m === "signup";
  $("toSignin").hidden = m === "signin";
  $("toReset").hidden = m === "reset";
  $("authMsg").textContent = ""; $("authMsg").className = "authmsg";
}
$("pwEye").onclick = () => {
  const show = $("authPass").type === "password";
  $("authPass").type = show ? "text" : "password";
  $("pwEye").setAttribute("aria-pressed", String(show)); $("pwEye").setAttribute("aria-label", show ? "Hide password" : "Show password");
};
$("toSignup").onclick = () => setAuthMode("signup");
$("toSignin").onclick = () => setAuthMode("signin");
$("toReset").onclick = () => setAuthMode("reset");
$("gBtn").onclick = async () => {
  $("authMsg").textContent = "";
  try { await api.signInGoogle(); } catch (e) { $("authMsg").textContent = authErr(e); }
};
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("authEmail").value.trim(), pass = $("authPass").value, name = $("authName").value.trim();
  const msg = $("authMsg"); msg.className = "authmsg";
  if (!email) { msg.textContent = "Enter your email."; return; }
  if (authMode !== "reset" && pass.length < 6) { msg.textContent = "Password should be at least 6 characters."; return; }
  if (authMode === "signup" && !name) { msg.textContent = "Enter your name."; return; }
  $("authGo").disabled = true;
  try {
    if (authMode === "signin") await api.signInEmail(email, pass);
    else if (authMode === "signup") await api.signUpEmail(email, pass, name);
    else { await api.resetPassword(email); msg.className = "authmsg ok"; msg.textContent = "Reset link sent. Check your email inbox and spam folder."; }
  } catch (err) { msg.textContent = authErr(err); }
  finally { $("authGo").disabled = false; }
});

// ================= Access check =================
const isActive = () => profile && (profile.admin || (profile.planUntil && profile.planUntil > Date.now()));
function showPending() {
  const name = profile.name || user.name || "";
  $("pendText").textContent = profile.planUntil
    ? `Your subscription ended on ${fmtDate(profile.planUntil)}. Renew it to keep making worksheets.`
    : `${name ? "Hi " + name + ", your" : "Your"} account (${user.email}) is ready. You can start making worksheets once your subscription is activated.`;
  $("pendPlans").textContent = APP.plansText;
  $("pendPhone").textContent = APP.contactPhone;
  const text = encodeURIComponent(`Hello, please activate my ${APP.name} account: ${user.email}`);
  $("pendWa").href = `https://wa.me/91${APP.contactPhone.replace(/\D/g, "").slice(-10)}?text=${text}`;
  $("pendCall").href = `tel:+91${APP.contactPhone.replace(/\D/g, "").slice(-10)}`;
  screen("scrPending");
}
$("pendCheck").onclick = async () => {
  $("pendCheck").disabled = true;
  try { profile = await api.loadProfile(user, store.get("wave_ref", null)); enter(); } catch (e) { toast("Could not check. Try again."); }
  finally { $("pendCheck").disabled = false; }
};
$("pendOut").onclick = () => api.signOut();
$("signOut").onclick = () => api.signOut();

function enter() { if (!isActive()) { showPending(); return; } startApp(); }

async function startApp() {
  settings = { ...DEFAULTS, teacher: profile.name || user.name || "", ...profile.branding };
  const nm = profile.name || user.name || user.email;
  const parts = APP.name.match(/^(.*?)\s*(Worksheets?)$/i);
  $("hdrTitle").textContent = parts ? parts[1] : APP.name;
  $("hdrSub").textContent = parts ? parts[2] : "";
  $("drName").textContent = nm;
  $("drRole").textContent = profile.admin ? "Admin" : "Teacher";
  $("drPhone").textContent = settings.phone || "";
  $("drAdmin").hidden = !profile.admin;
  const ph = APP.contactPhone.replace(/\D/g, "").slice(-10);
  $("drCall").href = `tel:+91${ph}`;
  $("drWa").href = `https://wa.me/91${ph}?text=${encodeURIComponent("Hello, I need help with " + APP.name)}`;
  paintAvatars();
  $("pfName").textContent = nm; $("pfEmail").textContent = user.email || "";
  $("pfPlan").textContent = planText();
  $("drVer").textContent = `Version ${APP_VERSION} · ${APP_DATE}`;
  $("pfVer").textContent = `App version ${APP_VERSION} · updated ${APP_DATE}`;
  if (OFFLINE) { $("teachersPanel").hidden = true; $("backupPanel").hidden = false; $("installPanel").hidden = isInstalled(); $("signOut").hidden = true; $("signOut2").hidden = true; }
  picked = new Map(store.get("ws_picked_" + user.uid, []).map(q => [q.id, q]));
  currentDraft = store.get("ws_draft_" + user.uid, null);
  fillSettingsUI(); logoUI(); updateCounts(false);
  screen("scrApp");
  history.replaceState({ v: "home" }, "", location.pathname + "#home");
  show("home", { push: false });
  try { chapterMap = await api.chapters(); }
  catch (e) { chapterMap = {}; toast("Could not load chapters. Check your internet."); }
  await loadSyllabus();
  initHome();
  if (OFFLINE) backupReminder();
  checkForUpdate();
}
// Tell the user when a newer version is on the website (phones often keep the old files for a while)
async function checkForUpdate() {
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const { version } = await r.json();
    if (version && version !== APP_VERSION) {
      const b = $("updBar"); b.hidden = false;
      b.innerHTML = `New version ${esc(version)} is ready. <button class="link" id="updGo">Update now</button>`;
      $("updGo").onclick = () => { location.href = location.pathname + "?v=" + encodeURIComponent(version) + "#home"; };
    }
  } catch (e) { /* offline: nothing to check */ }
}
function planText() {
  if (profile.admin) return "Admin · full access";
  if (!profile.planUntil) return "No active plan";
  return `Pro plan · active till ${fmtDate(profile.planUntil)}`;
}
function initials(s) { return (s || "?").split(/[\s@._]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(""); }
// Teacher's photo: the uploaded one, else the Google account photo, else initials.
// settings.photo: "" = use Google photo if any, "none" = initials only, data URL = uploaded photo
const photoSrc = () => settings.photo && settings.photo !== "none" ? settings.photo : settings.photo === "none" ? "" : (user.photo || "");
function paintAvatars() {
  const ini = esc(initials(settings.teacher || profile.name || user.name || user.email)), src = photoSrc();
  ["hdrAvatar", "drAvatar", "pfAvatar"].forEach(id => {
    const el = $(id); el.classList.toggle("ph", !!src);
    if (!src) { el.innerHTML = ini; return; }
    el.innerHTML = `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer">`;
    el.querySelector("img").onerror = () => { el.classList.remove("ph"); el.innerHTML = ini; };
  });
  $("phRemove").hidden = !src;
  $("phNote").textContent = settings.photo && settings.photo !== "none" ? "Your photo shows at the top right of the app." : src ? "Showing your Google account photo. Upload another one if you like." : "No photo yet. Your initials are shown at the top right.";
}
// Pick a photo, crop the middle square, shrink to 256 px
document.querySelectorAll(".photoIn").forEach(inp => inp.addEventListener("change", e => {
  const f = e.target.files && e.target.files[0]; setTimeout(() => { e.target.value = ""; }, 0); if (!f) return;
  if (f.type && !/^image\//.test(f.type)) { $("phMsg").textContent = "Please choose a photo (JPG or PNG)."; return; }
  $("phMsg").textContent = "Preparing photo…";
  const url = URL.createObjectURL(f), img = new Image();
  img.onload = () => {
    // shrink big camera photos first, then let the teacher place the circle
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    $("phMsg").textContent = ""; openCrop(c);
  };
  img.onerror = () => { URL.revokeObjectURL(url); $("phMsg").textContent = "Could not open that photo. Try a JPG or PNG."; };
  img.src = url;
}));
$("phRemove").onclick = () => { settings.photo = "none"; saveSet(); toast("Photo removed"); };
// ---- crop screen: drag to move, slider to zoom, the circle is what is kept
const crop = { src: null, W: 0, H: 0, z: 1, ox: 0, oy: 0, B: 300 };
function openCrop(canvas) {
  crop.src = canvas; crop.W = canvas.width; crop.H = canvas.height; crop.z = 1; crop.ox = 0; crop.oy = 0;
  $("cropImg").src = canvas.toDataURL("image/jpeg", 0.9); $("cropZoom").value = "1";
  $("cropModal").hidden = false; requestAnimationFrame(cropDraw);
}
function cropGeom() {
  crop.B = $("cropBox").clientWidth || 300;
  const s = crop.B / Math.min(crop.W, crop.H) * crop.z, w = crop.W * s, h = crop.H * s;
  const mx = (w - crop.B) / 2, my = (h - crop.B) / 2;
  crop.ox = Math.max(-mx, Math.min(mx, crop.ox)); crop.oy = Math.max(-my, Math.min(my, crop.oy));
  return { s, x: crop.B / 2 - w / 2 + crop.ox, y: crop.B / 2 - h / 2 + crop.oy };
}
function cropDraw() { const g = cropGeom(); $("cropImg").style.width = crop.W + "px"; $("cropImg").style.transform = `translate(${g.x}px,${g.y}px) scale(${g.s})`; }
$("cropZoom").addEventListener("input", () => { crop.z = +$("cropZoom").value; cropDraw(); });
(() => {
  const box = $("cropBox"), pts = new Map(); let last = null, pinch = null;
  box.addEventListener("pointerdown", e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: crop.z }; } });
  box.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; crop.z = Math.max(1, Math.min(4, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); $("cropZoom").value = crop.z; cropDraw(); return; }
    crop.ox += e.clientX - last.x; crop.oy += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; cropDraw();
  });
  const up = e => { pts.delete(e.pointerId); pinch = null; const r = [...pts.values()][0]; if (r) last = { ...r }; };
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  box.addEventListener("wheel", e => { e.preventDefault(); crop.z = Math.max(1, Math.min(4, crop.z * (e.deltaY < 0 ? 1.08 : 0.93))); $("cropZoom").value = crop.z; cropDraw(); }, { passive: false });
})();
$("cropSave").onclick = () => {
  const g = cropGeom(), k = 256 / crop.B, c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 256, 256); x.imageSmoothingQuality = "high";
  x.drawImage(crop.src, g.x * k, g.y * k, crop.W * g.s * k, crop.H * g.s * k);
  settings.photo = c.toDataURL("image/jpeg", 0.85); saveSet(); $("cropModal").hidden = true; toast("Photo updated");
};
$("cropX").onclick = $("cropCancel").onclick = () => { $("cropModal").hidden = true; };

// ================= Settings (saved to the account) =================
let saveTimer;
function saveSet() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await api.saveBranding(user.uid, settings); } catch (e) { toast("Could not save your settings. Check your internet."); }
  }, 900);
  paintAvatars(); $("drPhone").textContent = settings.phone || "";
}
const bind = [["sAcademy", "academy"], ["sTeacher", "teacher"], ["sPhone", "phone"], ["sWm", "wm"], ["wClass", "cls"], ["wTopic", "topic"], ["wTpTime", "tpTime"], ["wTpMM", "tpMM"], ["wTpIns", "tpIns"], ["wTpNeg", "tpNeg"]];
const checks = [["wGroup", "group"], ["wMarks", "marks"], ["wKey", "key"], ["wWm", "wmOn"], ["wSrc", "srcOn"], ["wTpAns", "tpAns"], ["wTpEval", "tpEval"]];
bind.forEach(([id, k]) => $(id).addEventListener("input", () => { settings[k] = $(id).value; saveSet(); schedule(); }));
checks.forEach(([id, k]) => $(id).addEventListener("change", () => { settings[k] = $(id).checked; saveSet(); schedule(); }));
$("wFont").onchange = () => { settings.font = $("wFont").value; saveSet(); schedule(); };
function fillSettingsUI() {
  bind.forEach(([id, k]) => { $(id).value = settings[k] || ""; });
  checks.forEach(([id, k]) => { $(id).checked = !!settings[k]; });
  $("wFont").value = settings.font;
  $("wTp").checked = !!settings.tp; $("tpBox").hidden = !settings.tp;
}
// ---- Test paper: Time (5 min per question) and M.M. (marks added up), unless the teacher typed them
function tpAuto() {
  const qs = [...picked.values()], mins = qs.length * 5, h = Math.floor(mins / 60), m = mins % 60;
  const time = !mins ? "" : (h ? `${h} Hour${h > 1 ? "s" : ""}` : "") + (h && m ? " " : "") + (m ? `${m} Minutes` : "");
  const mm = qs.reduce((a, q) => a + (+q.marks || DEF_MARKS[q.type] || 1), 0);
  return { time, mm: String(+mm.toFixed(2)) };
}
const tpVals = () => { const a = tpAuto(); return { time: (settings.tpTime || "").trim() || a.time, mm: (settings.tpMM || "").trim() || a.mm }; };
function tpPlaceholders() { const a = tpAuto(); $("wTpTime").placeholder = a.time ? `Auto: ${a.time}` : "Auto"; $("wTpMM").placeholder = a.mm ? `Auto: ${a.mm}` : "Auto"; }
$("wTp").addEventListener("change", () => {
  settings.tp = $("wTp").checked; $("tpBox").hidden = !settings.tp;
  if (settings.tp) { settings.marks = true; settings.key = false; $("wMarks").checked = true; $("wKey").checked = false; toast("Test paper: marks shown, answer key off"); }
  saveSet(); schedule();
});
$("tpInsDef").onclick = () => { settings.tpIns = TP_INS; $("wTpIns").value = TP_INS; saveSet(); schedule(); };

// ================= Navigation =================
const VIEWS = ["home", "chapters", "bank", "ws", "saved", "drafts", "set", "refer", "feedback", "help", "admin", "syl"];
let curView = "home";
const nav = { cls: 10, subject: "", chapter: "" };
function show(v, { push = true } = {}) {
  if (!VIEWS.includes(v) || ((v === "admin" || v === "syl") && !profile.admin)) v = "home";
  if ((v === "chapters" && !nav.subject) || (v === "bank" && !nav.chapter)) v = "home";
  VIEWS.forEach(x => { $("v-" + x).hidden = x !== v; });
  curView = v; closeDrawer();
  $("bbHome").classList.toggle("on", ["home", "chapters", "bank"].includes(v));
  $("hdrAvatar").classList.toggle("on", v === "set");
  $("goWs").classList.toggle("on", v === "ws");
  document.querySelectorAll(".dr-list [data-go]").forEach(b => b.classList.toggle("on", b.dataset.go === v));
  if (push) history.pushState({ v }, "", "#" + v);
  if (v === "home") renderHome();
  if (v === "chapters") renderChapters();
  if (v === "ws") { renderPreview(); $("draftNote").hidden = !currentDraft; if (currentDraft) $("draftNote").textContent = `Editing draft: ${currentDraft.name}`; }
  if (v === "saved") renderWorksheets("saved");
  if (v === "drafts") renderWorksheets("draft");
  if (v === "refer") renderRefer();
  if (v === "admin") { if (OFFLINE) renderBackup(); else { loadUsers(); loadFeedback(); } }
  if (v === "syl") { if (!sylAt.subject) sylAt.cls = nav.cls || 10; renderSyl(); }
  scrollTo(0, 0);
}
addEventListener("popstate", e => {
  if ($("drawer").classList.contains("open")) { closeDrawer(); history.pushState({ v: curView }, "", "#" + curView); return; }
  const m = [...document.querySelectorAll(".modal")].find(x => !x.hidden);
  if (m) { m.hidden = true; history.pushState({ v: curView }, "", "#" + curView); return; }
  if (!$("scrApp").hidden) show((e.state && e.state.v) || "home", { push: false });
});
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g && !$("scrApp").hidden) { e.preventDefault(); show(g.dataset.go); return; }
  if (e.target.closest("[data-back]")) { e.preventDefault(); history.back(); }
});
function openDrawer() { $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("scrim").hidden = false; }
function closeDrawer() { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); $("scrim").hidden = true; }
$("menuBtn").onclick = openDrawer;
$("scrim").onclick = closeDrawer;
$("hdrAvatar").onclick = () => show("set");
$("signOut2").onclick = () => api.signOut();

// ================= Home: exam, class, subjects =================
const SUBJECT_ICONS = {
  Maths: { bg: "#e7f0ff", svg: '<rect x="10" y="10" width="28" height="28" rx="6" fill="#2f6fde"/><path d="M17 20h14M24 13v14" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M17 33h14" stroke="#ffd36b" stroke-width="3" stroke-linecap="round"/><circle cx="36" cy="36" r="7" fill="#f4ae22"/><path d="M33 36h6" stroke="#0e2a47" stroke-width="2.4" stroke-linecap="round"/>' },
  Physics: { bg: "#e5f6f8", svg: '<circle cx="24" cy="24" r="4.5" fill="#0f8fa1"/><g fill="none" stroke="#0e2a47" stroke-width="2.4"><ellipse cx="24" cy="24" rx="17" ry="6.5"/><ellipse cx="24" cy="24" rx="17" ry="6.5" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="17" ry="6.5" transform="rotate(-60 24 24)"/></g><circle cx="41" cy="24" r="2.6" fill="#f4ae22"/>' },
  Chemistry: { bg: "#f0ebff", svg: '<path d="M19 8h10M21 8v11L11 36a3 3 0 0 0 2.6 4.5h20.8A3 3 0 0 0 37 36L27 19V8" fill="#fff" stroke="#5b3fc4" stroke-width="2.4" stroke-linejoin="round"/><path d="M14.5 31h19L37 36a3 3 0 0 1-2.6 4.5H13.6A3 3 0 0 1 11 36z" fill="#8f6cf0"/><circle cx="21" cy="35" r="2" fill="#fff"/><circle cx="27" cy="33" r="1.4" fill="#fff"/>' },
  Biology: { bg: "#e6f6ec", svg: '<path d="M16 8c0 10 16 12 16 24 0 4-2 7-4 8M32 8c0 10-16 12-16 24 0 4 2 7 4 8" fill="none" stroke="#1d8657" stroke-width="2.6" stroke-linecap="round"/><path d="M18 14h12M17.5 20h13M18 28h12M19.5 34h9" stroke="#f4ae22" stroke-width="2.4" stroke-linecap="round"/>' },
  Science: { bg: "#fff3d4", svg: '<circle cx="24" cy="20" r="11" fill="#ffd36b" stroke="#b26500" stroke-width="2"/><path d="M19 34h10M20 38h8" stroke="#0e2a47" stroke-width="2.6" stroke-linecap="round"/><path d="M20 30v-4c-2-1-4-4-4-6M28 30v-4c2-1 4-4 4-6" fill="none" stroke="#b26500" stroke-width="2"/><path d="M24 4v3M38 8l-2 2M10 8l2 2M42 20h-3M6 20h3" stroke="#f4ae22" stroke-width="2.2" stroke-linecap="round"/>' },
  _: { bg: "#eef2f6", svg: '<path d="M10 10h12a4 4 0 0 1 4 4v24a3 3 0 0 0-3-3H10zM38 10H26a4 4 0 0 0-4 4v24a3 3 0 0 1 3-3h13z" fill="#fff" stroke="#0e2a47" stroke-width="2.2" stroke-linejoin="round"/>' }
};
function initHome() {
  fillSel($("fExam"), [["", "All exams"], ["CBSE", "CBSE"], ["JEE", "JEE"], ["NEET", "NEET"]]);
  fillSel($("fClass"), CLASSES.map(c => [String(c), "Class " + roman(c)]));
  fillSel($("fType"), TYPE_ORDER.map(k => [k, TYPES[k]]), "All types");
  fillSel($("fMarks"), [1, 2, 3, 4, 5].map(m => [String(m), m + (m === 1 ? " mark" : " marks")]), "All marks");
  fillSel($("fSrc"), SOURCES.map(x => [x, x]), "All sources");
  fillSel($("wdSrc"), SOURCES.map(x => [x, x]), "None");
  const last = store.get("ws_last", { cls: "10", exam: "" });
  $("fClass").value = last.cls || "10"; $("fExam").value = last.exam || "";
  nav.cls = +$("fClass").value;
  renderHome();
}
$("fClass").onchange = () => { nav.cls = +$("fClass").value; nav.subject = ""; nav.chapter = ""; saveLast(); renderSubjects(true); };
$("fExam").onchange = () => { saveLast(); if (curView === "bank") renderList(); };
function saveLast() { store.set("ws_last", { cls: $("fClass").value, exam: $("fExam").value }); }
// Subjects of a class in the admin's order. Teachers don't see hidden ones; the admin sees them marked.
const visibleChapters = (cls, subj) => {
  const has = new Set(chapterMap[cls + "|" + subj] || []);
  return chapList(cls, subj, profile.admin).filter(c => has.has(c.n));
};
function subjectsFor(cls) {
  return subjList(cls, profile.admin).map(s => ({ name: s.n, hidden: !!s.h, n: visibleChapters(cls, s.n).length }));
}
function renderHome() { renderPro(); renderSubjects(false); }
function renderPro() {
  const b = $("proBanner"); let title, sub, warn = false;
  if (profile.admin) { title = "Admin access"; sub = "Manage questions, teachers and feedback"; }
  else {
    const left = Math.ceil((profile.planUntil - Date.now()) / DAY);
    warn = left <= 7;
    title = warn ? `Plan ends in ${left} day${left === 1 ? "" : "s"}` : "Pro version active";
    sub = warn ? `Ends ${fmtDate(profile.planUntil)} · tap to renew on WhatsApp` : `Active till ${fmtDate(profile.planUntil)}`;
  }
  b.className = "pro" + (warn ? " warn" : "");
  b.innerHTML = `<span class="pro-txt"><b>${esc(title)}</b><span>${esc(sub)}</span></span><span class="crown"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9z" fill="#fff" stroke="#b26500" stroke-width="1.4" stroke-linejoin="round"/><rect x="5" y="18" width="14" height="2.4" rx="1" fill="#fff"/></svg></span>`;
  b.onclick = () => { if (profile.admin) show("admin"); else if (warn) window.open($("drWa").href, "_blank"); else show("set"); };
}
function renderSubjects() {
  const list = subjectsFor(nav.cls);
  $("subjGrid").innerHTML = list.map(s => {
    const ic = SUBJECT_ICONS[s.name] || SUBJECT_ICONS._;
    return `<button class="subj${s.n ? "" : " empty"}" data-subj="${esc(s.name)}"><span class="disc" style="background:${ic.bg}"><svg class="sv" viewBox="0 0 48 48" aria-hidden="true">${ic.svg}</svg></span>${esc(s.name)}<small>${s.hidden ? "Hidden · " : ""}${s.n ? s.n + " chapter" + (s.n === 1 ? "" : "s") : "Coming soon"}</small></button>`;
  }).join("") || `<div class="empty">No subjects for this class yet.${profile.admin ? " Add them in Admin → Syllabus." : ""}</div>`;
}
$("subjGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-subj]"); if (!b) return;
  const n = visibleChapters(nav.cls, b.dataset.subj).length;
  if (!n) { toast(profile.admin ? "No chapters yet. Add questions from Admin." : "Questions for this subject are coming soon."); return; }
  nav.subject = b.dataset.subj; nav.chapter = ""; show("chapters");
});

// ================= Chapters =================
function renderChapters() {
  $("chTitle").textContent = nav.subject; $("chSub").textContent = `Class ${roman(nav.cls)} · choose a chapter`;
  const chs = visibleChapters(nav.cls, nav.subject);
  const ticked = ch => [...picked.values()].filter(q => q.cls === nav.cls && q.subject === nav.subject && q.chapter === ch).length;
  $("chList").innerHTML = chs.length ? chs.map((c, i) => { const t = ticked(c.n), k = (c.k || []).filter(x => profile.admin || !x.h).length;
    return `<button class="chap" data-ch="${esc(c.n)}"><span class="num">${i + 1}</span><span class="nm">${esc(c.n)}${k || c.h ? `<small>${c.h ? "Hidden · " : ""}${k ? k + " concept" + (k === 1 ? "" : "s") : ""}</small>` : ""}</span>${t ? `<span class="tk">${t} ticked</span>` : ""}<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`; }).join("")
    : `<div class="empty">No chapters yet.</div>`;
}
$("chList").addEventListener("click", e => {
  const b = e.target.closest("[data-ch]"); if (!b) return;
  nav.chapter = b.dataset.ch; $("fType").value = ""; $("fSrc").value = ""; $("fMarks").value = ""; $("fSearch").value = ""; fConcept = "";
  show("bank"); loadQuestions();
});

// ================= Questions of one chapter =================
["fType", "fSrc", "fMarks"].forEach(id => $(id).onchange = renderList);
$("fSearch").addEventListener("input", renderList);
async function loadQuestions() {
  const { cls, subject, chapter } = nav;
  $("qTitle").textContent = chapter; $("qSub").textContent = `Class ${roman(cls)} · ${subject}`;
  const token = ++loadToken;
  current = [];
  $("qlist").innerHTML = `<div class="loadingrow">Loading questions…</div>`; $("shownInfo").textContent = "";
  try {
    const qs = await api.questions(cls, subject, chapter);
    if (token !== loadToken) return;
    current = qs.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  } catch (e) {
    if (token !== loadToken) return;
    $("qlist").innerHTML = `<div class="empty">Could not load questions. Check your internet and try again.</div>`;
    return;
  }
  renderList();
}
// Questions a teacher may see: not in a concept the admin has hidden
function usable() {
  if (profile.admin) return current;
  const hid = new Set(conList(nav.cls, nav.subject, nav.chapter, true).filter(x => x.h).map(x => x.n.toLowerCase()));
  return hid.size ? current.filter(q => !q.concept || !hid.has(q.concept.toLowerCase())) : current;
}
// Concept chips: syllabus order first, then any other concept found on the questions
function renderConcepts() {
  const qs = usable(), box = $("cChips");
  const count = new Map(); let none = 0;
  qs.forEach(q => { if (q.concept) { const k = q.concept.toLowerCase(); count.set(k, (count.get(k) || 0) + 1); } else none++; });
  const names = [];
  conList(nav.cls, nav.subject, nav.chapter, profile.admin).forEach(c => { if (count.has(c.n.toLowerCase())) names.push(c.n); });
  qs.forEach(q => { if (q.concept && !names.some(n => sameName(n, q.concept))) names.push(q.concept); });
  if (!names.length) { box.hidden = true; fConcept = ""; return; }
  if (fConcept && fConcept !== "\u0000" && !names.some(n => sameName(n, fConcept))) fConcept = "";
  const chip = (v, label, n) => `<button type="button" class="cchip${fConcept === v ? " on" : ""}" data-con="${esc(v)}">${esc(label)} <span>${n}</span></button>`;
  box.innerHTML = chip("", "All", qs.length) + names.map(n => chip(n, n, count.get(n.toLowerCase()))).join("") + (none ? chip("\u0000", "No concept", none) : "");
  box.hidden = false;
}
$("cChips").addEventListener("click", e => { const b = e.target.closest("[data-con]"); if (!b) return; fConcept = b.dataset.con; renderList(); });
function shown() {
  const e = $("fExam").value, t = $("fType").value, sr = $("fSrc").value, w = $("fSearch").value.trim().toLowerCase();
  const mk = $("fMarks").value;
  return usable().filter(q => (!e || (q.exam || []).includes(e)) && (!t || (t === "PR" ? isProof(q) : q.type === t)) && (!sr || (q.src || []).some(x => x.s === sr)) && (!mk || +q.marks === +mk) &&
    (!fConcept || (fConcept === "\u0000" ? !q.concept : sameName(q.concept, fConcept))) &&
    (!w || ((q.text || "") + " " + (q.case || "") + " " + (q.reason || "")).toLowerCase().includes(w)));
}
function renderList() {
  if (!nav.chapter) return;
  renderConcepts();
  const list = shown(), total = usable().length;
  $("shownInfo").textContent = `${list.length} of ${total} questions`;
  $("qlist").innerHTML = list.length ? list.map(q => `<label class="q ${picked.has(q.id) ? "on" : ""}" data-id="${esc(q.id)}">
    <input type="checkbox" ${picked.has(q.id) ? "checked" : ""} aria-label="Use this question">
    <div class="txt"><div class="chips"><span class="chip t">${TYPES[q.type] || esc(q.type)}</span>${q.concept && !fConcept ? `<span class="chip conchip">${esc(q.concept)}</span>` : ""}<span class="chip">${esc((q.exam || []).join(" · "))}</span>${q.marks ? `<span class="chip">${esc(q.marks)} mark${q.marks == 1 ? "" : "s"}</span>` : ""}${q.proof && q.type !== "PR" ? `<span class="chip proofchip">Proof</span>` : ""}${q.hasImg ? `<span class="chip imgchip">Diagram</span>` : ""}${q.src && q.src.length ? `<span class="chip srcchip">${esc(srcText(q))}</span>` : ""}</div>
    ${q.case ? `<div class="opts">${mt(q.case)}</div>` : ""}<div>${mt(q.text).replace(/\n/g, "<br>")}</div>
    ${q.type === "AR" ? `<div class="opts">R: ${mt(q.reason)}</div>` : ""}${q.type === "TF" ? `<div class="opts">(True / False)</div>` : ""}
    ${q.hasImg ? `<img class="qthumb${imgCache[q.id] ? "" : " loading"}" data-qimg="${esc(q.id)}" alt="Diagram, tap to enlarge"${imgCache[q.id] ? ` src="${imgCache[q.id]}"` : ""}>` : ""}
    ${isMCQ(q.type) ? `<div class="opts">${(q.opts || []).map((o, i) => "abcd"[i] + ") " + mt(o)).join(" &nbsp; ")}</div>` : ""}
    ${profile.admin ? `<div class="qadm"><button class="btn qedit" type="button" data-edit="${esc(q.id)}">Edit</button><button class="btn qdel" type="button" data-del="${esc(q.id)}">Delete</button></div>` : ""}</div></label>`).join("")
    : `<div class="empty">${total ? "No questions match this filter." : "No questions in this chapter yet."}</div>`;
  watchThumbs();
}
// Diagrams load only when their card comes on screen
let thumbQ = new Set(), thumbT = null;
const thumbObs = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { thumbObs.unobserve(en.target); thumbQ.add(en.target.dataset.qimg); clearTimeout(thumbT); thumbT = setTimeout(loadThumbs, 120); } }), { rootMargin: "300px" }) : null;
async function loadThumbs() {
  const ids = [...thumbQ].filter(id => !imgCache[id]); thumbQ = new Set();
  if (ids.length) { try { Object.assign(imgCache, await api.images(ids)); } catch (e) { /* try again next time */ } }
  document.querySelectorAll("#qlist .qthumb.loading").forEach(im => { const d = imgCache[im.dataset.qimg]; if (d) { im.src = d; im.classList.remove("loading"); } });
}
function watchThumbs() { document.querySelectorAll("#qlist .qthumb.loading").forEach(im => { if (thumbObs) thumbObs.observe(im); else thumbQ.add(im.dataset.qimg); }); if (!thumbObs) loadThumbs(); }
$("imgX").onclick = () => { $("imgModal").hidden = true; };
$("imgModal").addEventListener("click", e => { if (e.target.id === "imgModal") $("imgModal").hidden = true; });
$("qlist").addEventListener("click", async e => {
  const th = e.target.closest(".qthumb");
  if (th) { e.preventDefault(); if (th.getAttribute("src")) { $("imgBig").src = th.src; $("imgModal").hidden = false; } return; }
  const ed = e.target.closest("[data-edit]");
  if (ed) { e.preventDefault(); const q = current.find(x => x.id === ed.dataset.edit); if (q) openEdit(q); return; }
  const del = e.target.closest("[data-del]");
  if (!del) return;
  e.preventDefault();
  if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; setTimeout(() => { if (del.isConnected) { del.dataset.armed = ""; del.textContent = "Delete"; } }, 4000); return; }
  const q = current.find(x => x.id === del.dataset.del); if (!q) return;
  del.disabled = true; del.textContent = "Deleting…";
  try { await api.deleteQuestion(q); current = current.filter(x => x.id !== q.id); picked.delete(q.id); savePicked(); renderList(); updateCounts(); toast("Question deleted"); }
  catch (err) { del.disabled = false; del.textContent = "Delete"; toast("Could not delete. Try again."); }
});
$("qlist").addEventListener("change", e => {
  const lab = e.target.closest(".q"); if (!lab) return;
  const q = current.find(x => x.id === lab.dataset.id); if (!q) return;
  if (e.target.checked) pick(q); else picked.delete(q.id);
  lab.classList.toggle("on", e.target.checked); savePicked(); updateCounts(true);
});
function pick(q) {
  const { img, ...rest } = q; picked.set(q.id, rest);
  if (!settings.topic) { settings.topic = q.chapter; $("wTopic").value = q.chapter; saveSet(); }
  if (!settings.cls) { settings.cls = `Class ${roman(q.cls)} _ ${q.subject}`; $("wClass").value = settings.cls; saveSet(); }
}
function savePicked() { store.set("ws_picked_" + user.uid, [...picked.values()]); }
function updateCounts(animate) {
  const n = picked.size, b = $("tabCount");
  b.textContent = n; b.classList.toggle("zero", !n);
  if (animate) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  $("selInfo").textContent = `${n} question${n === 1 ? "" : "s"}`;
  $("dlPdf").disabled = !n;
}
$("selAll").onclick = () => { shown().forEach(pick); savePicked(); renderList(); updateCounts(true); };
$("selNone").onclick = () => { shown().forEach(q => picked.delete(q.id)); savePicked(); renderList(); updateCounts(true); };

// A JEE / NEET source also tags the question with that exam, so the Exam filter finds it
function examsFromSrc(q) {
  const ex = new Set(q.exam && q.exam.length ? q.exam : ["CBSE"]);
  for (const x of q.src || []) { if (/^JEE/.test(x.s)) ex.add("JEE"); if (x.s === "NEET") ex.add("NEET"); }
  return [...ex];
}
// Save questions to the online bank, then refresh chapters
async function saveToBank(list) {
  const base = Date.now() * 1000;
  const withSeq = list.map((q, i) => ({ ...q, exam: examsFromSrc(q), seq: base + i }));
  await api.addQuestions(withSeq, (d, t) => toast(`Saving ${d} of ${t}…`, 8000));
  if (OFFLINE) backupReminder();
  if (addFromQuestions(syllabus, withSeq)) { try { await saveSyllabus(); } catch (e) { toast("Questions saved, but the syllabus could not be updated."); } }
  chapterMap = await api.chapters();
  mergeChapterMap(syllabus, chapterMap);
  const f = withSeq[0];
  if (f) { nav.cls = f.cls; $("fClass").value = String(f.cls); saveLast(); }
  renderHome();
  if (f && curView === "bank" && nav.subject === f.subject && nav.chapter === f.chapter) loadQuestions();
  return withSeq.length;
}
async function loadPickedImages() {
  const need = [...picked.values()].filter(q => q.hasImg && !imgCache[q.id]).map(q => q.id);
  if (need.length) { try { Object.assign(imgCache, await api.images(need)); } catch (e) { toast("Some diagrams could not be loaded."); } }
}

// ================= My Worksheets & Drafts =================
let currentDraft = null;           // {id, name} while editing a draft
let lastSavedSig = "";
const WS_KEYS = ["cls", "topic", "group", "marks", "key", "wmOn", "srcOn", "font", "imgSizes", "tp", "tpTime", "tpMM", "tpIns", "tpNeg", "tpAns", "tpEval"];
// Diagram size: the teacher's choice for this worksheet, else the admin's default
const effW = q => ((settings.imgSizes || {})[q.id]) || q.imgW || 70;
function snapshot(kind, name) {
  const qs = JSON.parse(JSON.stringify([...picked.values()]));
  return { kind, name, count: qs.length, questions: qs, ws: Object.fromEntries(WS_KEYS.map(k => [k, settings[k]])), updatedAt: Date.now() };
}
async function autoSaveWorksheet() {
  const sig = [...picked.keys()].join(",") + "|" + settings.topic + "|" + settings.cls;
  if (sig === lastSavedSig) return;
  try { await api.saveWorksheet(null, snapshot("saved", settings.topic || "Worksheet")); lastSavedSig = sig; } catch (e) { /* history is a convenience */ }
}
$("draftBtn").onclick = () => {
  if (!picked.size) { toast("Tick some questions first"); return; }
  $("dmName").value = currentDraft ? currentDraft.name : (settings.topic || "Draft") + " · " + fmtDate(Date.now());
  $("dmMsg").textContent = ""; $("draftModal").hidden = false; $("dmName").focus();
};
$("dmX").onclick = $("dmCancel").onclick = () => { $("draftModal").hidden = true; };
$("dmSave").onclick = async () => {
  const name = $("dmName").value.trim() || "Draft"; const b = $("dmSave"); b.disabled = true; $("dmMsg").textContent = "Saving…";
  try {
    const id = await api.saveWorksheet(currentDraft ? currentDraft.id : null, snapshot("draft", name));
    currentDraft = { id, name }; store.set("ws_draft_" + user.uid, currentDraft);
    $("draftModal").hidden = true; $("draftNote").hidden = false; $("draftNote").textContent = `Editing draft: ${name}`; toast("Draft saved");
  } catch (e) { $("dmMsg").textContent = "Could not save. Check your internet and try again."; }
  finally { b.disabled = false; }
};
$("wsClear").onclick = () => {
  const b = $("wsClear");
  if (picked.size && b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to clear"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Start new"; }, 4000); return; }
  b.dataset.armed = ""; b.textContent = "Start new";
  picked.clear(); savePicked(); currentDraft = null; store.set("ws_draft_" + user.uid, null); settings.imgSizes = {}; settings.tpTime = ""; settings.tpMM = ""; $("wTpTime").value = ""; $("wTpMM").value = "";
  settings.topic = ""; settings.cls = ""; $("wTopic").value = ""; $("wClass").value = ""; saveSet();
  updateCounts(true); renderPreview(); $("draftNote").hidden = true; toast("Started a new worksheet");
};
let wsCache = [];
async function renderWorksheets(kind) {
  const box = $(kind === "draft" ? "draftList" : "savedList");
  box.innerHTML = `<div class="loadingrow">Loading…</div>`;
  try { wsCache = await api.listWorksheets(kind); }
  catch (e) { box.innerHTML = `<div class="empty">Could not load. Check your internet.</div>`; return; }
  box.innerHTML = wsCache.length ? wsCache.map(w => `<div class="wrow"><div class="wt"><span class="wico${kind === "draft" ? " d" : ""}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${kind === "draft" ? '<path d="M4 20h4L19 9l-4-4L4 16z"/>' : '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'}</svg></span>
    <div class="wm"><b>${esc(w.name)}</b><span>${w.count} question${w.count === 1 ? "" : "s"} · ${fmtDate(w.updatedAt)}${w.ws && w.ws.cls ? " · " + esc(w.ws.cls) : ""}</span></div></div>
    <div class="wa"><button class="btn primary" data-wopen="${esc(w.id)}">${kind === "draft" ? "Continue" : "Open"}</button>${kind === "draft" ? "" : `<button class="btn" data-wpdf="${esc(w.id)}">Download</button>`}<button class="btn del" data-wdel="${esc(w.id)}">Delete</button></div></div>`).join("")
    : `<div class="empty">${kind === "draft" ? "No drafts yet. On the worksheet screen, tap “Save as draft”." : "No worksheets yet. Every PDF you download will appear here."}</div>`;
}
async function openWorksheet(id, thenPdf) {
  const w = await api.getWorksheet(id); if (!w) { toast("That worksheet was not found"); return; }
  picked = new Map((w.questions || []).map(q => [q.id, q])); savePicked();
  Object.assign(settings, w.ws || {}); settings.imgSizes = { ...((w.ws || {}).imgSizes || {}) }; fillSettingsUI(); saveSet();
  currentDraft = w.kind === "draft" ? { id: w.id, name: w.name } : null; store.set("ws_draft_" + user.uid, currentDraft);
  lastSavedSig = w.kind === "saved" ? [...picked.keys()].join(",") + "|" + settings.topic + "|" + settings.cls : "";
  updateCounts(true); show("ws");
  if (thenPdf) $("dlPdf").click();
}
["savedList", "draftList"].forEach(id => $(id).addEventListener("click", async e => {
  const o = e.target.closest("[data-wopen]"), p = e.target.closest("[data-wpdf]"), d = e.target.closest("[data-wdel]");
  try {
    if (o) await openWorksheet(o.dataset.wopen, false);
    else if (p) await openWorksheet(p.dataset.wpdf, true);
    else if (d) {
      if (d.dataset.armed !== "1") { d.dataset.armed = "1"; d.textContent = "Tap again"; setTimeout(() => { if (d.isConnected) { d.dataset.armed = ""; d.textContent = "Delete"; } }, 4000); return; }
      await api.deleteWorksheet(d.dataset.wdel);
      if (currentDraft && currentDraft.id === d.dataset.wdel) { currentDraft = null; store.set("ws_draft_" + user.uid, null); }
      renderWorksheets(id === "draftList" ? "draft" : "saved"); toast("Deleted");
    }
  } catch (err) { toast("Could not do that. Check your internet."); }
}));

// ================= Refer & Earn =================
function referLink() { return location.origin + location.pathname + "?ref=" + encodeURIComponent(user.uid); }
function renderRefer() {
  const link = referLink();
  $("refLink").value = link;
  $("refWa").href = "https://wa.me/?text=" + encodeURIComponent(`I make my worksheets with ${APP.name}. Pick questions, get a ready PDF in a minute. Join with my link: ${link}`);
  const n = profile.refRewards || 0;
  $("refEarned").textContent = n ? `You have earned ${n} free month${n === 1 ? "" : "s"} so far. Thank you!` : "Your free months will show here.";
}
$("refCopy").onclick = async () => {
  try { await navigator.clipboard.writeText($("refLink").value); toast("Link copied"); }
  catch (e) { $("refLink").select(); toast("Press and hold to copy the link"); }
};

// ================= Feedback =================
let fbRating = 0;
$("fbStars").addEventListener("click", e => {
  const b = e.target.closest("[data-r]"); if (!b) return;
  fbRating = +b.dataset.r;
  [...$("fbStars").children].forEach(x => x.classList.toggle("on", +x.dataset.r <= fbRating));
});
$("fbSend").onclick = async () => {
  const text = $("fbText").value.trim();
  if (!text && !fbRating) { $("fbMsg").textContent = "Choose stars or write a message first."; return; }
  $("fbSend").disabled = true; $("fbMsg").textContent = "Sending…";
  try {
    await api.sendFeedback({ rating: fbRating, text, name: profile.name || user.name || "", email: user.email || "" });
    $("fbText").value = ""; fbRating = 0; [...$("fbStars").children].forEach(x => x.classList.remove("on"));
    $("fbMsg").textContent = "Thank you! Your feedback was sent."; toast("Feedback sent");
  } catch (e) { $("fbMsg").textContent = "Could not send. Check your internet and try again."; }
  finally { $("fbSend").disabled = false; }
};
async function loadFeedback() {
  $("fbList").innerHTML = `<div class="loadingrow">Loading…</div>`;
  try {
    const list = await api.listFeedback();
    $("fbList").innerHTML = list.length ? list.map(f => `<div class="fbitem">${f.rating ? `<span class="st">${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</span>` : ""}${f.text ? `<p>${esc(f.text)}</p>` : ""}
      <div class="meta"><span>${esc(f.name || "")} · ${esc(f.email || "")}${f.createdAt ? " · " + fmtDate(f.createdAt) : ""}</span><button class="btn" data-fbdel="${esc(f.id)}">Delete</button></div></div>`).join("")
      : `<div class="empty">No feedback yet.</div>`;
  } catch (e) { $("fbList").innerHTML = `<div class="empty">Could not load feedback. Make sure the new security rules are published.</div>`; }
}
$("fbReload").onclick = loadFeedback;
$("fbList").addEventListener("click", async e => {
  const b = e.target.closest("[data-fbdel]"); if (!b) return;
  try { await api.deleteFeedback(b.dataset.fbdel); b.closest(".fbitem").remove(); } catch (err) { toast("Could not delete."); }
});

// ================= Add one question (admin) =================
// ---- add question
fillSel($("aType"),TYPE_ORDER.map(k=>[k,TYPES[k]]));
function addTypeUI(){const t=$("aType").value;$("aOpts").hidden=!isMCQ(t);$("aReasonL").hidden=t!=="AR";$("aCaseL").hidden=t!=="CS";
  $("aTextLabel").textContent=t==="AR"?"Assertion (A)":t==="CS"?"Questions on the passage (one per line)":t==="TF"?"Statement":t==="FB"?"Question (type ______ for the blank)":"Question";
  $("aAns").placeholder={MCQ:"e.g. b",MCQJ:"e.g. b",AR:"e.g. a",TF:"True or False",FB:"Word for the blank",NUM:"e.g. 9"}[t]||"Model answer (optional)";
  $("aMarks").value=DEF_MARKS[t]||1;}
$("aType").onchange=addTypeUI;
// ---- Class → Subject → Chapter → Concept pickers (shared by Add question and Word import)
const NEW="__new";
function fillPick(sel,inp,names,{none,newLabel,keep}={}){
  const prev=keep!==undefined?keep:sel.value;
  sel.innerHTML=(none!==undefined?`<option value="">${esc(none)}</option>`:"")+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")+(newLabel?`<option value="${NEW}">${esc(newLabel)}</option>`:"");
  const hit=names.find(n=>sameName(n,prev));
  sel.value=hit!==undefined?hit:prev===NEW&&newLabel?NEW:none!==undefined?"":names.length?names[0]:(newLabel?NEW:"");
  if(inp)inp.hidden=sel.value!==NEW;
}
const pickVal=(sel,inp)=>sel.value===NEW?inp.value.trim():sel.value;
function subjNames(cls){return subjList(cls,true).map(x=>x.n)}
function addFill(level,keep={}){
  const cls=+$("aClass").value;
  if(level<=0)fillPick($("aSubject"),null,subjNames(cls),{keep:keep.subject});
  if(level<=1)fillPick($("aChapter"),$("aChapterNew"),chapList(cls,$("aSubject").value,true).map(x=>x.n),{newLabel:"+ New chapter…",keep:keep.chapter});
  if(level<=2)fillPick($("aConcept"),$("aConceptNew"),$("aChapter").value===NEW?[]:conList(cls,$("aSubject").value,$("aChapter").value,true).map(x=>x.n),{none:"No concept",newLabel:"+ New concept…",keep:keep.concept});
}
$("aClass").onchange=()=>addFill(0);
$("aSubject").onchange=()=>addFill(1);
$("aChapter").onchange=()=>{$("aChapterNew").hidden=$("aChapter").value!==NEW;if(!$("aChapterNew").hidden)$("aChapterNew").focus();addFill(2)};
$("aConcept").onchange=()=>{$("aConceptNew").hidden=$("aConcept").value!==NEW;if(!$("aConceptNew").hidden)$("aConceptNew").focus()};
let addKeep=null;   // remember the last chapter/concept so several questions can be added in a row
let editing=null;   // the question being edited, or null when adding a new one
const ADD_FIELDS=["aText","aReason","aCase","aO0","aO1","aO2","aO3","aAns","aChapterNew","aConceptNew"];
function clearAddForm(){ADD_FIELDS.forEach(i=>$(i).value="");$("aSrcRows").innerHTML="";aImg=null;$("aImgW").value="70";aImgUI();$("aErr").textContent="";$("aImgMsg").textContent=""}
function addMode(isEdit){$("addTitle").textContent=isEdit?"Edit question":"Add a question";$("addSave").textContent=isEdit?"Save changes":"Save question"}
$("addOpen").onclick=()=>{if(editing){editing=null;clearAddForm();$("aExam").value="CBSE"}addMode(false);$("addModal").hidden=false;
  const k=addKeep&&(!nav.chapter||(addKeep.cls===nav.cls&&addKeep.subject===nav.subject&&addKeep.chapter===nav.chapter))?addKeep:{cls:nav.cls||10,subject:nav.subject,chapter:nav.chapter,concept:fConcept&&fConcept!=="\u0000"?fConcept:""};
  $("aClass").value=String(k.cls||10);addFill(0,k);$("aErr").textContent="";addTypeUI();$("aText").focus()};
$("addCancel").onclick=$("addX").onclick=()=>{$("addModal").hidden=true};
$("addModal").addEventListener("click",e=>{if(e.target.id==="addModal")$("addModal").hidden=true});

function srcRow(s="",y=""){const d=document.createElement("div");d.className="srcrow";
  d.innerHTML=`<select aria-label="Source">${SOURCES.map(x=>`<option${x===s?" selected":""}>${x}</option>`).join("")}</select><input type="text" inputmode="numeric" maxlength="4" placeholder="Year" aria-label="Year" value="${esc(y)}"><button class="btn" type="button" aria-label="Remove source">✕</button>`;
  d.querySelector("button").onclick=()=>d.remove();$("aSrcRows").appendChild(d)}
$("aSrcAdd").onclick=()=>srcRow();
function readSrcRows(){return [...$("aSrcRows").children].map(r=>({s:r.querySelector("select").value,y:(r.querySelector("input").value.trim().match(/^(19|20)\d{2}$/)||[""])[0]}))}
let aImg=null;
function aImgUI(){const on=!!aImg;$("aImgPrev").hidden=!on;$("aImgSize").hidden=!on;$("aImgDel").hidden=!on;if(on){$("aImgPrev").src=aImg.src;$("aImgWPrev").src=aImg.src}aImgWUI();$("aImgBtn").firstChild.nodeValue=on?"Change image":"Add image"}
function aImgWUI(){const v=+$("aImgW").value;$("aImgWVal").textContent=v+"%";$("aImgWPrev").style.width=v+"%"}
$("aImgW").addEventListener("input",aImgWUI);
$("aImgIn").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];if(!f)return;
  $("aImgMsg").textContent="Preparing image…";
  const url=URL.createObjectURL(f);const img=new Image();
  img.onload=()=>{const k=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
    const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
    aImg={src:c.toDataURL("image/jpeg",0.88),ar:c.width/c.height};URL.revokeObjectURL(url);$("aImgMsg").textContent="";aImgUI();setTimeout(()=>{e.target.value=""},0)};
  img.onerror=()=>{URL.revokeObjectURL(url);$("aImgMsg").textContent="Could not open that image. Use JPG or PNG."};img.src=url});
$("aImgDel").onclick=()=>{aImg=null;aImgUI()};
// Open the form filled with an existing question
async function openEdit(q){
  editing=q;clearAddForm();addMode(true);
  $("aType").value=q.type;addTypeUI();
  $("aExam").value=(q.exam||[]).join(", ");$("aClass").value=String(q.cls);
  addFill(0,{subject:q.subject,chapter:q.chapter,concept:q.concept||""});
  $("aMarks").value=q.marks??"";$("aText").value=q.text||"";$("aReason").value=q.reason||"";$("aCase").value=q.case||"";$("aAns").value=q.ans||"";
  if(isMCQ(q.type))(q.opts||[]).forEach((o,i)=>{if(i<4)$("aO"+i).value=o});
  (q.src||[]).forEach(x=>srcRow(x.s,x.y));
  $("aImgW").value=String(q.imgW||70);aImgWUI();
  $("addModal").hidden=false;
  if(q.hasImg){$("aImgMsg").textContent="Loading diagram…";
    try{if(!imgCache[q.id])Object.assign(imgCache,await api.images([q.id]));}catch(e){}
    if(editing!==q)return;
    if(imgCache[q.id]){aImg={src:imgCache[q.id],ar:q.imgAR||1.5,existing:true};$("aImgMsg").textContent=""}else $("aImgMsg").textContent="The diagram could not be loaded. Saving keeps the old one unless you remove or change it.";
    aImgUI()}
}
$("addSave").onclick=async()=>{
  const t=$("aType").value,text=$("aText").value.trim(),chapter=pickVal($("aChapter"),$("aChapterNew")),concept=pickVal($("aConcept"),$("aConceptNew"));
  const opts=[0,1,2,3].map(i=>$("aO"+i).value.trim());
  if(!text){$("aErr").textContent="Write the question first.";return}
  if(!$("aSubject").value){$("aErr").textContent="This class has no subjects. Add one in Admin → Syllabus.";return}
  if(!chapter){$("aErr").textContent="Choose a chapter, or type the new chapter's name.";return}
  if($("aConcept").value===NEW&&!concept){$("aErr").textContent="Type the new concept's name, or choose No concept.";return}
  if(isMCQ(t)&&opts.some(o=>!o)){$("aErr").textContent="Fill all four options.";return}
  if(t==="AR"&&!$("aReason").value.trim()){$("aErr").textContent="Write the Reason (R).";return}
  const q={exam:$("aExam").value.split(/[ ,]+/).map(s=>s.trim().toUpperCase()).filter(Boolean),cls:+$("aClass").value,subject:$("aSubject").value,chapter,type:t,text,ans:t==="TF"?tfAns($("aAns").value.trim()):$("aAns").value.trim(),marks:+$("aMarks").value||1};
  if(!q.exam.length)q.exam=["CBSE"];
  if(isMCQ(t))q.opts=opts; if(t==="AR"){q.opts=AR_OPTS;q.reason=$("aReason").value.trim()} if(t==="CS")q.case=$("aCase").value.trim();
  if(concept)q.concept=concept;
  if(aImg){q.img=aImg.src;q.imgAR=aImg.ar;q.imgW=+$("aImgW").value}
  const qsrc=readSrcRows();if(qsrc.length)q.src=qsrc;
  if(editing){await saveEdit(editing,q);return}
  $("addSave").disabled=true;$("aErr").textContent="Saving…";
  try{await saveToBank([q])}catch(err){$("aErr").textContent="Could not save. Check your internet and try again.";$("addSave").disabled=false;return}
  $("addSave").disabled=false;
  ["aText","aReason","aCase","aO0","aO1","aO2","aO3","aAns","aChapterNew","aConceptNew"].forEach(i=>$(i).value="");
  addKeep={cls:q.cls,subject:q.subject,chapter:q.chapter,concept:q.concept||""};$("aSrcRows").innerHTML="";aImg=null;aImgUI();$("aErr").textContent="";$("addModal").hidden=true;
  toast("Question saved to the bank");
};



// Save an edited question in place (same id, same position)
async function saveEdit(old,q){
  const imgMode=aImg?(aImg.existing?"keep":"new"):(old.hasImg&&!$("aImgMsg").textContent.startsWith("The diagram could not")?"remove":"keep");
  const data={...q};delete data.img;
  if(imgMode==="keep"&&old.hasImg&&!aImg){data.imgAR=old.imgAR;data.imgW=old.imgW}
  data.seq=old.seq;data.exam=examsFromSrc(data);
  $("addSave").disabled=true;$("aErr").textContent="Saving changes…";
  let saved;
  try{saved=await api.updateQuestion(old.id,data,imgMode==="new"?q.img:imgMode);}
  catch(err){$("aErr").textContent="Could not save. Check your internet and try again.";$("addSave").disabled=false;return}
  $("addSave").disabled=false;
  if(imgMode==="new")imgCache[old.id]=q.img;if(imgMode==="remove")delete imgCache[old.id];
  if(addFromQuestions(syllabus,[saved])){try{await saveSyllabus()}catch(e){}}
  try{chapterMap=await api.chapters();mergeChapterMap(syllabus,chapterMap)}catch(e){}
  const i=current.findIndex(x=>x.id===old.id);
  const here=saved.cls===nav.cls&&saved.subject===nav.subject&&saved.chapter===nav.chapter;
  if(i>=0){if(here)current[i]=saved;else current.splice(i,1)}
  if(picked.has(old.id)){picked.set(old.id,saved);savePicked()}
  editing=null;clearAddForm();addMode(false);$("aExam").value="CBSE";$("addModal").hidden=true;
  renderList();renderHome();toast(here?"Question updated":`Question updated and moved to ${saved.chapter}`);
}
// ===== Import from Excel / CSV / pasted rows =====
const TYPE_MAP={mcqj:"MCQJ","mcq jee neet":"MCQJ","mcq jee":"MCQJ","mcq neet":"MCQJ","jee mcq":"MCQJ","neet mcq":"MCQJ","jee neet mcq":"MCQJ",
  gr:"GR","give reason":"GR","give reasons":"GR",m1:"M1","1 marker":"M1","1 mark":"M1",m2:"VSA","2 marker":"VSA","2 marks":"VSA",m3:"SA","3 marker":"SA","3 marks":"SA",
  m5:"LA","5 marker":"LA","5 marks":"LA",pr:"PR",proof:"PR",proving:"PR","numerical type":"NUM","assertion / reason":"AR","fill in the blanks":"FB",
  mcq:"MCQ",ar:"AR","assertion reason":"AR","assertion-reason":"AR",sa:"SA",short:"SA","short answer":"SA",la:"LA",long:"LA","long answer":"LA",cs:"CS","case study":"CS",case:"CS",
  fb:"FB",fib:"FB",blank:"FB","fill in the blank":"FB","fill in the blanks":"FB","fill ups":"FB",tf:"TF","t/f":"TF","true false":"TF","true/false":"TF","true or false":"TF",
  num:"NUM",numerical:"NUM",integer:"NUM",numeric:"NUM",vsa:"VSA","very short":"VSA","very short answer":"VSA"};
let imReady=[];
const norm=h=>String(h||"").toLowerCase().replace(/\(.*?\)/g,"").replace(/[^a-z]/g,"");
const COLS={proof:"proof",proving:"proof",concept:"concept",subtopic:"concept",source:"src",year:"year",exam:"exam",class:"cls",subject:"subject",chapter:"chapter",type:"type",question:"text",assertion:"text",reason:"reason",passage:"case",optiona:"o0",optionb:"o1",optionc:"o2",optiond:"o3",answer:"ans",marks:"marks",difficulty:"diff",image:"img",imagesize:"imgSize"};
function imShow(step){$("imStart").hidden=step!=="start";$("imReview").hidden=step!=="review"}
function parseTSV(t){const rows=[];let row=[],cur="",q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c=='"'){if(t[i+1]=='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c=='"'&&cur==="")q=true;else if(c=="\t"){row.push(cur);cur=""}else if(c=="\n"||c=="\r"){if(c=="\r"&&t[i+1]=="\n")i++;row.push(cur);rows.push(row);row=[];cur=""}else cur+=c}
  if(cur!==""||row.length){row.push(cur);rows.push(row)}return rows.filter(r=>r.some(x=>String(x).trim()))}
// "35%", "37", "Small", "Medium", "Full" -> percent of the column (10–100)
function sizePct(t){const s=String(t||"").trim().toLowerCase();const w={small:40,medium:70,full:100}[s];if(w)return w;
  const n=parseFloat(s);return Number.isFinite(n)?Math.max(10,Math.min(100,Math.round(n))):70}
// "MCQ – JEE/NEET", "2 Marker", "fill-in-the-blanks" -> lookup key
const typeKey=t=>String(t||"").toLowerCase().replace(/[–—\-\/_]+/g," ").replace(/\s+/g," ").trim();
const SUBJ_ALIAS={math:"Maths",maths:"Maths",mathematics:"Maths",bio:"Biology",phy:"Physics",chem:"Chemistry"};
function rowsToQuestions(rows,images){
  const out=[],probs=[];const newCh=new Set(),newCon=new Set();if(!rows.length){probs.push("The sheet is empty.");return {out,probs}}
  const head=rows[0].map(norm);const map=head.map(h=>COLS[h]);
  if(!map.includes("text")||!map.includes("type")){probs.push("Header row not found. Keep the template's first row (Exam, Class, Subject, Chapter, Concept, Type, Question…).");return {out,probs}}
  const isExample=r=>/^which vessel carries deoxygenated|^fishes have only two|^why is it necessary to separate|^draw a labelled diagram of a sectional|^\(i\) what do the two numbers|^in the circuit shown, what is the reading|^a ball is thrown vertically upward with speed 20|^the si unit of electric resistance is _|^resistivity of a wire depends on its length\.|^a ball is dropped from a height of 45 m|^prove that a line drawn parallel to one side|^give reason: the walls of the ventricles/i.test(r.text||"");
  let skipped=0;
  rows.slice(1).forEach((r,ix)=>{const n=ix+2,v={};map.forEach((k,i)=>{if(k)v[k]=String(r[i]??"").trim()});
    if(!Object.values(v).some(Boolean))return;
    if(isExample(v)){skipped++;return}
    let type=TYPE_MAP[typeKey(v.type)];const err=[];
    if(type&&/^(y|yes|true|1|✓|proof)$/i.test(v.proof||"")&&!isMCQ(type)&&type!=="AR")type="PR";   // old "Proof" column
    if(!v.text)err.push("Question is empty");
    if(!type)err.push(`Type "${v.type||""}" should be MCQ, MCQJ, FB, TF, AR, GR, NUM, M1, M2, M3, PR, CS or M5`);
    const cls=parseInt(v.cls,10);if(![9,10,11,12].includes(cls))err.push("Class should be 9, 10, 11 or 12");
    if(!v.chapter)err.push("Chapter is empty");
    let ans=(v.ans||"").replace(/[()]/g,"");
    if(isMCQ(type)){if(!(v.o0&&v.o1&&v.o2&&v.o3))err.push("All four options are needed");ans=ans.toLowerCase();if(ans&&!/^[abcd]$/.test(ans))err.push("Answer should be a, b, c or d")}
    if(type==="AR"){if(!v.reason)err.push("Reason is empty");ans=ans.toLowerCase();if(ans&&!/^[abcd]$/.test(ans))err.push("Answer should be a, b, c or d")}
    if(type==="CS"&&!v.case)err.push("Passage is empty");
    if(type==="TF"){ans=tfAns(ans);if(ans&&!/^(True|False)$/.test(ans))err.push("Answer should be True or False")}
    let img=null;if(v.img){img=images[v.img.toLowerCase()];if(!img)err.push(`Image "${v.img}" was not selected`)}
    let subj=null,chapter=v.chapter,concept=v.concept||"";
    if([9,10,11,12].includes(cls)){const subs=subjNames(cls);
      subj=subs.find(x=>sameName(x,v.subject))||subs.find(x=>sameName(x,SUBJ_ALIAS[norm(v.subject)]));
      if(!subj)err.push(v.subject?`Subject "${v.subject}" is not in Class ${roman(cls)} (use ${subs.join(", ")}, or add it in Admin → Syllabus)`:"Subject is empty")}
    if(err.length){probs.push(`Row ${n}: ${err.join("; ")}`);return}
    const chItem=findItem(chapList(cls,subj,true),chapter);if(chItem)chapter=chItem.n;else newCh.add(cls+"|"+subj+"|"+chapter.toLowerCase());
    if(concept){const co=chItem&&findItem(chItem.k,concept);if(co)concept=co.n;else newCon.add(cls+"|"+subj+"|"+chapter.toLowerCase()+"|"+concept.toLowerCase())}
    const q={id:"i"+Date.now().toString(36)+ix,exam:(v.exam||"CBSE").split(/[ ,\/]+/).map(x=>x.toUpperCase()).filter(Boolean),cls,subject:subj,chapter,type,text:v.text,ans,
      marks:parseFloat(v.marks)||DEF_MARKS[type]};
    if(isMCQ(type))q.opts=[v.o0,v.o1,v.o2,v.o3];if(type==="AR"){q.opts=AR_OPTS;q.reason=v.reason}if(type==="CS")q.case=v.case;
    if(img){q.img=img.src;q.imgAR=img.ar;q.imgW=sizePct(v.imgSize)}
    const src=parseSources(v.src,v.year);if(src.length)q.src=src;
    if(concept)q.concept=concept;
    out.push(q)});
  const notes=[];if(skipped)notes.push(`${skipped} yellow example row${skipped>1?"s":""} from the template skipped.`);
  if(newCh.size||newCon.size)notes.push(`New in the syllabus: ${[newCh.size?`${newCh.size} chapter${newCh.size>1?"s":""}`:"",newCon.size?`${newCon.size} concept${newCon.size>1?"s":""}`:""].filter(Boolean).join(" and ")}. They will be added when you import. If that is a spelling mistake, fix the sheet first.`);
  return {out,probs,note:notes.join(" ")};
}
function shrinkImage(f){return new Promise(res=>{const url=URL.createObjectURL(f);const img=new Image();
  img.onload=()=>{const k=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
    const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);res({src:c.toDataURL("image/jpeg",0.88),ar:c.width/c.height})};
  img.onerror=()=>{URL.revokeObjectURL(url);res(null)};img.src=url})}
function imReviewShow({out,probs,note}){imReady=out;imShow("review");
  $("imSummary").textContent=out.length?`${out.length} question${out.length>1?"s":""} ready to import`:"No questions could be imported";
  $("imProblems").innerHTML=probs.length?`<b>${probs.length} row${probs.length>1?"s":""} need attention:</b><br>`+probs.map(esc).join("<br>"):"";if(note)$("imProblems").innerHTML+=(probs.length?"<br><br>":"")+esc(note);
  $("imGo").disabled=!out.length;$("imMsg").textContent=""}
$("imFile").addEventListener("change",async e=>{const files=[...(e.target.files||[])];setTimeout(()=>{e.target.value=""},0);if(!files.length)return;
  const sheetF=files.find(f=>/\.(xlsx|xls|csv)$/i.test(f.name)||/sheet|excel|csv/.test(f.type));
  if(!sheetF){$("imMsg").textContent="No Excel or CSV file was selected. Choose the filled template.";return}
  if(!window.XLSX){$("imMsg").textContent="The Excel reader did not load. Check your internet and reopen the page.";return}
  $("imMsg").textContent="Reading file…";
  try{const images={};for(const f of files.filter(f=>f!==sheetF&&/^image\//.test(f.type||"image/"))){const r=await shrinkImage(f);if(r)images[f.name.toLowerCase()]=r}
    const wbk=XLSX.read(await sheetF.arrayBuffer(),{type:"array"});
    const name=wbk.SheetNames.find(n=>/question/i.test(n))||wbk.SheetNames[0];
    const rows=XLSX.utils.sheet_to_json(wbk.Sheets[name],{header:1,defval:"",raw:false}).filter(r=>r.some(x=>String(x).trim()));
    imReviewShow(rowsToQuestions(rows,images))}
  catch(err){$("imMsg").textContent="Could not read that file. Save it as .xlsx or .csv and try again."}});
$("imPasteGo").onclick=()=>{const t=$("imPaste").value;if(!t.trim()){$("imMsg").textContent="Paste the copied rows first.";return}
  const rows=parseTSV(t);if(rows.length&&rows[0].length<3){$("imMsg").textContent="Rows were not recognised. Copy the cells straight from the sheet, including the header row.";return}
  imReviewShow(rowsToQuestions(rows,{}))};
$("imGo").onclick=async()=>{if(!imReady.length)return;const b=$("imGo");b.disabled=true;$("imMsg").textContent="Saving to the question bank…";
  try{const n=await saveToBank(imReady);imReady=[];$("imModal").hidden=true;$("imPaste").value="";toast(`${n} question${n>1?"s":""} imported`)}
  catch(err){$("imMsg").textContent="Could not save. Check your internet and try again."}finally{b.disabled=false}};
$("imBack").onclick=()=>imShow("start");
$("impOpen").onclick=()=>{$("imModal").hidden=false;imShow("start");$("imMsg").textContent=""};
$("imClose").onclick=()=>{$("imModal").hidden=true};
$("imModal").addEventListener("click",e=>{if(e.target.id==="imModal")$("imModal").hidden=true});



// ===== Import from Word (.docx) =====
const W_NS="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SUPS={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","n":"ⁿ"};
const SUBS={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋"};
const toSup=t=>[...t].every(c=>SUPS[c])?[...t].map(c=>SUPS[c]).join(""):"^("+t+")";
const toSub=t=>[...t].every(c=>SUBS[c])?[...t].map(c=>SUBS[c]).join(""):"_("+t+")";
const ln=el=>el.localName;
const kids=(el,name)=>[...el.children].filter(c=>ln(c)===name);
const kid=(el,name)=>[...el.children].find(c=>ln(c)===name);
const attr=(el,name)=>{if(!el)return null;for(const a of el.attributes)if(a.localName===name)return a.value;return null};
// Word equation (OMML) to LaTeX, so it is kept as a real equation: $\frac{a}{b}$, $\int_0^1$, $\vec{F}$ …
const TEX_CHR={"∫":"\\int","∬":"\\iint","∭":"\\iiint","∮":"\\oint","∑":"\\sum","∏":"\\prod","⋃":"\\bigcup","⋂":"\\bigcap"};
const TEX_DELIM={"(":"(",")":")","[":"[","]":"]","{":"\\{","}":"\\}","|":"|","‖":"\\|","⟨":"\\langle","⟩":"\\rangle","⌊":"\\lfloor","⌋":"\\rfloor","⌈":"\\lceil","⌉":"\\rceil","":"."};
const TEX_ACC={"\u0302":"\\hat","^":"\\hat","\u20d7":"\\vec","→":"\\vec","\u20d1":"\\vec","\u0305":"\\bar","¯":"\\bar","\u0304":"\\bar","\u0307":"\\dot","˙":"\\dot","\u0308":"\\ddot","¨":"\\ddot","~":"\\tilde","\u0303":"\\tilde"};
const TEX_UNI={"×":"\\times ","·":"\\cdot ","⋅":"\\cdot ","±":"\\pm ","∓":"\\mp ","≈":"\\approx ","∝":"\\propto ","≠":"\\neq ","≤":"\\leq ","≥":"\\geq ","∞":"\\infty ","→":"\\rightarrow ","⇒":"\\Rightarrow ","⇌":"\\rightleftharpoons ","∴":"\\therefore ","∵":"\\because ","∂":"\\partial ","∇":"\\nabla ","Δ":"\\Delta ","∠":"\\angle ","⊥":"\\perp ","∥":"\\parallel ","°":"^{\\circ}","−":"-","ℏ":"\\hbar ","…":"\\ldots ","′":"'"};
function texEsc(t){return t.replace(/\\/g,"\\backslash ").replace(/([{}%#&_$])/g,"\\$1").replace(/\^/g,"\\hat{}").replace(/[×·⋅±∓≈∝≠≤≥∞→⇒⇌∴∵∂∇Δ∠⊥∥°−ℏ…′]/g,c=>TEX_UNI[c])}
function ommlTex(n){const name=ln(n),c=k=>{const e=kid(n,k);return e?ommlTex(e):""};const pr=k=>kid(n,k);
  const val=(prName,child,def)=>{const p=pr(prName);const e=p&&kid(p,child);const v=attr(e,"val");return v==null?def:v};
  switch(name){
    case "t":return texEsc(n.textContent);
    case "r":{const rp=kid(n,"rPr");const sty=attr(rp&&kid(rp,"sty"),"val");const nor=rp&&kid(rp,"nor");
      const txt=[...n.children].filter(x=>ln(x)==="t").map(x=>x.textContent).join("");if(!txt)return "";
      if(nor||(/\s/.test(txt.trim())&&/[a-z]{2,}/i.test(txt)))return "\\text{"+txt.replace(/[{}\\]/g,"")+"}";
      const body=texEsc(txt).replace(/ /g,"\\ ");
      if(/^\s*(sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|det)\s*$/.test(txt))return "\\"+txt.trim()+" ";   // function names upright
      if(sty==="p"&&/[A-Za-z]{2,}/.test(txt)){return txt.trim().match(/^(sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|det)$/)?"\\"+txt.trim()+" ":"\\mathrm{"+body+"}"}
      if(sty==="b"||sty==="bi")return "\\mathbf{"+body+"}";return body}
    case "f":{const tp=val("fPr","type","bar");const a=c("num"),b=c("den");return tp==="lin"||tp==="skw"?`{${a}}/{${b}}`:tp==="noBar"?`\\genfrac{}{}{0pt}{}{${a}}{${b}}`:`\\frac{${a}}{${b}}`}
    case "sSup":return `{${c("e")}}^{${c("sup")}}`;
    case "sSub":return `{${c("e")}}_{${c("sub")}}`;
    case "sSubSup":return `{${c("e")}}_{${c("sub")}}^{${c("sup")}}`;
    case "sPre":return `{}_{${c("sub")}}^{${c("sup")}}{${c("e")}}`;
    case "rad":{const d=c("deg");const hide=val("radPr","degHide","0");return d&&!["1","on","true"].includes(hide)?`\\sqrt[${d}]{${c("e")}}`:`\\sqrt{${c("e")}}`}
    case "d":{const b=val("dPr","begChr","("),e=val("dPr","endChr",")"),sep=val("dPr","sepChr","|");
      const parts=kids(n,"e").map(ommlTex);return `\\left${TEX_DELIM[b]??b}${parts.join(sep==="|"?"\\mid ":texEsc(sep))}\\right${TEX_DELIM[e]??e}`}
    case "nary":{const ch=val("naryPr","chr","∫");const loc=val("naryPr","limLoc","");const sub=c("sub"),sup=c("sup");
      const subH=["1","on","true"].includes(val("naryPr","subHide","0")),supH=["1","on","true"].includes(val("naryPr","supHide","0"));
      const op=(TEX_CHR[ch]||texEsc(ch))+(loc==="undOvr"&&/int/.test(TEX_CHR[ch]||"")?"\\limits":"");
      return `${op}${!subH&&sub?`_{${sub}}`:""}${!supH&&sup?`^{${sup}}`:""} ${c("e")}`}
    case "acc":{const ch=val("accPr","chr","\u0302");const e=c("e");const cmd=TEX_ACC[ch];
      if(cmd==="\\hat"&&(e==="i"||e==="j"))return `\\hat{\\${e}math}`;return cmd?`${cmd}{${e}}`:`\\overset{${texEsc(ch)}}{${e}}`}
    case "bar":return val("barPr","pos","bot")==="top"?`\\overline{${c("e")}}`:`\\underline{${c("e")}}`;
    case "groupChr":{const pos=val("groupChrPr","pos","bot");return pos==="top"?`\\overbrace{${c("e")}}`:`\\underbrace{${c("e")}}`}
    case "m":{const rows=kids(n,"mr").map(r=>kids(r,"e").map(ommlTex).join(" & "));return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`}
    case "eqArr":return `\\begin{gathered}${kids(n,"e").map(ommlTex).join(" \\\\ ")}\\end{gathered}`;
    case "func":return `${c("fName")} ${c("e")}`;
    case "limLow":{const e=c("e");return /^\\?(lim|max|min)\s*$/.test(e.trim())||e.trim()==="\\lim"?`\\lim_{${c("lim")}}`:`\\underset{${c("lim")}}{${e}}`}
    case "limUpp":return `\\overset{${c("lim")}}{${c("e")}}`;
    case "box":case "borderBox":case "phant":return c("e");
    case "oMathPara":return kids(n,"oMath").map(ommlTex).join(" \\quad ");
  }
  if(/Pr$/.test(name))return "";
  return [...n.children].map(ommlTex).join("");
}
// Word equation (OMML) to readable text
function omml(n){const name=ln(n),c=k=>{const e=kid(n,k);return e?omml(e):""};
  if(name==="t")return n.textContent;
  if(name==="f"){const a=c("num"),b=c("den");return (a.length>1?"("+a+")":a)+"/"+(b.length>1?"("+b+")":b)}
  if(name==="sSup")return c("e")+toSup(c("sup"));
  if(name==="sSub")return c("e")+toSub(c("sub"));
  if(name==="sSubSup")return c("e")+toSub(c("sub"))+toSup(c("sup"));
  if(name==="rad"){const d=c("deg"),e=c("e");return (d?toSup(d):"")+"√"+(e.length>1?"("+e+")":e)}
  if(name==="d"){const beg=attr(kid(kid(n,"dPr")||n,"begChr")||null,"val")??"(",end=attr(kid(kid(n,"dPr")||n,"endChr")||null,"val")??")";return beg+kids(n,"e").map(omml).join(", ")+end}
  if(name==="nary"){const ch=attr(kid(kid(n,"naryPr")||n,"chr")||null,"val")||"∫";const lo=c("sub"),hi=c("sup");return ch+(lo?toSub(lo):"")+(hi?toSup(hi):"")+" "+c("e")}
  // accents: î ĵ k̂ (unit vectors), arrows, bars
  if(name==="acc"){const ch=attr(kid(kid(n,"accPr")||n,"chr")||null,"val")??"\u0302",e=c("e");
    if(ch==="\u0302"||ch==="^"){if(e==="i")return "î";if(e==="j")return "ĵ"}
    const cm={"\u0302":"\u0302","^":"\u0302","\u20d7":"\u20d7","→":"\u20d7","\u0305":"\u0305","¯":"\u0305","\u0307":"\u0307","˙":"\u0307","~":"\u0303","\u0303":"\u0303"}[ch]||ch;
    return e+cm}
  if(name==="bar")return c("e")+"\u0305";
  if(/Pr$/.test(name))return "";
  return [...n.children].map(omml).join("");
}
async function readDocx(file){
  if(!window.JSZip)throw new Error("nozip");
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const xml=async p=>{const f=zip.file(p);return f?new DOMParser().parseFromString(await f.async("string"),"application/xml"):null};
  const doc=await xml("word/document.xml");if(!doc)throw new Error("notdocx");
  const rels={};const rx=await xml("word/_rels/document.xml.rels");
  if(rx)for(const r of rx.getElementsByTagName("Relationship"))rels[r.getAttribute("Id")]=r.getAttribute("Target");
  // numbering formats, so auto-numbered lists (1. 2. / a) b)) are understood
  const fmt={};const nx=await xml("word/numbering.xml");
  if(nx){const abs={};for(const a of nx.getElementsByTagNameNS(W_NS,"abstractNum")){const id=attr(a,"abstractNumId");abs[id]={};for(const l of kids(a,"lvl"))abs[id][attr(l,"ilvl")]=attr(kid(l,"numFmt"),"val")}
    for(const nm of nx.getElementsByTagNameNS(W_NS,"num")){fmt[attr(nm,"numId")]=abs[attr(kid(nm,"abstractNumId"),"val")]||{}}}
  const styleNum={};const sx=await xml("word/styles.xml");
  if(sx)for(const st of sx.getElementsByTagNameNS(W_NS,"style")){const np=kid(kid(st,"pPr")||st,"numPr");if(np)styleNum[attr(st,"styleId")]={id:attr(kid(np,"numId")||null,"val"),lv:attr(kid(np,"ilvl")||null,"val")}}
  const imgCache={};
  async function image(rid){const t=rels[rid];if(!t)return null;if(imgCache[rid])return imgCache[rid];
    const f=zip.file("word/"+t.replace(/^\.?\//,""))||zip.file(t.replace(/^\/?/,""));if(!f||!/\.(png|jpe?g|gif|bmp|webp)$/i.test(t))return null;
    const blob=new Blob([await f.async("uint8array")],{type:/png$/i.test(t)?"image/png":"image/jpeg"});
    return imgCache[rid]=await shrinkImage(blob)}
  async function para(p){let text="",imgs=[];
    const walk=async n=>{for(const ch of n.children){const nm=ln(ch);
      if(nm==="r"){const rp=kid(ch,"rPr"),va=attr(kid(rp||ch,"vertAlign")||null,"val");
        for(const x of ch.children){const xn=ln(x);
          if(xn==="t"){const t=x.textContent;text+=va==="superscript"?toSup(t):va==="subscript"?toSub(t):t}
          else if(xn==="tab")text+="\t";else if(xn==="br"||xn==="cr")text+="\n";
          else if(xn==="drawing"||xn==="pict"||xn==="object"){for(const b of x.getElementsByTagName("*"))if(ln(b)==="blip"||ln(b)==="imagedata"){const id=attr(b,"embed")||attr(b,"id");const im=id&&await image(id);if(im)imgs.push(im)}}}}
      else if(nm==="oMath"||nm==="oMathPara"){const tx=ommlTex(ch).replace(/^(\s|\\ )+|(\s|\\ )+$/g,"");if(tx)text+="$"+tx+"$"}
      else if(nm==="hyperlink"||nm==="smartTag"||nm==="ins"||nm==="sdt"||nm==="sdtContent"||nm==="fldSimple")await walk(ch)}};
    await walk(p);
    const ppr=kid(p,"pPr"),np=ppr&&kid(ppr,"numPr"),sn=styleNum[attr(ppr&&kid(ppr,"pStyle")||null,"val")]||{};let list=null;
    const id=attr(np&&kid(np,"numId")||null,"val")||sn.id,lv=attr(np&&kid(np,"ilvl")||null,"val")||sn.lv||"0";
    if(id&&id!=="0")list={fmt:(fmt[id]||{})[lv]||(lv==="0"?"decimal":"lowerLetter"),id,lv};
    return {text:text.replace(/\u00a0/g," "),imgs,list}}
  const out=[];
  async function block(el){for(const ch of el.children){const nm=ln(ch);
    if(nm==="p")out.push(await para(ch));
    else if(nm==="tbl"){const rows=[];for(const tr of kids(ch,"tr")){const cells=[];for(const tc of kids(tr,"tc")){const ps=[];for(const p of kids(tc,"p"))ps.push(await para(p));cells.push(ps)}rows.push(cells)}
      out.push({table:rows.map(r=>r.map(c=>c.map(p=>p.text).join(" ").trim()))});
      for(const r of rows)for(const c of r)for(const p of c)out.push(p)}
    else if(nm==="sdt"){const sc=kid(ch,"sdtContent");if(sc)await block(sc)}}}
  await block(kid(doc.documentElement,"body"));
  // page headers often carry "Class 11th _ Physics", "Concept _ Centre of Mass"
  const head=[];
  for(const name of Object.keys(zip.files).filter(n=>/^word\/header\d*\.xml$/.test(n)).sort()){const hx=await xml(name);if(!hx)continue;
    for(const p of hx.getElementsByTagNameNS(W_NS,"p")){const t=[...p.getElementsByTagNameNS(W_NS,"t")].map(x=>x.textContent).join("").trim();if(t&&!head.some(h=>h.text===t))head.push({text:t,imgs:[],list:null,header:true})}}
  return [...head,...out];
}
// Turn the paragraphs into questions
function parseWord(paras){
  const meta={};const qs=[];const key={};let cur=null,inKey=false,last="text";
  let qNum=null;
  const lf=p=>p.list?p.list.fmt:"";
  const isQList=p=>{if(!p.list||!/decimal/i.test(p.list.fmt))return false;if(qNum===null){qNum=p.list.id;return true}return p.list.id===qNum&&p.list.lv==="0"};
  const isOptList=p=>p.list&&cur&&(/letter|bullet/i.test(p.list.fmt)||(/decimal/i.test(p.list.fmt)&&!(p.list.id===qNum&&p.list.lv==="0")));
  const startQ=t=>{cur={text:t||"",opts:[],imgs:[],ans:"",reason:"",assert:"",casePas:"",lines:[],src:[]};qs.push(cur);last="text"};
  const addOpt=(L,t)=>{if(!cur)return;const i="abcd".indexOf(L.toLowerCase());if(i<0)return;cur.opts[i]=(t||"").trim();last="opt"+i};
  const keyPairs=t=>{let m,re=/(?:Q\.?\s*)?(\d{1,3})\s*[.)\-:–]?\s*\(?([a-dA-D])\)?(?![a-z])/g,found=0;while((m=re.exec(t))){key[+m[1]]=m[2].toLowerCase();found++}return found};
  const OPT_SPLIT=/(?:^|\s)\(?([a-dA-D])\)\s*|(?:^|\t|\s{2,})([a-dA-D])[.)]\s+/g;
  for(const p of paras){
    if(p.table){const t=p.table;
      if(t.length>=2&&/^q/i.test(t[0][0]||"")&&/^ans/i.test(t[1][0]||"")){for(let r=0;r+1<t.length;r+=2)t[r].forEach((v,i)=>{const n=parseInt(v,10),a=(t[r+1][i]||"").trim().toLowerCase().replace(/[()]/g,"");if(n&&/^[a-d]$/.test(a))key[n]=a});p.skipCells=true}
      continue}
    let t=p.text.trim();
    // an empty line with Word's own number (1. 2. 3.) starts a question whose text is on the next lines
    if(!t&&!p.imgs.length){if(!inKey&&!p.header&&isQList(p))startQ("");continue}
    if(!qs.length||p.header){const m1=t.match(/(?:topic|chapter)\s*[:\-–_]\s*(.+)/i);if(m1)meta.chapter=m1[1].trim();
      const mc=t.match(/concept\s*[:\-–_]\s*(.+)/i);if(mc)meta.concept=mc[1].trim();
      const m2=t.match(/class\s*[:\-–_]?\s*(XII|XI|IX|X|\d{1,2})(?:st|nd|rd|th)?\b/i);if(m2)meta.cls={IX:9,X:10,XI:11,XII:12}[m2[1].toUpperCase()]||parseInt(m2[1],10);
      const m3=t.match(/\b(maths?|mathematics|physics|chemistry|biology)\b/i);if(m3)meta.subject=({math:"Maths",maths:"Maths",mathematics:"Maths"})[m3[1].toLowerCase()]||m3[1][0].toUpperCase()+m3[1].slice(1).toLowerCase()}
    if(p.header)continue;
    if(/^(answer\s*key|answers|answer\s*sheet|solutions?)\s*[:\-]?\s*$/i.test(t)){inKey=true;continue}
    if(inKey){keyPairs(t);continue}
    // answer line inside a question
    const am=t.match(/^(?:ans(?:wer)?|correct\s*option)\s*[.:\-–]\s*(.*)$/i);
    if(am){if(cur){const a=am[1].trim();const l=a.match(/^\(?([a-dA-D])\)?(?:\W|$)/);cur.ans=l?l[1].toLowerCase():a;last="ans"}continue}
    // a line that is only a source, e.g. "JEE Mains: 2026", "JEE Adv.", "[NEET 2019]"
    if(cur&&t.length<=60&&/^\[?\s*(jee|neet|ncert|cbse|aipmt|aiims|iit|board|exemplar)/i.test(t)){const sr=parseSources(t.replace(/[\[\]]/g,""));if(sr.length){for(const x of sr)if(!cur.src.some(y=>y.s===x.s&&y.y===x.y))cur.src.push(x);continue}}
    // new question?
    let qm=t.match(/^(?:Q(?:ues(?:tion)?)?\.?\s*)(\d{1,3})\s*[.):\-–]?\s*(.*)$/is)||t.match(/^(\d{1,3})\s*[.)]\s+(.*)$/s);
    if(!qm&&isQList(p))qm=[null,null,t];
    if(qm){startQ("");t=(qm[2]||"").trim();if(!t){cur.imgs.push(...p.imgs);continue}}
    if(!cur){continue}
    // auto-lettered option
    if(!qm&&isOptList(p)&&!/roman/i.test(lf(p))){addOpt("abcd"[cur.opts.filter(x=>x!==undefined).length]||"d",t);cur.imgs.push(...p.imgs);continue}
    // assertion / reason
    const as=t.match(/^assertion\s*(?:\(A\))?\s*[:\-–]\s*(.*)$/is);if(as){cur.assert=as[1].trim();last="assert";cur.imgs.push(...p.imgs);continue}
    const rs=t.match(/^reason\s*(?:\(R\))?\s*[:\-–]\s*(.*)$/is);if(rs){cur.reason=rs[1].trim();last="reason";continue}
    // options written as text: "(a) Two (b) Four" or "a) Two"
    if(/^\(?[a-dA-D]\)\s*|^[a-dA-D][.)]\s+/.test(t)){
      const parts=[];let m;OPT_SPLIT.lastIndex=0;while((m=OPT_SPLIT.exec(t)))parts.push({L:m[1]||m[2],i:m.index,end:OPT_SPLIT.lastIndex});
      parts.forEach((x,k)=>addOpt(x.L,t.slice(x.end,k+1<parts.length?parts[k+1].i:undefined)));cur.imgs.push(...p.imgs);continue}
    // roman sub-questions belong to the question text
    if(/roman/i.test(lf(p)))t="("+["i","ii","iii","iv","v","vi"][cur.lines.length%6]+") "+t;
    // continuation text
    if(last==="ans"&&/^[A-Za-z .&-]{2,30}:$/.test(t))continue;   // section labels such as "HOTS:"
    if(last==="ans"){if(!/^[abcd]$/.test(cur.ans))cur.ans=(cur.ans+" "+t).trim();cur.imgs.push(...p.imgs);continue}   // answer written on the next line(s)
    if(last.startsWith("opt")){const i=+last.slice(3);cur.opts[i]+=" "+t}
    else if(last==="reason")cur.reason+=" "+t;
    else if(last==="assert")cur.assert+=" "+t;
    else cur.lines.push(t);
    cur.imgs.push(...p.imgs);
  }
  // finalise
  const res=qs.map((q,ix)=>{const n=ix+1;let type,text=q.lines.join("\n").trim(),issues=[],passage="";
    if(q.assert||(/assertion/i.test(text)&&q.reason)){type="AR";text=q.assert||text.replace(/^.*?assertion\s*(?:\(A\))?\s*[:\-–]\s*/is,"")}
    else if(q.opts.filter(Boolean).length>=2)type=[...q.src,...parseSources((text.match(/[\[(]([^\[\]()]{3,60})[\])]\s*$/)||[])[1]||"")].some(x=>/^(JEE|NEET)/.test(x.s))?"MCQJ":"MCQ";
    else if(/read the (following )?(passage|case|paragraph|text|source)|case\s*study|case\s*based/i.test(text)){type="CS";
      const ls=q.lines.slice();const intro=/^read the|case\s*(study|based)/i.test(ls[0]||"")?ls.shift():"";
      const subIx=ls.findIndex(l=>/^\(?(i|1|a)\)/i.test(l));passage=(subIx>0?ls.slice(0,subIx):ls.slice(0,1)).join(" ");text=(subIx>0?ls.slice(subIx):ls.slice(1)).join("\n")||intro}
    else if(/^\s*(state\s+)?(whether\s+)?(the following (statement )?is\s+)?true\s*(or|\/)\s*false|\(\s*true\s*\/\s*false\s*\)\s*$/i.test(text)){type="TF";text=text.replace(/\s*\(\s*true\s*\/\s*false\s*\)\s*$/i,"").replace(/^\s*state\s+(whether\s+)?(the following (statement )?is\s+)?true\s*(or|\/)\s*false\s*[:.\-–]?\s*/i,"")}
    else if(/_{3,}|\.{6,}|…{2,}/.test(text))type=/^-?\d+(\.\d+)?$/.test((q.ans||key[n]||"").trim())||/nearest integer|numerical value|integer value/i.test(text)?"NUM":"FB";
    else if(/nearest integer|numerical value|integer value/i.test(text))type="NUM";
    else type=/\b(explain|describe|draw|derive|discuss|elaborate|differentiate)\b/i.test(text)&&text.length>90?"LA":text.length<110?"VSA":"SA";
    let src=q.src.slice();
    const tm=text.match(/\s*[\[(]([^\[\]()]{3,60})[\])]\s*$/);
    if(tm){const p=parseSources(tm[1]);if(p.length&&/\d{4}|ncert|exemplar|jee|neet|cbse|pyq|sample|board/i.test(tm[1])){for(const x of p)if(!src.some(y=>y.s===x.s&&y.y===x.y))src.push(x);text=text.slice(0,tm.index).trim()}}
    let ans=q.ans||key[n]||"";
    if(isMCQ(type)){const o=[0,1,2,3].map(i=>(q.opts[i]||"").trim());if(o.some(x=>!x))issues.push("fewer than 4 options");q.opts=o;if(!/^[abcd]$/.test(ans)){if(ans)issues.push("answer is not a–d");else issues.push("no answer found");ans=/^[abcd]$/.test(ans)?ans:""}}
    if(type==="AR"&&!q.reason)issues.push("Reason not found");
    if(type==="AR"&&!/^[abcd]$/.test(ans))issues.push("no answer found");
    if(type==="TF")ans=tfAns(ans);
    // "(3 Marks)" / "[2]" at the end of a written question sets its marks and Marker type
    let marks=DEF_MARKS[type];const mm=text.match(/\s*[\[(]\s*(\d{1,2})\s*(?:marks?)?\s*[\])]\s*$/i);
    if(mm&&+mm[1]>=1&&+mm[1]<=10){marks=+mm[1];text=text.slice(0,mm.index).trim();if(["M1","VSA","SA","LA"].includes(type))type={1:"M1",2:"VSA",3:"SA",5:"LA"}[marks]||type}
    if(!["MCQ","MCQJ","AR","TF","CS"].includes(type)){if(/^\s*give\s+reasons?\b/i.test(text)){type="GR";if(!mm)marks=1}else if(/\b(prove|show)\s+that\b/i.test(text)){type="PR";if(!mm)marks=3}}
    if(!text)issues.push("question text is empty");
    return {n,type,type0:type,text,opts:q.opts,reason:q.reason,passage,ans,img:q.imgs[0]||null,issues,use:!!text,src,marks}});
  return {meta,qs:res};
}
let wdData=null;
function wdFill(level,keep={}){
  const cls=+$("wdCls").value;
  if(level<=0)fillPick($("wdSubject"),null,subjNames(cls),{keep:keep.subject});
  if(level<=1){const chs=chapList(cls,$("wdSubject").value,true).map(x=>x.n);
    fillPick($("wdChapter"),$("wdChapterNew"),chs,{none:"Choose chapter…",newLabel:"+ New chapter…",keep:keep.chapter!==undefined?(chs.some(c=>sameName(c,keep.chapter))||!keep.chapter?keep.chapter:NEW):undefined});
    if(keep.chapter&&$("wdChapter").value===NEW)$("wdChapterNew").value=keep.chapter}
  if(level<=2){const cs=wdConcepts(),kc=keep.concept;
    fillPick($("wdConcept"),$("wdConceptNew"),cs,{none:"No concept",newLabel:"+ New concept…",keep:kc?(cs.some(c=>sameName(c,kc))?kc:NEW):undefined});
    if(kc&&$("wdConcept").value===NEW)$("wdConceptNew").value=kc}
}
const wdConcepts=()=>$("wdChapter").value===NEW?[]:conList(+$("wdCls").value,$("wdSubject").value,$("wdChapter").value,true).map(x=>x.n);
function wdRender(){const {qs}=wdData;
  const ok=qs.filter(q=>!q.issues.length).length;
  $("wdSummary").textContent=`${qs.length} question${qs.length===1?"":"s"} found · ${ok} look complete · ${qs.length-ok} need a check`;
  const cons=wdConcepts();
  $("wdList").innerHTML=qs.map((q,i)=>`<div class="wq ${q.issues.length?"warn":""}">
    <label class="check"><input type="checkbox" data-i="${i}" class="wdUse" ${q.use?"checked":""}> <b>Q${q.n}</b></label>
    <select data-i="${i}" class="wdType" aria-label="Question type">${TYPE_ORDER.map(k=>`<option value="${k}" ${k===q.type?"selected":""}>${TYPES[k]}</option>`).join("")}</select>
    <select data-i="${i}" class="wdCon" aria-label="Concept for Q${q.n}"><option value="">Concept: same as above</option><option value="\u0000" ${q.concept==="\u0000"?"selected":""}>No concept</option>${cons.map(c=>`<option value="${esc(c)}" ${q.concept===c?"selected":""}>${esc(c)}</option>`).join("")}</select>
    <div class="wtxt">${q.passage?`<div class="opts">${esc(q.passage).slice(0,160)}…</div>`:""}${mt(q.type==="AR"?"A: "+q.text:q.text).replace(/\n/g,"<br>")}
      ${q.type==="AR"?`<div class="opts">R: ${mt(q.reason)}</div>`:""}
      ${isMCQ(q.type)?`<div class="opts">${q.opts.map((o,j)=>"abcd"[j]+") "+(o?mt(o):"<i>missing</i>")).join(" &nbsp; ")}</div>`:""}
      ${q.img?`<img class="qthumb" src="${q.img.src}" alt="Diagram">`:""}
      <div class="opts">${q.marks?`<span class="chip">${q.marks} mark${q.marks==1?"":"s"}</span> `:""}${q.src&&q.src.length?`<span class="chip srcchip">${esc(srcText(q))}</span> `:""}Answer: <b>${mt(q.ans||"–")}</b>${q.issues.length?` · <span style="color:var(--warn)">${esc(q.issues.join(", "))}</span>`:""}</div></div></div>`).join("")||`<div class="empty">No numbered questions were found. Questions should start with Q1., 1. or Word's own numbering.</div>`;
  $("wdGo").disabled=!qs.some(q=>q.use);
}
$("wdCls").onchange=()=>{wdFill(0);wdRender()};
$("wdSubject").onchange=()=>{wdFill(1);wdRender()};
$("wdChapter").onchange=()=>{$("wdChapterNew").hidden=$("wdChapter").value!==NEW;wdFill(2);wdData.qs.forEach(q=>{if(q.concept!=="\u0000")q.concept=""});wdRender()};
$("wdConcept").onchange=()=>{$("wdConceptNew").hidden=$("wdConcept").value!==NEW};
$("wdList").addEventListener("change",e=>{const i=+e.target.dataset.i;if(Number.isNaN(i))return;
  if(e.target.classList.contains("wdUse"))wdData.qs[i].use=e.target.checked;
  if(e.target.classList.contains("wdType")){wdData.qs[i].type=e.target.value;}
  if(e.target.classList.contains("wdCon")){wdData.qs[i].concept=e.target.value;}
  $("wdGo").disabled=!wdData.qs.some(q=>q.use)});
$("wdFile").addEventListener("change",async e=>{const f=e.target.files&&e.target.files[0];setTimeout(()=>{e.target.value=""},0);if(!f)return;
  if(/\.doc$/i.test(f.name)){$("wdMsg").textContent="This is an old .doc file. Open it in Word and use Save As → Word Document (.docx), then try again.";return}
  $("wdMsg").textContent="Reading Word file…";
  try{const paras=await readDocx(f);wdData=parseWord(paras);$("wdMsg").textContent="";$("wdStart").hidden=true;$("wdReview").hidden=false;
    const m=wdData.meta;$("wdCls").value=String(m.cls||nav.cls||10);$("wdChapterNew").value="";$("wdConceptNew").value="";
    // a concept named in the file: find the chapter it already belongs to
    let ch=m.chapter||"";const sub=subjNames(+$("wdCls").value).find(s=>sameName(s,m.subject||nav.subject))||"";
    if(!ch&&m.concept&&sub){const hit=chapList(+$("wdCls").value,sub,true).find(c=>sameName(c.n,m.concept)||findItem(c.k,m.concept));if(hit){ch=hit.n;if(sameName(hit.n,m.concept))m.concept=""}}
    if(!ch&&!m.concept)ch=nav.chapter||"";
    wdFill(0,{subject:sub,chapter:ch,concept:m.concept||""});wdRender()}
  catch(err){$("wdMsg").textContent=err&&err.message==="nozip"?"The Word reader did not load. Check your internet and reopen the page.":"Could not read that file. Make sure it is a .docx Word file."}});
$("wdGo").onclick=async()=>{const cls=+$("wdCls").value,subject=$("wdSubject").value,chapter=pickVal($("wdChapter"),$("wdChapterNew")),topCon=pickVal($("wdConcept"),$("wdConceptNew"));
  if(!subject){$("wdMsg").textContent="This class has no subjects. Add one in Admin → Syllabus.";return}
  if(!chapter){$("wdMsg").textContent="Choose a chapter, or type the new chapter's name.";return}
  const exam=$("wdExam").value.split(/[ ,\/]+/).map(x=>x.toUpperCase()).filter(Boolean);
  const add=wdData.qs.filter(q=>q.use).map((q,k)=>{const o={exam:exam.length?exam:["CBSE"],cls,subject,chapter,type:q.type,text:q.text,ans:q.type==="TF"?tfAns(q.ans):q.ans,marks:q.marks&&q.type===q.type0?q.marks:DEF_MARKS[q.type]||1};
    if(isMCQ(q.type))o.opts=q.opts.map(x=>x||"");if(q.type==="AR"){o.opts=AR_OPTS;o.reason=q.reason||""}if(q.type==="CS")o.case=q.passage||"";
    if(q.img){o.img=q.img.src;o.imgAR=q.img.ar;o.imgW=70}
    const common=$("wdSrc").value?[{s:$("wdSrc").value,y:/^(19|20)\d{2}$/.test($("wdYear").value.trim())?$("wdYear").value.trim():""}]:[];
    const sr=q.src&&q.src.length?q.src:common;if(sr.length)o.src=sr;
    const con=q.concept==="\u0000"?"":q.concept||topCon;if(con)o.concept=con;return o});
  const b=$("wdGo");b.disabled=true;$("wdMsg").textContent="Saving to the question bank…";
  try{await saveToBank(add);$("wdModal").hidden=true;toast(`${add.length} question${add.length===1?"":"s"} imported from Word`)}
  catch(err){$("wdMsg").textContent="Could not save. Check your internet and try again."}finally{b.disabled=false}};
$("wdOpen").onclick=()=>{$("wdTitle").textContent="Import from Word";$("wdModal").hidden=false;$("wdStart").hidden=false;$("wdReview").hidden=true;$("wdMsg").textContent=""};
$("wdBack").onclick=()=>{$("wdStart").hidden=false;$("wdReview").hidden=true};
$("wdClose").onclick=()=>{$("wdModal").hidden=true};
$("wdModal").addEventListener("click",e=>{if(e.target.id==="wdModal")$("wdModal").hidden=true});


// ================= Logo =================
let pendingLogo=null,pendingSize=25;
const mm=v=>v*3.78;
function logoUI(){
  const have=!!settings.logo;$("logoNone").hidden=have;$("logoHave").hidden=!have;
  if(have){$("logoPrev").innerHTML=`<img src="${settings.logo}" alt="Your logo">`;$("logoInfo").textContent=`Size ${settings.logoSize||25} mm`}
}
function openModal(step){$("logoModal").hidden=false;$("logoMsg").textContent="";modalStep(step);
  setTimeout(()=>{(step==="edit"?$("lsAdd"):$("lmPick").querySelector("input")).focus()},50)}
function closeModal(){$("logoModal").hidden=true;pendingLogo=null}
function modalStep(step){$("lmPick").hidden=step!=="pick";$("lmEdit").hidden=step!=="edit";
  $("lmTitle").textContent=step==="edit"?"Adjust logo":"Upload logo";if(step==="edit")requestAnimationFrame(drawHdr)}
function drawHdr(){
  $("lsVal").textContent=pendingSize+" mm";$("lsRange").value=pendingSize;
  const box=$("hdrPrev"),w=box.clientWidth||340,sc=w/794;
  const p=pageShell(1,{logo:pendingLogo,size:pendingSize});
  const head=p.querySelector(".ws-head");const wrap=document.createElement("div");wrap.className="ws-page";wrap.style.fontFamily=curFont().fam;wrap.appendChild(head);
  wrap.style.transform=`scale(${sc})`;box.innerHTML="";box.appendChild(wrap);
  requestAnimationFrame(()=>{box.style.height=(wrap.offsetHeight*sc)+"px"});
}
// Trim the blank (white or transparent) border, then scale to a fixed 400px square:
// a big logo is shrunk, a small one is enlarged, so every logo comes out the same size on the sheet.
function fitLogo(img){
  const W=img.naturalWidth,Hh=img.naturalHeight,c=document.createElement("canvas");c.width=W;c.height=Hh;
  const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,W,Hh);x.drawImage(img,0,0);
  let l=W,t=Hh,r=-1,b=-1;
  try{const d=x.getImageData(0,0,W,Hh).data;
    for(let y=0;y<Hh;y++)for(let i=0;i<W;i++){const k=(y*W+i)*4;if(d[k]<240||d[k+1]<240||d[k+2]<240){if(i<l)l=i;if(i>r)r=i;if(y<t)t=y;if(y>b)b=y}}}catch(e){}
  if(r<0){l=0;t=0;r=W-1;b=Hh-1}
  const cw=r-l+1,ch=b-t+1,S=400,pad=8,k=(S-2*pad)/Math.max(cw,ch);
  const o=document.createElement("canvas");o.width=S;o.height=S;const ox=o.getContext("2d");
  ox.fillStyle="#fff";ox.fillRect(0,0,S,S);ox.imageSmoothingQuality="high";
  ox.drawImage(c,l,t,cw,ch,(S-cw*k)/2,(S-ch*k)/2,cw*k,ch*k);
  return o.toDataURL("image/png");
}
// Accept the picked image however the phone labels it (gallery picks often have no file extension)
function handleLogoFile(f){
  if(!f){$("logoMsg").textContent="No file was received. Please try choosing it again.";return}
  if(f.type&&!/^image\//.test(f.type)){$("logoMsg").textContent="That file is not an image. Please choose a JPG or PNG logo.";return}
  $("logoMsg").textContent="Preparing logo…";
  const done=img=>{try{pendingLogo=fitLogo(img);pendingSize=25;$("logoMsg").textContent="";modalStep("edit")}catch(err){$("logoMsg").textContent="Could not process that image. Try another JPG or PNG."}};
  const viaReader=()=>{const r=new FileReader();
    r.onerror=()=>{$("logoMsg").textContent="Could not read that file. Try another JPG or PNG."};
    r.onload=()=>{const img=new Image();img.onload=()=>done(img);img.onerror=()=>{$("logoMsg").textContent="This image format is not supported. Please use JPG or PNG."};img.src=r.result};
    r.readAsDataURL(f)};
  let url=null;try{url=URL.createObjectURL(f)}catch(e){}
  if(!url)return viaReader();
  const img=new Image();img.onload=()=>{done(img);try{URL.revokeObjectURL(url)}catch(e){}};img.onerror=()=>{try{URL.revokeObjectURL(url)}catch(e){}viaReader()};img.src=url;
}
document.querySelectorAll(".logoIn").forEach(el=>{
  const go=e=>{const f=e.target.files&&e.target.files[0];if(!f)return;handleLogoFile(f);setTimeout(()=>{try{e.target.value=""}catch(x){}},0)};
  el.addEventListener("change",go);
});
// Fallbacks: paste a copied image, or drop a file onto the popup
document.addEventListener("paste",e=>{if($("logoModal").hidden)return;const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/"));if(it){e.preventDefault();handleLogoFile(it.getAsFile())}});
$("logoModal").addEventListener("dragover",e=>e.preventDefault());
$("logoModal").addEventListener("drop",e=>{e.preventDefault();const f=e.dataTransfer?.files?.[0];if(f)handleLogoFile(f)});
$("lsRange").addEventListener("input",()=>{pendingSize=+$("lsRange").value;drawHdr()});
$("lOpen").onclick=()=>openModal("pick");
$("lReplace").onclick=()=>openModal("pick");
$("lsResize").onclick=()=>{pendingLogo=settings.logo;pendingSize=settings.logoSize||25;openModal("edit")};
$("lmClose").onclick=closeModal;$("lsCancel").onclick=closeModal;
$("logoModal").addEventListener("click",e=>{if(e.target.id==="logoModal")closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("logoModal").hidden)closeModal()});
$("lsAdd").onclick=()=>{settings.logo=pendingLogo;settings.logoSize=pendingSize;saveSet();closeModal();logoUI();schedule();toast("Logo added")};
$("sLogoClear").onclick=()=>{settings.logo="";saveSet();logoUI();schedule();toast("Logo removed")};

// ================= Worksheet layout =================
function pageShell(n,lg){const L=lg?lg.logo:settings.logo,LS=mm(lg?lg.size:(settings.logoSize||25));
  const p=document.createElement("div");p.className="ws-page"+(settings.marks?" mkon":"");p.style.fontFamily=curFont().fam;p.style.setProperty("--qs",curFont().size+"px");
  p.innerHTML=`<div class="ws-head"><div><h3>${esc(settings.academy)}</h3><div class="meta">${esc(settings.cls)}<br>Topic: ${esc(settings.topic)}</div></div>
  ${L?`<div class="ws-logo" style="width:${LS}px;height:${LS}px"><img src="${L}" alt=""></div>`:""}</div>
  ${settings.wmOn&&settings.wm?`<div class="ws-wm">${esc(settings.wm)}</div>`:""}
  ${settings.tp&&n===1&&!lg?tpHTML():""}
  <div class="ws-body"><div class="ws-col"></div><div class="ws-col"></div></div>
  <div class="ws-foot"><span>By ${esc(settings.teacher)}</span><span>☎ ${esc(settings.phone)}</span><span class="pg">Page ${n}</span></div>`;
  return p;
}
// Test paper strip on page 1: Time / M.M., a name line, general instructions
function tpHTML(){const v=tpVals(),ins=String(settings.tpIns||"").split("\n").map(x=>x.trim()).filter(Boolean);
  return `<div class="tp-strip"><span>Time: ${esc(v.time)}</span><span>M.M.: ${esc(v.mm)}</span></div>
  <div class="tp-stu"><span>Name:<i></i></span><span class="dt">Date:<i></i></span></div>
  ${ins.length?`<div class="tp-ins"><b>General Instructions</b><ol>${ins.map(x=>`<li>${mt(x)}</li>`).join("")}</ol></div>`:""}`}
let mctx;function textW(s){if(!mctx){mctx=document.createElement("canvas").getContext("2d")}mctx.font=curFont().size+'px '+curFont().fam;return mctx.measureText(s).width}
// option column is ~300px wide; if every option fits in half of it, show two per line
function optsHTML(list){const one=(o,i)=>`<div class="o"><span class="l">${"abcd"[i]})</span><span>${mt(o)}</span></div>`;
  // half column = ~145px, minus 22px label = ~123px for text; keep a safety margin so nothing wraps
  const short=list.every(o=>textW(plain(o))*(hasMath(o)?1.25:1)<=112);
  if(!short)return list.map(one).join("");
  let h="";for(let i=0;i<list.length;i+=2)h+=`<div class="og">${list.slice(i,i+2).map((o,j)=>one(o,i+j)).join("")}</div>`;return h}
function qHTML(q,n){
  const mk=settings.marks?`<span class="mk">[${q.marks}]</span>`:"";
  // source & year: own line at the end of the question, right side, bold
  // test paper: objective questions get an answer box (on the source line when there is one)
  const ab=settings.tp&&settings.tpAns!==false&&KEY_TABLE.has(q.type)?`<span class="ab">Ans. <i class="${q.type==="FB"||q.type==="NUM"?"w":""}"></i></span>`:"";
  const st=settings.srcOn&&srcText(q)?`<div class="srcl${ab?" abrow":""}"><span>[${esc(srcText(q))}]</span>${ab}</div>`:ab?`<div class="abrow">${ab}</div>`:"";
  // no blank answer lines under written questions (removed on request)
  let b="";
  if(isMCQ(q.type))b=`<div class="s">${mk}${mt(q.text)}</div>`+optsHTML(q.opts)+st;
  else if(q.type==="AR")b=`<div class="s ar">${mk}<b>Assertion (A):</b> ${mt(q.text)}</div><div class="s ar"><b>Reason (R):</b> ${mt(q.reason)}</div>`+optsHTML(AR_OPTS)+st;
  else if(q.type==="TF")b=`<div class="s">${mk}${mt(q.text)} <i>(True / False)</i></div>`+st;
  else if(q.type!=="CS")b=`<div class="s">${mk}${mt(q.text)}</div>`+st;   // other types
  else if(q.type==="CS")b=`<div class="s">${mk}Read the passage and answer the questions that follow.</div><div class="case">${mt(q.case)}</div>`+q.text.split("\n").filter(Boolean).map(t=>`<div class="s">${mt(t)}</div>`).join("")+st;
  if(q.img){const im=`<div class="qimg"><img src="${q.img}" alt="" style="width:${effW(q)}%;aspect-ratio:${q.imgAR||1.5}"></div>`;
    const tmp=document.createElement("div");tmp.innerHTML=b;const kids=[...tmp.children];
    const after=q.type==="AR"?kids[1]:q.type==="CS"?kids[1]:kids[0];
    if(after)after.insertAdjacentHTML("afterend",im);b=tmp.innerHTML}
  const d=document.createElement("div");d.className="ws-q";d.innerHTML=`<span class="n ring">Q${n}</span><div class="qc">${b}</div>`;return d;
}
// Sections by marks: A = 1 mark, B = 2, C = 3, D = 4, E = 5; any other marks get F, G… after them.
// Inside a section, questions follow the type list (MCQ, MCQ JEE/NEET, Fill in the Blanks…).
const secOf=q=>+q.marks||DEF_MARKS[q.type]||1;
function wsSort(qs){return qs.slice().sort((a,b)=>secOf(a)-secOf(b)||TYPE_ORDER.indexOf(a.type)-TYPE_ORDER.indexOf(b.type))}
function secLetter(m,qs){if([1,2,3,4,5].includes(m))return "ABCDE"[m-1];
  const extra=[...new Set(qs.map(secOf))].filter(x=>![1,2,3,4,5].includes(x)).sort((a,b)=>a-b);return String.fromCharCode(70+extra.indexOf(m))}
// Answer as it goes in the key table: T / F for True-False
function keyAns(q){const a=String(q.ans||"").trim();if(!a)return "–";if(q.type==="TF"){const t=tfAns(a);return t==="True"?"T":t==="False"?"F":t}return a}
// Split question q so that everything above `limit` (px) stays; returns the continuation question, or null if nothing fits.
function splitQ(q,limit){
  const qc=q.querySelector(".qc");const blocks=[...qc.children];
  let i=blocks.findIndex(b=>b.getBoundingClientRect().bottom>limit+0.5);
  if(i<0)return "fits";
  const b=blocks[i];let cont=null;
  if(b.matches(".s,.o,.case")){
    const tw=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let node,cut=null,first=true;const seenK=new Set();
    outer:while((node=tw.nextNode())){if(node.parentElement.closest(".l,.mk"))continue;
      const kx=node.parentElement.closest(".katex");   // an equation moves as one piece
      if(kx){if(seenK.has(kx))continue;seenK.add(kx);if(kx.getBoundingClientRect().bottom>limit+0.5){if(!first)cut={el:kx};break outer}first=false;continue}
      const re=/\S+/g;let m;
      while((m=re.exec(node.data))){const r=document.createRange();r.setStart(node,m.index);r.setEnd(node,m.index+m[0].length);
        const rs=r.getClientRects();const bot=rs.length?rs[rs.length-1].bottom:0;
        if(bot>limit+0.5){if(!first)cut={node,off:m.index};break outer}first=false}}
    if(cut){const r=document.createRange();if(cut.el)r.setStartBefore(cut.el);else r.setStart(cut.node,cut.off);r.setEndAfter(b.lastChild);const frag=r.extractContents();
      cont=b.cloneNode(false);if(b.classList.contains("o")){const l=document.createElement("span");l.className="l";cont.appendChild(l)}
      cont.appendChild(frag);b.classList.add("brk");cont.classList.add("cont")}
  }
  if(!cont&&i===0)return null;
  const rq=document.createElement("div");rq.className="ws-q";rq.innerHTML='<span class="n"></span><div class="qc"></div>';  // continuation: no number
  const rqc=rq.querySelector(".qc");if(cont)rqc.appendChild(cont);
  blocks.slice(cont?i+1:i).forEach(x=>rqc.appendChild(x));
  return rq;
}
function build(){
  const M=$("measure");M.innerHTML="";
  let qs=[...picked.values()].map(q=>q.hasImg?{...q,img:imgCache[q.id]||null}:q);
  if(settings.group)qs=wsSort(qs);
  if(!qs.length){return []}
  const items=[];let last=null,sec=0;
  qs.forEach((q,i)=>{if(settings.group&&secOf(q)!==last){const s=document.createElement("div");s.className="ws-sec";s.textContent=`Section ${secLetter(secOf(q),qs)}`;items.push(s);last=secOf(q)}items.push(qHTML(q,i+1))});
  if(settings.tp&&settings.tpEval!==false){
    const neg=Math.abs(parseFloat(settings.tpNeg)||0),mk=[...new Set(qs.map(q=>+q.marks||DEF_MARKS[q.type]||1))];
    const ev=document.createElement("div");ev.className="ev atom";
    ev.innerHTML=`<h4><span>Evaluation</span><span>For teacher's use</span></h4><table>
      <tr><th></th><th>Number</th><th>Marks</th></tr>
      <tr><td>Correct answers${mk.length===1?` <small>(× ${mk[0]})</small>`:""}</td><td></td><td></td></tr>
      <tr><td>Incorrect answers${neg?` <small>(× −${neg})</small>`:""}</td><td></td><td>${neg?"":"0"}</td></tr>
      <tr><td>Not attempted</td><td></td><td>0</td></tr>
      <tr class="tot"><td>Total marks</td><td colspan="2" class="tm">______ / ${esc(tpVals().mm)}</td></tr></table>
      <div class="sig"><span>Checked by: <i></i></span><span>Signature: <i></i></span></div>`;
    items.push(ev);
  }
  if(settings.key){
    // short answers (MCQ, FB, T/F, AR, Numerical) in a table; written answers listed below it
    const all=qs.map((q,i)=>({n:i+1,q})).filter(x=>!isProof(x.q));   // proving questions have no key entry
    const obj=all.filter(x=>KEY_TABLE.has(x.q.type)),wr=all.filter(x=>!KEY_TABLE.has(x.q.type));
    if(obj.length||wr.length){
      const h=document.createElement("div");h.className="ws-sec";h.textContent="Answer Key";items.push(h);
      const mx=Math.max(0,...obj.map(x=>keyAns(x.q).length)),per=mx<=2?8:mx<=4?6:mx<=8?4:3;   // fewer, wider cells for longer answers
      for(let i=0;i<obj.length;i+=per){
        const part=obj.slice(i,i+per);while(part.length<per)part.push(null);
        const t=document.createElement("table");t.className="ws-ktab atom";
        t.innerHTML=`<tr><th>Q.</th>${part.map(x=>`<td>${x?x.n:""}</td>`).join("")}</tr><tr><th>Ans.</th>${part.map(x=>`<td class="ka">${x?mt(keyAns(x.q)):""}</td>`).join("")}</tr>`;
        items.push(t);
      }
      for(const x of wr){
        const d=document.createElement("div");d.className="ws-q wans";
        d.innerHTML=`<span class="n">Q${x.n}.</span><div class="qc">${String(x.q.ans||"–").split("\n").map(l=>`<div class="s">${mt(l)}</div>`).join("")}</div>`;
        items.push(d);
      }
    }
  }
  const pages=[];let page,cols,ci;
  const newPage=()=>{page=pageShell(pages.length+1);M.appendChild(page);pages.push(page);cols=page.querySelectorAll(".ws-col");ci=0};
  const advance=()=>{if(ci===0)ci=1;else newPage()};
  newPage();
  // fill column 1 completely before column 2, splitting a question across columns/pages when needed
  for(let el of items){
    for(let guard=0;guard<200;guard++){
      const col=cols[ci];col.appendChild(el);
      const limit=col.getBoundingClientRect().bottom;
      if(el.classList.contains("atom")){
        if(el.getBoundingClientRect().bottom<=limit+0.5||col.children.length===1)break;
        col.removeChild(el);advance();continue;
      }
      if(el.classList.contains("ws-sec")){
        if(el.getBoundingClientRect().bottom+40<=limit||col.children.length===1)break;
        col.removeChild(el);advance();continue;
      }
      if(el.getBoundingClientRect().bottom<=limit+0.5)break;
      const rest=splitQ(el,limit);
      if(rest==="fits")break;
      if(rest===null){
        if(col.children.length===1)break;            // taller than a whole column; leave it
        col.removeChild(el);
        const prev=col.lastElementChild;if(prev&&prev.classList.contains("ws-sec")){col.removeChild(prev);advance();cols[ci].appendChild(prev)}else advance();
        continue;
      }
      advance();el=rest;
    }
  }
  const total=pages.length;pages.forEach((p,i)=>p.querySelector(".pg").textContent=`Page ${i+1}`);
  return pages;
}
// Load the worksheet font before measuring; otherwise lines are measured with a fallback font and columns break in the wrong place
async function ensureFonts(){const f=curFont(),fam=f.fam.split(",")[0];
  try{await Promise.race([Promise.all(["400","700","italic 400"].map(w=>document.fonts.load(`${w} ${f.size}px ${fam}`,"Ab"))),new Promise(r=>setTimeout(r,4000))])}catch(e){}
  if([...picked.values()].some(q=>hasMath(q.text)||hasMath(q.case)||hasMath(q.reason)||(q.opts||[]).some(hasMath)||hasMath(q.ans))){
    try{await Promise.race([Promise.all(["KaTeX_Main","italic KaTeX_Math","KaTeX_Size1","KaTeX_Size2","KaTeX_AMS"].map(f=>document.fonts.load("16px "+f.replace(/^italic /,"")+(f.startsWith("italic")?"":""),"a"))),new Promise(r=>setTimeout(r,4000))])}catch(e){}
    try{await document.fonts.load("italic 16px KaTeX_Math","x")}catch(e){}}
  try{await document.fonts.ready}catch(e){}}
try{document.fonts.addEventListener("loadingdone",()=>{if(!$("v-ws").hidden)schedule()})}catch(e){}
let timer;function schedule(){clearTimeout(timer);timer=setTimeout(renderPreview,250)}
async function renderPreview(){
  $("wsHint").hidden=!!settings.academy;
  await ensureFonts();await loadPickedImages();
  const pages=build();const S=$("sheets");S.innerHTML="";
  if(!pages.length){S.innerHTML=`<div class="empty">Tick questions in the Questions tab to build a worksheet. You can tick from several chapters.</div>`;$("pageInfo").textContent="";return}
  const w=Math.min(794,S.clientWidth||794),sc=w/794;
  pages.forEach(p=>{const wrap=document.createElement("div");wrap.className="sheetwrap";wrap.style.width=w+"px";wrap.style.height=(1123*sc)+"px";
    const c=p.cloneNode(true);c.style.transform=`scale(${sc})`;wrap.appendChild(c);S.appendChild(wrap)});
  const n=picked.size;
  $("pageInfo").textContent=`${n} question${n===1?"":"s"} · ${pages.length} page${pages.length>1?"s":""} · A4`;
  renderImgSizes(); tpPlaceholders();
}
// Teacher's "Diagram sizes" list (rebuilt only when the set of diagrams changes, so sliding stays smooth)
let iszSig="";
function wsOrder(){const qs=[...picked.values()];return settings.group?wsSort(qs):qs}
function renderImgSizes(){
  const list=wsOrder().map((q,i)=>({q,n:i+1})).filter(x=>x.q.hasImg&&imgCache[x.q.id]);
  $("imgSizesPanel").hidden=!list.length;
  const sig=list.map(x=>x.q.id+":"+x.n).join(",");if(sig===iszSig)return;iszSig=sig;
  $("imgSizes").innerHTML=list.map(({q,n})=>{const v=effW(q),own=(settings.imgSizes||{})[q.id];
    return `<div class="isz-item" data-id="${esc(q.id)}"><span class="qn">Q${n}</span><img src="${imgCache[q.id]}" alt=""><div class="ctl">
      <div class="isz-row"><b class="v">${v}%</b><button class="link rs" type="button" ${own?"":"hidden"}>Reset to ${q.imgW||70}%</button></div>
      <input type="range" min="10" max="100" step="1" value="${v}" aria-label="Size of the diagram in Q${n}"></div></div>`}).join("");
}
$("imgSizes").addEventListener("input",e=>{const it=e.target.closest(".isz-item");if(!it||e.target.type!=="range")return;
  const v=+e.target.value;settings.imgSizes={...(settings.imgSizes||{}),[it.dataset.id]:v};it.querySelector(".v").textContent=v+"%";it.querySelector(".rs").hidden=false;saveSet();schedule()});
$("imgSizes").addEventListener("click",e=>{const b=e.target.closest(".rs");if(!b)return;const it=b.closest(".isz-item"),id=it.dataset.id;
  const s={...(settings.imgSizes||{})};delete s[id];settings.imgSizes=s;const q=picked.get(id);const v=(q&&q.imgW)||70;
  it.querySelector("input").value=v;it.querySelector(".v").textContent=v+"%";b.hidden=true;saveSet();schedule()});
addEventListener("resize",()=>{if(!$("v-ws").hidden)schedule()});


$("wsHintGo").onclick = () => show("set");

// ================= Admin: teachers & subscriptions =================
let usersCache = [];
async function loadUsers() {
  $("uList").innerHTML = `<div class="loadingrow">Loading teachers…</div>`;
  try { usersCache = await api.users(); renderUsers(); }
  catch (e) { $("uList").innerHTML = `<div class="empty">Could not load teachers. Check that the security rules are published (README step 5).</div>`; }
}
function renderUsers() {
  const w = $("uSearch").value.trim().toLowerCase(), now = Date.now();
  const list = usersCache.filter(u => !w || ((u.name || "") + " " + (u.email || "")).toLowerCase().includes(w));
  $("uList").innerHTML = list.length ? list.map(u => {
    const on = u.planUntil && u.planUntil > now;
    const status = u.admin ? `<span class="pill adm">Admin</span>` : on ? `<span class="pill on">Active till ${fmtDate(u.planUntil)}</span>`
      : u.planUntil ? `<span class="pill off">Expired ${fmtDate(u.planUntil)}</span>` : `<span class="pill off">Waiting for activation</span>`;
    const refBy = u.referredBy ? usersCache.find(x => x.uid === u.referredBy) : null;
    const refTxt = refBy ? ` · Referred by ${esc(refBy.name || refBy.email)}${u.referralRewarded ? " (rewarded)" : ""}` : "";
    return `<div class="urow"><div class="uinfo"><b>${esc(u.name || "No name")}</b> · ${esc(u.email)}<br><span class="note">${status}${u.createdAt ? " · Joined " + fmtDate(u.createdAt) : ""}${refTxt}</span></div>
      ${u.admin ? "" : `<div class="uacts"><button class="btn" data-uid="${esc(u.uid)}" data-act="m1">+1 month</button><button class="btn" data-uid="${esc(u.uid)}" data-act="y1">+1 year</button>${on ? `<button class="btn" data-uid="${esc(u.uid)}" data-act="stop">Stop</button>` : ""}</div>`}</div>`;
  }).join("") : `<div class="empty">No teachers found.</div>`;
}
$("uSearch").addEventListener("input", renderUsers);
$("usersReload").onclick = loadUsers;
$("uList").addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const u = usersCache.find(x => x.uid === b.dataset.uid); if (!u) return;
  const from = Math.max(Date.now(), u.planUntil || 0);
  const until = b.dataset.act === "m1" ? from + 30 * DAY : b.dataset.act === "y1" ? from + 365 * DAY : null;
  b.disabled = true;
  try {
    await api.setPlan(u.uid, until); u.planUntil = until;
    let extra = "";
    if (until && u.referredBy && !u.referralRewarded && usersCache.some(x => x.uid === u.referredBy)) {
      try { await api.rewardReferral(u.uid, u.referredBy, 30 * DAY); u.referralRewarded = true; const r = usersCache.find(x => x.uid === u.referredBy); if (r) { r.planUntil = Math.max(Date.now(), r.planUntil || 0) + 30 * DAY; extra = ` · ${r.name || r.email} got +1 month for the referral`; } }
      catch (e) { extra = " · referral reward could not be added"; }
    }
    renderUsers(); toast((until ? `${u.name || u.email} active till ${fmtDate(until)}` : "Subscription stopped") + extra, 5000);
  }
  catch (err) { b.disabled = false; toast("Could not update. Try again."); }
});

// ================= Admin: delete questions =================
let delTarget = null;   // null = all, or {cls, subject, chapter}
function openDelete(target) {
  delTarget = target;
  $("delText").textContent = target
    ? `Delete all ${current.length} questions in Class ${roman(target.cls)} · ${target.subject} · ${target.chapter}?`
    : "Delete EVERY question in the bank, in all classes and subjects?";
  $("delType").value = ""; $("delGo").disabled = true; $("delMsg").textContent = "";
  $("delBox").hidden = false; $("delType").focus();
}
$("delChapterBtn").onclick = () => {
  if (!nav.chapter) { $("delMsg").textContent = "First open the chapter from Home (subject, then chapter), then come back here."; return; }
  if (!current.length) { $("delMsg").textContent = "That chapter's questions are not loaded. Open the chapter again, then come back here."; return; }
  openDelete({ cls: nav.cls, subject: nav.subject, chapter: nav.chapter });
};
$("delAllBtn").onclick = () => openDelete(null);
$("delCancel").onclick = () => { $("delBox").hidden = true; delTarget = null; };
$("delType").addEventListener("input", () => { $("delGo").disabled = $("delType").value.trim().toUpperCase() !== "DELETE"; });
$("delGo").onclick = async () => {
  const t = delTarget, b = $("delGo"); b.disabled = true; $("delCancel").disabled = true;
  $("delMsg").textContent = "Deleting…";
  try {
    const n = await api.deleteQuestions(t, done => { $("delMsg").textContent = `Deleting… ${done} done`; });
    for (const [id, q] of [...picked]) if (!t || (q.cls === t.cls && q.subject === t.subject && q.chapter === t.chapter)) picked.delete(id);
    savePicked(); updateCounts(true);
    chapterMap = await api.chapters(); mergeChapterMap(syllabus, chapterMap); if (t) { nav.chapter = ""; current = []; } else { nav.subject = ""; nav.chapter = ""; current = []; } renderHome();
    $("delBox").hidden = true;
    $("delMsg").textContent = `${n} question${n === 1 ? "" : "s"} deleted.`; toast(`${n} questions deleted`);
  } catch (e) { $("delMsg").textContent = "Could not delete. Check your internet and try again."; b.disabled = false; }
  finally { $("delCancel").disabled = false; }
};

// ================= Small dialog (instead of the browser's confirm/prompt) =================
// ask({title, html, buttons:[{label, value, cls, word}]}) -> value of the tapped button, or null.
// A button with `word` stays disabled until that word is typed in the box.
let dlgDone = null;
function ask({ title, html = "", buttons, onOpen }) {
  if (dlgDone) dlgDone(null);
  $("dlgTitle").textContent = title; $("dlgMsg").textContent = "";
  const word = (buttons.find(b => b.word) || {}).word;
  $("dlgBody").innerHTML = html + (word ? `<label class="f">Type ${esc(word)} to confirm<input type="text" id="dlgWord" autocomplete="off" autocapitalize="characters"></label>` : "");
  $("dlgBtns").innerHTML = buttons.map((b, i) => `<button class="btn ${b.cls || ""}" data-i="${i}" ${b.word ? "disabled" : ""}>${esc(b.label)}</button>`).join("");
  $("dlgModal").hidden = false;
  if (word) $("dlgWord").addEventListener("input", () => { const ok = $("dlgWord").value.trim().toUpperCase() === word; $("dlgBtns").querySelectorAll("button").forEach((x, i) => { if (buttons[i].word) x.disabled = !ok; }); });
  if (onOpen) onOpen();
  const first = $("dlgBody").querySelector("input,select"); if (first) setTimeout(() => first.focus(), 50);
  return new Promise(res => {
    dlgDone = v => { dlgDone = null; $("dlgModal").hidden = true; res(v); };
    $("dlgBtns").onclick = e => { const b = e.target.closest("[data-i]"); if (!b) return; const btn = buttons[+b.dataset.i]; if (btn.check) { const m = btn.check(); if (m) { $("dlgMsg").textContent = m; return; } } dlgDone(btn.value); };
  });
}
$("dlgX").onclick = () => dlgDone && dlgDone(null);
$("dlgModal").addEventListener("click", e => { if (e.target.id === "dlgModal" && dlgDone) dlgDone(null); });
new MutationObserver(() => { if ($("dlgModal").hidden && dlgDone) dlgDone(null); }).observe($("dlgModal"), { attributes: true, attributeFilter: ["hidden"] });

// ================= Admin: Syllabus (subjects → chapters → concepts) =================
const sylAt = { cls: 10, subject: "", chapter: "" };     // where the admin is in the tree
const ICON = {
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  ren: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', move: '<path d="M4 12h14M13 6l6 6-6 6"/>',
  hide: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  show: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/>',
  del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
};
const ib = (act, i, label, extra = "") => `<button class="sib ${extra}" data-act="${act}" data-i="${i}" aria-label="${esc(label)}" title="${esc(label)}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[act]}</svg></button>`;
const sylLevel = () => (sylAt.chapter ? 2 : sylAt.subject ? 1 : 0);
function sylItems() {
  const { cls, subject, chapter } = sylAt;
  if (!subject) return (syllabus.s[cls] ??= []);
  const list = (syllabus.c[cls + "|" + subject] ??= []);
  if (!chapter) return list;
  const ch = findItem(list, chapter); return ch ? (ch.k ??= []) : [];
}
const LEVEL_WORD = ["subject", "chapter", "concept"];
function renderSyl() {
  const L = sylLevel(), { cls, subject, chapter } = sylAt, items = sylItems();
  $("sylTitle").textContent = L === 0 ? "Syllabus" : L === 1 ? subject : chapter;
  $("sylSub").textContent = L === 0 ? "Subjects, chapters and concepts" : L === 1 ? `Class ${roman(cls)} · chapters` : `Class ${roman(cls)} · ${subject} · concepts`;
  $("sylClass").hidden = L !== 0;
  $("sylClass").innerHTML = CLASSES.map(c => `<button role="tab" class="seg${c === cls ? " on" : ""}" aria-selected="${c === cls}" data-cls="${c}">Class ${roman(c)}</button>`).join("");
  const has = new Set(chapterMap[cls + "|" + subject] || []);
  $("sylList").innerHTML = items.length ? items.map((x, i) => {
    let meta = "";
    if (L === 0) { const chs = syllabus.c[cls + "|" + x.n] || [], q = (chapterMap[cls + "|" + x.n] || []).length; meta = `${chs.length} chapter${chs.length === 1 ? "" : "s"}${q ? ` · ${q} with questions` : ""}`; }
    if (L === 1) { const k = (x.k || []).length; meta = `${k ? k + " concept" + (k === 1 ? "" : "s") + " · " : ""}${has.has(x.n) ? "has questions" : "no questions yet"}`; }
    const open = L < 2;
    return `<div class="srow${x.h ? " hid" : ""}">
      <${open ? "button" : "div"} class="snm" ${open ? `data-open="${i}"` : ""}><span class="sn">${i + 1}</span><span class="st"><b>${esc(x.n)}</b>${meta || x.h ? `<small>${x.h ? `<em>Hidden from teachers</em>${meta ? " · " : ""}` : ""}${esc(meta)}</small>` : ""}</span>${open ? `<svg class="ic chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>` : ""}</${open ? "button" : "div"}>
      <div class="sacts">${ib("up", i, "Move up", i ? "" : "dim")}${ib("down", i, "Move down", i < items.length - 1 ? "" : "dim")}${ib("ren", i, "Rename")}${L === 1 ? ib("move", i, "Move or merge") : ""}${ib(x.h ? "show" : "hide", i, x.h ? "Show to teachers" : "Hide from teachers")}${ib("del", i, "Delete", "red")}</div>
    </div>`;
  }).join("") : `<div class="empty">No ${LEVEL_WORD[L]}s yet. Add one below.</div>`;
  $("sylAdd").innerHTML = L === 0
    ? `<h2>Add a subject</h2><label class="f">Subject name<input type="text" id="sylNew" placeholder="e.g. Science, English"></label>
       <div class="f">Add it to<div class="clsticks">${CLASSES.map(c => `<label class="check"><input type="checkbox" class="sylCls" value="${c}" ${c === cls ? "checked" : ""}> Class ${roman(c)}</label>`).join("")}</div></div>
       <div class="bar" style="margin:0"><span class="grow note" id="sylMsg"></span><button class="btn primary" id="sylAddGo">Add subject</button></div>`
    : `<h2>Add ${LEVEL_WORD[L]}s</h2><label class="f">${L === 1 ? "Chapter" : "Concept"} names, one per line<textarea id="sylNew" placeholder="${L === 1 ? "e.g. Electricity" : "e.g. Ohm's Law\nResistors in Series"}" style="min-height:80px"></textarea></label>
       <div class="bar" style="margin:0"><span class="grow note" id="sylMsg"></span><button class="btn primary" id="sylAddGo">Add</button></div>`;
  $("sylAddGo").onclick = sylAdd;
}
$("sylClass").addEventListener("click", e => { const b = e.target.closest("[data-cls]"); if (!b) return; sylAt.cls = +b.dataset.cls; renderSyl(); });
$("sylBack").onclick = () => { if (sylAt.chapter) sylAt.chapter = ""; else if (sylAt.subject) sylAt.subject = ""; else { history.back(); return; } renderSyl(); scrollTo(0, 0); };
$("sylList").addEventListener("click", e => {
  const o = e.target.closest("[data-open]");
  if (o) { const x = sylItems()[+o.dataset.open]; if (sylLevel() === 0) sylAt.subject = x.n; else sylAt.chapter = x.n; renderSyl(); scrollTo(0, 0); return; }
  const b = e.target.closest("[data-act]"); if (!b || b.classList.contains("dim")) return;
  sylAction(b.dataset.act, +b.dataset.i);
});
async function sylSave(msg) {
  try { await saveSyllabus(); if (msg) toast(msg); }
  catch (e) { toast("Could not save the syllabus. Check your internet."); }
  renderSyl(); renderHome();
}
async function sylAdd() {
  const L = sylLevel(), raw = $("sylNew").value, msg = $("sylMsg");
  const names = [...new Set(raw.split("\n").map(x => x.trim().replace(/\s+/g, " ")).filter(Boolean))];
  if (!names.length) { msg.textContent = "Type a name first."; return; }
  if (names.some(n => n.length > 120 || /[|]/.test(n))) { msg.textContent = "Names must be short and cannot contain the | sign."; return; }
  if (L === 0) {
    const classes = [...document.querySelectorAll(".sylCls:checked")].map(x => +x.value);
    if (!classes.length) { msg.textContent = "Tick at least one class."; return; }
    const added = [], skipped = [];
    for (const c of classes) { const list = (syllabus.s[c] ??= []); if (findItem(list, names[0])) skipped.push(roman(c)); else { list.push({ n: names[0] }); syllabus.c[c + "|" + names[0]] ??= []; added.push(roman(c)); } }
    if (!added.length) { msg.textContent = `${names[0]} is already in Class ${skipped.join(", ")}.`; return; }
    await sylSave(`${names[0]} added to Class ${added.join(", ")}${skipped.length ? ` (already in ${skipped.join(", ")})` : ""}`);
    return;
  }
  const list = sylItems(); let n = 0;
  for (const nm of names) if (!findItem(list, nm)) { list.push(L === 1 ? { n: nm, k: [] } : { n: nm }); n++; }
  if (!n) { msg.textContent = "Already in the list."; return; }
  await sylSave(`${n} ${LEVEL_WORD[L]}${n === 1 ? "" : "s"} added`);
}
// Filter for the questions under item x at the current level
function sylFilter(x) {
  const { cls, subject, chapter } = sylAt, L = sylLevel();
  return L === 0 ? { cls, subject: x.n } : L === 1 ? { cls, subject, chapter: x.n } : { cls, subject, chapter, concept: x.n };
}
// Keep ticked questions (on this phone) in step with renames / moves / deletes
function patchPicked(f, patch) {
  let ch = false;
  for (const [id, q] of picked) if (Object.entries(f).every(([k, v]) => q[k] === v)) {
    if (patch === null) picked.delete(id); else { for (const [k, v] of Object.entries(patch)) { if (v == null) delete q[k]; else q[k] = v; } }
    ch = true;
  }
  if (ch) { savePicked(); updateCounts(false); }
}
async function refreshChapters() { chapterMap = await api.chapters(); mergeChapterMap(syllabus, chapterMap); nav.subject = ""; nav.chapter = ""; current = []; }
async function busy(label, fn) {
  toast(label, 60000);
  try { await fn(); return true; }
  catch (e) { toast("Could not finish. Check your internet and try again."); return false; }
}
async function sylAction(act, i) {
  const L = sylLevel(), items = sylItems(), x = items[i], W = LEVEL_WORD[L], { cls, subject } = sylAt;
  if (!x) return;
  if (act === "up" || act === "down") { const j = act === "up" ? i - 1 : i + 1; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; await sylSave(); return; }
  if (act === "hide" || act === "show") { x.h = act === "hide" ? true : undefined; delete x.old; await sylSave(act === "hide" ? `${x.n} is hidden from teachers` : `${x.n} is visible to teachers`); return; }
  if (act === "ren") {
    const v = await ask({ title: `Rename ${W}`, html: `<label class="f">New name<input type="text" id="dlgName" value="${esc(x.n)}"></label>${L < 2 ? `<p class="note">Questions in this ${W} move to the new name automatically.</p>` : ""}`,
      buttons: [{ label: "Cancel", value: null }, { label: "Rename", value: "ok", cls: "primary", check: () => { const n = $("dlgName").value.trim(); if (!n) return "Type a name."; if (/[|]/.test(n)) return "The | sign is not allowed."; if (items.some(y => y !== x && sameName(y.n, n))) return "That name is already in the list."; return ""; } }] });
    if (v !== "ok") return;
    const nn = $("dlgName").value.trim().replace(/\s+/g, " "); if (nn === x.n) return;
    const f = sylFilter(x), field = ["subject", "chapter", "concept"][L];
    const ok = await busy("Renaming…", async () => {
      const n = await api.updateQuestions(f, { [field]: nn }, d => toast(`Renaming… ${d} questions updated`, 60000));
      if (L === 0) { syllabus.c[cls + "|" + nn] = syllabus.c[cls + "|" + x.n] || []; delete syllabus.c[cls + "|" + x.n]; }
      if (L < 2 && n) { const m = await api.chapters(); const k = cls + "|" + (L === 0 ? x.n : subject);
        if (L === 0) { if (m[k]) { m[cls + "|" + nn] = m[k]; delete m[k]; } }
        else m[k] = [...new Set((m[k] || []).map(c => c === x.n ? nn : c))];
        await api.setChapterMap(m); }
      patchPicked(f, { [field]: nn });
      x.n = nn; delete x.old; await saveSyllabus(); await refreshChapters();
      toast(`Renamed to ${nn}${n ? ` · ${n} question${n === 1 ? "" : "s"} updated` : ""}`);
    });
    renderSyl(); renderHome(); return;
  }
  if (act === "move") {
    const subs = subjList(cls, true).map(s => s.n);
    const chOpts = to => (syllabus.c[cls + "|" + to] || []).filter(c => !(to === subject && c === x)).map(c => c.n);
    const v = await ask({ title: "Move or merge chapter", html: `<p style="margin:0">Move <b>${esc(x.n)}</b> with its concepts and questions to:</p>
      <label class="f">Subject (Class ${roman(cls)})<select id="dlgSub">${subs.map(s => `<option ${s === subject ? "" : ""}>${esc(s)}</option>`).join("")}</select></label>
      <label class="f">Chapter<select id="dlgCh"></select></label>
      <label class="f" id="dlgConL">Put these questions under concept (optional)<input type="text" id="dlgCon" placeholder="e.g. Human Heart"></label>`,
      buttons: [{ label: "Cancel", value: null }, { label: "Move", value: "ok", cls: "primary", check: () => $("dlgSub").value === subject && !$("dlgCh").value ? "Choose another subject, or a chapter to merge into." : "" }] , onOpen: () => {
        const fill = () => { const to = $("dlgSub").value; $("dlgCh").innerHTML = `<option value="">Keep as its own chapter</option>` + chOpts(to).map(c => `<option value="${esc(c)}">Merge into: ${esc(c)}</option>`).join(""); $("dlgConL").hidden = true; };
        $("dlgSub").onchange = fill; $("dlgCh").onchange = () => { $("dlgConL").hidden = !$("dlgCh").value; };
        const other = subs.find(s => s !== subject); if (other) $("dlgSub").value = other; fill();
      } });
    if (v !== "ok") return;
    const to = $("dlgSub").value, into = $("dlgCh").value, con = into ? $("dlgCon").value.trim().replace(/\s+/g, " ") : "", f = sylFilter(x);
    const target = into || x.n;
    await busy("Moving…", async () => {
      const patch = { subject: to, chapter: target }; if (con) patch.concept = con;
      const n = await api.updateQuestions(f, patch, d => toast(`Moving… ${d} questions`, 60000));
      items.splice(items.indexOf(x), 1);
      const dest = (syllabus.c[cls + "|" + to] ??= []), there = findItem(dest, target);
      if (there) { there.k ??= []; for (const k of [...(x.k || []), ...(con ? [{ n: con }] : [])]) if (!findItem(there.k, k.n)) there.k.push(k); }
      else dest.push({ ...x, k: [...(x.k || []), ...(con && !findItem(x.k, con) ? [{ n: con }] : [])] });
      if (n) { const m = await api.chapters(), ka = cls + "|" + subject, kb = cls + "|" + to; m[ka] = (m[ka] || []).filter(c => c !== x.n); if (!m[ka].length) delete m[ka]; m[kb] = [...new Set([...(m[kb] || []), target])]; await api.setChapterMap(m); }
      patchPicked(f, patch);
      await saveSyllabus(); await refreshChapters();
      toast(`${x.n} ${into ? `merged into ${into}` : "moved"}${to !== subject ? ` (${to})` : ""}${n ? ` · ${n} question${n === 1 ? "" : "s"}` : ""}`);
    });
    renderSyl(); renderHome(); return;
  }
  if (act === "del") {
    const f = sylFilter(x); let n = 0;
    toast("Checking questions…");
    try { n = await api.countQuestions(f); } catch (e) { toast("Could not check. Check your internet."); return; }
    $("toast").hidden = true;
    const where = L === 0 ? `Class ${roman(cls)}` : L === 1 ? `${subject} (Class ${roman(cls)})` : `${sylAt.chapter}`;
    const kids = L === 0 ? (syllabus.c[cls + "|" + x.n] || []).length : L === 1 ? (x.k || []).length : 0;
    const kidTxt = kids ? ` Its ${kids} ${L === 0 ? "chapter" : "concept"}${kids === 1 ? "" : "s"} will be removed from the syllabus too.` : "";
    let choice;
    if (!n) choice = await ask({ title: `Delete ${W}?`, html: `<p style="margin:0">Delete <b>${esc(x.n)}</b> from ${esc(where)}? It has no questions.${kidTxt}</p>`,
      buttons: [{ label: "Cancel", value: null }, { label: "Delete", value: "del", cls: "dangerbtn" }] });
    else if (L === 2) choice = await ask({ title: "Delete concept?", html: `<p style="margin:0"><b>${n} question${n === 1 ? "" : "s"}</b> use the concept <b>${esc(x.n)}</b>. The questions will stay in the chapter, just without a concept.</p>`,
      buttons: [{ label: "Cancel", value: null }, { label: "Remove concept", value: "unset", cls: "dangerbtn" }] });
    else choice = await ask({ title: `Delete ${W}?`, html: `<p style="margin:0"><b>${esc(x.n)}</b> in ${esc(where)} has <b>${n} question${n === 1 ? "" : "s"}</b>.</p>
        <p class="note" style="margin:8px 0 0"><b>Hide</b> keeps the questions safe; teachers just won't see this ${W}. You can show it again any time.<br><b>Delete everything</b> removes the ${W}${kids ? `, its ${kids} ${L === 0 ? "chapters" : "concepts"}` : ""} and all ${n} questions for ever.</p>`,
      buttons: [{ label: "Cancel", value: null }, ...(x.h ? [] : [{ label: "Hide instead", value: "hide", cls: "primary" }]), { label: `Delete everything (${n})`, value: "all", cls: "dangerbtn", word: "DELETE" }] });
    if (!choice) return;
    if (choice === "hide") { x.h = true; delete x.old; await sylSave(`${x.n} is hidden from teachers`); return; }
    await busy("Deleting…", async () => {
      if (choice === "unset") { await api.updateQuestions(f, { concept: null }, d => toast(`Updating… ${d} questions`, 60000)); patchPicked(f, { concept: null }); }
      if (choice === "all") { await api.deleteQuestions(f, d => toast(`Deleting… ${d} questions`, 60000)); patchPicked(f, null); }
      items.splice(i, 1);
      if (L === 0) delete syllabus.c[cls + "|" + x.n];
      await saveSyllabus(); await refreshChapters();
      toast(`${x.n} deleted${choice === "all" ? ` with ${n} question${n === 1 ? "" : "s"}` : ""}`);
    });
    renderSyl(); renderHome();
  }
}

// ================= Equation editor =================
// Buttons put LaTeX with □ boxes into the code box; the preview shows the real equation.
// "Insert" puts $…$ into the box the teacher last tapped in the question form.
const EQ_TABS = [
  ["Basic", [["\\frac{a}{b}", "\\frac{□}{□}", "fraction"], ["x^{2}", "□^{2}", "square"], ["x^{3}", "□^{3}", "cube"], ["x^{n}", "□^{□}", "any power"], ["x_{n}", "□_{□}", "subscript"],
    ["\\sqrt{x}", "\\sqrt{□}"], ["\\sqrt[3]{x}", "\\sqrt[3]{□}"], ["\\sqrt[n]{x}", "\\sqrt[□]{□}"], ["(\;)", "\\left(□\\right)"], ["[\;]", "\\left[□\\right]"], ["|x|", "\\left|□\\right|", "modulus"],
    ["a{\\times}10^{n}", "□\\times 10^{□}", "× 10ⁿ"], ["\\theta^{\\circ}", "□^{\\circ}", "degree"], ["\\text{ab}", "\\text{□}", "words, units"]]],
  ["Calculus", [["\\int", "\\int □\\,d□", "integral"], ["\\int_{a}^{b}", "\\int_{□}^{□} □\\,d□", "with limits"], ["\\oint", "\\oint □\\,d□", "closed"], ["\\iint", "\\iint □\\,d□"],
    ["\\frac{dy}{dx}", "\\frac{d□}{d□}"], ["\\frac{d^{2}y}{dx^{2}}", "\\frac{d^{2}□}{d□^{2}}"], ["\\frac{\\partial y}{\\partial x}", "\\frac{\\partial □}{\\partial □}"], ["\\dot{x}", "\\dot{□}"], ["\\ddot{x}", "\\ddot{□}"],
    ["\\lim_{x\\to 0}", "\\lim_{□\\to □} □", "limit"], ["\\sum", "\\sum □", "sum"], ["\\sum_{i=1}^{n}", "\\sum_{□=□}^{□} □", "with limits"], ["\\Delta x", "\\Delta □"], ["\\infty", "\\infty "]]],
  ["Vectors", [["\\vec{A}", "\\vec{□}", "vector"], ["\\hat{\\imath}", "\\hat{\\imath}"], ["\\hat{\\jmath}", "\\hat{\\jmath}"], ["\\hat{k}", "\\hat{k}"], ["\\hat{A}", "\\hat{□}", "unit vector"],
    ["\\vec{A}\\cdot\\vec{B}", "\\vec{□}\\cdot\\vec{□}", "dot product"], ["\\vec{A}\\times\\vec{B}", "\\vec{□}\\times\\vec{□}", "cross product"], ["|\\vec{A}|", "\\left|\\vec{□}\\right|", "magnitude"], ["\\bar{x}", "\\bar{□}", "average"], ["\\nabla", "\\nabla "]]],
  ["Log & trig", [["\\log x", "\\log □"], ["\\ln x", "\\ln □"], ["\\log_{a}x", "\\log_{□} □"], ["e^{x}", "e^{□}", "exponential"], ["e^{-x}", "e^{-□}"],
    ["\\sin", "\\sin □"], ["\\cos", "\\cos □"], ["\\tan", "\\tan □"], ["\\cot", "\\cot □"], ["\\sec", "\\sec □"], ["\\csc", "\\csc □", "cosec"],
    ["\\sin^{-1}", "\\sin^{-1} □"], ["\\cos^{-1}", "\\cos^{-1} □"], ["\\tan^{-1}", "\\tan^{-1} □"], ["\\sin^{2}", "\\sin^{2} □"]]],
  ["Matrix", [["\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}", "\\begin{vmatrix} □ & □ \\\\ □ & □ \\end{vmatrix}", "det 2×2"],
    ["\\begin{vmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{vmatrix}", "\\begin{vmatrix} □ & □ & □ \\\\ □ & □ & □ \\\\ □ & □ & □ \\end{vmatrix}", "det 3×3"],
    ["\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}", "\\begin{bmatrix} □ & □ \\\\ □ & □ \\end{bmatrix}", "matrix 2×2"],
    ["\\begin{bmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{bmatrix}", "\\begin{bmatrix} □ & □ & □ \\\\ □ & □ & □ \\\\ □ & □ & □ \\end{bmatrix}", "matrix 3×3"],
    ["\\begin{cases}a\\\\b\\end{cases}", "\\begin{cases} □ & □ \\\\ □ & □ \\end{cases}", "cases"]]],
  ["Greek", [["\\hat{\\imath}", "\\hat{\\imath} ", "i cap"], ["\\hat{\\jmath}", "\\hat{\\jmath} ", "j cap"], ["\\hat{k}", "\\hat{k} ", "k cap"]].concat("alpha beta gamma delta epsilon eta theta lambda mu nu pi rho sigma tau phi chi psi omega kappa xi zeta Delta Omega Phi Sigma Theta Lambda Gamma Psi".split(" ").map(g => ["\\" + g, "\\" + g + " "]))],
  ["Symbols", "times cdot pm mp approx propto neq leq geq equiv sim rightarrow Rightarrow rightleftharpoons therefore because angle perp parallel hbar infty".split(" ").map(g => ["\\" + g, "\\" + g + " "]).concat([["\\%", "\\%"], ["'", "'"]])]
];
let eqTab = 0, eqField = null, eqRange = null;
const EQ_FIELDS = ["aText", "aReason", "aCase", "aO0", "aO1", "aO2", "aO3", "aAns"];
let eqLast = "aText";
EQ_FIELDS.forEach(id => $(id).addEventListener("focus", () => { eqLast = id; }));
function eqQPreview(code) {
  const f = eqField || $("aText"), v = f ? f.value : "", [a, b] = eqRange || [v.length, v.length];
  const eq = code ? `<span class="eqcur">${texHTML(code.replace(/□/g, "\\square "))}</span>` : `<span class="eqcur">&nbsp;∑&nbsp;</span>`;
  $("eqQPrev").innerHTML = (mt(v.slice(0, a)) + (a > 0 && !/\s$/.test(v.slice(0, a)) ? " " : "") + eq + " " + mt(v.slice(b))).replace(/\n/g, "<br>") || eq;
}
function eqPreview() {
  const code = $("eqCode").value.trim(); eqQPreview(code);
  if (!code) { $("eqPrev").innerHTML = `<span class="ph">Your equation appears here</span>`; return; }
  if (!window.katex) { $("eqPrev").textContent = code; return; }
  try { $("eqPrev").innerHTML = katex.renderToString(code.replace(/□/g, "\\square "), { throwOnError: false, strict: "ignore", displayMode: true }); }
  catch (e) { $("eqPrev").textContent = code; }
}
function eqPalette() {
  $("eqTabs").innerHTML = EQ_TABS.map(([n], i) => `<button type="button" role="tab" class="eqtab${i === eqTab ? " on" : ""}" data-t="${i}">${esc(n)}</button>`).join("");
  $("eqPal").innerHTML = EQ_TABS[eqTab][1].map(([lab, , note], i) => `<button type="button" class="eqk" data-k="${i}" aria-label="${esc(note || lab.replace(/\\/g, ""))}"><span>${texHTML(lab)}${note ? `<small>${esc(note)}</small>` : ""}</span></button>`).join("");
}
function eqSelectBox(from) {
  const c = $("eqCode"), v = c.value; let i = v.indexOf("□", from); if (i < 0) i = v.indexOf("□");
  c.focus(); if (i >= 0) c.setSelectionRange(i, i + 1);
}
$("eqTabs").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; eqTab = +b.dataset.t; eqPalette(); });
// keep the keyboard on the code box while tapping buttons
$("eqPal").addEventListener("pointerdown", e => { if (e.target.closest(".eqk")) e.preventDefault(); });
$("eqPal").addEventListener("click", e => {
  const b = e.target.closest("[data-k]"); if (!b) return;
  const snip = EQ_TABS[eqTab][1][+b.dataset.k][1], c = $("eqCode"), s = c.selectionStart ?? c.value.length, en = c.selectionEnd ?? s;
  c.value = c.value.slice(0, s) + snip + c.value.slice(en); eqPreview();
  if (snip.includes("□")) eqSelectBox(s); else { c.focus(); c.setSelectionRange(s + snip.length, s + snip.length); }
});
$("eqNext").addEventListener("pointerdown", e => e.preventDefault());
$("eqNext").onclick = () => eqSelectBox(($("eqCode").selectionEnd || 0));
$("eqClear").onclick = () => { $("eqCode").value = ""; eqPreview(); $("eqCode").focus(); };
$("eqCode").addEventListener("input", eqPreview);
$("eqOpen").onclick = () => {
  eqField = $(eqLast) || $("aText"); eqRange = null;
  const v = eqField.value, pos = eqField.selectionStart ?? v.length; let code = "";
  for (const m of v.matchAll(MATH_RE)) if (pos >= m.index && pos <= m.index + m[0].length) { eqRange = [m.index, m.index + m[0].length]; code = m[1]; break; }
  if (!eqRange) eqRange = [pos, eqField.selectionEnd ?? pos];
  $("eqTitle").textContent = code ? "Edit equation" : "Equation";
  $("eqCode").value = code; $("eqMsg").textContent = ""; eqPalette(); eqPreview(); $("eqModal").hidden = false;
  setTimeout(() => $("eqCode").focus(), 60);
};
$("eqX").onclick = $("eqCancel").onclick = () => { $("eqModal").hidden = true; };
$("eqInsert").onclick = () => {
  const code = $("eqCode").value.trim().replace(/\$/g, "");
  if (code.includes("□")) { $("eqMsg").textContent = "Fill every □ box, or delete the ones you don't need."; eqSelectBox(0); return; }
  const f = eqField || $("aText"), v = f.value, [a, b] = eqRange || [v.length, v.length];
  const pre = v.slice(0, a), post = v.slice(b);
  const ins = code ? (pre && !/\s$/.test(pre) ? " " : "") + "$" + code + "$" + (post && !/^[\s.,;:)]/.test(post) ? " " : "") : "";
  f.value = pre + ins + post; $("eqModal").hidden = true;
  f.focus(); const p = pre.length + ins.length; try { f.setSelectionRange(p, p); } catch (e) {}
  f.dispatchEvent(new Event("input", { bubbles: true }));
};
// Paste from Word on a computer: Word sends its equations along (OMML), so keep them as equations
function wordHtmlToText(html) {
  const eqs = [];
  html = html.replace(/<!--\[if gte msEquation 12\]>([\s\S]*?)<!\[endif\]-->/gi, (m, x) => { eqs.push(x); return `@@EQ${eqs.length - 1}@@`; })
    .replace(/<!\[if !msEquation\]>[\s\S]*?<!\[endif\]>/gi, "");
  if (!eqs.length) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("p,div,br,li,tr").forEach(el => el.insertAdjacentText(el.tagName === "BR" ? "afterend" : "beforeend", "\n"));
  let text = (doc.body.textContent || "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.replace(/@@EQ(\d+)@@/g, (m, i) => {
    try {
      const xml = new DOMParser().parseFromString(`<r xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${eqs[+i]}</r>`, "application/xml");
      const root = xml.documentElement; if (root.getElementsByTagName("parsererror").length) return "";
      const tx = [...root.children].map(ommlTex).join(" ").replace(/^(\s|\\ )+|(\s|\\ )+$/g, ""); return tx ? "$" + tx + "$" : "";
    } catch (e) { return ""; }
  });
}
EQ_FIELDS.forEach(id => $(id).addEventListener("paste", e => {
  const html = e.clipboardData && e.clipboardData.getData("text/html"); if (!html || !/msEquation/i.test(html)) return;
  const text = wordHtmlToText(html); if (text == null) return;
  e.preventDefault(); const f = e.target, a = f.selectionStart, b = f.selectionEnd;
  f.value = f.value.slice(0, a) + text + f.value.slice(b); const p = a + text.length; f.setSelectionRange(p, p);
  toast("Pasted with equations");
}));

// ================= Import from photo (admin): Gemini reads the photo =================
// The key lives in Firestore private/gemini (rules: admins only). The admin's browser calls Gemini directly.
let phCfg = null;
const PH_TYPES = ["MCQ", "MCQJ", "FB", "TF", "AR", "GR", "NUM", "M1", "VSA", "SA", "PR", "CS", "LA"];
const PH_PROMPT = `You read photos or screenshots of exam questions (Physics, Chemistry, Maths, Biology; CBSE, JEE, NEET) and return every question you see, exactly as printed.
Rules:
- Copy the wording exactly. Write ALL mathematics (symbols, variables, units with powers, fractions, roots, vectors, integrals, sums, limits, matrices, chemical formulas with subscripts) as LaTeX inside single dollar signs, e.g. $\\frac{x}{10}$, $X_{L}=70\\,\\Omega$, $\\vec{F}$, $\\hat{\\imath}$, $\\int_{0}^{1} x^{2}\\,dx$, $\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}$. Plain words stay outside the dollar signs.
- Ignore website or app parts that are not the question: buttons, "Show answer", "Your answer", "Tap an option", menus, adverts, question-number badges.
- type: MCQ (4 options), MCQJ (4 options and the source is JEE or NEET), FB (fill in the blank, no options), TF (true/false), AR (assertion and reason), GR (give reason), NUM (numerical answer, no options, JEE style), M1/VSA/SA/LA (written answer of 1/2/3/5 marks), PR (prove/show that), CS (case study with a passage).
- options: the option texts only, without "(a)", "A." labels, in order.
- For AR: "text" is the Assertion only and "reason" is the Reason; options can be empty.
- For CS: "passage" is the passage, "text" the sub-questions one per line.
- source: exam and year if printed, e.g. "JEE Main 2023" or "NEET 2021". topic: the topic or concept tag if printed.
- answer: only if the answer is printed in the photo (MCQ/AR: the letter a, b, c or d; TF: True or False; otherwise the answer text). SOLVE_RULE
- figure_box: if the question has a diagram or figure, its box in the photo as [ymin, xmin, ymax, xmax] on a 0-1000 scale; otherwise an empty list.
- If no question is visible, return an empty list.`;
const PH_SCHEMA = { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "OBJECT", properties: {
  type: { type: "STRING", enum: PH_TYPES }, text: { type: "STRING" }, reason: { type: "STRING" }, passage: { type: "STRING" },
  options: { type: "ARRAY", items: { type: "STRING" } }, answer: { type: "STRING" }, answer_by_ai: { type: "BOOLEAN" },
  source: { type: "STRING" }, topic: { type: "STRING" }, marks: { type: "INTEGER" }, figure_box: { type: "ARRAY", items: { type: "INTEGER" } } },
  required: ["type", "text"] } } }, required: ["questions"] };
async function phLoadCfg() { if (phCfg) return phCfg; try { phCfg = (await api.getPrivate("gemini")) || {}; } catch (e) { phCfg = {}; } return phCfg; }
function phShow() { const has = !!(phCfg && phCfg.key); $("phKeyBox").hidden = has; $("phMain").hidden = !has; if (!has) { $("phKey").value = ""; $("phModel").value = (phCfg && phCfg.model) || ""; } }
$("phOpen").onclick = async () => { $("phModal").hidden = false; $("phStat").textContent = "Loading…"; $("phKeyBox").hidden = true; $("phMain").hidden = true; await phLoadCfg(); $("phStat").textContent = ""; phShow(); };
$("phX").onclick = () => { $("phModal").hidden = true; };
$("phKeyEdit").onclick = () => { $("phKeyBox").hidden = false; $("phMain").hidden = true; $("phKey").value = ""; $("phModel").value = phCfg.model || ""; };
$("phKeySave").onclick = async () => {
  const key = $("phKey").value.trim(), model = phModelName($("phModel").value) || "";
  if (!key && !(phCfg && phCfg.key)) { $("phStat").textContent = "Paste the API key first."; return; }
  $("phStat").textContent = "Saving…";
  try { phCfg = { key: key || phCfg.key, model }; await api.setPrivate("gemini", phCfg); $("phStat").textContent = "Saved. Now choose photos."; phShow(); }
  catch (e) { $("phStat").textContent = "Could not save. Publish the new Firebase rules first (see the update steps)."; }
};
// photo -> JPEG (max 2000 px) for Gemini; keeps the canvas for cutting out diagrams
function phPrepare(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res({ canvas: c, b64: c.toDataURL("image/jpeg", 0.9).split(",")[1] }); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("badimage")); }; img.src = url;
  });
}
function phCrop(canvas, box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  let [y0, x0, y1, x1] = box.map(v => Math.max(0, Math.min(1000, +v || 0)));
  if (y1 - y0 < 20 || x1 - x0 < 20) return null;
  const W = canvas.width, H = canvas.height, pad = 0.015;
  const sx = Math.max(0, (x0 / 1000 - pad) * W), sy = Math.max(0, (y0 / 1000 - pad) * H), ex = Math.min(W, (x1 / 1000 + pad) * W), ey = Math.min(H, (y1 / 1000 + pad) * H);
  const k = Math.min(1, 900 / Math.max(ex - sx, ey - sy)), c = document.createElement("canvas"); c.width = Math.round((ex - sx) * k); c.height = Math.round((ey - sy) * k);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, sx, sy, ex - sx, ey - sy, 0, 0, c.width, c.height);
  return { src: c.toDataURL("image/jpeg", 0.88), ar: c.width / c.height };
}
// clean what was typed in the model box: "models/gemini-x" or spaces -> "gemini-x"
const phModelName = m => { m = String(m || "").trim().replace(/^.*models\//, "").replace(/\s+/g, "-").toLowerCase(); return /^[a-z0-9][a-z0-9.\-]*$/.test(m) ? m : ""; };
// ask Google which models this key can use, and pick the newest normal Flash model
async function phPickModel() {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(phCfg.key)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || r.statusText); e.status = r.status; throw e; }
  const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => m.name.replace(/^models\//, "")).filter(n => /^gemini/.test(n) && !/(tts|image|audio|live|embed|robotics|computer|thinking-exp|learnlm|nano)/.test(n));
  const ver = n => +((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const score = n => (/flash/.test(n) ? 1000 : 0) + (/lite/.test(n) ? -300 : 0) + (/preview|exp/.test(n) ? -50 : 0) + (/latest/.test(n) ? -20 : 0) + ver(n) * 10;
  ok.sort((a, b) => score(b) - score(a));
  if (!ok.length) throw new Error("No Gemini model is available for this key.");
  return ok[0];
}
async function phAsk(b64, solve, retried) {
  if (!phModelName(phCfg.model)) { phCfg = { ...phCfg, model: await phPickModel() }; try { await api.setPrivate("gemini", phCfg); } catch (e) {} }
  const prompt = PH_PROMPT.replace("SOLVE_RULE", solve ? "If the answer is not printed, solve the question carefully and give your answer with answer_by_ai = true." : "If it is not printed, leave answer empty.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(phModelName(phCfg.model) || "gemini-flash-latest")}:generateContent?key=${encodeURIComponent(phCfg.key)}`;
  const body = { contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: b64 } }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: PH_SCHEMA } };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  // wrong / old model name -> find a working model once, save it, try again
  if (!r.ok && !retried && (r.status === 404 || (r.status === 400 && /model/i.test((j.error && j.error.message) || "")))) {
    const m = await phPickModel(); phCfg = { ...phCfg, model: m }; try { await api.setPrivate("gemini", phCfg); } catch (e) {}
    return phAsk(b64, solve, true);
  }
  if (!r.ok) { const m = (j.error && j.error.message) || r.statusText; const e = new Error(m); e.status = r.status; throw e; }
  const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || "").join("") || "";
  const data = JSON.parse(txt || "{}"); return Array.isArray(data.questions) ? data.questions : [];
}
// one Gemini question -> the same shape the Word review screen uses
function phToReview(g, canvas, n) {
  let type = PH_TYPES.includes(g.type) ? g.type : "VSA";
  const opts = (g.options || []).map(o => String(o || "").replace(/^\s*\(?[a-dA-D1-4][).:]\s*/, "").trim()).filter(Boolean);
  if (isMCQ(type) && opts.length < 2) type = "NUM";
  let src = parseSources(g.source || ""); if (isMCQ(type)) type = src.some(x => /^(JEE|NEET)/.test(x.s)) ? "MCQJ" : type === "MCQJ" && !src.length ? "MCQJ" : type;
  let ans = String(g.answer || "").trim(); const issues = [];
  if (isMCQ(type) || type === "AR") { const l = ans.match(/^\(?([a-dA-D])\)?(\W|$)/); ans = l ? l[1].toLowerCase() : ""; if (!ans) issues.push("no answer found"); }
  if (type === "TF") ans = tfAns(ans);
  if (isMCQ(type)) { while (opts.length < 4) opts.push(""); if (opts.slice(0, 4).some(o => !o)) issues.push("fewer than 4 options"); }
  if (ans && g.answer_by_ai) issues.push("answer worked out by AI – check it");
  return { n, type, type0: type, text: String(g.text || "").trim(), opts: isMCQ(type) ? opts.slice(0, 4) : [], reason: String(g.reason || "").trim(), passage: String(g.passage || "").trim(),
    ans, img: phCrop(canvas, g.figure_box), issues, use: !!String(g.text || "").trim(), src, marks: +g.marks || DEF_MARKS[type], topic: String(g.topic || "").trim() };
}
$("phFiles").addEventListener("change", async e => {
  const files = [...(e.target.files || [])]; setTimeout(() => { e.target.value = ""; }, 0); if (!files.length) return;
  const solve = $("phSuggest").checked, all = []; let fail = 0, lastErr = "";
  const btn = e.target.closest(".filebtn"); btn && btn.classList.add("busy"); e.target.disabled = true;
  for (let i = 0; i < files.length; i++) {
    $("phStat").textContent = `Reading photo ${i + 1} of ${files.length}… (this can take up to a minute)`;
    try { const p = await phPrepare(files[i]); const qs = await phAsk(p.b64, solve); qs.forEach(g => all.push(phToReview(g, p.canvas, all.length + 1))); }
    catch (err) { fail++; lastErr = err.status === 400 && /key/i.test(err.message) ? "The API key is not valid. Tap “Change API key”." : err.status === 429 ? "Gemini's free limit is used up for now. Try again later." : err.status === 404 || /model/i.test(err.message || "") ? "Gemini model problem: " + err.message + " Tap “Change API key / model” and leave the model box empty." : err.message === "badimage" ? "A photo could not be opened." : "Could not reach Gemini. Check your internet. (" + (err.message || "error") + ")"; }
  }
  btn && btn.classList.remove("busy"); e.target.disabled = false;
  if (!all.length) { $("phStat").textContent = (fail ? lastErr : "No questions were found in the photo(s).") ; return; }
  $("phStat").textContent = fail ? `${fail} photo(s) could not be read. ${lastErr}` : "";
  // hand over to the Word import review screen
  const topic = (all.find(q => q.topic) || {}).topic || "";
  wdData = { meta: { concept: topic }, qs: all };
  $("phModal").hidden = true; $("wdTitle").textContent = "Import from photo";
  $("wdModal").hidden = false; $("wdStart").hidden = true; $("wdReview").hidden = false; $("wdMsg").textContent = fail ? `${fail} photo(s) could not be read.` : "";
  $("wdCls").value = String(nav.cls || 10); $("wdChapterNew").value = ""; $("wdConceptNew").value = "";
  wdFill(0, { subject: nav.subject, chapter: nav.chapter || "", concept: topic }); wdRender();
});

// ================= Admin: bring old questions to the new types =================
// 4-mark MCQ -> MCQ JEE/NEET, "Proof" tag -> Proof type, 2-mark Short Answer -> 2 Marker
const UPGRADES = [
  { f: { type: "MCQ", marks: 4 }, patch: { type: "MCQJ" }, label: "4-mark MCQ → MCQ – JEE/NEET" },
  { f: { proof: true }, patch: { type: "PR", proof: null }, label: "Tagged “Proof” → Proof" },
  { f: { type: "SA", marks: 2 }, patch: { type: "VSA" }, label: "2-mark Short Answer → 2 Marker" }
];
$("vsaBtn").onclick = async () => {
  toast("Checking questions…"); let counts;
  try { counts = await Promise.all(UPGRADES.map(u => api.countQuestions(u.f))); } catch (e) { toast("Could not check. Check your internet."); return; }
  $("toast").hidden = true;
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) { await ask({ title: "Nothing to update", html: `<p style="margin:0">All questions already use the new types.</p>`, buttons: [{ label: "OK", value: null, cls: "primary" }] }); return; }
  const v = await ask({ title: "Update old questions?", html: `<p style="margin:0">These questions will move to the new types. Nothing else changes.</p><ul style="margin:8px 0 0;padding-left:20px">${UPGRADES.map((u, i) => counts[i] ? `<li><b>${counts[i]}</b> × ${esc(u.label)}</li>` : "").join("")}</ul>`,
    buttons: [{ label: "Cancel", value: null }, { label: `Update ${total}`, value: "ok", cls: "primary" }] });
  if (v !== "ok") return;
  await busy("Updating…", async () => {
    let done = 0;
    for (let i = 0; i < UPGRADES.length; i++) if (counts[i]) {
      const u = UPGRADES[i]; done += await api.updateQuestions(u.f, u.patch, d => toast(`Updating… ${done + d} questions`, 60000));
      patchPicked(u.f, u.patch);
      current = current.map(q => Object.entries(u.f).every(([k, val]) => (k === "marks" ? +q[k] : q[k]) === val) ? Object.fromEntries(Object.entries({ ...q, ...u.patch }).filter(([, x]) => x != null)) : q);
    }
    toast(`${done} question${done === 1 ? "" : "s"} updated to the new types`);
  });
  if (nav.chapter) renderList();
};

// ================= Admin: sample questions =================
$("seedBtn").onclick = async () => {
  const b = $("seedBtn");
  if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = `Tap again to add ${SAMPLE.length} sample questions`; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Load sample questions"; }, 5000); return; }
  b.dataset.armed = ""; b.disabled = true; b.textContent = "Adding…";
  try { const n = await saveToBank(SAMPLE.map(q => ({ ...q }))); toast(`${n} sample questions added`); $("adminMsg").textContent = `${n} sample questions added. Open the Questions tab to see them.`; }
  catch (e) { toast("Could not add sample questions: " + (e.message || "try again")); }
  finally { b.disabled = false; b.textContent = "Load sample questions"; }
};

// ================= PDF =================
async function makePdf() {
  await ensureFonts(); await loadPickedImages();
  const pages = build(); if (!pages.length) { toast("Tick at least one question first"); return null; }
  if (!window.jspdf || !window.html2canvas) { toast("PDF tools are not loaded yet. Open the app once with internet."); return null; }
  const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: "mm", format: "a4" });
  for (let i = 0; i < pages.length; i++) {
    const c = await html2canvas(pages[i], { scale: 2.2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    if (i) pdf.addPage();
    pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
  }
  const name = `${(settings.topic || "worksheet").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "worksheet"}_worksheet.pdf`;
  return { pdf, name, blob: pdf.output("blob") };
}
async function withBusy(btn, label, fn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = label;
  try { await fn(); } catch (e) { if (e && e.name !== "AbortError") toast("Could not make the PDF. Try again."); }
  finally { btn.textContent = old; btn.disabled = false; updateCounts(false); }
}
const canShareFiles = !!BRIDGE || (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "t.pdf", { type: "application/pdf" })] })); } catch (e) { return false; } })();
$("sharePdf").hidden = !canShareFiles;

// ================= PowerPoint slides =================
// Slide: 13.333 x 7.5 in. Black header + gold line, dark green body, black footer.
// The question sits in the right 30% (left 70% stays empty for the teacher).
// Too long? Try 50% width; still too long? Continue on the next slide.
const PPT = { W: 13.333, H: 7.5, HDR: 0.7, FTR: 0.55, GREEN: "14532D", BLACK: "0B0B0B", GOLD: "F4AE22", WHITE: "FFFFFF", PASSAGE: "DCEFE2" };
const BODY_TOP = PPT.HDR + 0.04 + 0.25, BODY_BOTTOM = PPT.H - PPT.FTR - 0.2, BODY_H = BODY_BOTTOM - BODY_TOP, RIGHT_PAD = 0.32;
let mctxP;
function measureIn(text, pt, bold) {
  if (!mctxP) mctxP = document.createElement("canvas").getContext("2d");
  mctxP.font = `${bold ? "700 " : ""}${pt}pt Carlito, Calibri, Arial, sans-serif`;
  return mctxP.measureText(text).width / 96;           // canvas px at 96 per inch
}
function wrapLines(text, pt, widthIn) {
  const out = [];
  for (const para of String(text || "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean); let line = "";
    if (!words.length) { out.push(""); continue; }
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (measureIn(t, pt) <= widthIn * 0.97 || !line) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}
const lineH = pt => pt * 1.32 / 72;
async function toPng(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round((img.naturalWidth || 600) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || 400) * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res({ data: c.toDataURL("image/png").replace(/^data:/, ""), ar: c.width / c.height });
    };
    img.onerror = () => res(null); img.src = src;
  });
}
// A question as a list of blocks. Text blocks carry their own indent; options may sit two per row.
function pptBlocks(q, n, imgPng) {
  const B = [];
  const T = (text, o = {}) => B.push({ k: "text", text, ...o });
  if (q.type === "AR") { T(q.text, { label: `Q${n}`, pre: "Assertion (A): " }); T(q.reason || "", { pre: "Reason (R): " }); }
  else if (q.type === "CS") { T("Read the passage and answer the questions that follow.", { label: `Q${n}` }); T(q.case || "", { passage: true }); }
  else T(q.text + (q.type === "TF" ? " (True / False)" : ""), { label: `Q${n}` });
  if (imgPng) B.push({ k: "img", pct: effW(q), ...imgPng });
  if (q.type === "CS") (q.text || "").split("\n").filter(Boolean).forEach(t => T(t));
  if (isMCQ(q.type) || q.type === "AR") {
    const opts = q.type === "AR" ? AR_OPTS : (q.opts || []);
    opts.forEach((o, i) => B.push({ k: "opt", label: "abcd"[i] + ")", text: o || "", optIndex: i, optCount: opts.length, all: opts }));
  }
  // source & year: last line, right side, bold gold
  if (settings.srcOn && srcText(q)) B.push({ k: "src", text: `[${srcText(q)}]` });
  return B;
}
// Lay blocks out in a column of width w at font pt. Returns pages of placed pieces.
function layoutBlocks(blocks, w, pt, allowSplit) {
  const IND = ringD(pt) + 0.14, GAP = 0.13, OIND = IND, LAB = 0.4 * pt / 24;
  const pages = [[]]; let y = 0;
  const newPage = () => { pages.push([]); y = 0; };
  const room = () => BODY_H - y;
  const optsTwo = blocks.filter(b => b.k === "opt");
  const optMath = optsTwo.some(b => hasMath(b.text));
  const two = !optMath && optsTwo.length === 4 && optsTwo.every(b => measureIn(b.text, pt) <= (w - OIND) / 2 - LAB - 0.15);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "img") {
      let iw = Math.max(0.6, (w - IND) * (b.pct || 70) / 100), ih = iw / b.ar;   // same % of the column as on the worksheet
      const maxH = Math.min(2.3, BODY_H * 0.45); if (ih > maxH) { ih = maxH; iw = ih * b.ar; }
      if (ih > room()) { if (!allowSplit) return null; newPage(); }
      pages[pages.length - 1].push({ k: "img", x: IND, y, w: iw, h: ih, data: b.data }); y += ih + GAP; continue;
    }
    if (b.k === "src") {
      const lines = wrapLines(b.text, pt, w - IND), hh = lines.length * lineH(pt);
      if (hh > room()) { if (!allowSplit) return null; newPage(); }
      pages[pages.length - 1].push({ k: "src", x: IND, y: y + 0.02, w: w - IND, h: hh, lines }); y += hh + GAP; continue;
    }
    if (b.k === "opt" && optMath) {                             // options with equations: one per line, drawn as pictures
      const html = pmHTML(b.text), hh = Math.max(lineH(pt), mathHeight(html, w - OIND - LAB, pt));
      if (hh > room()) { if (!allowSplit) return null; newPage(); }
      pages[pages.length - 1].push({ k: "mopt", x: OIND, y, w: w - OIND, lab: LAB, label: b.label, html, text: b.text, h: hh }); y += hh + GAP * 0.6; continue;
    }
    if (b.k === "text" && hasMath(b.text)) {                    // text with an equation: one picture, kept together
      const tw = w - IND - (b.passage ? 0.16 : 0), html = pmHTML(b.text, b.pre), hh = mathHeight(html, tw, pt);
      if (hh > room() && (!allowSplit || y > 0)) { if (!allowSplit) return null; newPage(); }
      pages[pages.length - 1].push({ k: "mtext", x: IND, y, w: w - IND, h: hh, html, text: b.text, pre: b.pre || "", label: b.label || null, passage: !!b.passage, last: true }); y += hh + GAP; continue;
    }
    if (b.k === "opt") {
      if (two) {
        if (b.optIndex % 2) continue;                          // second of the pair is drawn with the first
        const pair = [b, blocks[i + 1]];
        const cw = (w - OIND) / 2;
        const hh = Math.max(...pair.map(p => wrapLines(p.text, pt, cw - LAB - 0.1).length)) * lineH(pt);
        if (hh > room()) { if (!allowSplit) return null; newPage(); }
        pair.forEach((p, j) => pages[pages.length - 1].push({ k: "opt", x: OIND + j * cw, y, w: cw - 0.1, lab: LAB, label: p.label, lines: wrapLines(p.text, pt, cw - LAB - 0.1) }));
        y += hh + GAP * 0.6; continue;
      }
      const lines = wrapLines(b.text, pt, w - OIND - LAB);
      const hh = lines.length * lineH(pt);
      if (hh > room()) { if (!allowSplit) return null; newPage(); }
      pages[pages.length - 1].push({ k: "opt", x: OIND, y, w: w - OIND, lab: LAB, label: b.label, lines }); y += hh + GAP * 0.6; continue;
    }
    // text
    const tw = w - IND - (b.passage ? 0.16 : 0);
    let lines = wrapLines((b.pre || "") + b.text, pt, tw);
    let first = true;
    while (lines.length) {
      const fit = Math.floor((room() + 0.01) / lineH(pt));
      if (fit < 1 || (fit < lines.length && fit < 2)) { if (!allowSplit) return null; newPage(); continue; }
      if (fit < lines.length && !allowSplit) return null;
      const take = lines.slice(0, fit); lines = lines.slice(fit);
      const hh = take.length * lineH(pt);
      pages[pages.length - 1].push({ k: "text", x: IND, y, w: w - IND, h: hh, lines: take, label: first ? b.label : null, pre: first ? b.pre : null, passage: !!b.passage, last: !lines.length, tag: b.tag || "" });
      y += hh + GAP; first = false;
      if (lines.length) newPage();
    }
  }
  return pages.filter(p => p.length);
}
// Lines with an equation are drawn as a picture on the slide (PowerPoint can't show LaTeX).
// They are measured with the same font and width, so the layout stays right.
let pmBox = null; const pmH = new Map();
function pmEl(html, wIn, pt, color) {
  if (!pmBox) { pmBox = document.createElement("div"); pmBox.style.cssText = "position:absolute;left:-20000px;top:0;font-family:Carlito,Calibri,Arial,sans-serif;line-height:1.32;text-align:justify;pointer-events:none"; document.body.appendChild(pmBox); }
  pmBox.style.width = (wIn * 96) + "px"; pmBox.style.fontSize = (pt * 96 / 72) + "px"; pmBox.style.color = color || "#FFFFFF"; pmBox.innerHTML = html;
  return pmBox;
}
function mathHeight(html, wIn, pt) {
  const k = wIn.toFixed(3) + "|" + pt + "|" + html;
  if (!pmH.has(k)) pmH.set(k, pmEl(html, wIn, pt).offsetHeight / 96);
  return pmH.get(k);
}
async function mathPng(html, wIn, pt, color) {
  try {
    const el = pmEl(html, wIn, pt, color);
    const c = await html2canvas(el, { backgroundColor: null, scale: 3, logging: false });
    return c.toDataURL("image/png");
  } catch (e) { return null; }          // caller falls back to plain text
}
const pmHTML = (text, pre) => (pre ? `<b style="color:#F4AE22">${esc(pre)}</b>` : "") + mt(text).replace(/\n/g, "<br>");
// Gold ring around "Q12": diameter grows a little with the font size
const ringD = pt => Math.max(0.5, lineH(pt) * 1.18);
function fitQuestion(blocks) {
  const W = PPT.W;
  for (const pt of [24, 22, 20, 18]) { const p = layoutBlocks(blocks, W * 0.30 - RIGHT_PAD, pt, false); if (p && p.length === 1) return { pages: p, pt, w: W * 0.30 - RIGHT_PAD }; }
  for (const pt of [22, 20, 18]) { const p = layoutBlocks(blocks, W * 0.50 - RIGHT_PAD, pt, false); if (p && p.length === 1) return { pages: p, pt, w: W * 0.50 - RIGHT_PAD }; }
  return { pages: layoutBlocks(blocks, W * 0.30 - RIGHT_PAD, 20, true), pt: 20, w: W * 0.30 - RIGHT_PAD };
}
function pptChrome(pptx, slide, title, right, logo) {
  slide.background = { color: PPT.GREEN };
  slide.addShape("rect", { x: 0, y: 0, w: PPT.W, h: PPT.HDR, fill: { color: PPT.BLACK }, line: { color: PPT.BLACK } });
  slide.addShape("rect", { x: 0, y: PPT.HDR, w: PPT.W, h: 0.04, fill: { color: PPT.GOLD }, line: { color: PPT.GOLD } });
  let tx = 0.35;
  if (logo) {
    const ly = (PPT.HDR - 0.71) / 2 + 0.02;      // same size as before; bar is thinner, so it sits like a badge
    slide.addShape("ellipse", { x: 0.3, y: ly, w: 0.71, h: 0.71, fill: { color: PPT.WHITE }, line: { color: PPT.GOLD, width: 2.25 } });
    const lw = 0.5, lh = lw / Math.max(logo.ar, 1), lw2 = lh * logo.ar;
    slide.addImage({ data: logo.data, x: 0.3 + (0.71 - lw2) / 2, y: ly + (0.71 - lh) / 2, w: lw2, h: lh });
    tx = 1.2;
  }
  slide.addText(title || "", { x: tx, y: 0, w: PPT.W - tx - 2.6, h: PPT.HDR, fontFace: "Calibri", fontSize: 26, bold: true, color: PPT.WHITE, valign: "middle", margin: 0, fit: "shrink" });
  slide.addText(right || "", { x: PPT.W - 2.5, y: 0, w: 2.2, h: PPT.HDR, fontFace: "Calibri", fontSize: 16, bold: true, color: PPT.GOLD, align: "right", valign: "middle", margin: 0 });
  const fy = PPT.H - PPT.FTR;
  slide.addShape("rect", { x: 0, y: fy, w: PPT.W, h: PPT.FTR, fill: { color: PPT.BLACK }, line: { color: PPT.BLACK } });
  const f = { y: fy, h: PPT.FTR, fontFace: "Calibri", fontSize: 14, color: "E8E8E8", valign: "middle", margin: 0 };
  slide.addText(settings.teacher || profile.name || "", { ...f, x: 0.35, w: 4.2 });
  slide.addText(settings.academy || "", { ...f, x: 4.6, w: 4.1, align: "center", bold: true, color: PPT.GOLD });
  slide.addText(settings.phone ? "Ph: " + settings.phone : "", { ...f, x: PPT.W - 4.55, w: 4.2, align: "right" });
}
const clsText = () => String(settings.cls || "").replace(/\s*_\s*/g, " · ");
async function makePpt(opts) {
  await loadPickedImages(); await ensureFonts();
  const qs0 = [...picked.values()];
  if (!qs0.length) { toast("Tick at least one question first"); return null; }
  if (!window.PptxGenJS) { toast("PowerPoint tools did not load. Check your internet and reload."); return null; }
  const qs = settings.group ? wsSort(qs0) : qs0;
  const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE";
  pptx.author = settings.teacher || ""; pptx.company = settings.academy || ""; pptx.title = settings.topic || "Worksheet";
  const logo = settings.logo ? await toPng(settings.logo) : null;
  const N = qs.length;
  const chapters = [...new Set(qs.map(q => q.chapter))];
  if (opts.title) {
    const s = pptx.addSlide(); pptChrome(pptx, s, settings.academy || APP.name, clsText(), logo);
    let y = 1.5;
    if (logo) { s.addShape("ellipse", { x: PPT.W / 2 - 1, y: 1.35, w: 2, h: 2, fill: { color: PPT.WHITE }, line: { color: PPT.GOLD, width: 4 } }); const bw = 1.34, bh = bw / Math.max(logo.ar, 1), bw2 = bh * logo.ar; s.addImage({ data: logo.data, x: PPT.W / 2 - bw2 / 2, y: 2.35 - bh / 2, w: bw2, h: bh }); y = 3.55; }
    s.addText(settings.academy || APP.name, { x: 0.5, y, w: PPT.W - 1, h: 0.8, fontFace: "Calibri", fontSize: 40, bold: true, color: PPT.WHITE, align: "center", margin: 0, fit: "shrink" });
    s.addText(settings.topic || chapters.join(" · "), { x: 0.8, y: y + 0.85, w: PPT.W - 1.6, h: 0.6, fontFace: "Calibri", fontSize: 26, bold: true, color: PPT.GOLD, align: "center", margin: 0, fit: "shrink" });
    s.addText(`${settings.cls ? clsText() + " · " : ""}${N} question${N === 1 ? "" : "s"}`, { x: 0.8, y: y + 1.5, w: PPT.W - 1.6, h: 0.5, fontFace: "Calibri", fontSize: 20, color: "E8E8E8", align: "center", margin: 0 });
    if (settings.tp) { const v = tpVals(); s.addText(`Time: ${v.time}     ·     M.M.: ${v.mm}`, { x: 0.8, y: y + 2.05, w: PPT.W - 1.6, h: 0.5, fontFace: "Calibri", fontSize: 22, bold: true, color: PPT.GOLD, align: "center", margin: 0 }); }
  }
  for (let i = 0; i < N; i++) {
    const q = qs[i], n = i + 1;
    const img = q.img || (q.hasImg ? imgCache[q.id] : null);
    const png = img ? await toPng(img) : null;
    const { pages, pt, w } = fitQuestion(pptBlocks(q, n, png));
    const x0 = PPT.W - RIGHT_PAD - w;
    for (let pi = 0; pi < pages.length; pi++) {
      const items = pages[pi];
      const s = pptx.addSlide();
      pptChrome(pptx, s, q.concept || q.chapter, `${settings.group ? "Sec " + secLetter(secOf(q), qs) + " · " : ""}Q ${n}${pi ? " (cont.)" : ""} / ${N}`, logo);
      for (const it of items) {
        const x = x0 + it.x, y = BODY_TOP + it.y;
        if (it.k === "img") { s.addImage({ data: it.data, x, y, w: it.w, h: it.h }); continue; }
        if (it.k === "src") { s.addText(it.lines.join(" "), { x, y, w: it.w, h: it.h, fontFace: "Calibri", fontSize: pt, bold: true, color: PPT.GOLD, align: "right", valign: "top", margin: 0 }); continue; }
        if (it.k === "mopt") {
          s.addText(it.label, { x, y, w: it.lab, h: lineH(pt), fontFace: "Calibri", fontSize: pt, bold: true, color: PPT.GOLD, valign: "top", margin: 0 });
          const pic = await mathPng(it.html, it.w - it.lab, pt, "#FFFFFF");
          if (pic) s.addImage({ data: pic, x: x + it.lab, y, w: it.w - it.lab, h: it.h });
          else s.addText(plain(it.text), { x: x + it.lab, y, w: it.w - it.lab, h: it.h, fontFace: "Calibri", fontSize: pt, color: PPT.WHITE, valign: "top", margin: 0 });
          continue;
        }
        if (it.k === "opt") {
          s.addText(it.label, { x, y, w: it.lab, h: it.lines.length * lineH(pt), fontFace: "Calibri", fontSize: pt, bold: true, color: PPT.GOLD, valign: "top", margin: 0 });
          s.addText(it.lines.join(" "), { x: x + it.lab, y, w: it.w - it.lab, h: it.lines.length * lineH(pt), fontFace: "Calibri", fontSize: pt, color: PPT.WHITE, align: "justify", valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
          continue;
        }
        if (it.label) {
          const d = ringD(pt), ry = y + lineH(pt) / 2 - d / 2 + 0.02;
          s.addShape("ellipse", { x: x0, y: ry, w: d, h: d, fill: { type: "none" }, line: { color: PPT.GOLD, width: 2.25 } });
          s.addText(it.label, { x: x0 - 0.05, y: ry, w: d + 0.1, h: d, fontFace: "Calibri", fontSize: Math.round(pt * (it.label.length > 3 ? 0.56 : 0.66)), bold: true, color: PPT.GOLD, align: "center", valign: "middle", margin: 0 });
        }
        if (it.k === "mtext") {
          const tw = it.passage ? it.w - 0.16 : it.w;
          if (it.passage) s.addShape("rect", { x, y, w: 0.05, h: it.h, fill: { color: PPT.GOLD }, line: { color: PPT.GOLD } });
          const pic = await mathPng(it.html, tw, pt, it.passage ? "#DCEFE2" : "#FFFFFF");
          if (pic) s.addImage({ data: pic, x: it.passage ? x + 0.16 : x, y, w: tw, h: it.h });
          else s.addText(plain((it.pre || "") + it.text), { x: it.passage ? x + 0.16 : x, y, w: tw, h: it.h, fontFace: "Calibri", fontSize: pt, color: it.passage ? PPT.PASSAGE : PPT.WHITE, align: "justify", valign: "top", margin: 0 });
          continue;
        }
        let body = it.lines.join(" "); const runs = [];
        if (it.pre && body.startsWith(it.pre)) { runs.push({ text: it.pre, options: { bold: true, color: PPT.GOLD } }); body = body.slice(it.pre.length); }
        runs.push({ text: body, options: {} });
        if (it.passage) s.addShape("rect", { x, y, w: 0.05, h: it.h, fill: { color: PPT.GOLD }, line: { color: PPT.GOLD } });
        s.addText(runs, { x: it.passage ? x + 0.16 : x, y, w: it.passage ? it.w - 0.16 : it.w, h: it.h, fontFace: "Calibri", fontSize: pt, color: it.passage ? PPT.PASSAGE : PPT.WHITE, align: "justify", valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
        if (!it.last && pages.length > 1 && it === items[items.length - 1]) s.addText("Continued on next slide →", { x, y: BODY_BOTTOM - 0.3, w: it.w, h: 0.3, fontFace: "Calibri", fontSize: 13, bold: true, color: PPT.GOLD, margin: 0 });
      }
      if (pi < pages.length - 1 && !items.some(it => it.k === "text" && !it.last)) s.addText("Continued on next slide →", { x: x0, y: BODY_BOTTOM - 0.3, w, h: 0.3, fontFace: "Calibri", fontSize: 13, bold: true, color: PPT.GOLD, margin: 0 });
    }
  }
  if (opts.key) {
    const all = qs.map((q, i) => ({ n: i + 1, q })).filter(x => !isProof(x.q));   // proving questions have no key entry
    const keyed = all.filter(x => KEY_TABLE.has(x.q.type)), written = all.filter(x => !KEY_TABLE.has(x.q.type));
    if (keyed.length) {
      const mx = Math.max(0, ...keyed.map(x => plain(keyAns(x.q)).length)), per = mx <= 2 ? 10 : mx <= 6 ? 8 : mx <= 10 ? 6 : 4, rowsPerSlide = 8;            // 4 Q/Ans pairs per slide
      const groups = []; for (let i = 0; i < keyed.length; i += per) groups.push(keyed.slice(i, i + per));
      for (let g = 0; g < groups.length; g += rowsPerSlide / 2) {
        const s = pptx.addSlide(); pptChrome(pptx, s, "Answer Key", `${keyed.length} answers`, logo);
        const rows = [];
        const H = { bold: true, color: PPT.GOLD, fill: { color: "0F3F22" } };
        for (const grp of groups.slice(g, g + rowsPerSlide / 2)) {
          const pad = Array.from({ length: per }, (_, k) => grp[k] || null);
          rows.push([{ text: "Q.", options: H }, ...pad.map(x => ({ text: x ? String(x.n) : "" }))]);
          rows.push([{ text: "Ans.", options: H }, ...pad.map(x => ({ text: x ? plain(keyAns(x.q)) : "", options: { bold: true } }))]);
        }
        s.addTable(rows, { x: 0.6, y: BODY_TOP + 0.1, w: PPT.W - 1.2, colW: [1.13, ...Array(per).fill((PPT.W - 1.2 - 1.13) / per)], fontFace: "Calibri", fontSize: per > 6 ? 20 : 18, color: PPT.WHITE, align: "center", valign: "middle", rowH: 0.5, border: { type: "solid", pt: 1, color: "8FB59B" } });
      }
    }
    if (written.length) {
      // written answers: "Q5." in gold, the answer beside it, as many as fit on each slide
      const pt = 20, LW = 0.9, TW = PPT.W - 1.2 - LW, lh = lineH(pt);
      const blocks = written.map(x => ({ n: x.n, lines: wrapLines(plain(x.q.ans || "–"), pt, TW) }));
      let s = null, y = 0;
      const page = () => { s = pptx.addSlide(); pptChrome(pptx, s, "Answers", `${written.length} written`, logo); y = BODY_TOP; };
      for (const b of blocks) {
        let lines = b.lines, first = true;
        while (lines.length) {
          if (!s || BODY_BOTTOM - y < lh * Math.min(2, lines.length)) page();
          const fit = Math.max(1, Math.floor((BODY_BOTTOM - y) / lh)), take = lines.slice(0, fit); lines = lines.slice(fit);
          const h = take.length * lh;
          if (first) s.addText(`Q${b.n}.`, { x: 0.6, y, w: LW, h: lh, fontFace: "Calibri", fontSize: pt, bold: true, color: PPT.GOLD, valign: "top", margin: 0 });
          s.addText(take.join("\n"), { x: 0.6 + LW, y, w: TW, h, fontFace: "Calibri", fontSize: pt, color: PPT.WHITE, valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
          y += h + 0.18; first = false;
          if (lines.length) s = null;
        }
      }
    }
  }
  const name = `${(settings.topic || "worksheet").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "worksheet"}_slides.pptx`;
  // Give the file the PowerPoint type so phones open it in PowerPoint / Google Slides, not as a zip
  const raw = await pptx.write({ outputType: "arraybuffer" });
  const blob = new Blob([raw], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  return { name, blob };
}
function saveBlob(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ================= Download / Share chooser =================
let fmtMode = "download";
function openFormat(mode) {
  if (!picked.size) { toast("Tick at least one question first"); return; }
  fmtMode = mode;
  $("fmtTitle").textContent = mode === "share" ? "Share as" : "Download as";
  $("pTitle").checked = settings.pptTitle !== false; $("pKey").checked = settings.pptKey !== false;
  $("fmtMsg").textContent = ""; $("fmtModal").hidden = false;
}
$("dlPdf").onclick = () => openFormat("download");
$("sharePdf").onclick = () => openFormat("share");
$("fmtX").onclick = () => { $("fmtModal").hidden = true; };
$("pTitle").onchange = () => { settings.pptTitle = $("pTitle").checked; saveSet(); };
$("pKey").onchange = () => { settings.pptKey = $("pKey").checked; saveSet(); };
document.querySelectorAll("#fmtModal [data-fmt]").forEach(b => b.onclick = async () => {
  const fmt = b.dataset.fmt, btns = [...document.querySelectorAll("#fmtModal [data-fmt]")];
  btns.forEach(x => x.disabled = true); $("fmtMsg").textContent = fmt === "ppt" ? "Making slides…" : "Making PDF…";
  try {
    let file;
    if (fmt === "pdf") { const r = await makePdf(); if (r) file = { name: r.name, blob: r.blob, mime: "application/pdf", pdf: r.pdf }; }
    else { const r = await makePpt({ title: $("pTitle").checked, key: $("pKey").checked }); if (r) file = { name: r.name, blob: r.blob, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }; }
    if (!file) { $("fmtMsg").textContent = ""; return; }
    autoSaveWorksheet();
    if (fmtMode === "share") {
      if (BRIDGE) { BRIDGE.shareFile(await blobToB64(file.blob), file.name, file.mime); $("fmtModal").hidden = true; return; }
      const f = new File([file.blob], file.name, { type: file.mime });
      let ok = false; try { ok = !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { ok = false; }
      if (ok) {
        // Sharing needs a fresh tap, so offer a button once the file is ready
        $("fmtMsg").innerHTML = `Ready: <b>${esc(file.name)}</b>`;
        const go = document.createElement("button"); go.className = "btn primary wide"; go.textContent = "Share now";
        go.onclick = async () => {
          try { await navigator.share({ files: [f], title: file.name }); $("fmtModal").hidden = true; toast("Shared"); }
          catch (e) { if (e.name !== "AbortError") { saveBlob(file.blob, file.name); $("fmtMsg").textContent = `Sharing did not work here, so the file was saved to Downloads instead. Open ${file.name} from Downloads and share it on WhatsApp.`; } }
        };
        $("fmtMsg").appendChild(go);
      } else {
        saveBlob(file.blob, file.name);
        $("fmtMsg").textContent = `This browser cannot share ${fmt === "ppt" ? "PowerPoint" : "these"} files directly, so ${file.name} was saved to Downloads. Open it from Downloads (Files app) and share it on WhatsApp from there.`;
      }
      return;
    }
    if (BRIDGE) BRIDGE.saveFile(await blobToB64(file.blob), file.name, file.mime);
    else if (file.pdf) file.pdf.save(file.name);
    else saveBlob(file.blob, file.name);
    $("fmtModal").hidden = true;
    toast(fmt === "ppt" ? "Slides saved to Downloads" : "PDF saved to Downloads");
  } catch (e) {
    if (e && e.name === "AbortError") { $("fmtMsg").textContent = ""; return; }
    $("fmtMsg").textContent = `Could not make the file. Try again. (${(e && (e.message || e.name)) || "unknown error"})`;
  } finally { btns.forEach(x => x.disabled = false); }
});

// ================= Offline extras: backup, install, storage =================
async function renderBackup() {
  if (!api.stats) return;
  const st = await api.stats();
  $("bkStats").textContent = `${st.questions} question${st.questions === 1 ? "" : "s"} (${st.diagrams} with diagrams) on this phone · Last backup: ${st.lastBackup ? fmtDate(st.lastBackup) : "never"}`;
}
async function backupReminder() {
  if (!api.stats) return;
  const st = await api.stats(), pb = $("planBar");
  const stale = st.questions > 0 && (!st.lastBackup || (st.lastChange > st.lastBackup && Date.now() - st.lastBackup > 7 * DAY));
  if (!stale) { pb.hidden = true; return; }
  pb.hidden = false; pb.className = "planbar warn";
  pb.innerHTML = `${st.lastBackup ? "Your last backup is more than a week old." : "You have not taken a backup yet."} <button class="link" id="pbBackup">Take backup</button>`;
  $("pbBackup").onclick = () => show("admin");
}
$("bkDown").onclick = async () => {
  const b = $("bkDown"); b.disabled = true; $("bkMsg").textContent = "Preparing backup…";
  try {
    const data = await api.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const name = `wave-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: "application/json" });
    let shared = false;
    if (BRIDGE) {
      const b64 = await blobToB64(blob);
      BRIDGE.saveFile(b64, name, "application/json");
      await api.markBackedUp();
      $("bkMsg").innerHTML = `Backup saved to Downloads as ${esc(name)}. <button class="link" id="bkShare">Send it to Google Drive / WhatsApp</button>`;
      $("bkShare").onclick = () => BRIDGE.shareFile(b64, name, "application/json");
      renderBackup(); backupReminder(); return;
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); shared = true; } catch (e) { if (e.name === "AbortError") { $("bkMsg").textContent = ""; return; } }
    }
    if (!shared) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    await api.markBackedUp();
    $("bkMsg").textContent = shared ? `Backup shared (${data.questions.length} questions). Save it to Google Drive or send it to yourself on WhatsApp.` : `Backup saved to Downloads as ${name}.`;
    renderBackup(); backupReminder();
  } catch (e) { $("bkMsg").textContent = "Could not make the backup. " + (e.message || ""); }
  finally { b.disabled = false; }
};
$("bkIn").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; setTimeout(() => { e.target.value = ""; }, 0); if (!f) return;
  $("bkMsg").textContent = "Restoring…";
  try {
    const n = await api.importAll(JSON.parse(await f.text()));
    profile = await api.loadProfile(user);
    settings = { ...DEFAULTS, ...profile.branding }; fillSettingsUI(); logoUI();
    chapterMap = await api.chapters(); await loadSyllabus(); renderHome();
    $("bkMsg").textContent = `Restored ${n} questions.`; renderBackup(); toast("Backup restored");
  } catch (err) { $("bkMsg").textContent = err instanceof SyntaxError ? "That file is not a backup file." : (err.message || "Could not restore."); }
});
const isInstalled = () => !!BRIDGE || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let installEvt = null;
addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); installEvt = e;
  if (OFFLINE && !isInstalled()) { $("installPanel").hidden = false; $("installBtn").hidden = false; $("installText").textContent = "Install the app to open it from your home screen, even without internet."; }
});
$("installBtn").onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null;
  if (r.outcome === "accepted") { $("installPanel").hidden = true; toast("App installed"); }
};
addEventListener("appinstalled", () => { $("installPanel").hidden = true; });
if (OFFLINE && !isInstalled()) $("installText").textContent = "In Chrome, tap the ⋮ menu, then “Install app” or “Add to Home screen”. After that the app opens from your home screen and works without internet.";
if (OFFLINE && !BRIDGE && "serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
if (OFFLINE && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Android app: Excel template download, and the phone's back button
if (BRIDGE) {
  document.addEventListener("click", async e => {
    const a = e.target.closest("a[download]"); if (!a) return;
    e.preventDefault();
    try { const blob = await (await fetch(a.getAttribute("href"))).blob(); BRIDGE.saveFile(await blobToB64(blob), a.getAttribute("href").split("/").pop(), blob.type || "application/octet-stream"); }
    catch (err) { toast("Could not save the file."); }
  });
}
window.__onBack = () => {
  const open = [...document.querySelectorAll(".modal")].find(m => !m.hidden);
  if (open) { open.hidden = true; return true; }
  if (!$("scrApp").hidden && curView !== "home") { history.back(); return true; }
  return false;
};

// ================= Start =================
(async () => {
  $("loginName").textContent = APP.name;
  $("loginVer").textContent = `Version ${APP_VERSION}`;
  document.title = APP.name;
  $("demoNote").hidden = !DEMO || OFFLINE;
  setAuthMode("signin");
  const refParam = new URLSearchParams(location.search).get("ref");
  if (refParam) { store.set("wave_ref", refParam); history.replaceState(null, "", location.pathname); }
  try { api = await createApi(); }
  catch (e) { screen("scrLogin"); $("authMsg").textContent = "Could not connect to the server. Check your internet and reload."; return; }
  api.onAuth(async u => {
    user = u;
    if (!u) { profile = null; setAuthMode("signin"); $("authPass").value = ""; screen("scrLogin"); return; }
    screen("scrLoading");
    try { profile = await api.loadProfile(u, store.get("wave_ref", null)); store.set("wave_ref", null); }
    catch (e) { screen("scrLogin"); $("authMsg").textContent = "Signed in, but your account could not be loaded. Check that Firestore and its rules are set up (README steps 3–5)."; return; }
    enter();
  });
})();
