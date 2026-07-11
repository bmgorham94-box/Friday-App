// ============================================================
// Friday Decider — seed data, defaults, and domain constants
// ============================================================
import { uid, addMinutesToClock, driveLabel } from "./util.js";

export const MEMBERS = ["Brandon", "Joey"];

// -------- Default profile (Portland couple + two dogs) --------
export function defaultProfile() {
  return {
    homeBase: { lat: 45.52, lon: -122.68, label: "Portland, OR" },
    fridayWorkEnd: "17:00",
    sundayHomeBy: "21:00",
    budgetCeiling: 120,
    dislikes: ["crowded trailheads", "long waits"],
    dogs: [
      { name: "Odin", weightLbs: 150, breed: "Cane Corso" },
      { name: "Finn", weightLbs: 70, breed: "Weimaraner" },
    ],
    members: [...MEMBERS],
  };
}

// -------- Seed trip library (couple replaces these) --------
// A = sunshine hike, B = bad-weather alternative, C = low-energy day.
export function seedTrips() {
  return [
    {
      id: uid(),
      name: "Angel's Rest, Columbia Gorge",
      type: "hike",
      slot: "A",
      driveMinutes: 45,
      whyLine: "Big-payoff ridge view for a clear, dry Saturday.",
      photoUrl: "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1000&q=70&auto=format&fit=crop",
      dogNotes: "On-leash, rocky final scramble. Fine for both dogs as a day hike — no lodging needed.",
      costEstimate: 25,
      packingExtras: ["Trekking poles", "Trail snacks", "Trailhead parking pass"],
    },
    {
      id: uid(),
      name: "Cannon Beach & Ecola",
      type: "town",
      slot: "B",
      driveMinutes: 95,
      whyLine: "Tide pools, chowder, and cozy shops when the sky won't cooperate.",
      photoUrl: "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=1000&q=70&auto=format&fit=crop",
      dogNotes: "Dog-friendly beach & town. Most inns cap pets at 75 lb — with Odin (150 lb) this stays a day trip.",
      costEstimate: 90,
      packingExtras: ["Rain shells", "Towels for the dogs", "Cash for chowder"],
    },
    {
      id: uid(),
      name: "Sauvie Island + St. Johns coffee",
      type: "mixed",
      slot: "C",
      driveMinutes: 25,
      whyLine: "Flat loop, farm stand, coffee in hand — home before you know it.",
      photoUrl: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1000&q=70&auto=format&fit=crop",
      dogNotes: "Wide-open easy walking, great for both dogs. Leash near the farm animals.",
      costEstimate: 30,
      packingExtras: ["Reusable coffee cups", "Farm-stand cash"],
    },
  ];
}

export function freshCurrentWeekend(weekOf) {
  return {
    weekOf,
    selectedTripId: null,
    sundayVibe: null,
    lockedBy: null,
    lockedAt: null,
    updatedAt: 0,
    packingChecked: {},
  };
}

export function seedHousehold(weekOf) {
  return {
    profile: defaultProfile(),
    trips: seedTrips(),
    currentWeekend: freshCurrentWeekend(weekOf),
    presence: {},
  };
}

// -------- Sunday vibe definitions --------
// leaveAt = when you leave the destination on Sunday (full-day derives from
// sundayHomeBy). warnOverDrive = drive beyond which the vibe feels off.
export const VIBES = [
  { id: "full-day",         label: "Full day",     hint: "home late",  leaveAt: null,    warnOverDrive: 999 },
  { id: "brunch-and-leave", label: "Brunch & leave", hint: "midday back", leaveAt: "12:30", warnOverDrive: 150 },
  { id: "coffee-and-go",    label: "Coffee & go",  hint: "early back", leaveAt: "09:30", warnOverDrive: 75 },
];

export function vibeById(id) {
  return VIBES.find((v) => v.id === id) || null;
}

// Feasibility for a (trip, vibe, profile): when you'd get home + a warning.
export function feasibility(trip, vibeId, profile) {
  const vibe = vibeById(vibeId);
  if (!vibe || !trip) return { homeClock: "", warn: false, text: "" };
  const drive = trip.driveMinutes || 0;
  let homeClock;
  if (vibe.id === "full-day") {
    homeClock = to12(profile.sundayHomeBy || "21:00");
  } else {
    homeClock = addMinutesToClock(vibe.leaveAt, drive);
  }
  const warn = drive > vibe.warnOverDrive;
  let text;
  if (vibe.id === "full-day") text = `Home ~${homeClock} — full day out`;
  else text = `Home ~${homeClock}`;
  if (warn && vibe.id === "coffee-and-go") text = `${driveLabel(drive)} each way for a coffee run`;
  else if (warn) text = `Long day — ${text.toLowerCase()}`;
  return { homeClock, warn, text };
}

function to12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
}

// -------- Open-Meteo WMO weather codes -> icon + label --------
export function weatherInfo(code) {
  const map = {
    0: ["☀️", "Clear"],
    1: ["🌤️", "Mostly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
    45: ["🌫️", "Fog"], 48: ["🌫️", "Rime fog"],
    51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌧️", "Heavy drizzle"],
    56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"],
    61: ["🌦️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
    66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
    71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["🌨️", "Snow grains"],
    80: ["🌦️", "Showers"], 81: ["🌧️", "Showers"], 82: ["⛈️", "Violent showers"],
    85: ["🌨️", "Snow showers"], 86: ["❄️", "Snow showers"],
    95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Storm w/ hail"], 99: ["⛈️", "Storm w/ hail"],
  };
  return map[code] || ["🌡️", "—"];
}

// -------- Base packing list (always present) --------
export const BASE_PACKING = [
  "Water bottles",
  "Phone + charger cable",
  "Wallet & cards",
  "Sunglasses",
  "Snacks",
];
