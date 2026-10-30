// Data layer. One interface, two backends:
//  - Firebase (Auth + Firestore) once config.js is filled in
//  - Demo mode (this browser's storage) before that, or with ?demo in the address
// Firestore layout:
//   users/{uid}      { email, name, createdAt, planUntil (Timestamp|null), branding {...} }
//   admins/{uid}     {}   <- create this document by hand in the console to make yourself admin
//   questions/{id}   { exam[], cls, subject, chapter, type, text, opts[], reason, case, ans, marks, hasImg, imgAR, imgW, createdAt }
//   qimages/{id}     { data }   <- diagram as a compressed data URL (free plan has no Cloud Storage)
//   meta/chapters    { c: { "10|Science": ["Human Heart", ...] } }
import { firebaseConfig, MODE } from "./config.js";

export const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE") || new URLSearchParams(location.search).has("demo");

export async function createApi() { return MODE === "offline" ? localApi() : DEMO ? demoApi() : firebaseApi(); }

// Firestore refuses `undefined`, so drop empty fields before saving
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
const key = (cls, subject) => cls + "|" + subject;

async function firebaseApi() {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const toMs = t => (t && t.toMillis ? t.toMillis() : null);

  return {
    mode: "firebase",
    onAuth(cb) { A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email || "", name: u.displayName || "" } : null)); },
    signInGoogle() { return A.signInWithPopup(auth, new A.GoogleAuthProvider()); },
    signInEmail(e, p) { return A.signInWithEmailAndPassword(auth, e, p); },
    async signUpEmail(e, p, name) {
      const c = await A.createUserWithEmailAndPassword(auth, e, p);
      if (name) await A.updateProfile(c.user, { displayName: name });
      return c;
    },
    resetPassword(e) { return A.sendPasswordResetEmail(auth, e); },
    signOut() { return A.signOut(auth); },

    async loadProfile(u) {
      const ref = F.doc(db, "users", u.uid);
      let snap = await F.getDoc(ref);
      if (!snap.exists()) {
        await F.setDoc(ref, { email: u.email, name: u.name || "", createdAt: F.serverTimestamp(), planUntil: null, branding: {} });
        snap = await F.getDoc(ref);
      }
      let admin = false;
      try { admin = (await F.getDoc(F.doc(db, "admins", u.uid))).exists(); } catch (e) { admin = false; }
      const d = snap.data();
      return { admin, planUntil: toMs(d.planUntil), branding: d.branding || {}, name: d.name || "" };
    },
    saveBranding(uid, branding) { return F.updateDoc(F.doc(db, "users", uid), { branding }); },

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
    async users() {
      const r = await F.getDocs(F.query(F.collection(db, "users"), F.orderBy("createdAt", "desc"), F.limit(1000)));
      const admins = new Set((await F.getDocs(F.collection(db, "admins"))).docs.map(d => d.id));
      return r.docs.map(d => { const x = d.data(); return { uid: d.id, email: x.email, name: x.name, createdAt: toMs(x.createdAt), planUntil: toMs(x.planUntil), admin: admins.has(d.id) }; });
    },
    setPlan(uid, ms) { return F.updateDoc(F.doc(db, "users", uid), { planUntil: ms == null ? null : F.Timestamp.fromMillis(ms) }); }
  };
}

// ---------------- Demo backend (browser storage only) ----------------
function demoApi() {
  const get = (k, d) => { try { const v = localStorage.getItem("demo_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem("demo_" + k, JSON.stringify(v)); } catch (e) { throw new Error("This browser is out of space for demo data."); } };
  let listeners = [];
  const current = () => { const id = get("session", null); const u = id && get("users", {})[id]; return u ? { uid: id, email: u.email, name: u.name } : null; };
  const emit = () => listeners.forEach(cb => cb(current()));
  const login = (email, name, pass, create) => {
    const users = get("users", {});
    let id = Object.keys(users).find(k => users[k].email.toLowerCase() === email.toLowerCase());
    if (create) {
      if (id) throw { code: "auth/email-already-in-use" };
      id = "u" + Date.now().toString(36);
      users[id] = { email, name: name || "", pass, planUntil: null, branding: {}, createdAt: Date.now(), admin: Object.keys(users).length === 0 };
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
    async loadProfile(u) { const x = get("users", {})[u.uid]; return wait({ admin: !!x.admin, planUntil: x.planUntil, branding: x.branding || {}, name: x.name }); },
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
    async users() { return wait(Object.entries(get("users", {})).map(([uid, x]) => ({ uid, email: x.email, name: x.name, createdAt: x.createdAt, planUntil: x.planUntil, admin: !!x.admin })).sort((a, b) => b.createdAt - a.createdAt)); },
    async setPlan(uid, ms) { const us = get("users", {}); us[uid].planUntil = ms; set("users", us); }
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
    async users() { return []; },
    async setPlan() {},
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
