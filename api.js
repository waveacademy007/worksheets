// Data layer. One interface, two backends:
//  - Firebase (Auth + Firestore) once config.js is filled in
//  - Demo mode (this browser's storage) before that, or with ?demo in the address
// Firestore layout:
//   users/{uid}      { email, name, createdAt, planUntil (Timestamp|null), branding {...} }
//   admins/{uid}     {}   <- create this document by hand in the console to make yourself admin
//   questions/{id}   { exam[], cls, subject, chapter, type, text, opts[], reason, case, ans, marks, hasImg, imgAR, imgW, createdAt }
//   qimages/{id}     { data }   <- diagram as a compressed data URL (free plan has no Cloud Storage)
//   meta/chapters    { c: { "10|Physics": ["Electricity", ...] } }   <- chapters that have questions
//   meta/syllabus    { s: {...subjects per class}, c: {...chapters + concepts} }  (see syllabus.js)
import { firebaseConfig, MODE } from "./config.js";

export const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE") || new URLSearchParams(location.search).has("demo");

export async function createApi() { return MODE === "offline" ? localApi() : DEMO ? demoApi() : firebaseApi(); }

// Firestore refuses `undefined`, so drop empty fields before saving
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
const key = (cls, subject) => cls + "|" + subject;
const match = (q, f) => !f || Object.entries(f).every(([k, v]) => q[k] === v);

async function firebaseApi() {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const toMs = t => (t && t.toMillis ? t.toMillis() : null);
  const qWhere = f => F.query(F.collection(db, "questions"), ...Object.entries(f || {}).map(([k, v]) => F.where(k, "==", v)));

  return {
    mode: "firebase",
    onAuth(cb) { A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email || "", name: u.displayName || "", photo: u.photoURL || "" } : null)); },
    signInGoogle() { return A.signInWithPopup(auth, new A.GoogleAuthProvider()); },
    signInEmail(e, p) { return A.signInWithEmailAndPassword(auth, e, p); },
    async signUpEmail(e, p, name) {
      const c = await A.createUserWithEmailAndPassword(auth, e, p);
      if (name) await A.updateProfile(c.user, { displayName: name });
      return c;
    },
    resetPassword(e) { return A.sendPasswordResetEmail(auth, e); },
    signOut() { return A.signOut(auth); },

    async loadProfile(u, referredBy) {
      const ref = F.doc(db, "users", u.uid);
      let snap = await F.getDoc(ref);
      if (!snap.exists()) {
        const doc = { email: u.email, name: u.name || "", createdAt: F.serverTimestamp(), planUntil: null, branding: {} };
        if (referredBy && referredBy !== u.uid && /^[\w-]{6,128}$/.test(referredBy)) doc.referredBy = referredBy;
        await F.setDoc(ref, doc);
        snap = await F.getDoc(ref);
      }
      let admin = false;
      try { admin = (await F.getDoc(F.doc(db, "admins", u.uid))).exists(); } catch (e) { admin = false; }
      const d = snap.data();
      return { admin, planUntil: toMs(d.planUntil), branding: d.branding || {}, name: d.name || "", refRewards: d.refRewards || 0, referredBy: d.referredBy || null };
    },
    saveBranding(uid, branding) { return F.updateDoc(F.doc(db, "users", uid), { branding }); },
    // ---- my worksheets & drafts: users/{uid}/worksheets
    async listWorksheets(kind) {
      const uid = auth.currentUser.uid;
      const r = await F.getDocs(F.query(F.collection(db, "users", uid, "worksheets"), F.where("kind", "==", kind)));
      return r.docs.map(d => { const x = d.data(); return { id: d.id, name: x.name, kind: x.kind, count: x.count, ws: x.ws, updatedAt: x.updatedAt }; }).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async getWorksheet(id) { const s = await F.getDoc(F.doc(db, "users", auth.currentUser.uid, "worksheets", id)); return s.exists() ? { id: s.id, ...s.data() } : null; },
    async saveWorksheet(id, data) {
      const col = F.collection(db, "users", auth.currentUser.uid, "worksheets");
      const ref = id ? F.doc(col, id) : F.doc(col);
      await F.setDoc(ref, JSON.parse(JSON.stringify(data)));
      return ref.id;
    },
    deleteWorksheet(id) { return F.deleteDoc(F.doc(db, "users", auth.currentUser.uid, "worksheets", id)); },
    // ---- feedback
    sendFeedback(f) { return F.addDoc(F.collection(db, "feedback"), { uid: auth.currentUser.uid, name: f.name || "", email: f.email || "", rating: f.rating || 0, text: f.text || "", createdAt: Date.now() }); },
    async listFeedback() { const r = await F.getDocs(F.query(F.collection(db, "feedback"), F.orderBy("createdAt", "desc"), F.limit(200))); return r.docs.map(d => ({ id: d.id, ...d.data() })); },
    deleteFeedback(id) { return F.deleteDoc(F.doc(db, "feedback", id)); },
    // ---- referral reward (admin): +days to the referrer, mark the new teacher as rewarded
    async rewardReferral(uid, referrer, ms) {
      const rs = await F.getDoc(F.doc(db, "users", referrer)); if (!rs.exists()) return;
      const cur = toMs(rs.data().planUntil) || 0;
      const b = F.writeBatch(db);
      b.update(F.doc(db, "users", referrer), { planUntil: F.Timestamp.fromMillis(Math.max(Date.now(), cur) + ms), refRewards: F.increment(1) });
      b.update(F.doc(db, "users", uid), { referralRewarded: true });
      await b.commit();
    },

    async chapters() {
      const s = await F.getDoc(F.doc(db, "meta", "chapters"));
      return s.exists() ? (s.data().c || {}) : {};
    },
    async questions(cls, subject, chapter) {
      const q = F.query(F.collection(db, "questions"),
        F.where("cls", "==", cls), F.where("subject", "==", subject), F.where("chapter", "==", chapter));
      const r = await F.getDocs(q);
      return r.docs.map(d => ({ id: d.id, ...d.data(), createdAt: undefined }));
    },
    async images(ids) {
      const out = {};
      await Promise.all(ids.map(async id => {
        const s = await F.getDoc(F.doc(db, "qimages", id));
        if (s.exists()) out[id] = s.data().data;
      }));
      return out;
    },
    // Writes in batches (max 400 writes, ~6 MB of images per batch)
    async addQuestions(list, onProgress) {
      const chaps = {};
      let batch = F.writeBatch(db), ops = 0, bytes = 0, done = 0;
      const flush = async () => { if (ops) { await batch.commit(); batch = F.writeBatch(db); ops = 0; bytes = 0; } };
      for (const q of list) {
        const ref = F.doc(F.collection(db, "questions"));
        const { img, id, ...rest } = q;
        batch.set(ref, { ...clean(rest), hasImg: !!img, createdAt: F.serverTimestamp() });
        ops++;
        if (img) { batch.set(F.doc(db, "qimages", ref.id), { data: img }); ops++; bytes += img.length; }
        (chaps[key(q.cls, q.subject)] ??= new Set()).add(q.chapter);
        done++;
        if (ops >= 400 || bytes > 6e6) { await flush(); onProgress && onProgress(done, list.length); }
      }
      await flush();
      const c = {};
      for (const [k, set] of Object.entries(chaps)) c[k] = F.arrayUnion(...set);
      await F.setDoc(F.doc(db, "meta", "chapters"), { c }, { merge: true });
      return list.length;
    },
    async deleteQuestion(q) {
      const b = F.writeBatch(db);
      b.delete(F.doc(db, "questions", q.id));
      if (q.hasImg) b.delete(F.doc(db, "qimages", q.id));
      await b.commit();
    },
    // Delete questions (+ their diagrams) in batches. filter = {cls, subject, chapter?, concept?} or null for ALL.
    async deleteQuestions(filter, onProgress) {
      let total = 0;
      for (let guard = 0; guard < 2000; guard++) {
        const r = await F.getDocs(F.query(qWhere(filter), F.limit(200)));
        if (r.empty) break;
        const b = F.writeBatch(db);
        r.docs.forEach(d => { b.delete(d.ref); if (d.data().hasImg) b.delete(F.doc(db, "qimages", d.id)); });
        await b.commit();
        total += r.size; onProgress && onProgress(total);
      }
      const k = filter && key(filter.cls, filter.subject);
      if (!filter) {
        // leftover diagrams without a question
        for (;;) { const r = await F.getDocs(F.query(F.collection(db, "qimages"), F.limit(200))); if (r.empty) break; const b = F.writeBatch(db); r.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
        await F.deleteDoc(F.doc(db, "meta", "chapters"));
      } else if (filter.concept) { /* chapter keeps its other questions */ }
      else if (filter.chapter) await F.setDoc(F.doc(db, "meta", "chapters"), { c: { [k]: F.arrayRemove(filter.chapter) } }, { merge: true });
      else await F.setDoc(F.doc(db, "meta", "chapters"), { c: { [k]: F.deleteField() } }, { merge: true });
      return total;
    },
    // Replace a question's content, keeping its id. img: "keep" | "remove" | data URL
    async updateQuestion(id, q, img) {
      const ref = F.doc(db, "questions", id), snap = await F.getDoc(ref);
      if (!snap.exists()) throw new Error("gone");
      const old = snap.data();
      const hasImg = img === "remove" ? false : img === "keep" ? !!old.hasImg : true;
      const data = { ...clean(q), hasImg, updatedAt: F.serverTimestamp() };
      for (const k of Object.keys(old)) if (!(k in data) && !["createdAt", "seq"].includes(k)) data[k] = F.deleteField();
      if (!hasImg) { data.imgAR = F.deleteField(); data.imgW = F.deleteField(); }
      const b = F.writeBatch(db);
      b.set(ref, data, { merge: true });
      if (img === "remove") b.delete(F.doc(db, "qimages", id));
      else if (img !== "keep") b.set(F.doc(db, "qimages", id), { data: img });
      await b.commit();
      if (old.cls !== q.cls || old.subject !== q.subject || old.chapter !== q.chapter) {
        await F.setDoc(F.doc(db, "meta", "chapters"), { c: { [key(q.cls, q.subject)]: F.arrayUnion(q.chapter) } }, { merge: true });
        const left = (await F.getCountFromServer(qWhere({ cls: old.cls, subject: old.subject, chapter: old.chapter }))).data().count;
        if (!left) await F.setDoc(F.doc(db, "meta", "chapters"), { c: { [key(old.cls, old.subject)]: F.arrayRemove(old.chapter) } }, { merge: true });
      }
      const out = { ...clean(q), id, hasImg }; if (!hasImg) { delete out.imgAR; delete out.imgW; } return out;
    },
    async countQuestions(filter) { return (await F.getCountFromServer(qWhere(filter))).data().count; },
    // Change a field on every matching question (rename / move). patch value null = remove the field.
    async updateQuestions(filter, patch, onProgress) {
      if (!Object.keys(patch).some(k => k in filter)) throw new Error("bad update");
      const upd = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v == null ? F.deleteField() : v]));
      let total = 0;
      for (let guard = 0; guard < 2000; guard++) {
        const r = await F.getDocs(F.query(qWhere(filter), F.limit(300)));
        if (r.empty) break;
        const b = F.writeBatch(db); r.docs.forEach(d => b.update(d.ref, upd)); await b.commit();
        total += r.size; onProgress && onProgress(total);
      }
      return total;
    },
    setChapterMap(c) { return F.setDoc(F.doc(db, "meta", "chapters"), { c }); },
    async syllabus() { const s = await F.getDoc(F.doc(db, "meta", "syllabus")); return s.exists() ? s.data() : null; },
    saveSyllabus(syl) { return F.setDoc(F.doc(db, "meta", "syllabus"), syl); },
    async users() {
      const r = await F.getDocs(F.query(F.collection(db, "users"), F.orderBy("createdAt", "desc"), F.limit(1000)));
      const admins = new Set((await F.getDocs(F.collection(db, "admins"))).docs.map(d => d.id));
      return r.docs.map(d => { const x = d.data(); return { uid: d.id, email: x.email, name: x.name, createdAt: toMs(x.createdAt), planUntil: toMs(x.planUntil), admin: admins.has(d.id), referredBy: x.referredBy || null, referralRewarded: !!x.referralRewarded }; });
    },
    setPlan(uid, ms) { return F.updateDoc(F.doc(db, "users", uid), { planUntil: ms == null ? null : F.Timestamp.fromMillis(ms) }); },
    // admin-only settings (e.g. the Gemini key for photo import): private/{name}, readable by admins only
    async getPrivate(name) { const s = await F.getDoc(F.doc(db, "private", name)); return s.exists() ? s.data() : null; },
    setPrivate(name, data) { return F.setDoc(F.doc(db, "private", name), data); }
  };
}

// ---------------- Demo backend (browser storage only) ----------------
function demoApi() {
  const get = (k, d) => { try { const v = localStorage.getItem("demo_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem("demo_" + k, JSON.stringify(v)); } catch (e) { throw new Error("This browser is out of space for demo data."); } };
  let listeners = [];
  const current = () => { const id = get("session", null); const u = id && get("users", {})[id]; return u ? { uid: id, email: u.email, name: u.name } : null; };
  const emit = () => listeners.forEach(cb => cb(current()));
  let pendingRef = null;
  const login = (email, name, pass, create) => {
    const users = get("users", {});
    let id = Object.keys(users).find(k => users[k].email.toLowerCase() === email.toLowerCase());
    if (create) {
      if (id) throw { code: "auth/email-already-in-use" };
      id = "u" + Date.now().toString(36);
      users[id] = { email, name: name || "", pass, planUntil: null, branding: {}, createdAt: Date.now(), admin: Object.keys(users).length === 0 };
      let ref = pendingRef; try { ref = ref || JSON.parse(localStorage.getItem("wave_ref")); } catch (e) {}
      if (ref && ref !== id && users[ref]) users[id].referredBy = ref;
      set("users", users);
    } else if (!id || (pass !== null && users[id].pass !== pass)) throw { code: "auth/invalid-credential" };
    set("session", id); setTimeout(emit, 0);
  };
  const wait = v => new Promise(r => setTimeout(() => r(v), 120));
  return {
    mode: "demo",
    onAuth(cb) { listeners.push(cb); setTimeout(() => cb(current()), 0); },
    async signInGoogle() {
      const users = get("users", {}), email = "owner@demo.app";
      login(email, "Demo Owner", null, !Object.values(users).some(u => u.email === email));
    },
    async signInEmail(e, p) { login(e, "", p, false); },
    async signUpEmail(e, p, n) { if ((p || "").length < 6) throw { code: "auth/weak-password" }; login(e, n, p, true); },
    async resetPassword() { return wait(); },
    async signOut() { set("session", null); emit(); },
    async loadProfile(u, ref) { pendingRef = ref; const x = get("users", {})[u.uid]; return wait({ admin: !!x.admin, planUntil: x.planUntil, branding: x.branding || {}, name: x.name, refRewards: x.refRewards || 0, referredBy: x.referredBy || null }); },
    async listWorksheets(kind) { const me = get("session", null); return wait(Object.entries(get("ws_" + me, {})).map(([id, w]) => ({ id, ...w })).filter(w => w.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt)); },
    async getWorksheet(id) { const me = get("session", null); const w = get("ws_" + me, {})[id]; return w ? { id, ...w } : null; },
    async saveWorksheet(id, data) { const me = get("session", null); const all = get("ws_" + me, {}); id = id || "w" + Date.now().toString(36); all[id] = JSON.parse(JSON.stringify(data)); set("ws_" + me, all); return id; },
    async deleteWorksheet(id) { const me = get("session", null); const all = get("ws_" + me, {}); delete all[id]; set("ws_" + me, all); },
    async sendFeedback(f) { const l = get("feedback", []); l.unshift({ id: "f" + Date.now(), ...f, createdAt: Date.now() }); set("feedback", l); },
    async listFeedback() { return wait(get("feedback", [])); },
    async deleteFeedback(id) { set("feedback", get("feedback", []).filter(f => f.id !== id)); },
    async rewardReferral(uid, ref, ms) { const us = get("users", {}); if (!us[ref]) return; us[ref].planUntil = Math.max(Date.now(), us[ref].planUntil || 0) + ms; us[ref].refRewards = (us[ref].refRewards || 0) + 1; us[uid].referralRewarded = true; set("users", us); },
    async saveBranding(uid, b) { const us = get("users", {}); us[uid].branding = b; set("users", us); },
    async chapters() { return wait(get("chapters", {})); },
    async questions(cls, subject, chapter) { return wait(get("questions", []).filter(q => q.cls === cls && q.subject === subject && q.chapter === chapter)); },
    async images(ids) { const all = get("images", {}); return Object.fromEntries(ids.filter(i => all[i]).map(i => [i, all[i]])); },
    async addQuestions(list) {
      const qs = get("questions", []), imgs = get("images", {}), ch = get("chapters", {});
      list.forEach((q, i) => {
        const id = "q" + Date.now().toString(36) + i;
        const { img, ...rest } = q;
        qs.push({ ...clean(rest), id, hasImg: !!img });
        if (img) imgs[id] = img;
        const k = key(q.cls, q.subject); ch[k] = [...new Set([...(ch[k] || []), q.chapter])];
      });
      set("questions", qs); set("images", imgs); set("chapters", ch);
      return wait(list.length);
    },
    async deleteQuestion(q) { set("questions", get("questions", []).filter(x => x.id !== q.id)); const im = get("images", {}); delete im[q.id]; set("images", im); },
    async deleteQuestions(f) {
      const qs = get("questions", []), im = get("images", {}), ch = get("chapters", {});
      const gone = qs.filter(q => match(q, f)); gone.forEach(q => delete im[q.id]);
      set("questions", qs.filter(q => !match(q, f))); set("images", im);
      if (!f) set("chapters", {});
      else if (!f.concept) { const k = key(f.cls, f.subject); if (f.chapter) ch[k] = (ch[k] || []).filter(c => c !== f.chapter); else delete ch[k]; set("chapters", ch); }
      return wait(gone.length);
    },
    async updateQuestion(id, q, img) {
      const qs = get("questions", []), im = get("images", {}), ch = get("chapters", {});
      const i = qs.findIndex(x => x.id === id); if (i < 0) throw new Error("gone");
      const old = qs[i], hasImg = img === "remove" ? false : img === "keep" ? !!old.hasImg : true;
      const doc = { ...clean(q), id, hasImg }; if (!hasImg) { delete doc.imgAR; delete doc.imgW; }
      qs[i] = doc; if (img === "remove") delete im[id]; else if (img !== "keep") im[id] = img;
      const k = key(q.cls, q.subject); ch[k] = [...new Set([...(ch[k] || []), q.chapter])];
      const ok = key(old.cls, old.subject);
      if (!qs.some(x => x.cls === old.cls && x.subject === old.subject && x.chapter === old.chapter)) ch[ok] = (ch[ok] || []).filter(c => c !== old.chapter);
      set("questions", qs); set("images", im); set("chapters", ch); return wait(doc);
    },
    async countQuestions(f) { return wait(get("questions", []).filter(q => match(q, f)).length); },
    async updateQuestions(f, patch) {
      const qs = get("questions", []); let n = 0;
      qs.forEach(q => { if (match(q, f)) { n++; for (const [k, v] of Object.entries(patch)) { if (v == null) delete q[k]; else q[k] = v; } } });
      set("questions", qs); return wait(n);
    },
    async setChapterMap(c) { set("chapters", c); },
    async syllabus() { return wait(get("syllabus", null)); },
    async saveSyllabus(s) { set("syllabus", s); },
    async users() { return wait(Object.entries(get("users", {})).map(([uid, x]) => ({ uid, email: x.email, name: x.name, createdAt: x.createdAt, planUntil: x.planUntil, admin: !!x.admin, referredBy: x.referredBy || null, referralRewarded: !!x.referralRewarded })).sort((a, b) => b.createdAt - a.createdAt)); },
    async setPlan(uid, ms) { const us = get("users", {}); us[uid].planUntil = ms; set("users", us); },
    async getPrivate(name) { return get("private_" + name, null); },
    async setPrivate(name, data) { set("private_" + name, data); }
  };
}

// ---------------- Offline backend: everything stays on this phone (IndexedDB) ----------------
function localApi() {
  let dbp;
  const open = () => dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open("wave-worksheets", 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("questions", { keyPath: "id" }); d.createObjectStore("images"); d.createObjectStore("kv"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (stores, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(stores, mode); let out;
      Promise.resolve(fn(...[].concat(stores).map(n => t.objectStore(n)))).then(v => { out = v; });
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("Phone storage is full."));
    });
  };
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  let cache = null;   // all questions (without images) kept in memory
  const all = async () => cache ??= await tx("questions", "readonly", s => req(s.getAll()));
  const kvGet = k => tx("kv", "readonly", s => req(s.get(k)));
  const kvSet = (k, v) => tx("kv", "readwrite", s => { s.put(v, k); });
  const touch = () => kvSet("lastChange", Date.now());
  const me = { uid: "me", email: "", name: "" };
  return {
    mode: "offline",
    onAuth(cb) { setTimeout(() => cb(me), 0); },
    signOut() {},
    async loadProfile() { return { admin: true, planUntil: null, branding: (await kvGet("branding")) || {}, name: "" }; },
    saveBranding(uid, b) { return kvSet("branding", b); },
    async chapters() {
      const c = {};
      for (const q of await all()) { const k = key(q.cls, q.subject); (c[k] ??= new Set()).add(q.chapter); }
      return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [...v]]));
    },
    async questions(cls, subject, chapter) { return (await all()).filter(q => q.cls === cls && q.subject === subject && q.chapter === chapter); },
    async images(ids) {
      return tx("images", "readonly", async s => {
        const out = {}; for (const id of ids) { const v = await req(s.get(id)); if (v) out[id] = v; } return out;
      });
    },
    async addQuestions(list) {
      const added = [];
      await tx(["questions", "images"], "readwrite", (qs, im) => {
        list.forEach((q, i) => {
          const id = q.id && !/^[iwcs]?\d/.test(q.id) && q.keepId ? q.id : "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + i;
          const { img, keepId, ...rest } = q;
          const doc = { ...clean(rest), id, hasImg: !!img };
          qs.put(doc); if (img) im.put(img, id); added.push(doc);
        });
      });
      (await all()).push(...added); await touch();
      return added.length;
    },
    async deleteQuestion(q) {
      await tx(["questions", "images"], "readwrite", (qs, im) => { qs.delete(q.id); im.delete(q.id); });
      cache = (await all()).filter(x => x.id !== q.id); await touch();
    },
    async deleteQuestions(f) {
      const qs = await all();
      const gone = qs.filter(q => match(q, f));
      await tx(["questions", "images"], "readwrite", (s, im) => { gone.forEach(q => { s.delete(q.id); im.delete(q.id); }); });
      cache = qs.filter(q => !match(q, f)); await touch();
      return gone.length;
    },
    async updateQuestion(id, q, img) {
      const qs = await all(), old = qs.find(x => x.id === id); if (!old) throw new Error("gone");
      const hasImg = img === "remove" ? false : img === "keep" ? !!old.hasImg : true;
      const doc = { ...clean(q), id, hasImg }; if (!hasImg) { delete doc.imgAR; delete doc.imgW; }
      await tx(["questions", "images"], "readwrite", (s, im) => { s.put(doc); if (img === "remove") im.delete(id); else if (img !== "keep") im.put(img, id); });
      qs[qs.indexOf(old)] = doc; await touch(); return doc;
    },
    async countQuestions(f) { return (await all()).filter(q => match(q, f)).length; },
    async updateQuestions(f, patch) {
      const hit = (await all()).filter(q => match(q, f));
      hit.forEach(q => { for (const [k, v] of Object.entries(patch)) { if (v == null) delete q[k]; else q[k] = v; } });
      await tx("questions", "readwrite", s => { hit.forEach(q => s.put(q)); }); await touch();
      return hit.length;
    },
    async setChapterMap() {},
    syllabus() { return kvGet("syllabus"); },
    saveSyllabus(s) { return kvSet("syllabus", s); },
    async listWorksheets(kind) { const all = (await kvGet("worksheets")) || {}; return Object.entries(all).map(([id, w]) => ({ id, ...w })).filter(w => w.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt); },
    async getWorksheet(id) { const all = (await kvGet("worksheets")) || {}; return all[id] ? { id, ...all[id] } : null; },
    async saveWorksheet(id, data) { const all = (await kvGet("worksheets")) || {}; id = id || "w" + Date.now().toString(36); all[id] = JSON.parse(JSON.stringify(data)); await kvSet("worksheets", all); return id; },
    async deleteWorksheet(id) { const all = (await kvGet("worksheets")) || {}; delete all[id]; await kvSet("worksheets", all); },
    async sendFeedback() {}, async listFeedback() { return []; }, async deleteFeedback() {}, async rewardReferral() {},
    async users() { return []; },
    async setPlan() {},
    getPrivate(name) { return kvGet("private_" + name); },
    setPrivate(name, data) { return kvSet("private_" + name, data); },
    // ---- backup / restore ----
    async stats() {
      const qs = await all();
      return { questions: qs.length, diagrams: qs.filter(q => q.hasImg).length, lastBackup: await kvGet("lastBackup"), lastChange: await kvGet("lastChange") };
    },
    async exportAll() {
      const qs = await all();
      const imgs = await this.images(qs.filter(q => q.hasImg).map(q => q.id));
      return { app: "wave-worksheets", version: 1, exportedAt: new Date().toISOString(), branding: (await kvGet("branding")) || {},
        questions: qs.map(q => imgs[q.id] ? { ...q, img: imgs[q.id] } : q) };
    },
    markBackedUp() { return kvSet("lastBackup", Date.now()); },
    // Restore: questions with the same id are replaced, others are added. Settings are restored too.
    async importAll(data) {
      if (!data || data.app !== "wave-worksheets" || !Array.isArray(data.questions)) throw new Error("This is not a Wave Worksheets backup file.");
      await tx(["questions", "images"], "readwrite", (qs, im) => {
        for (const q of data.questions) {
          if (!q || !q.id || !q.text) continue;
          const { img, ...rest } = q;
          qs.put({ ...rest, hasImg: !!img }); if (img) im.put(img, q.id); else im.delete(q.id);
        }
      });
      if (data.branding && Object.keys(data.branding).length) await kvSet("branding", data.branding);
      cache = null; await touch();
      return data.questions.length;
    }
  };
}
