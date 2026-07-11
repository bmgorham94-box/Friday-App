// ============================================================
// Friday Decider — rendering + bottom-sheet control
// Pure-ish view layer: render functions read state and write DOM,
// wiring interactions to callbacks passed in `h` (handlers).
// ============================================================
import { escapeHtml, driveLabel, clockFromTs, weekdayShort } from "./util.js";
import { dayView, weatherFit } from "./weather.js";
import { VIBES, feasibility, vibeById, MEMBERS, TYPE_BADGES, wildcardAsTrip } from "./data.js";
import { buildPacking, packingItems } from "./packing.js";

const $ = (id) => document.getElementById(id);

// ---------- tiny helpers ----------
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => (t.hidden = true), 250);
  }, 2600);
}

export function ribbon(text, kind) {
  const r = $("ribbon");
  if (!text) { r.hidden = true; return; }
  r.hidden = false;
  r.textContent = text;
  r.className = "ribbon" + (kind ? " " + kind : "");
}

// ---------- bottom sheet ----------
let sheetCloser = null;
let hideTimer = null;
export function openSheet(node, onClose) {
  const sheet = $("sheet"), scrim = $("sheetScrim"), body = $("sheetBody");
  clearTimeout(hideTimer); // cancel any in-flight close so we don't self-hide
  body.replaceChildren(node);
  sheet.hidden = false; scrim.hidden = false;
  requestAnimationFrame(() => { sheet.classList.add("is-open"); scrim.classList.add("is-open"); });
  sheetCloser = onClose || null;
}
export function closeSheet() {
  const sheet = $("sheet"), scrim = $("sheetScrim");
  sheet.classList.remove("is-open"); scrim.classList.remove("is-open");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { sheet.hidden = true; scrim.hidden = true; }, 280);
  const c = sheetCloser; sheetCloser = null;
  if (c) c();
}
export function wireSheetDismiss() {
  $("sheetScrim").addEventListener("click", closeSheet);
  $("sheetHandle").addEventListener("click", closeSheet);
  $("sheetHandle").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeSheet(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("sheet").hidden) closeSheet();
  });
}

// ============================================================
// HOME
// ============================================================
export function renderHome(state, h) {
  renderWeather(state);
  renderPresence(state);
  const cw = state.household.currentWeekend;
  const locked = !!cw.lockedBy && !!cw.selectedTripId;
  $("lockedBanner").hidden = !locked;
  $("cards").hidden = locked;
  $("emptyState").hidden = true;
  $("wildcardBtn").hidden = false;

  if (locked) {
    renderLocked(state, h);
    $("ctaBar").hidden = true;
    $("varietyNudge").hidden = true;
    return;
  }
  if (!state.household.trips.length) {
    renderEmpty(h);
    $("cards").hidden = true;
    $("ctaBar").hidden = true;
    $("varietyNudge").hidden = true;
    return;
  }
  renderCards(state, h);
  renderVariety(state, h);
  renderCTA(state, h);
}

// Gentle, dismissible nudge when all three slotted trips are the same type.
function renderVariety(state, h) {
  const el = $("varietyNudge");
  if (state.varietyDismissed) { el.hidden = true; return; }
  const slotted = ["A", "B", "C"].map((s) => state.household.trips.find((t) => t.slot === s)).filter(Boolean);
  const types = new Set(slotted.map((t) => t.type));
  if (slotted.length < 3 || types.size !== 1) { el.hidden = true; return; }
  const kind = [...types][0];
  const swap = kind === "hike" ? "a city day" : "a trail";
  const label = kind === "hike" ? "All trails this week" : kind === "town" ? "All city days this week" : "Same vibe all week";
  el.hidden = false;
  el.innerHTML = `<span>${label} — want to swap one for ${swap}?</span>
    <button class="variety-nudge__x" type="button" aria-label="Dismiss">✕</button>`;
  el.querySelector(".variety-nudge__x").addEventListener("click", () => { state.varietyDismissed = true; el.hidden = true; });
}

function renderWeather(state) {
  const el = $("weatherStrip").querySelector(".weather-strip__inner");
  const w = state.weather, fc = state.fc, verdict = state.verdict;
  if (!w) { el.innerHTML = `<div class="weather-loading">Checking the skies…</div>`; return; }

  const sat = dayView(fc.sat), sun = dayView(fc.sun);
  const dayCard = (name, d) => {
    if (!d) return `<div class="wx-day"><div class="wx-day__name">${name}</div><div class="wx-day__meta">—</div></div>`;
    return `<div class="wx-day">
      <div class="wx-day__name">${name}</div>
      <div class="wx-day__temps">${d.hi}°<span class="lo"> / ${d.lo}°</span></div>
      <div class="wx-day__meta"><span class="wx-icon">${d.icon}</span> ${d.precip}% · ${escapeHtml(d.label)}</div>
    </div>`;
  };
  const fri = state.household.currentWeekend.weekOf;
  const satName = "Sat", sunName = "Sun";

  const toneClass = verdict.tone === "good" ? "is-good" : verdict.tone === "warn" ? "is-warn" : "";
  el.innerHTML = `
    <div class="wx-days">${dayCard(satName, sat)}${dayCard(sunName, sun)}</div>
    <div class="wx-verdict ${toneClass}"><span class="dot"></span>${escapeHtml(verdict.text)}</div>
    ${w.stale ? `<div class="wx-stale">⚠︎ Couldn't reach the weather service — showing the last forecast we saved.</div>` : ""}
  `;
}

export function renderPresence(state) {
  const el = $("presence");
  const p = state.household.presence || {};
  const partner = MEMBERS.find((m) => m !== state.me) || "Your partner";
  const seen = p[partner]?.lastSeen || 0;
  const fresh = Date.now() - seen < 15000;
  if (fresh) {
    el.hidden = false;
    el.innerHTML = `<span class="pulse"></span>${escapeHtml(partner)} is looking now`;
  } else {
    el.hidden = true;
  }
}

function renderCards(state, h) {
  const box = $("cards");
  box.hidden = false;
  const sel = state.household.currentWeekend.selectedTripId;
  const cards = orderedTrips(state.household.trips).map((t) => cardEl(t, state, h, sel === t.id));
  if (state.household.currentWeekend.wildcard) {
    cards.push(wildcardCardEl(state, h, sel === "wildcard"));
  }
  box.replaceChildren(...cards);
}

function orderedTrips(trips) {
  const order = { A: 0, B: 1, C: 2 };
  return [...trips].sort((a, b) => (order[a.slot] ?? 9) - (order[b.slot] ?? 9) || a.name.localeCompare(b.name));
}

function cardEl(trip, state, h, selected) {
  const fit = weatherFit(trip, state.fc);
  const suggested = state.verdict.slot === trip.slot;
  const el = document.createElement("article");
  el.className = "card" + (selected ? " is-selected" : "");

  const dogChip = trip.dogNotes
    ? `<span class="chip chip--dog">🐾 ${escapeHtml(dogHint(trip.dogNotes))}</span>` : "";
  const pickChip = suggested
    ? `<span class="chip chip--pick">◆ Weather pick</span>` : "";
  const driveChip = trip.driveMinutes != null
    ? `<span class="chip chip--drive">🚗 ${driveLabel(trip.driveMinutes)}</span>` : "";

  el.innerHTML = `
    <div class="card__photo">
      ${typeBadgeHtml(trip.type)}
      <span class="card__slot">${escapeHtml(trip.slot || "?")}</span>
      <div class="card__scrim"></div>
      ${photoImg(trip.photoUrl, trip.name)}
      <div class="card__title-on-photo"><h2>${escapeHtml(trip.name)}</h2></div>
    </div>
    <div class="card__body">
      <p class="card__why">${escapeHtml(trip.whyLine || "")}</p>
      <div class="card__meta">
        ${driveChip}
        <span class="chip chip--fit-${fit.kind === "warn" ? "warn" : fit.kind === "good" ? "good" : "neutral"}">${escapeHtml(fit.text)}</span>
        ${pickChip}
        ${dogChip}
      </div>
      <div class="card__cta-row">
        <button class="card__select" type="button" data-act="choose">${selected ? "Selected ✓" : "Choose this"}</button>
        <button class="card__detail-link" type="button" data-act="detail" aria-label="Details & Sunday vibe">›</button>
      </div>
    </div>`;

  el.querySelector('[data-act="choose"]').addEventListener("click", () => h.onChooseTrip(trip.id));
  el.querySelector('[data-act="detail"]').addEventListener("click", () => h.onOpenDetail(trip.id));
  el.querySelector(".card__photo").addEventListener("click", () => h.onOpenDetail(trip.id));
  return el;
}

function dogHint(notes) {
  const s = notes.length > 34 ? notes.slice(0, 32).trim() + "…" : notes;
  return s;
}

function photoImg(url, alt) {
  if (!url) return `<div style="width:100%;height:100%;display:grid;place-items:center;font-size:40px">🏔️</div>`;
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"
    onerror="this.replaceWith(Object.assign(document.createElement('div'),{style:'width:100%;height:100%;display:grid;place-items:center;font-size:40px',textContent:'🏔️'}))" />`;
}

// ---------- wildcard card (the fun centerpiece) ----------
function wildcardFaceUp(state, trip, withActions, selected) {
  const fit = weatherFit(trip, state.fc);
  const note = withActions
    ? `<div class="card__cta-row">
         <button class="card__select" type="button" data-act="choose">${selected ? "Selected ✓" : "Choose this"}</button>
         <button class="card__detail-link" type="button" data-act="detail" aria-label="Details & Sunday vibe">›</button>
       </div>`
    : `<div class="wc-planter-note">Planted — ${escapeHtml(MEMBERS.find((m) => m !== state.me) || "your partner")} will see it Friday</div>`;
  return `
    <div class="card__photo">
      ${typeBadgeHtml(trip.type)}
      <span class="card__slot" aria-label="Wildcard">★</span>
      <div class="card__scrim"></div>
      ${trip.photoUrl ? photoImg(trip.photoUrl, trip.name) : `<div class="wc-motif"></div>`}
      <div class="card__title-on-photo"><h2>${escapeHtml(trip.name)}</h2></div>
    </div>
    <div class="card__body">
      ${trip.whyLine ? `<p class="card__why">${escapeHtml(trip.whyLine)}</p>` : ""}
      <div class="card__meta">
        <span class="chip chip--wild">🃏 Wildcard</span>
        <span class="chip chip--fit-${fit.kind === "warn" ? "warn" : fit.kind === "good" ? "good" : "neutral"}">${escapeHtml(fit.text)}</span>
      </div>
      ${note}
    </div>`;
}

function wildcardFaceDown(partner) {
  return `<div class="wc-back-face">
      <div class="wc-motif wc-motif--back"></div>
      <div class="wc-back-copy">
        <div class="wc-card-mark">🃏</div>
        <div class="wc-back-line">${escapeHtml(partner)} planted a wildcard</div>
        <div class="wc-back-hint">Tap to flip</div>
      </div>
    </div>`;
}

function wildcardCardEl(state, h, selected) {
  const wc = state.household.currentWeekend.wildcard;
  const trip = wildcardAsTrip(wc);
  const mine = wc.plantedBy === state.me;
  const revealed = !!wc.revealed;
  const partner = wc.plantedBy || "Your partner";

  const el = document.createElement("article");
  el.className = "card wildcard-card";

  const wireActions = () => {
    const choose = el.querySelector('[data-act="choose"]');
    const detail = el.querySelector('[data-act="detail"]');
    if (choose) choose.addEventListener("click", () => h.onChooseTrip("wildcard"));
    if (detail) detail.addEventListener("click", () => h.onOpenDetail("wildcard"));
  };

  // Planter always sees it face-up (no self-suspense). Pre-reveal: a note,
  // not the selectable actions — the reveal is a shared moment.
  if (mine && !revealed) {
    el.innerHTML = wildcardFaceUp(state, trip, false, selected);
    return el;
  }

  // Already revealed and not a fresh reveal to animate: static face-up.
  if (revealed && !state._wcAnimate) {
    el.innerHTML = wildcardFaceUp(state, trip, true, selected);
    wireActions();
    return el;
  }

  // A flip to play — either the non-planter tapping, or a remote reveal
  // landing on this device. Both faces present so the flip can animate.
  el.classList.add("wildcard-card--flip");
  el.innerHTML = `<div class="wc-flip">
      <div class="wc-face wc-face--front">${wildcardFaceDown(partner)}</div>
      <div class="wc-face wc-face--back">${wildcardFaceUp(state, trip, true, selected)}</div>
    </div>`;
  const flip = el.querySelector(".wc-flip");
  wireActions();

  if (revealed) {
    // Remote reveal: start face-down, then flip in on the next frame.
    requestAnimationFrame(() => requestAnimationFrame(() => flip.classList.add("is-flipped")));
    maybeBothHere(state, el);
  } else {
    // Non-planter, not yet revealed: tap flips + reveals for both.
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${partner} planted a wildcard — tap to reveal`);
    const front = el.querySelector(".wc-face--front");
    front.addEventListener("click", () => {
      flip.classList.add("is-flipped");
      maybeBothHere(state, el);
      h.onFlipWildcard();
    });
  }
  return el;
}

// Tiny "you're both here 👀" line under the card when a flip lands while
// both partners are live. Auto-removes after a few seconds.
function maybeBothHere(state, el) {
  const p = state.household.presence || {};
  const partner = MEMBERS.find((m) => m !== state.me);
  const bothLive = partner && Date.now() - (p[partner]?.lastSeen || 0) < 15000;
  if (!bothLive) return;
  const line = document.createElement("div");
  line.className = "wc-both-here";
  line.textContent = "you're both here 👀";
  el.appendChild(line);
  setTimeout(() => line.remove(), 4000);
}

// ---------- plant / edit a wildcard ----------
export function wildcardPlantSheet(state, h) {
  const existing = state.household.currentWeekend.wildcard;
  const replacing = !!existing;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="pack-hero"><div class="kick">Wildcard 🃏</div><h2>Plant something</h2></div>
    <p class="sub">A this-weekend-only find — a market, a show, a pop-up. Your partner sees a face-down card and flips it Friday.</p>
    ${replacing ? `<div class="dognote" style="background:var(--warn-soft);color:var(--warn)">Heads up — this replaces the current wildcard (${escapeHtml(existing.title)}).</div>` : ""}

    <div class="field"><label>What is it?</label><input id="wc-title" type="text" maxlength="60" value="${escapeHtml(existing?.title || "")}" placeholder="Alberta St. Street Fair" /></div>
    <div class="field"><label>One line (optional)</label><input id="wc-note" type="text" maxlength="90" value="${escapeHtml(existing?.note || "")}" placeholder="Food carts + live music til 9" /></div>
    <div class="field"><label>Photo URL (optional)</label><input id="wc-photo" type="url" value="${escapeHtml(existing?.photoUrl || "")}" placeholder="https://…" /></div>

    <div class="field"><label>Type (optional)</label>
      <div class="type-pick" id="wc-type">
        ${typePickButtons(existing?.type)}
      </div>
    </div>

    <div class="sheet__cta">
      <button class="btn-cta" id="wc-plant" type="button" disabled>${replacing ? "Replace wildcard" : "Plant it"}</button>
    </div>`;

  let type = existing?.type || null;
  wrap.querySelectorAll("#wc-type [data-type]").forEach((b) => b.addEventListener("click", () => {
    type = type === b.dataset.type ? null : b.dataset.type; // toggle off if re-tapped
    wrap.querySelectorAll("#wc-type [data-type]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.type === type)));
  }));

  const titleInput = wrap.querySelector("#wc-title");
  const plantBtn = wrap.querySelector("#wc-plant");
  const sync = () => (plantBtn.disabled = !titleInput.value.trim());
  titleInput.addEventListener("input", sync);
  sync();

  plantBtn.addEventListener("click", () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    h.onPlantWildcard({
      title,
      note: wrap.querySelector("#wc-note").value.trim(),
      photoUrl: wrap.querySelector("#wc-photo").value.trim() || null,
      type,
    });
  });
  return wrap;
}

function typePickButtons(current) {
  return ["hike", "town", "mixed"].map((t) => {
    const b = TYPE_BADGES[t];
    return `<button type="button" class="type-pick__btn" data-type="${t}" aria-pressed="${current === t}">${b.emoji} ${escapeHtml(b.label)}</button>`;
  }).join("");
}

function renderCTA(state, h) {
  const bar = $("ctaBar"), btn = $("lockBtn"), label = $("lockBtnLabel");
  bar.hidden = false;
  const cw = state.household.currentWeekend;
  const trip = tripById(state, cw.selectedTripId);
  const vibe = cw.sundayVibe;
  btn.classList.toggle("is-saving", state.saving);

  if (state.saving) { btn.disabled = true; label.textContent = "Saving…"; return; }
  if (!trip) { btn.disabled = true; label.textContent = "Pick a trip"; btn.onclick = null; return; }
  if (!vibe) {
    btn.disabled = false;
    label.textContent = "Choose a Sunday vibe";
    btn.onclick = () => h.onOpenDetail(trip.id);
    return;
  }
  btn.disabled = false;
  label.textContent = `Lock in ${trip.name.split(",")[0]}`;
  btn.onclick = () => h.onLock();
}

function renderLocked(state, h) {
  const el = $("lockedBanner");
  const cw = state.household.currentWeekend;
  const trip = tripById(state, cw.selectedTripId);
  const vibe = vibeById(cw.sundayVibe);
  if (!trip) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    ${trip.photoUrl ? `<img class="locked__photo" src="${escapeHtml(trip.photoUrl)}" alt="${escapeHtml(trip.name)}" />` : ""}
    <div class="locked__body">
      <span class="locked__stamp">✓ Locked in by ${escapeHtml(cw.lockedBy)} · ${clockFromTs(cw.lockedAt)}</span>
      <div>
        <div class="locked__title">${escapeHtml(trip.name)}</div>
        <div class="locked__sub">${vibe ? vibe.label + " → " + vibe.hint : ""}${trip.driveMinutes != null ? " · " + driveLabel(trip.driveMinutes) + " each way" : ""}</div>
      </div>
      <div class="locked__actions">
        <button class="btn-solid" data-act="packing" type="button">📋 Packing list</button>
        <button class="btn-outline btn-danger" data-act="change" type="button">Change plan</button>
      </div>
    </div>`;
  el.querySelector('[data-act="packing"]').addEventListener("click", () => h.onOpenPacking());
  el.querySelector('[data-act="change"]').addEventListener("click", () => h.onChangePlan());
}

function renderEmpty(h) {
  const el = $("emptyState");
  el.hidden = false;
  el.innerHTML = `
    <div class="empty__mark">🏔️</div>
    <h2>Let's set up your three go-to's</h2>
    <p>Friday Decider works best with one trip per weather mood. Add your first three and you'll be picking in seconds.</p>
    <div class="steps">
      <div class="step"><span class="n">A</span> A sunshine hike</div>
      <div class="step"><span class="n">B</span> A rainy-day backup</div>
      <div class="step"><span class="n">C</span> An easy, low-energy day</div>
    </div>
    <button class="btn-solid" data-act="add" type="button">Add your first trip</button>`;
  el.querySelector('[data-act="add"]').addEventListener("click", () => h.onAddTrip());
}

// ============================================================
// DETAIL / VIBE SHEET
// ============================================================
export function detailSheet(trip, state, h) {
  const wrap = document.createElement("div");
  const profile = state.household.profile;
  const over = trip.costEstimate > profile.budgetCeiling;
  const cw = state.household.currentWeekend;
  const selectedVibe = cw.selectedTripId === trip.id ? cw.sundayVibe : null;

  const driveBit = trip.driveMinutes != null ? ` · ${driveLabel(trip.driveMinutes)} each way` : "";
  wrap.innerHTML = `
    ${trip.photoUrl ? `<img class="sheet__photo" src="${escapeHtml(trip.photoUrl)}" alt="${escapeHtml(trip.name)}" />` : ""}
    <h2>${escapeHtml(trip.name)}${trip.isWildcard ? ' <span class="wc-tag">🃏</span>' : ""}</h2>
    <div class="sub">${escapeHtml(trip.whyLine || "")}${driveBit}</div>

    ${trip.isWildcard ? "" : `<div class="cost-row ${over ? "over" : ""}">
      <div><div class="big">$${trip.costEstimate ?? 0}</div><div class="ceil">estimated</div></div>
      <div style="text-align:right"><div class="ceil">budget ceiling</div><div style="font-weight:700">$${profile.budgetCeiling}</div></div>
    </div>`}
    ${trip.dogNotes ? `<div class="dognote">🐾 ${escapeHtml(trip.dogNotes)}</div>` : ""}

    <div class="sheet__section">
      <h3>Sunday vibe</h3>
      <div class="seg" role="group" aria-label="Sunday vibe"></div>
      <div class="pack-progress__label" id="feasHint" style="text-align:left;margin-top:8px"></div>
    </div>

    <div class="sheet__cta">
      <button class="btn-cta" id="sheetLock" type="button" disabled>Pick a Sunday vibe</button>
    </div>`;

  const seg = wrap.querySelector(".seg");
  const hint = wrap.querySelector("#feasHint");
  const lockBtn = wrap.querySelector("#sheetLock");
  let chosen = selectedVibe;

  const paint = () => {
    seg.replaceChildren(...VIBES.map((v) => {
      const feas = feasibility(trip, v.id, profile);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg__btn" + (feas.warn ? " warn" : "");
      b.setAttribute("aria-pressed", String(chosen === v.id));
      b.innerHTML = `<span>${escapeHtml(v.label)}</span><span class="feas">${escapeHtml(v.hint)}</span>`;
      b.addEventListener("click", () => {
        chosen = v.id;
        h.onChooseTrip(trip.id, v.id); // sets selection (trip + vibe)
        paint();
      });
      return b;
    }));
    if (chosen) {
      const feas = feasibility(trip, chosen, profile);
      hint.textContent = feas.text;
      hint.style.color = feas.warn ? "var(--warn)" : "var(--ink-soft)";
      lockBtn.disabled = false;
      lockBtn.textContent = `Lock it in`;
    } else {
      hint.textContent = "Pick how Sunday ends — it changes what's feasible.";
      lockBtn.disabled = true;
      lockBtn.textContent = "Pick a Sunday vibe";
    }
  };
  paint();

  lockBtn.addEventListener("click", () => h.onLock());
  return wrap;
}

// ============================================================
// PACKING SHEET
// ============================================================
export function packingSheet(state, h) {
  const cw = state.household.currentWeekend;
  const trip = tripById(state, cw.selectedTripId);
  const groups = buildPacking(trip, state.fc, state.household.profile);
  const all = packingItems(groups);
  const checked = cw.packingChecked || {};
  const doneCount = all.filter((i) => checked[i]).length;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="pack-hero">
      <div class="kick">We're really doing this</div>
      <h2>Packing for ${escapeHtml(trip ? trip.name.split(",")[0] : "the weekend")}</h2>
      <div class="pack-progress"><div class="pack-progress__fill" style="width:${all.length ? (doneCount / all.length) * 100 : 0}%"></div></div>
      <div class="pack-progress__label">${doneCount} of ${all.length} packed</div>
    </div>
    <div id="packGroups"></div>`;

  const host = wrap.querySelector("#packGroups");
  groups.forEach((g) => {
    const gEl = document.createElement("div");
    gEl.className = "pack-group";
    gEl.innerHTML = `<h3>${escapeHtml(g.title)}</h3>`;
    g.items.forEach((item) => {
      const on = !!checked[item];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pack-item" + (on ? " checked" : "");
      b.innerHTML = `<span class="pack-box">${on ? "✓" : ""}</span><span class="pack-label">${escapeHtml(item)}</span>`;
      b.addEventListener("click", () => h.onTogglePack(item, !on));
      gEl.appendChild(b);
    });
    host.appendChild(gEl);
  });
  return wrap;
}

// ============================================================
// LIBRARY
// ============================================================
export function renderLibrary(state, h) {
  const list = $("libraryList");
  const trips = orderedTrips(state.household.trips);
  if (!trips.length) {
    list.innerHTML = `<p style="color:var(--ink-soft);padding:20px 4px">No trips yet. Add your sunshine hike, rainy-day backup, and easy day.</p>`;
    return;
  }
  list.replaceChildren(...trips.map((t) => {
    const el = document.createElement("div");
    el.className = "lib-card";
    el.innerHTML = `
      ${t.photoUrl ? `<img class="lib-card__thumb" src="${escapeHtml(t.photoUrl)}" alt="" />` : `<div class="lib-card__thumb" style="display:grid;place-items:center;font-size:24px">🏔️</div>`}
      <div class="lib-card__body">
        <div class="lib-card__title"><span class="lib-slot">${escapeHtml(t.slot || "?")}</span>${escapeHtml(t.name)}</div>
        <div class="lib-card__meta">${escapeHtml(cap(t.type))} · ${driveLabel(t.driveMinutes)} · $${t.costEstimate ?? 0}</div>
        <div class="lib-card__meta">${escapeHtml(t.whyLine || "")}</div>
      </div>
      <button class="btn-ghost lib-card__edit" type="button">Edit</button>`;
    el.querySelector(".lib-card__edit").addEventListener("click", () => h.onEditTrip(t.id));
    return el;
  }));
}

export function tripFormSheet(trip, h) {
  const t = trip || { slot: "A", type: "hike", driveMinutes: 60, costEstimate: 0 };
  const isNew = !trip;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h2>${isNew ? "Add a trip" : "Edit trip"}</h2>
    <div class="sub">Slots A/B/C map to sunny / rainy / easy on the home screen.</div>

    <div class="field"><label>Name</label><input id="f-name" type="text" value="${escapeHtml(t.name || "")}" placeholder="e.g. Angel's Rest, Columbia Gorge" /></div>

    <div class="field"><label>Slot</label>
      <div class="slot-pick" id="f-slot">
        ${["A", "B", "C"].map((s) => `<button type="button" class="slot-pick__btn" data-slot="${s}" aria-pressed="${t.slot === s}">${s}</button>`).join("")}
      </div>
      <div class="hint">A = sunshine hike · B = bad-weather · C = low-energy</div>
    </div>

    <div class="field"><label>Type</label>
      <div class="type-pick" id="f-type">${typePickButtons(t.type || "hike")}</div>
    </div>
    <div class="field"><label>Drive (minutes)</label>
      <input id="f-drive" type="number" inputmode="numeric" min="0" max="180" value="${t.driveMinutes ?? 60}" />
      <div class="err" id="f-drive-err" hidden>Keep it ≤ 180 min (3-hour radius).</div>
    </div>

    <div class="field"><label>Why today (one line)</label><input id="f-why" type="text" value="${escapeHtml(t.whyLine || "")}" placeholder="Big view for a clear Saturday" /></div>
    <div class="field"><label>Photo URL</label><input id="f-photo" type="url" value="${escapeHtml(t.photoUrl || "")}" placeholder="https://…" /></div>
    <div class="field"><label>Dog notes</label><textarea id="f-dog" placeholder="Leash rules, lodging weight caps, etc.">${escapeHtml(t.dogNotes || "")}</textarea></div>

    <div class="field"><label>Cost estimate ($)</label><input id="f-cost" type="number" inputmode="numeric" min="0" value="${t.costEstimate ?? 0}" /></div>
    <div class="field"><label>Packing extras (comma-separated)</label><input id="f-extras" type="text" value="${escapeHtml((t.packingExtras || []).join(", "))}" placeholder="Trekking poles, trail snacks" /></div>

    <div class="sheet__cta" style="display:flex;gap:10px">
      ${isNew ? "" : `<button class="btn-outline btn-danger" id="f-del" type="button">Delete</button>`}
      <button class="btn-cta" id="f-save" type="button" style="flex:1">${isNew ? "Add trip" : "Save"}</button>
    </div>`;

  let slot = t.slot || "A";
  wrap.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", () => {
    slot = b.dataset.slot;
    wrap.querySelectorAll("[data-slot]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));

  let type = t.type || "hike";
  wrap.querySelectorAll("#f-type [data-type]").forEach((b) => b.addEventListener("click", () => {
    type = b.dataset.type;
    wrap.querySelectorAll("#f-type [data-type]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));

  const driveInput = wrap.querySelector("#f-drive");
  const driveErr = wrap.querySelector("#f-drive-err");

  wrap.querySelector("#f-save").addEventListener("click", () => {
    const drive = Number(driveInput.value);
    if (!(drive >= 0) || drive > 180) { driveErr.hidden = false; driveInput.focus(); return; }
    const name = wrap.querySelector("#f-name").value.trim();
    if (!name) { wrap.querySelector("#f-name").focus(); return; }
    const extras = wrap.querySelector("#f-extras").value.split(",").map((s) => s.trim()).filter(Boolean);
    const out = {
      ...(trip || {}),
      name,
      slot,
      type,
      driveMinutes: drive,
      whyLine: wrap.querySelector("#f-why").value.trim(),
      photoUrl: wrap.querySelector("#f-photo").value.trim(),
      dogNotes: wrap.querySelector("#f-dog").value.trim(),
      costEstimate: Number(wrap.querySelector("#f-cost").value) || 0,
      packingExtras: extras,
    };
    h.onSaveTrip(out);
  });

  const del = wrap.querySelector("#f-del");
  if (del) del.addEventListener("click", () => h.onDeleteTrip(t.id));
  return wrap;
}

// ============================================================
// SETTINGS
// ============================================================
export function renderSettings(state, h) {
  const p = state.household.profile;
  const body = $("settingsBody");
  body.innerHTML = `
    <div class="settings-group">
      <h2>Who's here</h2>
      <div class="member-pick" id="s-member">
        ${MEMBERS.map((m) => `<button type="button" class="member-pick__btn" data-member="${escapeHtml(m)}" aria-pressed="${state.me === m}">${escapeHtml(m)}</button>`).join("")}
      </div>
      <div class="hint" style="margin-top:8px;color:var(--ink-faint);font-size:12px">Used for presence & the "locked in by" stamp.</div>
    </div>

    <div class="settings-group">
      <h2>Home base & timing</h2>
      <div class="field"><label>Home label</label><input id="s-label" type="text" value="${escapeHtml(p.homeBase.label)}" /></div>
      <div class="field-row">
        <div class="field"><label>Latitude</label><input id="s-lat" type="number" step="0.01" value="${p.homeBase.lat}" /></div>
        <div class="field"><label>Longitude</label><input id="s-lon" type="number" step="0.01" value="${p.homeBase.lon}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Friday work ends</label><input id="s-workend" type="time" value="${escapeHtml(p.fridayWorkEnd)}" /></div>
        <div class="field"><label>Sunday home by</label><input id="s-homeby" type="time" value="${escapeHtml(p.sundayHomeBy)}" /></div>
      </div>
      <div class="field"><label>Weekend budget ceiling ($)</label><input id="s-budget" type="number" inputmode="numeric" min="0" value="${p.budgetCeiling}" /></div>
      <div class="field"><label>Dislikes / avoid (comma-separated)</label><input id="s-dislikes" type="text" value="${escapeHtml((p.dislikes || []).join(", "))}" /></div>
    </div>

    <div class="settings-group">
      <h2>Dogs</h2>
      <div id="s-dogs"></div>
      <button class="btn-outline" id="s-add-dog" type="button" style="width:100%">+ Add a dog</button>
      <div class="hint" style="margin-top:8px;color:var(--ink-faint);font-size:12px">Weight matters — many inns cap pets at 50–75 lb.</div>
    </div>

    <div class="settings-group">
      <h2>Household</h2>
      <div class="field"><label>Household ID (share with your partner)</label>
        <div class="share-box"><code id="s-hid">${escapeHtml(state.householdId)}</code>
          <button class="btn-solid" id="s-share" type="button" style="min-height:40px;padding:0 14px">Share</button>
        </div>
        <div class="hint" style="margin-top:8px;color:var(--ink-faint);font-size:12px">Both phones use the same ID to see the same live plan.</div>
      </div>
    </div>

    <div style="padding:0 16px">
      <button class="btn-cta" id="s-save" type="button" style="background:var(--pine)">Save settings</button>
    </div>

    <p class="attrib">Weather by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · CC BY 4.0</p>
  `;

  // dog rows
  let dogs = (p.dogs || []).map((d) => ({ ...d }));
  const dogHost = body.querySelector("#s-dogs");
  const paintDogs = () => {
    dogHost.replaceChildren(...dogs.map((d, i) => {
      const row = document.createElement("div");
      row.className = "dog-row";
      row.innerHTML = `
        <div class="field" style="flex:2"><label>Name</label><input type="text" data-dog="name" value="${escapeHtml(d.name || "")}" /></div>
        <div class="field" style="flex:1"><label>Weight (lb)</label><input type="number" inputmode="numeric" data-dog="weight" value="${d.weightLbs ?? ""}" /></div>
        <button class="dog-del" type="button" aria-label="Remove dog">✕</button>`;
      row.querySelector('[data-dog="name"]').addEventListener("input", (e) => (dogs[i].name = e.target.value));
      row.querySelector('[data-dog="weight"]').addEventListener("input", (e) => (dogs[i].weightLbs = Number(e.target.value) || 0));
      row.querySelector(".dog-del").addEventListener("click", () => { dogs.splice(i, 1); paintDogs(); });
      return row;
    }));
  };
  paintDogs();
  body.querySelector("#s-add-dog").addEventListener("click", () => { dogs.push({ name: "", weightLbs: 0, breed: "" }); paintDogs(); });

  // member pick
  body.querySelectorAll("[data-member]").forEach((b) => b.addEventListener("click", () => {
    h.onSetMember(b.dataset.member);
    body.querySelectorAll("[data-member]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));

  body.querySelector("#s-share").addEventListener("click", () => h.onShare());

  body.querySelector("#s-save").addEventListener("click", () => {
    const next = {
      ...p,
      homeBase: {
        label: body.querySelector("#s-label").value.trim() || "Home",
        lat: Number(body.querySelector("#s-lat").value) || p.homeBase.lat,
        lon: Number(body.querySelector("#s-lon").value) || p.homeBase.lon,
      },
      fridayWorkEnd: body.querySelector("#s-workend").value || p.fridayWorkEnd,
      sundayHomeBy: body.querySelector("#s-homeby").value || p.sundayHomeBy,
      budgetCeiling: Number(body.querySelector("#s-budget").value) || 0,
      dislikes: body.querySelector("#s-dislikes").value.split(",").map((s) => s.trim()).filter(Boolean),
      dogs: dogs.filter((d) => d.name).map((d) => ({ name: d.name, weightLbs: d.weightLbs || 0, breed: d.breed || "" })),
      members: [...MEMBERS],
    };
    h.onSaveProfile(next);
  });
}

// ---------- shared ----------
function tripById(state, id) {
  if (id === "wildcard") return wildcardAsTrip(state.household.currentWeekend.wildcard);
  return state.household.trips.find((t) => t.id === id) || null;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ""; }

function typeBadgeHtml(type) {
  const b = TYPE_BADGES[type];
  if (!b) return "";
  return `<span class="card__typebadge">${b.emoji} ${escapeHtml(b.label)}</span>`;
}
