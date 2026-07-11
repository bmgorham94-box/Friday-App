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

// Rate a day for hiking: 'good' | 'ok' | 'poor'
function rateDay(day) {
  if (!day) return "ok";
  if (day.precip >= 55 || day.code >= 61) return "poor";
  if (day.precip >= 35 || day.lo < 38 || day.hi < 45) return "ok";
  return "good";
}

// Which slot the weather nudges toward + a plain-language verdict.
// A = sunshine hike, B = bad-weather town, C = low-energy.
export function decisionVerdict(fc) {
  const sat = fc.sat, sun = fc.sun;
  if (!sat && !sun) {
    return { slot: "A", tone: "info", text: "No forecast yet — pick what sounds good." };
  }
  const best = sat || sun;
  const rate = rateDay(best);
  const dv = dayView(best) || {};
  if (rate === "good") {
    return {
      slot: "A", tone: "good",
      text: `Dry and ${dv.hi >= 70 ? "warm" : "mild"} Saturday (${dv.hi}°) — a good hiking day.`,
    };
  }
  if (rate === "poor") {
    return {
      slot: "B", tone: "warn",
      text: `Rain likely Saturday (${best.precip}% chance) — Option B looks better.`,
    };
  }
  return {
    slot: "C", tone: "info",
    text: `Mixed skies (${best.precip}% rain) — an easy day travels well.`,
  };
}

// Per-card weather-fit badge. Returns {kind:'good'|'warn'|'neutral', text}
export function weatherFit(trip, fc) {
  const day = fc.sat || fc.sun;
  if (!day) return { kind: "neutral", text: "No forecast" };
  const rate = rateDay(day);
  if (trip.type === "hike") {
    if (rate === "good") return { kind: "good", text: "Great hiking weather" };
    if (rate === "poor") return { kind: "warn", text: "Wet for a hike" };
    return { kind: "neutral", text: "Hikeable, dress warm" };
  }
  if (trip.type === "town") {
    if (rate === "poor") return { kind: "good", text: "Perfect rainy-day plan" };
    if (rate === "good") return { kind: "neutral", text: "Nice, but sun's for hiking" };
    return { kind: "good", text: "Weather-proof" };
  }
  // mixed / low-energy
  if (rate === "poor") return { kind: "good", text: "Easy come rain or shine" };
  return { kind: "neutral", text: "Works any weather" };
}
