// ============================================================
// Friday Decider — small pure helpers (no side effects)
// ============================================================

// Anchor Friday for the current weekend, as a local YYYY-MM-DD string.
// Mon–Fri -> the upcoming Friday. Sat/Sun -> the Friday that just started
// this weekend. Used for the new-week rollover check.
export function currentFriday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 Sun .. 6 Sat
  let offset;
  if (day === 0) offset = -2;       // Sunday -> Friday two days ago
  else if (day === 6) offset = -1;  // Saturday -> Friday yesterday
  else offset = 5 - day;            // Mon..Fri -> upcoming/this Friday
  d.setDate(d.getDate() + offset);
  return isoDate(d);
}

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "Sat" / "Sun" etc. from a YYYY-MM-DD (parsed as local).
export function weekdayShort(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

// The Sat and Sun dates (YYYY-MM-DD) that follow a given Friday.
export function weekendDates(fridayIso) {
  const [y, m, d] = fridayIso.split("-").map(Number);
  const fri = new Date(y, m - 1, d);
  const sat = new Date(fri); sat.setDate(fri.getDate() + 1);
  const sun = new Date(fri); sun.setDate(fri.getDate() + 2);
  return { sat: isoDate(sat), sun: isoDate(sun) };
}

// "1h 40m", "45m", "3h"
export function driveLabel(mins) {
  const m = Math.round(mins || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

// Add minutes to an "HH:MM" clock and return "h:mmam/pm".
export function addMinutesToClock(hhmm, addMins) {
  const [h, m] = (hhmm || "09:00").split(":").map(Number);
  let total = h * 60 + m + Math.round(addMins);
  total = ((total % 1440) + 1440) % 1440;
  return minutesToClock(total);
}

export function minutesToClock(total) {
  let h = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

// Format a ms timestamp as "6:42pm".
export function clockFromTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return minutesToClock(d.getHours() * 60 + d.getMinutes());
}

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// URL-safe random household slug, e.g. "portland-4820-lark".
const SLUG_WORDS = ["lark", "cedar", "gorge", "tide", "fern", "pine", "heron", "moss", "alder", "cove", "ridge", "spruce"];
export function makeSlug(rand = Math.random) {
  const w1 = SLUG_WORDS[Math.floor(rand() * SLUG_WORDS.length)];
  const w2 = SLUG_WORDS[Math.floor(rand() * SLUG_WORDS.length)];
  const n = String(Math.floor(rand() * 9000) + 1000);
  return `${w1}-${n}-${w2}`;
}

export function uid() {
  return "t_" + Math.random().toString(36).slice(2, 9);
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
