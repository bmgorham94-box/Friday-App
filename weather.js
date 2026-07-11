// ============================================================
// Friday Decider — weather (Open-Meteo, no API key, CORS-ok)
// Fetches the weekend forecast, caches the last good result,
// and turns it into a plain-language decision verdict.
// ============================================================
import { weatherInfo } from "./data.js";
import { weekendDates } from "./util.js";

const CACHE_KEY = "friday.weather.v1";

// Fahrenheit for a Portland couple; Open-Meteo lets us ask directly.
function endpoint(lat, lon) {
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code" +
    "&temperature_unit=fahrenheit&timezone=auto&forecast_days=10"
  );
}

// Returns { days: {date: {hi,lo,precip,code}}, fetchedAt, stale, error }
export async function getWeather(profile) {
  const { lat, lon } = profile.homeBase;
  try {
    const res = await fetch(endpoint(lat, lon), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const days = {};
    const d = raw.daily;
    d.time.forEach((date, i) => {
      days[date] = {
        hi: Math.round(d.temperature_2m_max[i]),
        lo: Math.round(d.temperature_2m_min[i]),
        precip: d.precipitation_probability_max[i] ?? 0,
        code: d.weather_code[i],
      };
    });
    const payload = { days, fetchedAt: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch {}
    return { ...payload, stale: false, error: null };
  } catch (err) {
    // Network / service failure — fall back to last cached forecast.
    const cached = readCache();
    if (cached) return { ...cached, stale: true, error: err.message };
    return { days: {}, fetchedAt: null, stale: true, error: err.message };
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Pull the Sat + Sun day objects for a given Friday.
export function weekendForecast(weather, fridayIso) {
  const { sat, sun } = weekendDates(fridayIso);
  return {
    sat: weather.days[sat] || null,
    sun: weather.days[sun] || null,
  };
}

export function dayView(day) {
  if (!day) return null;
  const [icon, label] = weatherInfo(day.code);
  return { ...day, icon, label };
}

// ---- Condition classification (WMO code + precip) ----
// The single source of truth for verdict, per-card fit, and packing rules.
// Buckets: clear | partly | overcast | fog | drizzle | rain | unknown
export function classifyDay(day) {
  if (!day) return "unknown";
  const { code, precip } = day;
  if (code >= 63 || precip > 70) return "rain";                       // real rain
  if ((code >= 51 && code <= 62) || (precip >= 40 && precip <= 70)) return "drizzle";
  if (code === 45 || code === 48) return "fog";
  if (code === 3) return "overcast";
  if (code === 2) return "partly";
  if (code <= 1 && precip < 20) return "clear";
  if (code <= 1) return "partly";   // clear sky but a meaningful precip chance
  return "overcast";
}

export const isWet = (c) => c === "rain" || c === "drizzle";
export const isNice = (c) => c === "clear" || c === "partly";

// Verdict copy — a calm friend, dry humor, honest about the sky.
// 2–3 variants per bucket, rotated deterministically by the week so a
// given Friday reads the same on both phones but not the same as last week.
const VERDICTS = {
  clear:    { slot: "A", tone: "good", lines: [
    "Actual sunshine. Option A was made for this.",
    "Clear skies Saturday — the trail is the whole point today.",
    "Bluebird weekend. A is the obvious move." ] },
  partly:   { slot: "A", tone: "good", lines: [
    "Sun's making appearances. Good enough for the trail.",
    "Partly cloudy, mostly cooperative — A still wins.",
    "A few clouds, nothing serious. Take the hike." ] },
  overcast: { slot: "C", tone: "info", lines: [
    "Cloudy but dry. No views today — but no crowds either.",
    "Grey and dry. Fine for moving, thin on scenery.",
    "Overcast all day. A works, just don't expect the vista." ] },
  fog:      { slot: "C", tone: "info", lines: [
    "Fog in the Gorge. Moody hike or cozy city day — dealer's choice.",
    "Low fog around. Atmospheric on the trail, easy in town.",
    "Socked in. Could go either way today." ] },
  drizzle:  { slot: "B", tone: "warn", lines: [
    "Light rain likely. Option B earns its keep this week.",
    "Drizzle on and off — B is looking smart.",
    "Damp one coming. B was built for this." ] },
  rain:     { slot: "B", tone: "warn", lines: [
    "Properly wet. This is exactly why Option B exists.",
    "Real rain Saturday. Lean into B.",
    "Soggy weekend. B, no question." ] },
  unknown:  { slot: "A", tone: "info", lines: [
    "No forecast yet — pick what sounds good.",
    "Sky's a mystery today. Go with your gut." ] },
};

const HOT_LINES = [
  "Hot one. Early start, or something with shade and cold drinks.",
  "Heat's on. Beat it early or lean toward shade and water.",
];

// Stable per-week index from the Friday date string.
function weekHash(weekOf) {
  let h = 0;
  const s = weekOf || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function rotate(lines, weekOf) {
  return lines[weekHash(weekOf) % lines.length];
}

// Considers both days, leads with Saturday. Recommended slot follows the
// bucket (overcast is NOT an automatic hike promotion). Never claims a
// condition that isn't in the forecast.
export function decisionVerdict(fc, weekOf) {
  const lead = fc.sat || fc.sun;
  if (!lead) return { slot: "A", tone: "info", text: rotate(VERDICTS.unknown.lines, weekOf) };

  const hiMax = Math.max(fc.sat?.hi ?? -99, fc.sun?.hi ?? -99);
  if (hiMax >= 85) return { slot: "A", tone: "warn", text: rotate(HOT_LINES, weekOf) };

  const cond = classifyDay(lead);
  const bucket = VERDICTS[cond] || VERDICTS.unknown;
  let text = rotate(bucket.lines, weekOf);

  // Cold honesty, appended (unless already talking about heavy rain).
  if (lead.hi < 45 && cond !== "rain") text += " Cold, too — layers are non-negotiable.";

  return { slot: bucket.slot, tone: bucket.tone, text };
}

// Per-card weather-fit badge. Returns {kind:'good'|'warn'|'neutral', text}
export function weatherFit(trip, fc) {
  const day = fc.sat || fc.sun;
  if (!day) return { kind: "neutral", text: "No forecast" };
  const c = classifyDay(day);
  if (trip.type === "hike") {
    if (isNice(c)) return { kind: "good", text: "Great hiking weather" };
    if (isWet(c)) return { kind: "warn", text: "Wet for a hike" };
    if (c === "fog") return { kind: "neutral", text: "Foggy — moody trail" };
    return { kind: "neutral", text: "Dry, no views" };
  }
  if (trip.type === "town") {
    if (isWet(c)) return { kind: "good", text: "Perfect rainy-day plan" };
    if (isNice(c)) return { kind: "neutral", text: "Nice, but sun's for hiking" };
    return { kind: "good", text: "Weather-proof" };
  }
  // mixed / low-energy
  if (isWet(c)) return { kind: "good", text: "Easy rain or shine" };
  return { kind: "neutral", text: "Works any weather" };
}
