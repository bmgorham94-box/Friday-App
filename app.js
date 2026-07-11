// ============================================================
// Friday Decider — app orchestrator
// Resolves the household + member, wires the store's live sync
// to the view, and owns the optimistic-write / stale-guard rules.
// ============================================================
import { createStore } from "./firestore.js";
import { getWeather, weekendForecast, decisionVerdict } from "./weather.js";
import { seedHousehold, freshCurrentWeekend, defaultProfile, MEMBERS } from "./data.js";
import { currentFriday, makeSlug } from "./util.js";
import * as ui from "./ui.js";

// ---------------- app state ----------------
const state = {
  householdId: null,
  me: null,                 // "Brandon" | "Joey"
  household: null,          // the synced doc
  weather: null,
  fc: null,                 // weekend forecast (sat/sun)
  verdict: null,
  saving: false,
  lastLocalMutationAt: 0,   // stale-write guard reference
  rolledFor: null,
  screen: "home",
  sheet: null,              // 'detail' | 'packing' | 'trip' | 'settingsish' | null
  weatherFetchedAt: 0,
};

let store = null;
let unsub = null;
let heartbeatTimer = null;
let presenceTick = null;

const LS = {
  household: "friday.household",
  me: "friday.me",
  a2hs: "friday.a2hs.dismissed",
};

// ---------------- boot ----------------
init();

async function init() {
  ui.wireSheetDismiss();
  wireNav();
  wireA2HS();

  resolveHousehold();
  state.me = localStorage.getItem(LS.me) || null;

  store = await createStore();
  if (store.mode === "local") {
    ui.ribbon("On this device only — add Firebase in the README to sync both phones.", "local");
  }

  await loadWeather();           // best-effort; renders when household arrives
  subscribeHousehold();
  startPresence();
  registerSW();

  // First-run experiences (after a tick so the first snapshot can land).
  setTimeout(firstRunIfNeeded, 400);
}

function resolveHousehold() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  let hid = hash.get("h");
  if (!hid) hid = localStorage.getItem(LS.household);
  if (hid) {
    localStorage.setItem(LS.household, hid);
    if (!location.hash) location.hash = "h=" + hid;
  }
  state.householdId = hid; // may be null -> first-run creates one
}

// ---------------- sync ----------------
function subscribeHousehold() {
  if (!state.householdId) return; // wait for first-run
  if (unsub) unsub();
  let seeded = false;
  unsub = store.subscribe(state.householdId, (doc) => {
    if (doc === undefined) {           // snapshot error
      ui.ribbon("Reconnecting…", "");
      return;
    }
    if (store.mode === "cloud") ui.ribbon("");
    if (doc === null) {                // not created yet
      if (!seeded) {
        seeded = true;
        store.ensureSeed(state.householdId, seedHousehold(currentFriday())).catch(console.warn);
      }
      return;
    }
    applySnapshot(doc);
  });
}

// Merge an incoming snapshot, honoring the last-write-wins stale guard on
// currentWeekend: only accept incoming currentWeekend if its updatedAt is
// strictly newer than our last local mutation.
function applySnapshot(doc) {
  const incomingCw = doc.currentWeekend || freshCurrentWeekend(currentFriday());
  const localCw = state.household?.currentWeekend;
  let cw;
  if (!localCw) cw = incomingCw;
  else if ((incomingCw.updatedAt || 0) > state.lastLocalMutationAt) cw = incomingCw;
  else cw = localCw; // keep our just-made choice; late snapshot is stale

  state.household = {
    profile: doc.profile || defaultProfile(),
    trips: doc.trips || [],
    currentWeekend: cw,
    presence: doc.presence || {},
  };
  recomputeWeather();
  maybeRollover();
  renderCurrent();
  rerenderSheetIfOpen();
}

function maybeRollover() {
  const cw = state.household.currentWeekend;
  const thisFri = currentFriday();
  if (cw?.weekOf && cw.weekOf < thisFri && state.rolledFor !== thisFri) {
    state.rolledFor = thisFri;
    const fresh = freshCurrentWeekend(thisFri);
    const ts = Date.now();
    fresh.updatedAt = ts;
    state.lastLocalMutationAt = ts;
    state.household.currentWeekend = fresh;
    store.update(state.householdId, { currentWeekend: fresh }).catch(console.warn);
  }
}

// ---------------- weather ----------------
async function loadWeather() {
  const profile = state.household?.profile || defaultProfile();
  state.weather = await getWeather(profile);
  state.weatherFetchedAt = Date.now();
  recomputeWeather();
  if (state.household) renderCurrent();
}

function recomputeWeather() {
  if (!state.weather || !state.household) return;
  const fri = state.household.currentWeekend?.weekOf || currentFriday();
  state.fc = weekendForecast(state.weather, fri);
  state.verdict = decisionVerdict(state.fc);
}

// ---------------- mutations ----------------
// Optimistic currentWeekend write + stale-guard bookkeeping.
function mutateWeekend(fields) {
  const cw = state.household.currentWeekend;
  const ts = Date.now();
  state.lastLocalMutationAt = ts;
  state.household.currentWeekend = { ...cw, ...fields, updatedAt: ts };
  const map = { "currentWeekend.updatedAt": ts };
  for (const [k, v] of Object.entries(fields)) map["currentWeekend." + k] = v;
  return store.update(state.householdId, map).catch((err) => {
    console.warn(err);
    ui.toast("Couldn't sync that yet — will retry when you're back online.");
  });
}

// ---------------- handlers ----------------
const handlers = {
  onChooseTrip(tripId, vibeId) {
    if (state.household.currentWeekend.lockedBy) return;
    const fields = { selectedTripId: tripId };
    if (vibeId) fields.sundayVibe = vibeId;
    mutateWeekend(fields);
    renderCurrent();
  },

  onOpenDetail(tripId) {
    const trip = state.household.trips.find((t) => t.id === tripId);
    if (!trip) return;
    state.sheet = "detail";
    state.sheetTripId = tripId;
    ui.openSheet(ui.detailSheet(trip, state, handlers), () => (state.sheet = null));
  },

  async onLock() {
    if (!state.me) { openWhoAreYou(); return; }
    const cw = state.household.currentWeekend;
    if (!cw.selectedTripId || !cw.sundayVibe) { ui.toast("Pick a trip and a Sunday vibe first."); return; }
    state.saving = true;
    renderCurrent();
    const ts = Date.now();
    try {
      state.lastLocalMutationAt = ts;
      state.household.currentWeekend = { ...cw, lockedBy: state.me, lockedAt: ts, updatedAt: ts };
      await store.update(state.householdId, {
        "currentWeekend.lockedBy": state.me,
        "currentWeekend.lockedAt": ts,
        "currentWeekend.updatedAt": ts,
      });
      state.saving = false;
      renderCurrent();
      ui.toast("Locked in — have a good one 🥾");
      handlers.onOpenPacking(); // reuses the open sheet, swapping in the packing list
    } catch (err) {
      state.saving = false;
      console.warn(err);
      ui.toast("Couldn't lock in — check your connection.");
      renderCurrent();
    }
  },

  onChangePlan() {
    mutateWeekend({ lockedBy: null, lockedAt: null });
    renderCurrent();
  },

  onOpenPacking() {
    state.sheet = "packing";
    state.lastPackingSig = JSON.stringify(state.household.currentWeekend.packingChecked || {});
    ui.openSheet(ui.packingSheet(state, handlers), () => (state.sheet = null));
  },

  onTogglePack(item, checked) {
    const cur = state.household.currentWeekend.packingChecked || {};
    const next = { ...cur, [item]: checked };
    mutateWeekend({ packingChecked: next });
    state.lastPackingSig = JSON.stringify(next);
    if (state.sheet === "packing") ui.openSheet(ui.packingSheet(state, handlers), () => (state.sheet = null));
  },

  // library
  onAddTrip() {
    state.sheet = "trip";
    ui.openSheet(ui.tripFormSheet(null, handlers), () => (state.sheet = null));
  },
  onEditTrip(id) {
    const trip = state.household.trips.find((t) => t.id === id);
    state.sheet = "trip";
    ui.openSheet(ui.tripFormSheet(trip, handlers), () => (state.sheet = null));
  },
  async onSaveTrip(trip) {
    const trips = [...state.household.trips];
    const idx = trips.findIndex((t) => t.id === trip.id);
    if (idx >= 0) trips[idx] = trip; else trips.push(trip);
    state.household.trips = trips;
    ui.closeSheet();
    renderCurrent();
    await store.update(state.householdId, { trips }).catch(console.warn);
    ui.toast(idx >= 0 ? "Trip saved" : "Trip added");
  },
  async onDeleteTrip(id) {
    const trips = state.household.trips.filter((t) => t.id !== id);
    state.household.trips = trips;
    // if the deleted trip was selected, clear the selection
    if (state.household.currentWeekend.selectedTripId === id) {
      mutateWeekend({ selectedTripId: null, lockedBy: null, lockedAt: null });
    }
    ui.closeSheet();
    renderCurrent();
    await store.update(state.householdId, { trips }).catch(console.warn);
    ui.toast("Trip deleted");
  },

  // settings
  onSetMember(name) {
    state.me = name;
    localStorage.setItem(LS.me, name);
    sendHeartbeat();
    renderCurrent();
  },
  async onSaveProfile(profile) {
    state.household.profile = profile;
    renderCurrent();
    recomputeWeather();
    await store.update(state.householdId, { profile }).catch(console.warn);
    await loadWeather(); // home base may have moved
    ui.toast("Settings saved");
  },
  onShare() { shareHousehold(); },
};

// ---------------- render dispatch ----------------
function renderCurrent() {
  if (!state.household) return;
  if (state.screen === "home") ui.renderHome(state, handlers);
  else if (state.screen === "library") ui.renderLibrary(state, handlers);
  else if (state.screen === "settings") ui.renderSettings(state, handlers);
  // hide the home CTA anywhere but home
  if (state.screen !== "home") document.getElementById("ctaBar").hidden = true;
}

function rerenderSheetIfOpen() {
  // Keep the shared packing checklist live as the partner taps — but only
  // rebuild when the checklist actually changed, so a heartbeat-triggered
  // snapshot doesn't reset the user's scroll position.
  if (state.sheet === "packing" && !document.getElementById("sheet").hidden) {
    const sig = JSON.stringify(state.household.currentWeekend.packingChecked || {});
    if (sig !== state.lastPackingSig) {
      state.lastPackingSig = sig;
      ui.openSheet(ui.packingSheet(state, handlers), () => (state.sheet = null));
    }
  }
}

// ---------------- navigation ----------------
function wireNav() {
  document.querySelectorAll("[data-nav]").forEach((b) =>
    b.addEventListener("click", () => showScreen(b.dataset.nav))
  );
}
function showScreen(name) {
  state.screen = name;
  ["home", "library", "settings"].forEach((s) => {
    document.getElementById("screen-" + s).hidden = s !== name;
  });
  document.querySelectorAll(".tab").forEach((t) =>
    t.setAttribute("aria-current", t.dataset.nav === name ? "page" : "false")
  );
  renderCurrent();
}

// ---------------- presence ----------------
function startPresence() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sendHeartbeat();
      ensureHeartbeat();
      maybeRefreshWeather();
    } else {
      clearInterval(heartbeatTimer); heartbeatTimer = null;
    }
  });
  if (document.visibilityState === "visible") { sendHeartbeat(); ensureHeartbeat(); }
  // lightweight tick so "looking now" expires on its own (no full re-render)
  presenceTick = setInterval(() => {
    if (state.household) ui.renderPresence(state);
  }, 5000);
}
function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(sendHeartbeat, 10000);
}
function sendHeartbeat() {
  if (!state.me || !state.householdId || !state.household) return;
  store.update(state.householdId, { ["presence." + state.me + ".lastSeen"]: Date.now() }).catch(() => {});
}

function maybeRefreshWeather() {
  if (Date.now() - state.weatherFetchedAt > 20 * 60 * 1000) loadWeather();
}

// ---------------- first-run ----------------
function firstRunIfNeeded() {
  if (!state.householdId) { openWelcome(); return; }
  if (!state.me) { openWhoAreYou(); return; }
}

function openWelcome() {
  const hid = makeSlug();
  const node = document.createElement("div");
  node.innerHTML = `
    <div class="pack-hero"><div class="kick">Welcome</div><h2>Friday Decider</h2></div>
    <p class="sub">Two phones, one weekend plan. Here's your private household — share it once with your partner and you'll both see the same live picks.</p>
    <div class="settings-group" style="margin:8px 0">
      <h2>Your household ID</h2>
      <div class="share-box"><code>${hid}</code></div>
    </div>
    <div class="sheet__section"><h3>Who are you?</h3><div class="member-pick" id="w-member">
      ${MEMBERS.map((m) => `<button type="button" class="member-pick__btn" data-member="${m}">${m}</button>`).join("")}
    </div></div>
    <div class="sheet__cta" style="display:flex;gap:10px">
      <button class="btn-outline" id="w-share" type="button">Share ID</button>
      <button class="btn-cta" id="w-go" type="button" style="flex:1" disabled>Choose your name</button>
    </div>`;
  let chosen = null;
  node.querySelectorAll("[data-member]").forEach((b) => b.addEventListener("click", () => {
    chosen = b.dataset.member;
    node.querySelectorAll("[data-member]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const go = node.querySelector("#w-go"); go.disabled = false; go.textContent = "Start deciding";
  }));
  node.querySelector("#w-share").addEventListener("click", () => shareHousehold(hid));
  node.querySelector("#w-go").addEventListener("click", () => {
    if (!chosen) return;
    state.householdId = hid;
    localStorage.setItem(LS.household, hid);
    location.hash = "h=" + hid;
    state.me = chosen; localStorage.setItem(LS.me, chosen);
    ui.closeSheet();
    subscribeHousehold();
    sendHeartbeat();
  });
  state.sheet = "welcome";
  ui.openSheet(node, () => (state.sheet = null));
}

function openWhoAreYou() {
  const node = document.createElement("div");
  node.innerHTML = `
    <div class="pack-hero"><div class="kick">One quick thing</div><h2>Who's picking?</h2></div>
    <p class="sub">So your partner sees "you're looking now" and who locked the plan in.</p>
    <div class="member-pick" id="wa-member" style="margin-top:14px">
      ${MEMBERS.map((m) => `<button type="button" class="member-pick__btn" data-member="${m}">${m}</button>`).join("")}
    </div>`;
  node.querySelectorAll("[data-member]").forEach((b) => b.addEventListener("click", () => {
    handlers.onSetMember(b.dataset.member);
    ui.closeSheet();
  }));
  state.sheet = "who";
  ui.openSheet(node, () => (state.sheet = null));
}

function shareHousehold(hid = state.householdId) {
  const url = location.origin + location.pathname + "#h=" + hid;
  if (navigator.share) {
    navigator.share({ title: "Friday Decider", text: "Join our weekend plan:", url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => ui.toast("Link copied — text it to your partner")).catch(() => ui.toast(url));
  } else {
    ui.toast(url);
  }
}

// ---------------- A2HS + service worker ----------------
function wireA2HS() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (isIos && !standalone && !localStorage.getItem(LS.a2hs)) {
    const el = document.getElementById("a2hs");
    setTimeout(() => (el.hidden = false), 3500);
    document.getElementById("a2hsClose").addEventListener("click", () => {
      el.hidden = true;
      localStorage.setItem(LS.a2hs, "1");
    });
  }
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW:", e))
    );
  }
}
