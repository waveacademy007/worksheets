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
  try { profile = await api.loadProfile(user); enter(); } catch (e) { toast("Could not check. Try again."); }
  finally { $("pendCheck").disabled = false; }
};
$("pendOut").onclick = () => api.signOut();
$("signOut").onclick = () => api.signOut();

function enter() { if (!isActive()) { showPending(); return; } startApp(); }

async function startApp() {
  settings = { ...DEFAULTS, teacher: profile.name || user.name || "", ...profile.branding };
  $("brandName").textContent = APP.name;
  $("whoName").textContent = profile.name || user.name || user.email;
  $("adminTab").hidden = !profile.admin;
  if (OFFLINE) {
    $("adminTab").textContent = "Manage"; $("signOut").hidden = true; $("whoName").hidden = true;
    $("teachersPanel").hidden = true; $("backupPanel").hidden = false; $("installPanel").hidden = isInstalled();
  }
  const pb = $("planBar");
  if (!profile.admin && profile.planUntil) {
    const left = Math.ceil((profile.planUntil - Date.now()) / DAY);
    pb.hidden = false; pb.className = "planbar" + (left <= 7 ? " warn" : "");
    pb.textContent = left <= 7 ? `Your subscription ends in ${left} day${left === 1 ? "" : "s"} (${fmtDate(profile.planUntil)}). Contact ${APP.contactPhone} to renew.`
      : `Subscription active till ${fmtDate(profile.planUntil)}`;
  } else pb.hidden = true;
  if (OFFLINE) backupReminder();
  picked = new Map(store.get("ws_picked_" + user.uid, []).map(q => [q.id, q]));
  fillSettingsUI(); logoUI(); updateCounts();
  screen("scrApp"); show("bank");
  try { chapterMap = await api.chapters(); }
  catch (e) { chapterMap = {}; toast("Could not load chapters. Check your internet."); }
  initFilters();
}

// ================= Settings (saved to the account) =================
let saveTimer;
function saveSet() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await api.saveBranding(user.uid, settings); } catch (e) { toast("Could not save your settings. Check your internet."); }
  }, 900);
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

// ================= Question bank (by chapter) =================
function initFilters() {
  fillSel($("fClass"), CLASSES.map(c => [String(c), "Class " + roman(c)]));
  fillSel($("fExam"), ["CBSE", "JEE", "NEET"].map(x => [x, x]), "All");
  fillSel($("fType"), Object.entries(TYPES), "All");
  const last = store.get("ws_last", { cls: "10", subject: "Science", chapter: "" });
  $("fClass").value = last.cls || "10";
  subjectsUI(last.subject); chaptersUI(last.chapter);
}
function subjectsUI(pref) {
  const cls = $("fClass").value;
  const extra = Object.keys(chapterMap).filter(k => k.startsWith(cls + "|")).map(k => k.split("|")[1]).filter(s => !SUBJECTS.includes(s));
  const list = [...SUBJECTS, ...extra];
  const has = s => (chapterMap[cls + "|" + s] || []).length > 0;
  fillSel($("fSubject"), list.map(s => [s, s + (has(s) ? "" : " (no questions yet)")]));
  $("fSubject").value = list.includes(pref) && has(pref) ? pref : (list.find(has) || pref || list[0]);
}
function chaptersUI(pref) {
  const chs = [...(chapterMap[$("fClass").value + "|" + $("fSubject").value] || [])].sort((a, b) => a.localeCompare(b));
  if (!chs.length) fillSel($("fChapter"), [["", "No chapters yet"]]);
  else { fillSel($("fChapter"), chs.map(c => [c, c])); $("fChapter").value = chs.includes(pref) ? pref : chs[0]; }
  loadQuestions();
}
function goTo(cls, subject, chapter) { $("fClass").value = String(cls); subjectsUI(subject); chaptersUI(chapter); }
$("fClass").onchange = () => { subjectsUI($("fSubject").value); chaptersUI(""); };
$("fSubject").onchange = () => chaptersUI("");
$("fChapter").onchange = () => loadQuestions();
["fExam", "fType"].forEach(id => $(id).onchange = renderList);
$("fSearch").addEventListener("input", renderList);

async function loadQuestions() {
  const cls = +$("fClass").value, subject = $("fSubject").value, chapter = $("fChapter").value;
  store.set("ws_last", { cls: String(cls), subject, chapter });
  const token = ++loadToken;
  if (!chapter) { current = []; renderList(); return; }
  $("qlist").innerHTML = `<div class="loadingrow">Loading questions…</div>`;
  try {
    const qs = await api.questions(cls, subject, chapter);
    if (token !== loadToken) return;
    current = qs.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  } catch (e) {
    if (token !== loadToken) return;
    current = [];
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
  const list = shown();
  const chapter = $("fChapter").value;
  $("shownInfo").textContent = chapter ? `${list.length} of ${current.length} questions in ${chapter}` : "";
  if (!chapter) {
    $("qlist").innerHTML = `<div class="empty">No questions for this class and subject yet.${profile.admin ? " Add them from the Admin tab." : " Choose another subject."}</div>`;
    updateCounts(); return;
  }
  $("qlist").innerHTML = list.length ? list.map(q => `<label class="q ${picked.has(q.id) ? "on" : ""}" data-id="${esc(q.id)}">
    <input type="checkbox" ${picked.has(q.id) ? "checked" : ""} aria-label="Use this question">
    <div class="txt"><div class="chips"><span class="chip t">${TYPES[q.type] || esc(q.type)}</span><span class="chip">${esc((q.exam || []).join(" · "))}</span>${q.marks ? `<span class="chip">${esc(q.marks)} mark${q.marks == 1 ? "" : "s"}</span>` : ""}${q.hasImg ? `<span class="chip imgchip">Diagram</span>` : ""}</div>
    ${q.case ? `<div class="opts">${esc(q.case)}</div>` : ""}<div>${esc(q.text).replace(/\n/g, "<br>")}</div>
    ${q.type === "AR" ? `<div class="opts">R: ${esc(q.reason)}</div>` : ""}
    ${q.type === "MCQ" ? `<div class="opts">${(q.opts || []).map((o, i) => "abcd"[i] + ") " + esc(o)).join(" &nbsp; ")}</div>` : ""}
    ${profile.admin ? `<button class="btn qdel" type="button" data-del="${esc(q.id)}">Delete</button>` : ""}</div></label>`).join("")
    : `<div class="empty">No questions match these filters.</div>`;
  updateCounts();
}
$("qlist").addEventListener("click", async e => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  e.preventDefault();
  if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; setTimeout(() => { if (del.isConnected) { del.dataset.armed = ""; del.textContent = "Delete"; } }, 4000); return; }
  const q = current.find(x => x.id === del.dataset.del); if (!q) return;
  del.disabled = true; del.textContent = "Deleting…";
  try { await api.deleteQuestion(q); current = current.filter(x => x.id !== q.id); picked.delete(q.id); savePicked(); renderList(); toast("Question deleted"); }
  catch (err) { del.disabled = false; del.textContent = "Delete"; toast("Could not delete. Try again."); }
});
$("qlist").addEventListener("change", e => {
  const lab = e.target.closest(".q"); if (!lab) return;
  const q = current.find(x => x.id === lab.dataset.id); if (!q) return;
  if (e.target.checked) pick(q); else picked.delete(q.id);
  lab.classList.toggle("on", e.target.checked); savePicked(); updateCounts();
});
function pick(q) {
  const { img, ...rest } = q; picked.set(q.id, rest);
  if (!settings.topic) { settings.topic = q.chapter; $("wTopic").value = q.chapter; saveSet(); }
  if (!settings.cls) { settings.cls = `Class ${roman(q.cls)} _ ${q.subject}`; $("wClass").value = settings.cls; saveSet(); }
}
function savePicked() { store.set("ws_picked_" + user.uid, [...picked.values()]); }
function updateCounts() {
  const n = picked.size;
  $("tabCount").textContent = n;
  $("selInfo").textContent = `${n} question${n === 1 ? "" : "s"} ticked`;
  $("dlPdf").disabled = !n;
}
$("selAll").onclick = () => { shown().forEach(pick); savePicked(); renderList(); };
$("selNone").onclick = () => {
  const b = $("selNone");
  if (b.dataset.armed !== "1" && picked.size > 5) { b.dataset.armed = "1"; b.textContent = `Tap again to clear ${picked.size}`; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Clear all ticks"; }, 4000); return; }
  b.dataset.armed = ""; b.textContent = "Clear all ticks"; picked.clear(); savePicked(); renderList();
};

// Save questions to the online bank, then jump to their chapter
async function saveToBank(list) {
  const base = Date.now() * 1000;
  const withSeq = list.map((q, i) => ({ ...q, seq: base + i }));
  await api.addQuestions(withSeq, (d, t) => toast(`Saving ${d} of ${t}…`, 8000));
  if (OFFLINE) backupReminder();
  chapterMap = await api.chapters();
  const f = withSeq[0];
  if (f) goTo(f.cls, f.subject, f.chapter);
  return withSeq.length;
}
async function loadPickedImages() {
  const need = [...picked.values()].filter(q => q.hasImg && !imgCache[q.id]).map(q => q.id);
  if (!need.length) return;
  try { Object.assign(imgCache, await api.images(need)); } catch (e) { toast("Some diagrams could not be loaded."); }
}

// ================= Add one question (admin) =================
// ---- add question
fillSel($("aType"),Object.entries(TYPES));
function addTypeUI(){const t=$("aType").value;$("aOpts").hidden=t!=="MCQ";$("aReasonL").hidden=t!=="AR";$("aCaseL").hidden=t!=="CS";
  $("aTextLabel").textContent=t==="AR"?"Assertion (A)":t==="CS"?"Questions on the passage (one per line)":"Question";
  $("aMarks").value={MCQ:1,AR:1,SA:2,LA:5,CS:4}[t];}
$("aType").onchange=addTypeUI;
$("addOpen").onclick=()=>{$("addModal").hidden=false;$("aClass").value=$("fClass").value||"10";$("aSubject").value=SUBJECTS.includes($("fSubject").value)?$("fSubject").value:"Science";if(!$("aChapter").value)$("aChapter").value=$("fChapter").value||"";$("aErr").textContent="";addTypeUI();$("aText").focus()};
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


// ================= Tabs =================
function show(tab) {
  if (tab === "admin" && !profile.admin) tab = "bank";
  ["bank", "ws", "set", "admin"].forEach(t => { $("v-" + t).hidden = t !== tab; });
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  document.querySelector(".stickybar").hidden = tab === "admin";
  if (tab === "ws") renderPreview();
  if (tab === "admin") { if (OFFLINE) renderBackup(); else loadUsers(); }
  scrollTo(0, 0);
}
document.querySelectorAll(".tab").forEach(b => b.onclick = () => show(b.dataset.tab));
$("goWs").onclick = () => show("ws");
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
    return `<div class="urow"><div class="uinfo"><b>${esc(u.name || "No name")}</b> · ${esc(u.email)}<br><span class="note">${status}${u.createdAt ? " · Joined " + fmtDate(u.createdAt) : ""}</span></div>
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
  try { await api.setPlan(u.uid, until); u.planUntil = until; renderUsers(); toast(until ? `${u.name || u.email} active till ${fmtDate(until)}` : "Subscription stopped"); }
  catch (err) { b.disabled = false; toast("Could not update. Try again."); }
});

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
  finally { btn.textContent = old; btn.disabled = false; updateCounts(); }
}
$("dlPdf").onclick = () => withBusy($("dlPdf"), "Making PDF…", async () => {
  const r = await makePdf(); if (!r) return;
  if (BRIDGE) BRIDGE.saveFile(await blobToB64(r.blob), r.name, "application/pdf");
  else { r.pdf.save(r.name); toast("PDF saved to Downloads"); }
});
const canShareFiles = !!BRIDGE || (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "t.pdf", { type: "application/pdf" })] })); } catch (e) { return false; } })();
$("sharePdf").hidden = !canShareFiles;
$("sharePdf").onclick = () => withBusy($("sharePdf"), "Making…", async () => {
  const r = await makePdf(); if (!r) return;
  if (BRIDGE) BRIDGE.shareFile(await blobToB64(r.blob), r.name, "application/pdf");
  else await navigator.share({ files: [new File([r.blob], r.name, { type: "application/pdf" })], title: r.name });
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
    chapterMap = await api.chapters(); initFilters();
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
  if (!$("scrApp").hidden && $("v-bank").hidden) { show("bank"); return true; }
  return false;
};

// ================= Start =================
(async () => {
  $("loginName").textContent = APP.name;
  document.title = APP.name;
  $("demoNote").hidden = !DEMO || OFFLINE;
  setAuthMode("signin");
  try { api = await createApi(); }
  catch (e) { screen("scrLogin"); $("authMsg").textContent = "Could not connect to the server. Check your internet and reload."; return; }
  api.onAuth(async u => {
    user = u;
    if (!u) { profile = null; setAuthMode("signin"); $("authPass").value = ""; screen("scrLogin"); return; }
    screen("scrLoading");
    try { profile = await api.loadProfile(u); }
    catch (e) { screen("scrLogin"); $("authMsg").textContent = "Signed in, but your account could not be loaded. Check that Firestore and its rules are set up (README steps 3–5)."; return; }
    enter();
  });
})();
