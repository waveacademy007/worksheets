// Wave Worksheets — main app
import { createApi, DEMO } from "./api.js";
import { APP, MODE } from "./config.js";
const OFFLINE = MODE === "offline";
// Inside the Android app (APK) the page talks to the phone through this bridge
const BRIDGE = window.AndroidBridge || null;
const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
import { TYPES, AR_OPTS, SUBJECTS, CLASSES } from "./constants.js";
import { SAMPLE } from "./sample-questions.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
  group: false, marks: false, key: true, wmOn: true, font: "garamond" };

let api, user = null, profile = null;
let settings = { ...DEFAULTS };          // branding + worksheet options, saved to the teacher's account
let chapterMap = {};                     // "10|Science" -> [chapters]
let current = [];                        // questions of the chapter on screen
let picked = new Map();                  // ticked questions (any chapter), kept on this device
const imgCache = {};                     // question id -> diagram data URL
let loadToken = 0;
const curFont = () => FONTS[settings.font] || FONTS.garamond;

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
  if (OFFLINE) { $("teachersPanel").hidden = true; $("backupPanel").hidden = false; $("installPanel").hidden = isInstalled(); $("signOut").hidden = true; $("signOut2").hidden = true; }
  picked = new Map(store.get("ws_picked_" + user.uid, []).map(q => [q.id, q]));
  currentDraft = store.get("ws_draft_" + user.uid, null);
  fillSettingsUI(); logoUI(); updateCounts(false);
  screen("scrApp");
  history.replaceState({ v: "home" }, "", location.pathname + "#home");
  show("home", { push: false });
  try { chapterMap = await api.chapters(); }
  catch (e) { chapterMap = {}; toast("Could not load chapters. Check your internet."); }
  initHome();
  if (OFFLINE) backupReminder();
}
function planText() {
  if (profile.admin) return "Admin · full access";
  if (!profile.planUntil) return "No active plan";
  return `Pro plan · active till ${fmtDate(profile.planUntil)}`;
}
function initials(s) { return (s || "?").split(/[\s@._]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(""); }
function paintAvatars() {
  const html = settings.logo ? `<img src="${settings.logo}" alt="">` : esc(initials(profile.name || user.name || user.email));
  ["hdrAvatar", "drAvatar", "pfAvatar"].forEach(id => { $(id).innerHTML = html; });
}

// ================= Settings (saved to the account) =================
let saveTimer;
function saveSet() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await api.saveBranding(user.uid, settings); } catch (e) { toast("Could not save your settings. Check your internet."); }
  }, 900);
  paintAvatars(); $("drPhone").textContent = settings.phone || "";
}
const bind = [["sAcademy", "academy"], ["sTeacher", "teacher"], ["sPhone", "phone"], ["sWm", "wm"], ["wClass", "cls"], ["wTopic", "topic"]];
const checks = [["wGroup", "group"], ["wMarks", "marks"], ["wKey", "key"], ["wWm", "wmOn"]];
bind.forEach(([id, k]) => $(id).addEventListener("input", () => { settings[k] = $(id).value; saveSet(); schedule(); }));
checks.forEach(([id, k]) => $(id).addEventListener("change", () => { settings[k] = $(id).checked; saveSet(); schedule(); }));
$("wFont").onchange = () => { settings.font = $("wFont").value; saveSet(); schedule(); };
function fillSettingsUI() {
  bind.forEach(([id, k]) => { $(id).value = settings[k] || ""; });
  checks.forEach(([id, k]) => { $(id).checked = !!settings[k]; });
  $("wFont").value = settings.font;
}

// ================= Navigation =================
const VIEWS = ["home", "chapters", "bank", "ws", "saved", "drafts", "set", "refer", "feedback", "help", "admin"];
let curView = "home";
const nav = { cls: 10, subject: "", chapter: "" };
function show(v, { push = true } = {}) {
  if (!VIEWS.includes(v) || (v === "admin" && !profile.admin)) v = "home";
  if ((v === "chapters" && !nav.subject) || (v === "bank" && !nav.chapter)) v = "home";
  VIEWS.forEach(x => { $("v-" + x).hidden = x !== v; });
  curView = v; closeDrawer();
  $("bbHome").classList.toggle("on", ["home", "chapters", "bank"].includes(v));
  $("bbProfile").classList.toggle("on", v === "set");
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
  fillSel($("fType"), Object.entries(TYPES), "All types");
  const last = store.get("ws_last", { cls: "10", exam: "" });
  $("fClass").value = last.cls || "10"; $("fExam").value = last.exam || "";
  nav.cls = +$("fClass").value;
  renderHome();
}
$("fClass").onchange = () => { nav.cls = +$("fClass").value; nav.subject = ""; nav.chapter = ""; saveLast(); renderSubjects(true); };
$("fExam").onchange = () => { saveLast(); if (curView === "bank") renderList(); };
function saveLast() { store.set("ws_last", { cls: $("fClass").value, exam: $("fExam").value }); }
function subjectsFor(cls) {
  const extra = Object.keys(chapterMap).filter(k => k.startsWith(cls + "|")).map(k => k.split("|")[1]).filter(s => !SUBJECTS.includes(s));
  return [...SUBJECTS, ...extra].map(s => ({ name: s, n: (chapterMap[cls + "|" + s] || []).length }));
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
    return `<button class="subj${s.n ? "" : " empty"}" data-subj="${esc(s.name)}"><span class="disc" style="background:${ic.bg}"><svg class="sv" viewBox="0 0 48 48" aria-hidden="true">${ic.svg}</svg></span>${esc(s.name)}<small>${s.n ? s.n + " chapter" + (s.n === 1 ? "" : "s") : "Coming soon"}</small></button>`;
  }).join("");
}
$("subjGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-subj]"); if (!b) return;
  const n = (chapterMap[nav.cls + "|" + b.dataset.subj] || []).length;
  if (!n) { toast(profile.admin ? "No chapters yet. Add questions from Admin." : "Questions for this subject are coming soon."); return; }
  nav.subject = b.dataset.subj; nav.chapter = ""; show("chapters");
});

// ================= Chapters =================
function renderChapters() {
  $("chTitle").textContent = nav.subject; $("chSub").textContent = `Class ${roman(nav.cls)} · choose a chapter`;
  const chs = [...(chapterMap[nav.cls + "|" + nav.subject] || [])].sort((a, b) => a.localeCompare(b));
  const ticked = ch => [...picked.values()].filter(q => q.cls === nav.cls && q.subject === nav.subject && q.chapter === ch).length;
  $("chList").innerHTML = chs.length ? chs.map((c, i) => { const t = ticked(c);
    return `<button class="chap" data-ch="${esc(c)}"><span class="num">${i + 1}</span><span class="nm">${esc(c)}</span>${t ? `<span class="tk">${t} ticked</span>` : ""}<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`; }).join("")
    : `<div class="empty">No chapters yet.</div>`;
}
$("chList").addEventListener("click", e => {
  const b = e.target.closest("[data-ch]"); if (!b) return;
  nav.chapter = b.dataset.ch; $("fType").value = ""; $("fSearch").value = "";
  show("bank"); loadQuestions();
});

// ================= Questions of one chapter =================
["fType"].forEach(id => $(id).onchange = renderList);
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
function shown() {
  const e = $("fExam").value, t = $("fType").value, w = $("fSearch").value.trim().toLowerCase();
  return current.filter(q => (!e || (q.exam || []).includes(e)) && (!t || q.type === t) &&
    (!w || ((q.text || "") + " " + (q.case || "") + " " + (q.reason || "")).toLowerCase().includes(w)));
}
function renderList() {
  if (!nav.chapter) return;
  const list = shown();
  $("shownInfo").textContent = `${list.length} of ${current.length} questions`;
  $("qlist").innerHTML = list.length ? list.map(q => `<label class="q ${picked.has(q.id) ? "on" : ""}" data-id="${esc(q.id)}">
    <input type="checkbox" ${picked.has(q.id) ? "checked" : ""} aria-label="Use this question">
    <div class="txt"><div class="chips"><span class="chip t">${TYPES[q.type] || esc(q.type)}</span><span class="chip">${esc((q.exam || []).join(" · "))}</span>${q.marks ? `<span class="chip">${esc(q.marks)} mark${q.marks == 1 ? "" : "s"}</span>` : ""}${q.hasImg ? `<span class="chip imgchip">Diagram</span>` : ""}</div>
    ${q.case ? `<div class="opts">${esc(q.case)}</div>` : ""}<div>${esc(q.text).replace(/\n/g, "<br>")}</div>
    ${q.type === "AR" ? `<div class="opts">R: ${esc(q.reason)}</div>` : ""}
    ${q.type === "MCQ" ? `<div class="opts">${(q.opts || []).map((o, i) => "abcd"[i] + ") " + esc(o)).join(" &nbsp; ")}</div>` : ""}
    ${profile.admin ? `<button class="btn qdel" type="button" data-del="${esc(q.id)}">Delete</button>` : ""}</div></label>`).join("")
    : `<div class="empty">${current.length ? "No questions match this filter." : "No questions in this chapter yet."}</div>`;
}
$("qlist").addEventListener("click", async e => {
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

// Save questions to the online bank, then refresh chapters
async function saveToBank(list) {
  const base = Date.now() * 1000;
  const withSeq = list.map((q, i) => ({ ...q, seq: base + i }));
  await api.addQuestions(withSeq, (d, t) => toast(`Saving ${d} of ${t}…`, 8000));
  if (OFFLINE) backupReminder();
  chapterMap = await api.chapters();
  const f = withSeq[0];
  if (f) { nav.cls = f.cls; $("fClass").value = String(f.cls); saveLast(); }
  renderHome();
  if (f && curView === "bank" && nav.subject === f.subject && nav.chapter === f.chapter) loadQuestions();
  return withSeq.length;
}
async function loadPickedImages() {
  const need = [...picked.values()].filter(q => q.hasImg && !imgCache[q.id]).map(q => q.id);
  if (!need.length) return;
  try { Object.assign(imgCache, await api.images(need)); } catch (e) { toast("Some diagrams could not be loaded."); }
}

// ================= My Worksheets & Drafts =================
let currentDraft = null;           // {id, name} while editing a draft
let lastSavedSig = "";
const WS_KEYS = ["cls", "topic", "group", "marks", "key", "wmOn", "font"];
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
  picked.clear(); savePicked(); currentDraft = null; store.set("ws_draft_" + user.uid, null);
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
  Object.assign(settings, w.ws || {}); fillSettingsUI(); saveSet();
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
fillSel($("aType"),Object.entries(TYPES));
function addTypeUI(){const t=$("aType").value;$("aOpts").hidden=t!=="MCQ";$("aReasonL").hidden=t!=="AR";$("aCaseL").hidden=t!=="CS";
  $("aTextLabel").textContent=t==="AR"?"Assertion (A)":t==="CS"?"Questions on the passage (one per line)":"Question";
  $("aMarks").value={MCQ:1,AR:1,SA:2,LA:5,CS:4}[t];}
$("aType").onchange=addTypeUI;
$("addOpen").onclick=()=>{$("addModal").hidden=false;$("aClass").value=String(nav.cls||10);$("aSubject").value=SUBJECTS.includes(nav.subject)?nav.subject:"Science";if(!$("aChapter").value)$("aChapter").value=nav.chapter||"";$("aErr").textContent="";addTypeUI();$("aText").focus()};
$("addCancel").onclick=$("addX").onclick=()=>{$("addModal").hidden=true};
$("addModal").addEventListener("click",e=>{if(e.target.id==="addModal")$("addModal").hidden=true});

let aImg=null;
function aImgUI(){const on=!!aImg;$("aImgPrev").hidden=!on;$("aImgW").hidden=!on;$("aImgDel").hidden=!on;if(on)$("aImgPrev").src=aImg.src;$("aImgBtn").firstChild.nodeValue=on?"Change image":"Add image"}
$("aImgIn").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];if(!f)return;
  $("aImgMsg").textContent="Preparing image…";
  const url=URL.createObjectURL(f);const img=new Image();
  img.onload=()=>{const k=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
    const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
    aImg={src:c.toDataURL("image/jpeg",0.88),ar:c.width/c.height};URL.revokeObjectURL(url);$("aImgMsg").textContent="";aImgUI();setTimeout(()=>{e.target.value=""},0)};
  img.onerror=()=>{URL.revokeObjectURL(url);$("aImgMsg").textContent="Could not open that image. Use JPG or PNG."};img.src=url});
$("aImgDel").onclick=()=>{aImg=null;aImgUI()};
$("addSave").onclick=async()=>{
  const t=$("aType").value,text=$("aText").value.trim(),chapter=$("aChapter").value.trim();
  const opts=[0,1,2,3].map(i=>$("aO"+i).value.trim());
  if(!text){$("aErr").textContent="Write the question first.";return}
  if(!chapter){$("aErr").textContent="Add a chapter name so you can filter by it.";return}
  if(t==="MCQ"&&opts.some(o=>!o)){$("aErr").textContent="Fill all four options.";return}
  if(t==="AR"&&!$("aReason").value.trim()){$("aErr").textContent="Write the Reason (R).";return}
  const q={exam:$("aExam").value.split(/[ ,]+/).map(s=>s.trim().toUpperCase()).filter(Boolean),cls:+$("aClass").value,subject:$("aSubject").value,chapter,type:t,text,ans:$("aAns").value.trim(),marks:+$("aMarks").value||1};
  if(!q.exam.length)q.exam=["CBSE"];
  if(t==="MCQ")q.opts=opts; if(t==="AR"){q.opts=AR_OPTS;q.reason=$("aReason").value.trim()} if(t==="CS")q.case=$("aCase").value.trim();
  if(aImg){q.img=aImg.src;q.imgAR=aImg.ar;q.imgW=+$("aImgW").value}
  $("addSave").disabled=true;$("aErr").textContent="Saving…";
  try{await saveToBank([q])}catch(err){$("aErr").textContent="Could not save. Check your internet and try again.";$("addSave").disabled=false;return}
  $("addSave").disabled=false;
  ["aText","aReason","aCase","aO0","aO1","aO2","aO3","aAns"].forEach(i=>$(i).value="");aImg=null;aImgUI();$("aErr").textContent="";$("addModal").hidden=true;
  toast("Question saved to the bank");
};


// ===== Import from Excel / CSV / pasted rows =====
const TYPE_MAP={mcq:"MCQ",ar:"AR","assertion reason":"AR","assertion-reason":"AR",sa:"SA",short:"SA","short answer":"SA",la:"LA",long:"LA","long answer":"LA",cs:"CS","case study":"CS",case:"CS"};
let imReady=[];
const norm=h=>String(h||"").toLowerCase().replace(/\(.*?\)/g,"").replace(/[^a-z]/g,"");
const COLS={exam:"exam",class:"cls",subject:"subject",chapter:"chapter",type:"type",question:"text",assertion:"text",reason:"reason",passage:"case",optiona:"o0",optionb:"o1",optionc:"o2",optiond:"o3",answer:"ans",marks:"marks",difficulty:"diff",image:"img",imagesize:"imgSize"};
function imShow(step){$("imStart").hidden=step!=="start";$("imReview").hidden=step!=="review"}
function parseTSV(t){const rows=[];let row=[],cur="",q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c=='"'){if(t[i+1]=='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c=='"'&&cur==="")q=true;else if(c=="\t"){row.push(cur);cur=""}else if(c=="\n"||c=="\r"){if(c=="\r"&&t[i+1]=="\n")i++;row.push(cur);rows.push(row);row=[];cur=""}else cur+=c}
  if(cur!==""||row.length){row.push(cur);rows.push(row)}return rows.filter(r=>r.some(x=>String(x).trim()))}
function rowsToQuestions(rows,images){
  const out=[],probs=[];if(!rows.length){probs.push("The sheet is empty.");return {out,probs}}
  const head=rows[0].map(norm);const map=head.map(h=>COLS[h]);
  if(!map.includes("text")||!map.includes("type")){probs.push("Header row not found. Keep the template's first row (Exam, Class, Subject, Chapter, Type, Question…).");return {out,probs}}
  const isExample=r=>/^which vessel carries deoxygenated|^fishes have only two|^why is it necessary to separate|^draw a labelled diagram of a sectional|^\(i\) what do the two numbers|^in the circuit shown, what is the reading|^a ball is thrown vertically upward with speed 20/i.test(r.text||"");
  let skipped=0;
  rows.slice(1).forEach((r,ix)=>{const n=ix+2,v={};map.forEach((k,i)=>{if(k)v[k]=String(r[i]??"").trim()});
    if(!Object.values(v).some(Boolean))return;
    if(isExample(v)){skipped++;return}
    const type=TYPE_MAP[(v.type||"").toLowerCase()];const err=[];
    if(!v.text)err.push("Question is empty");
    if(!type)err.push(`Type "${v.type||""}" should be MCQ, AR, SA, LA or CS`);
    const cls=parseInt(v.cls,10);if(![9,10,11,12].includes(cls))err.push("Class should be 9, 10, 11 or 12");
    if(!v.chapter)err.push("Chapter is empty");
    let ans=(v.ans||"").replace(/[()]/g,"");
    if(type==="MCQ"){if(!(v.o0&&v.o1&&v.o2&&v.o3))err.push("All four options are needed");ans=ans.toLowerCase();if(ans&&!/^[abcd]$/.test(ans))err.push("Answer should be a, b, c or d")}
    if(type==="AR"){if(!v.reason)err.push("Reason is empty");ans=ans.toLowerCase();if(ans&&!/^[abcd]$/.test(ans))err.push("Answer should be a, b, c or d")}
    if(type==="CS"&&!v.case)err.push("Passage is empty");
    let img=null;if(v.img){img=images[v.img.toLowerCase()];if(!img)err.push(`Image "${v.img}" was not selected`)}
    if(err.length){probs.push(`Row ${n}: ${err.join("; ")}`);return}
    const subj=SUBJECTS.find(x=>x.toLowerCase()===(v.subject||"").toLowerCase())||v.subject||"Science";
    const q={id:"i"+Date.now().toString(36)+ix,exam:(v.exam||"CBSE").split(/[ ,\/]+/).map(x=>x.toUpperCase()).filter(Boolean),cls,subject:subj,chapter:v.chapter,type,text:v.text,ans,
      marks:parseFloat(v.marks)||({MCQ:1,AR:1,SA:2,LA:5,CS:4}[type])};
    if(type==="MCQ")q.opts=[v.o0,v.o1,v.o2,v.o3];if(type==="AR"){q.opts=AR_OPTS;q.reason=v.reason}if(type==="CS")q.case=v.case;
    if(img){q.img=img.src;q.imgAR=img.ar;q.imgW={small:40,medium:70,full:100}[(v.imgSize||"medium").toLowerCase()]||70}
    out.push(q)});
  return {out,probs,note:skipped?`${skipped} yellow example row${skipped>1?"s":""} from the template skipped.`:""};
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
      else if(nm==="oMath"||nm==="oMathPara")text+=omml(ch);
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
  return out;
}
// Turn the paragraphs into questions
function parseWord(paras){
  const meta={};const qs=[];const key={};let cur=null,inKey=false,last="text";
  let qNum=null;
  const lf=p=>p.list?p.list.fmt:"";
  const isQList=p=>{if(!p.list||!/decimal/i.test(p.list.fmt))return false;if(qNum===null){qNum=p.list.id;return true}return p.list.id===qNum&&p.list.lv==="0"};
  const isOptList=p=>p.list&&cur&&(/letter|bullet/i.test(p.list.fmt)||(/decimal/i.test(p.list.fmt)&&!(p.list.id===qNum&&p.list.lv==="0")));
  const startQ=t=>{cur={text:t||"",opts:[],imgs:[],ans:"",reason:"",assert:"",casePas:"",lines:[]};qs.push(cur);last="text"};
  const addOpt=(L,t)=>{if(!cur)return;const i="abcd".indexOf(L.toLowerCase());if(i<0)return;cur.opts[i]=(t||"").trim();last="opt"+i};
  const keyPairs=t=>{let m,re=/(?:Q\.?\s*)?(\d{1,3})\s*[.)\-:–]?\s*\(?([a-dA-D])\)?(?![a-z])/g,found=0;while((m=re.exec(t))){key[+m[1]]=m[2].toLowerCase();found++}return found};
  const OPT_SPLIT=/(?:^|\s)\(?([a-dA-D])\)\s*|(?:^|\t|\s{2,})([a-dA-D])[.)]\s+/g;
  for(const p of paras){
    if(p.table){const t=p.table;
      if(t.length>=2&&/^q/i.test(t[0][0]||"")&&/^ans/i.test(t[1][0]||"")){for(let r=0;r+1<t.length;r+=2)t[r].forEach((v,i)=>{const n=parseInt(v,10),a=(t[r+1][i]||"").trim().toLowerCase().replace(/[()]/g,"");if(n&&/^[a-d]$/.test(a))key[n]=a});p.skipCells=true}
      continue}
    let t=p.text.trim();
    if(!t&&!p.imgs.length)continue;
    if(!qs.length){const m1=t.match(/topic\s*[:\-–]\s*(.+)/i);if(m1)meta.chapter=m1[1].trim();
      const m2=t.match(/class\s*[:\-–]?\s*(XII|XI|IX|X|\d{1,2})\b/i);if(m2)meta.cls={IX:9,X:10,XI:11,XII:12}[m2[1].toUpperCase()]||parseInt(m2[1],10);
      const m3=t.match(/\b(science|maths?|mathematics|physics|chemistry|biology)\b/i);if(m3)meta.subject=({math:"Maths",maths:"Maths",mathematics:"Maths"})[m3[1].toLowerCase()]||m3[1][0].toUpperCase()+m3[1].slice(1).toLowerCase()}
    if(/^(answer\s*key|answers|answer\s*sheet|solutions?)\s*[:\-]?\s*$/i.test(t)){inKey=true;continue}
    if(inKey){keyPairs(t);continue}
    // answer line inside a question
    const am=t.match(/^(?:ans(?:wer)?|correct\s*option)\s*[.:\-–]\s*(.*)$/i);
    if(am){if(cur){const a=am[1].trim();const l=a.match(/^\(?([a-dA-D])\)?(?:\W|$)/);cur.ans=l?l[1].toLowerCase():a}continue}
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
    if(last.startsWith("opt")){const i=+last.slice(3);cur.opts[i]+=" "+t}
    else if(last==="reason")cur.reason+=" "+t;
    else if(last==="assert")cur.assert+=" "+t;
    else cur.lines.push(t);
    cur.imgs.push(...p.imgs);
  }
  // finalise
  const res=qs.map((q,ix)=>{const n=ix+1;let type,text=q.lines.join("\n").trim(),issues=[],passage="";
    if(q.assert||(/assertion/i.test(text)&&q.reason)){type="AR";text=q.assert||text.replace(/^.*?assertion\s*(?:\(A\))?\s*[:\-–]\s*/is,"")}
    else if(q.opts.filter(Boolean).length>=2)type="MCQ";
    else if(/read the (following )?(passage|case|paragraph|text|source)|case\s*study|case\s*based/i.test(text)){type="CS";
      const ls=q.lines.slice();const intro=/^read the|case\s*(study|based)/i.test(ls[0]||"")?ls.shift():"";
      const subIx=ls.findIndex(l=>/^\(?(i|1|a)\)/i.test(l));passage=(subIx>0?ls.slice(0,subIx):ls.slice(0,1)).join(" ");text=(subIx>0?ls.slice(subIx):ls.slice(1)).join("\n")||intro}
    else type=/\b(explain|describe|draw|derive|discuss|elaborate|differentiate)\b/i.test(text)&&text.length>90?"LA":"SA";
    let ans=q.ans||key[n]||"";
    if(type==="MCQ"){const o=[0,1,2,3].map(i=>(q.opts[i]||"").trim());if(o.some(x=>!x))issues.push("fewer than 4 options");q.opts=o;if(!/^[abcd]$/.test(ans)){if(ans)issues.push("answer is not a–d");else issues.push("no answer found");ans=/^[abcd]$/.test(ans)?ans:""}}
    if(type==="AR"&&!q.reason)issues.push("Reason not found");
    if(type==="AR"&&!/^[abcd]$/.test(ans))issues.push("no answer found");
    if(!text)issues.push("question text is empty");
    return {n,type,text,opts:q.opts,reason:q.reason,passage,ans,img:q.imgs[0]||null,issues,use:!!text}});
  return {meta,qs:res};
}
let wdData=null;
function wdRender(){const {meta,qs}=wdData;
  $("wdCls").value=String(meta.cls||10);$("wdSubject").value=meta.subject||"Science";$("wdChapter").value=meta.chapter||"";
  const ok=qs.filter(q=>!q.issues.length).length;
  $("wdSummary").textContent=`${qs.length} question${qs.length===1?"":"s"} found · ${ok} look complete · ${qs.length-ok} need a check`;
  $("wdList").innerHTML=qs.map((q,i)=>`<div class="wq ${q.issues.length?"warn":""}">
    <label class="check"><input type="checkbox" data-i="${i}" class="wdUse" ${q.use?"checked":""}> <b>Q${q.n}</b></label>
    <select data-i="${i}" class="wdType" aria-label="Question type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${k===q.type?"selected":""}>${v}</option>`).join("")}</select>
    <div class="wtxt">${q.passage?`<div class="opts">${esc(q.passage).slice(0,160)}…</div>`:""}${esc(q.type==="AR"?"A: "+q.text:q.text).replace(/\n/g,"<br>")}
      ${q.type==="AR"?`<div class="opts">R: ${esc(q.reason)}</div>`:""}
      ${q.type==="MCQ"?`<div class="opts">${q.opts.map((o,j)=>"abcd"[j]+") "+(o?esc(o):"<i>missing</i>")).join(" &nbsp; ")}</div>`:""}
      ${q.img?`<img class="qthumb" src="${q.img.src}" alt="Diagram">`:""}
      <div class="opts">Answer: <b>${esc(q.ans||"–")}</b>${q.issues.length?` · <span style="color:var(--warn)">${esc(q.issues.join(", "))}</span>`:""}</div></div></div>`).join("")||`<div class="empty">No numbered questions were found. Questions should start with Q1., 1. or Word's own numbering.</div>`;
  $("wdGo").disabled=!qs.some(q=>q.use);
}
$("wdList").addEventListener("change",e=>{const i=+e.target.dataset.i;if(Number.isNaN(i))return;
  if(e.target.classList.contains("wdUse"))wdData.qs[i].use=e.target.checked;
  if(e.target.classList.contains("wdType")){wdData.qs[i].type=e.target.value;}
  $("wdGo").disabled=!wdData.qs.some(q=>q.use)});
$("wdFile").addEventListener("change",async e=>{const f=e.target.files&&e.target.files[0];setTimeout(()=>{e.target.value=""},0);if(!f)return;
  if(/\.doc$/i.test(f.name)){$("wdMsg").textContent="This is an old .doc file. Open it in Word and use Save As → Word Document (.docx), then try again.";return}
  $("wdMsg").textContent="Reading Word file…";
  try{const paras=await readDocx(f);wdData=parseWord(paras);$("wdMsg").textContent="";$("wdStart").hidden=true;$("wdReview").hidden=false;wdRender()}
  catch(err){$("wdMsg").textContent=err&&err.message==="nozip"?"The Word reader did not load. Check your internet and reopen the page.":"Could not read that file. Make sure it is a .docx Word file."}});
$("wdGo").onclick=async()=>{const cls=+$("wdCls").value,subject=$("wdSubject").value,chapter=$("wdChapter").value.trim()||"Imported";
  const exam=$("wdExam").value.split(/[ ,\/]+/).map(x=>x.toUpperCase()).filter(Boolean);
  const add=wdData.qs.filter(q=>q.use).map((q,k)=>{const o={exam:exam.length?exam:["CBSE"],cls,subject,chapter,type:q.type,text:q.text,ans:q.ans,marks:{MCQ:1,AR:1,SA:2,LA:5,CS:4}[q.type]};
    if(q.type==="MCQ")o.opts=q.opts.map(x=>x||"");if(q.type==="AR"){o.opts=AR_OPTS;o.reason=q.reason||""}if(q.type==="CS")o.case=q.passage||"";
    if(q.img){o.img=q.img.src;o.imgAR=q.img.ar;o.imgW=70}return o});
  const b=$("wdGo");b.disabled=true;$("wdMsg").textContent="Saving to the question bank…";
  try{await saveToBank(add);$("wdModal").hidden=true;toast(`${add.length} question${add.length===1?"":"s"} imported from Word`)}
  catch(err){$("wdMsg").textContent="Could not save. Check your internet and try again."}finally{b.disabled=false}};
$("wdOpen").onclick=()=>{$("wdModal").hidden=false;$("wdStart").hidden=false;$("wdReview").hidden=true;$("wdMsg").textContent=""};
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
  const p=document.createElement("div");p.className="ws-page";p.style.fontFamily=curFont().fam;p.style.setProperty("--qs",curFont().size+"px");
  p.innerHTML=`<div class="ws-head"><div><h3>${esc(settings.academy)}</h3><div class="meta">${esc(settings.cls)}<br>Topic: ${esc(settings.topic)}</div></div>
  ${L?`<div class="ws-logo" style="width:${LS}px;height:${LS}px"><img src="${L}" alt=""></div>`:""}</div>
  ${settings.wmOn&&settings.wm?`<div class="ws-wm">${esc(settings.wm)}</div>`:""}
  <div class="ws-body"><div class="ws-col"></div><div class="ws-col"></div></div>
  <div class="ws-foot"><span>By ${esc(settings.teacher)}</span><span>☎ ${esc(settings.phone)}</span><span class="pg">Page ${n}</span></div>`;
  return p;
}
let mctx;function textW(s){if(!mctx){mctx=document.createElement("canvas").getContext("2d")}mctx.font=curFont().size+'px '+curFont().fam;return mctx.measureText(s).width}
// option column is ~300px wide; if every option fits in half of it, show two per line
function optsHTML(list){const one=(o,i)=>`<div class="o"><span class="l">${"abcd"[i]})</span><span>${esc(o)}</span></div>`;
  // half column = ~145px, minus 22px label = ~123px for text; keep a safety margin so nothing wraps
  const short=list.every(o=>textW(o)<=112);
  if(!short)return list.map(one).join("");
  let h="";for(let i=0;i<list.length;i+=2)h+=`<div class="og">${list.slice(i,i+2).map((o,j)=>one(o,i+j)).join("")}</div>`;return h}
function qHTML(q,n){
  const mk=settings.marks?`<span class="mk">[${q.marks}]</span>`:"";
  const lines=k=>'<div class="ln"></div>'.repeat(k);
  let b="";
  if(q.type==="MCQ")b=`<div class="s">${mk}${esc(q.text)}</div>`+optsHTML(q.opts);
  else if(q.type==="AR")b=`<div class="s ar">${mk}<b>Assertion (A):</b> ${esc(q.text)}</div><div class="s ar"><b>Reason (R):</b> ${esc(q.reason)}</div>`+optsHTML(AR_OPTS);
  else if(q.type==="SA")b=`<div class="s">${mk}${esc(q.text)}</div>`+lines(4);
  else if(q.type==="LA")b=`<div class="s">${mk}${esc(q.text)}</div>`+lines(9);
  else if(q.type==="CS")b=`<div class="s">${mk}Read the passage and answer the questions that follow.</div><div class="case">${esc(q.case)}</div>`+q.text.split("\n").filter(Boolean).map(t=>`<div class="s">${esc(t)}</div>`).join("")+lines(5);
  if(q.img){const im=`<div class="qimg"><img src="${q.img}" alt="" style="width:${q.imgW||70}%;aspect-ratio:${q.imgAR||1.5}"></div>`;
    const tmp=document.createElement("div");tmp.innerHTML=b;const kids=[...tmp.children];
    const after=q.type==="AR"?kids[1]:q.type==="CS"?kids[1]:kids[0];
    if(after)after.insertAdjacentHTML("afterend",im);b=tmp.innerHTML}
  const d=document.createElement("div");d.className="ws-q";d.innerHTML=`<span class="n">Q${n}.</span><div class="qc">${b}</div>`;return d;
}
// Split question q so that everything above `limit` (px) stays; returns the continuation question, or null if nothing fits.
function splitQ(q,limit){
  const qc=q.querySelector(".qc");const blocks=[...qc.children];
  let i=blocks.findIndex(b=>b.getBoundingClientRect().bottom>limit+0.5);
  if(i<0)return "fits";
  const b=blocks[i];let cont=null;
  if(b.matches(".s,.o,.case")){
    const tw=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let node,cut=null,first=true;
    outer:while((node=tw.nextNode())){if(node.parentElement.closest(".l,.mk"))continue;const re=/\S+/g;let m;
      while((m=re.exec(node.data))){const r=document.createRange();r.setStart(node,m.index);r.setEnd(node,m.index+m[0].length);
        const rs=r.getClientRects();const bot=rs.length?rs[rs.length-1].bottom:0;
        if(bot>limit+0.5){if(!first)cut={node,off:m.index};break outer}first=false}}
    if(cut){const r=document.createRange();r.setStart(cut.node,cut.off);r.setEndAfter(b.lastChild);const frag=r.extractContents();
      cont=b.cloneNode(false);if(b.classList.contains("o")){const l=document.createElement("span");l.className="l";cont.appendChild(l)}
      cont.appendChild(frag);b.classList.add("brk");cont.classList.add("cont")}
  }
  if(!cont&&i===0)return null;
  const rq=document.createElement("div");rq.className="ws-q";rq.innerHTML='<span class="n"></span><div class="qc"></div>';
  const rqc=rq.querySelector(".qc");if(cont)rqc.appendChild(cont);
  blocks.slice(cont?i+1:i).forEach(x=>rqc.appendChild(x));
  return rq;
}
function build(){
  const M=$("measure");M.innerHTML="";
  let qs=[...picked.values()].map(q=>q.hasImg?{...q,img:imgCache[q.id]||null}:q);
  const order=["MCQ","AR","SA","CS","LA"];
  if(settings.group)qs=qs.slice().sort((a,b)=>order.indexOf(a.type)-order.indexOf(b.type));
  if(!qs.length){return []}
  const items=[];let last=null,sec=0;
  qs.forEach((q,i)=>{if(settings.group&&q.type!==last){const s=document.createElement("div");s.className="ws-sec";s.textContent=`Section ${"ABCDE"[sec++]} – ${TYPES[q.type]}`;items.push(s);last=q.type}items.push(qHTML(q,i+1))});
  if(settings.key){
    const obj=qs.map((q,i)=>({n:i+1,q})).filter(x=>x.q.type==="MCQ"||x.q.type==="AR");
    if(obj.length){
      const h=document.createElement("div");h.className="ws-sec";h.textContent="Answer Key";items.push(h);
      const per=8;
      for(let i=0;i<obj.length;i+=per){
        const part=obj.slice(i,i+per);while(part.length<per)part.push(null);
        const t=document.createElement("table");t.className="ws-ktab atom";
        t.innerHTML=`<tr><th>Q.</th>${part.map(x=>`<td>${x?x.n:""}</td>`).join("")}</tr><tr><th>Ans.</th>${part.map(x=>`<td class="ka">${x?esc(x.q.ans||"–"):""}</td>`).join("")}</tr>`;
        items.push(t);
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
}
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
    chapterMap = await api.chapters(); if (t) { nav.chapter = ""; current = []; } else { nav.subject = ""; nav.chapter = ""; current = []; } renderHome();
    $("delBox").hidden = true;
    $("delMsg").textContent = `${n} question${n === 1 ? "" : "s"} deleted.`; toast(`${n} questions deleted`);
  } catch (e) { $("delMsg").textContent = "Could not delete. Check your internet and try again."; b.disabled = false; }
  finally { $("delCancel").disabled = false; }
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
const PPT = { W: 13.333, H: 7.5, HDR: 0.95, FTR: 0.55, GREEN: "14532D", BLACK: "0B0B0B", GOLD: "F4AE22", WHITE: "FFFFFF", PASSAGE: "DCEFE2" };
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
  if (q.type === "AR") { T(q.text, { label: `Q${n}.`, pre: "Assertion (A): " }); T(q.reason || "", { pre: "Reason (R): " }); }
  else if (q.type === "CS") { T("Read the passage and answer the questions that follow.", { label: `Q${n}.` }); T(q.case || "", { passage: true }); }
  else T(q.text, { label: `Q${n}.` });
  if (imgPng) B.push({ k: "img", ...imgPng });
  if (q.type === "CS") (q.text || "").split("\n").filter(Boolean).forEach(t => T(t));
  if (q.type === "MCQ" || q.type === "AR") {
    const opts = q.type === "AR" ? AR_OPTS : (q.opts || []);
    opts.forEach((o, i) => B.push({ k: "opt", label: "abcd"[i] + ")", text: o || "", optIndex: i, optCount: opts.length, all: opts }));
  }
  return B;
}
// Lay blocks out in a column of width w at font pt. Returns pages of placed pieces.
function layoutBlocks(blocks, w, pt, allowSplit) {
  const IND = Math.max(0.62 * pt / 24, measureIn("Q88.", pt, true) + 0.1), GAP = 0.13, OIND = IND, LAB = 0.4 * pt / 24;
  const pages = [[]]; let y = 0;
  const newPage = () => { pages.push([]); y = 0; };
  const room = () => BODY_H - y;
  const optsTwo = blocks.filter(b => b.k === "opt");
  const two = optsTwo.length === 4 && optsTwo.every(b => measureIn(b.text, pt) <= (w - OIND) / 2 - LAB - 0.15);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.k === "img") {
      let iw = Math.min(w - IND, 3.4), ih = iw / b.ar;
      const maxH = Math.min(2.3, BODY_H * 0.45); if (ih > maxH) { ih = maxH; iw = ih * b.ar; }
      if (ih > room()) { if (!allowSplit) return null; newPage(); }
      pages[pages.length - 1].push({ k: "img", x: IND, y, w: iw, h: ih, data: b.data }); y += ih + GAP; continue;
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
      pages[pages.length - 1].push({ k: "text", x: IND, y, w: w - IND, h: hh, lines: take, label: first ? b.label : null, pre: first ? b.pre : null, passage: !!b.passage, last: !lines.length });
      y += hh + GAP; first = false;
      if (lines.length) newPage();
    }
  }
  return pages.filter(p => p.length);
}
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
    slide.addShape("ellipse", { x: 0.3, y: 0.12, w: 0.71, h: 0.71, fill: { color: PPT.WHITE }, line: { color: PPT.WHITE } });
    const lw = 0.48, lh = lw / Math.max(logo.ar, 1), lw2 = lh * logo.ar;
    slide.addImage({ data: logo.data, x: 0.3 + (0.71 - lw2) / 2, y: 0.12 + (0.71 - lh) / 2, w: lw2, h: lh });
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
  await loadPickedImages();
  const qs0 = [...picked.values()];
  if (!qs0.length) { toast("Tick at least one question first"); return null; }
  if (!window.PptxGenJS) { toast("PowerPoint tools did not load. Check your internet and reload."); return null; }
  const order = ["MCQ", "AR", "SA", "CS", "LA"];
  const qs = settings.group ? qs0.slice().sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)) : qs0;
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
  }
  for (let i = 0; i < N; i++) {
    const q = qs[i], n = i + 1;
    const img = q.img || (q.hasImg ? imgCache[q.id] : null);
    const png = img ? await toPng(img) : null;
    const { pages, pt, w } = fitQuestion(pptBlocks(q, n, png));
    const x0 = PPT.W - RIGHT_PAD - w;
    pages.forEach((items, pi) => {
      const s = pptx.addSlide();
      pptChrome(pptx, s, q.chapter, `Q ${n}${pi ? " (cont.)" : ""} / ${N}`, logo);
      for (const it of items) {
        const x = x0 + it.x, y = BODY_TOP + it.y;
        if (it.k === "img") { s.addImage({ data: it.data, x, y, w: it.w, h: it.h }); continue; }
        if (it.k === "opt") {
          s.addText(it.label, { x, y, w: it.lab, h: it.lines.length * lineH(pt), fontFace: "Calibri", fontSize: pt, bold: true, color: PPT.GOLD, valign: "top", margin: 0 });
          s.addText(it.lines.join(" "), { x: x + it.lab, y, w: it.w - it.lab, h: it.lines.length * lineH(pt), fontFace: "Calibri", fontSize: pt, color: PPT.WHITE, align: "justify", valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
          continue;
        }
        if (it.label) s.addText(it.label, { x: x0, y, w: it.x, h: lineH(pt), fontFace: "Calibri", fontSize: pt, bold: true, color: PPT.GOLD, valign: "top", margin: 0 });
        let body = it.lines.join(" "); const runs = [];
        if (it.pre && body.startsWith(it.pre)) { runs.push({ text: it.pre, options: { bold: true, color: PPT.GOLD } }); body = body.slice(it.pre.length); }
        runs.push({ text: body, options: {} });
        if (it.passage) s.addShape("rect", { x, y, w: 0.05, h: it.h, fill: { color: PPT.GOLD }, line: { color: PPT.GOLD } });
        s.addText(runs, { x: it.passage ? x + 0.16 : x, y, w: it.passage ? it.w - 0.16 : it.w, h: it.h, fontFace: "Calibri", fontSize: pt, color: it.passage ? PPT.PASSAGE : PPT.WHITE, align: "justify", valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
        if (!it.last && pages.length > 1 && it === items[items.length - 1]) s.addText("Continued on next slide →", { x, y: BODY_BOTTOM - 0.3, w: it.w, h: 0.3, fontFace: "Calibri", fontSize: 13, bold: true, color: PPT.GOLD, margin: 0 });
      }
      if (pi < pages.length - 1 && !items.some(it => it.k === "text" && !it.last)) s.addText("Continued on next slide →", { x: x0, y: BODY_BOTTOM - 0.3, w, h: 0.3, fontFace: "Calibri", fontSize: 13, bold: true, color: PPT.GOLD, margin: 0 });
    });
  }
  if (opts.key) {
    const keyed = qs.map((q, i) => ({ n: i + 1, q })).filter(x => x.q.type === "MCQ" || x.q.type === "AR");
    if (keyed.length) {
      const per = 10, rowsPerSlide = 8;            // 4 Q/Ans pairs per slide
      const groups = []; for (let i = 0; i < keyed.length; i += per) groups.push(keyed.slice(i, i + per));
      for (let g = 0; g < groups.length; g += rowsPerSlide / 2) {
        const s = pptx.addSlide(); pptChrome(pptx, s, "Answer Key", `${keyed.length} answers`, logo);
        const rows = [];
        const H = { bold: true, color: PPT.GOLD, fill: { color: "0F3F22" } };
        for (const grp of groups.slice(g, g + rowsPerSlide / 2)) {
          const pad = Array.from({ length: per }, (_, k) => grp[k] || null);
          rows.push([{ text: "Q.", options: H }, ...pad.map(x => ({ text: x ? String(x.n) : "" }))]);
          rows.push([{ text: "Ans.", options: H }, ...pad.map(x => ({ text: x ? (x.q.ans || "–") : "", options: { bold: true } }))]);
        }
        s.addTable(rows, { x: 0.6, y: BODY_TOP + 0.1, w: PPT.W - 1.2, colW: [1.13, ...Array(per).fill((PPT.W - 1.2 - 1.13) / per)], fontFace: "Calibri", fontSize: 20, color: PPT.WHITE, align: "center", valign: "middle", rowH: 0.5, border: { type: "solid", pt: 1, color: "8FB59B" } });
      }
    }
  }
  const name = `${(settings.topic || "worksheet").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "worksheet"}_slides.pptx`;
  const blob = await pptx.write({ outputType: "blob" });
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
    if (fmtMode === "share") {
      if (BRIDGE) BRIDGE.shareFile(await blobToB64(file.blob), file.name, file.mime);
      else await navigator.share({ files: [new File([file.blob], file.name, { type: file.mime })], title: file.name });
    } else if (BRIDGE) BRIDGE.saveFile(await blobToB64(file.blob), file.name, file.mime);
    else if (file.pdf) file.pdf.save(file.name);
    else saveBlob(file.blob, file.name);
    $("fmtModal").hidden = true;
    toast(fmtMode === "share" ? "Shared" : (fmt === "ppt" ? "Slides saved to Downloads" : "PDF saved to Downloads"));
    autoSaveWorksheet();
  } catch (e) {
    if (e && e.name === "AbortError") { $("fmtMsg").textContent = ""; return; }
    $("fmtMsg").textContent = "Could not make the file. Try again.";
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
    chapterMap = await api.chapters(); renderHome();
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
