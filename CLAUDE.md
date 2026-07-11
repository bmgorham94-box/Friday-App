# Friday Decider — project notes for future sessions

A mobile-first PWA for two people (Brandon & Joey, Portland OR) to pick a weekend
trip every Friday in under a minute. Vanilla HTML/CSS/JS ES modules, no build step,
GitHub Pages + Firestore (Spark). See `README.md` for setup/deploy.

## Design system (as shipped)

The original brief's "design section" was never provided, so the shipped system is:

- **Palette:** warm Pacific-NW evening. Tokens live at the top of `styles.css`.
  - Surfaces: `--bg` warm paper, `--surface`, `--surface-2` greige.
  - Ink: `--ink` (green-tinted near-black), `--ink-soft`, `--ink-faint`.
  - Brand: `--pine` (green). Info: `--sky`. Warn: `--warn`.
  - **Accent `--accent` (terracotta) is reserved for the single commit action** — the
    "Lock in…" CTA. Nothing else uses it. Verified ≥4.5:1 on white.
- **Type:** system font stack (`-apple-system`…). No web fonts (offline/CSP friendly).
  Chips/badges use weight 600; headings 800–850.
- **Dark mode** via `prefers-color-scheme`; every token has a dark value.
- **Radius/geometry:** `--r-sm…--r-xl`, tap targets `--tap: 48px` (hard floor).
- **Safe areas:** `env(safe-area-inset-*)` pad the weather strip (top) and CTA (bottom).

> Note: an earlier patch prompt referenced a "sage / Bricolage Grotesque / Japandi"
> direction. That was never the shipped system — follow the terracotta/system-font
> tokens above. Extend them; don't swap them.

## Motion budget — FOUR sanctioned moments

Everything else is instant or a plain opacity fade. All respect `prefers-reduced-motion`.

1. **Bottom-sheet spring** — sheets rise with a cubic-bezier ease.
2. **Segmented-control** selection (Sunday vibe) — background/shadow transition.
3. **Lock-in settle** — CTA press.
4. **Wildcard flip** (added in the "fun" patch) — the most theatrical, but weekly-at-most.
   3D `rotateY` with a spring settle (~520ms). Reduced motion → crossfade the two
   faces over 200ms, no 3D transform.

## Weather verdict — condition buckets (the trust rule)

`weather.js` `classifyDay()` is the single source of truth (verdict, per-card fit,
and packing rules all use it). It must **never** claim a condition that isn't in the
forecast (the original bug: overcast was called a "good hiking day").

Buckets (WMO `weather_code` + precip %): `clear` (0–1, <20%), `partly` (2),
`overcast` (3), `fog` (45/48), `drizzle` (51–62 or precip 40–70%), `rain` (≥63 or
>70%). Modifiers: cold snap (`hi < 45` appends a layers line), hot (`hi ≥ 85` overrides).

- Verdict copy: calm friend, dry humor, one sentence, sentence case, no exclamation
  points or emoji. 2–3 variants per bucket, rotated **deterministically by the week**
  (`weekHash(weekOf)`) so both phones match but Fridays don't repeat.
- Recommended slot follows the bucket: clear/partly→A, overcast/fog→C, drizzle/rain→B,
  hot→A. **Overcast is not an automatic hike promotion.**
- Packing weather rules reuse the buckets: wet→rain gear, `lo<45`→layers,
  clear&`hi≥70`→sun kit (overcast never triggers sun kit), fog→headlamp + reflective
  dog leashes.

## Trip-type badges

`data.js` `TYPE_BADGES`: `hike`→🥾 Trail, `town`→🏙 City day, `mixed`→🌤 Bit of both.
- Card badge sits top-left over the photo scrim (`.card__typebadge`): greige at ~90%,
  weight 600, 12px, pill. The ONLY emoji on cards besides the wildcard chip.
- Library editor + wildcard plant sheet use the same badge picker (`.type-pick`).
- Variety nudge: if all three A/B/C slots share a type, a dismissible line appears under
  the cards ("All trails this week — want to swap one for a city day?"). Never blocks.

## The Wildcard

A this-weekend-only face-down fourth card either partner can plant. Lives on
`currentWeekend.wildcard` (resets with the weekly rollover):

```
wildcard: { title, note, photoUrl, type, plantedBy, plantedAt,
            revealed: boolean, revealedAt } | null
```

- Plant affordance: the 🃏 button in the weather strip (`#wildcardBtn`), present all
  week. Plant form is the only typing allowed outside Library/Settings (title required).
- No wildcard planted → **no fourth card at all** (absence keeps the surprise real).
- The planter always sees it face-up (a "planted — partner sees it Friday" note, not
  selectable yet). The other partner sees it **face-down** (`.wc-flip` / `.wc-face`).
- Tapping the face-down card flips it (sets `revealed=true`, optimistic + write). On the
  partner's device the flip **animates on remote reveal** too — that's the shared moment.
  `app.js` guards the flip window (`wcAnimatingUntil` + `scheduleRender`) so an echoing
  snapshot doesn't cut the animation short; `computeWildcardAnim()` decides when to play.
- Once revealed it behaves like any card: `wildcardAsTrip()` adapts it so
  select/lock/packing/detail all work through the same code paths (id `"wildcard"`).
- One per weekend; planting again replaces it (the sheet warns).
- Presence bonus: if both partners are live (<15s) when the flip lands, a brief
  "you're both here 👀" line shows under the card (`maybeBothHere`).

## Sync rules (unchanged, don't break)

- One Firestore doc per household; `onSnapshot` live sync; optimistic writes.
- **Last-write-wins with a stale guard:** apply an incoming `currentWeekend` only if its
  `updatedAt` is strictly newer than the last local mutation (`lastLocalMutationAt`).
- Presence heartbeat every ~10s while visible; new-week rollover resets `currentWeekend`.
- Local-only fallback store (same interface) runs the app before Firebase is configured.
- **Bump `CACHE` in `sw.js` on any shell change** so installed phones update.

## Testing

Pure-logic checks and a headless mobile-browser walkthrough live in the scratchpad
during development (not committed). Before shipping a change: `node --check` every
module, exercise the 3-tap flow + wildcard plant/flip, and verify light + dark render.
```
