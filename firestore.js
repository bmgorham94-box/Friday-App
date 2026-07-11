// ============================================================
// Friday Decider — shared-state store
// Primary: Firebase Cloud Firestore (Spark plan) with offline
// persistence + real-time onSnapshot.
// Fallback: a localStorage store with the SAME interface, used
// when Firebase isn't configured yet or fails to load. The rest
// of the app never needs to know which one it's talking to.
//
// Store interface:
//   store.mode                         'cloud' | 'local'
//   store.subscribe(hid, cb) -> unsub  cb(householdDoc | null)
//   store.ensureSeed(hid, seedDoc)     create doc if missing
//   store.update(hid, fieldMap)        dotted-path field updates
//   store.setPath(obj, path, value)    (local helper, exported for tests)
// ============================================================
import { firebaseConfig, isConfigured } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.5";

export async function createStore() {
  if (isConfigured()) {
    try {
      return await createCloudStore();
    } catch (err) {
      console.warn("[Friday] Firestore init failed, using local store:", err);
    }
  }
  return createLocalStore();
}

// -------------------- CLOUD --------------------
async function createCloudStore() {
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  const fs = await import(`${SDK}/firebase-firestore.js`);

  const app = initializeApp(firebaseConfig);

  // Offline persistence: the app shell + last synced state survive reloads
  // and flaky coffee-shop wifi. Multi-tab safe.
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app); // persistence unavailable (e.g. private mode)
  }

  const ref = (hid) => fs.doc(db, "households", hid);

  return {
    mode: "cloud",

    subscribe(hid, cb) {
      return fs.onSnapshot(
        ref(hid),
        { includeMetadataChanges: false },
        (snap) => cb(snap.exists() ? snap.data() : null),
        (err) => { console.warn("[Friday] snapshot error:", err); cb(undefined); }
      );
    },

    async ensureSeed(hid, seedDoc) {
      const snap = await fs.getDoc(ref(hid));
      if (!snap.exists()) await fs.setDoc(ref(hid), seedDoc);
    },

    async update(hid, fieldMap) {
      await fs.updateDoc(ref(hid), fieldMap);
    },
  };
}

// -------------------- LOCAL --------------------
function createLocalStore() {
  const KEY = (hid) => `friday.hh.${hid}`;
  const subs = new Map(); // hid -> Set<cb>

  const read = (hid) => {
    try { const r = localStorage.getItem(KEY(hid)); return r ? JSON.parse(r) : null; }
    catch { return null; }
  };
  const write = (hid, doc) => {
    try { localStorage.setItem(KEY(hid), JSON.stringify(doc)); } catch {}
    (subs.get(hid) || []).forEach((cb) => cb(doc));
  };

  // Cross-tab sync on the same device.
  window.addEventListener("storage", (e) => {
    for (const [hid, set] of subs) {
      if (e.key === KEY(hid)) {
        const doc = read(hid);
        set.forEach((cb) => cb(doc));
      }
    }
  });

  return {
    mode: "local",

    subscribe(hid, cb) {
      if (!subs.has(hid)) subs.set(hid, new Set());
      subs.get(hid).add(cb);
      Promise.resolve().then(() => cb(read(hid))); // async, like onSnapshot
      return () => subs.get(hid)?.delete(cb);
    },

    async ensureSeed(hid, seedDoc) {
      if (!read(hid)) write(hid, seedDoc);
    },

    async update(hid, fieldMap) {
      const doc = read(hid) || {};
      for (const [path, value] of Object.entries(fieldMap)) {
        setPath(doc, path, value);
      }
      write(hid, doc);
    },
  };
}

// Apply a dotted "a.b.c" path onto an object (used by the local store).
export function setPath(obj, path, value) {
  const parts = path.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
    node = node[k];
  }
  node[parts[parts.length - 1]] = value;
  return obj;
}
