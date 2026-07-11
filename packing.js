// ============================================================
// Friday Decider — packing list generation
// base list + trip extras + weather rules + dog kit.
// Returns grouped items so the checklist reads by reason.
// ============================================================
import { BASE_PACKING } from "./data.js";
import { classifyDay, isWet } from "./weather.js";

// Weather rules, driven by the same condition buckets as the verdict:
//   wet (rain/drizzle) -> rain gear
//   low < 45°F         -> layers
//   clear & high ≥70°F -> sun kit  (overcast never triggers this)
//   fog                -> headlamp + reflective leashes for the dogs
function weatherItems(fc) {
  const items = [];
  const day = fc.sat || fc.sun;
  if (!day) return items;
  const cSat = fc.sat ? classifyDay(fc.sat) : null;
  const cSun = fc.sun ? classifyDay(fc.sun) : null;
  const wet = isWet(cSat) || isWet(cSun);
  const foggy = cSat === "fog" || cSun === "fog";
  const low = Math.min(fc.sat?.lo ?? 99, fc.sun?.lo ?? 99);
  const clearHot = (cSat === "clear" && fc.sat.hi >= 70) ||
                   (cSun === "clear" && fc.sun.hi >= 70);
  if (wet) items.push("Rain jackets", "Dry socks");
  if (low < 45) items.push("Warm layers", "Beanie");
  if (clearHot) items.push("Sunscreen", "Hats");
  if (foggy) items.push("Headlamp", "Reflective leashes for the dogs");
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
