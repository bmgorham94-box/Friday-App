// ============================================================
// Friday Decider — packing list generation
// base list + trip extras + weather rules + dog kit.
// Returns grouped items so the checklist reads by reason.
// ============================================================
import { BASE_PACKING } from "./data.js";

// Weather rules (per spec):
//   rain gear if precip >= 40%
//   layers   if low  < 45°F
//   sun kit  if clear (code<=1) and high >= 70°F
function weatherItems(fc) {
  const items = [];
  const day = fc.sat || fc.sun;
  if (!day) return items;
  const precip = Math.max(fc.sat?.precip ?? 0, fc.sun?.precip ?? 0);
  const low = Math.min(fc.sat?.lo ?? 99, fc.sun?.lo ?? 99);
  const clear = (fc.sat && fc.sat.code <= 1 && fc.sat.hi >= 70) ||
                (fc.sun && fc.sun.code <= 1 && fc.sun.hi >= 70);
  if (precip >= 40) items.push("Rain jackets", "Dry socks");
  if (low < 45) items.push("Warm layers", "Beanie");
  if (clear) items.push("Sunscreen", "Hats");
  return items;
}

// Dog kit, with Odin-specific call-outs when a heavy dog is along.
function dogItems(dogs = []) {
  if (!dogs.length) return [];
  const items = ["Leashes", "Water bowl", "Dog water jug", "Poop bags", "Towel"];
  const heavy = dogs.find((d) => (d.weightLbs || 0) >= 100);
  if (heavy) {
    items.push(`${heavy.name}'s harness (big-dog)`, `${heavy.name}'s ramp/blanket for the car`);
  }
  const treats = dogs.map((d) => d.name).filter(Boolean).join(" & ");
  if (treats) items.push(`Treats for ${treats}`);
  return items;
}

// Build the grouped list. Groups: Basics, This trip, Weather, Dogs.
export function buildPacking(trip, fc, profile) {
  const groups = [];
  const dedupe = new Set();
  const add = (title, items) => {
    const clean = [];
    for (const it of items) {
      const key = it.toLowerCase();
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      clean.push(it);
    }
    if (clean.length) groups.push({ title, items: clean });
  };

  add("Basics", BASE_PACKING);
  if (trip && trip.packingExtras?.length) add("For this trip", trip.packingExtras);
  add("Weather", weatherItems(fc));
  add("Dogs", dogItems(profile.dogs));

  return groups;
}

// Flatten to the list of item strings (for progress counting).
export function packingItems(groups) {
  return groups.flatMap((g) => g.items);
}
