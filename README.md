# Friday Decider 🥾

A mobile-first Progressive Web App for **two people** (Brandon & Joey, Portland OR) to
pick a weekend trip every Friday evening in under a minute. Weekend weather up top, three
pre-saved trip cards (sunny hike / rainy backup / easy day), a Sunday-vibe pick, one tap to
lock it in, and an auto-generated packing list. Both phones show the **same live state**.

- **No build step.** Vanilla HTML/CSS/JS with ES modules. Deploy by pushing to GitHub Pages.
- **Shared state** via Firebase Cloud Firestore on the **free Spark plan** (never needs Blaze).
- **Weather** from [Open-Meteo](https://open-meteo.com) — no API key, CORS-enabled.
- **Installable** PWA with offline app shell + last-synced state.
- **No login.** Access is a shared household slug in the URL. Firestore rules scope everything
  to `/households/{householdId}`.

> **Runs immediately in local-only mode.** Before you add Firebase, the app works fully on one
> device (state saved to `localStorage`) so you can try it. Add Firebase to sync both phones.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell + all screen containers |
| `styles.css` | Design system (warm PNW palette, safe areas, bottom sheet, dark mode) |
| `app.js` | Orchestrator: sync, optimistic writes + stale-write guard, presence, rollover |
| `firestore.js` | Store layer — Firestore (with offline persistence) **or** a local fallback |
| `weather.js` | Open-Meteo fetch, caching, plain-language verdict + per-card weather fit |
| `packing.js` | Packing list generation (base + trip + weather rules + dog kit) |
| `ui.js` | All rendering + bottom-sheet control |
| `data.js` | Seed trips, default profile, Sunday-vibe defs, weather-code map |
| `util.js` | Pure helpers (week rollover math, formatting, slug) |
| `config.js` | **Your Firebase web config goes here** |
| `manifest.json` | PWA manifest (standalone, icons, theme colors) |
| `sw.js` | Service worker — cache-first shell, network-first weather |
| `firestore.rules` | Security rules — scope to `/households/{id}`, deny all else |
| `icons/` | App icons (180 apple-touch, 192/512 standard + maskable) |
| `scripts/make_icons.py` | Regenerates the icons (optional) |

---

## Setup

### 1. Create a Firebase project (free Spark plan)

1. Go to the [Firebase console](https://console.firebase.google.com) → **Add project**.
2. Name it (e.g. `friday-decider`). Google Analytics is optional — skip it.
3. When the project is ready, you're on the **Spark (free) plan by default**.
   **Do not upgrade to Blaze.** Spark's daily free quota (50k reads / 20k writes) is *vastly*
   more than two people will ever use, and the hard stop is your safety net.

### 2. Enable Cloud Firestore

1. In the console → **Build → Firestore Database → Create database**.
2. Start in **production mode** (we'll paste real rules next).
3. Pick a location near you (e.g. `us-west1`).

### 3. Add a Web App and paste the config

1. Project **⚙ Settings → General → Your apps → Web (`</>`)**. Register an app (nickname
   `friday`). You do **not** need Firebase Hosting.
2. Copy the `firebaseConfig` object it shows you.
3. Open [`config.js`](./config.js) and replace the placeholder values with yours:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "friday-decider.firebaseapp.com",
     projectId: "friday-decider",
     storageBucket: "friday-decider.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123",
   };
   ```

   > The web API key is **safe to commit** — it only identifies the project. Real protection
   > comes from the Firestore rules below plus your unguessable household slug.

Offline persistence is enabled automatically in code (`persistentLocalCache`) — nothing to
configure.

### 4. Deploy the Firestore security rules

The rules pin every read/write to a document under `/households/{householdId}` and deny
everything else. Two ways to deploy:

**Console (easiest):** Firestore → **Rules** tab → paste the contents of
[`firestore.rules`](./firestore.rules) → **Publish**.

**CLI:**
```bash
npm i -g firebase-tools
firebase login
firebase init firestore   # select your project; keep firestore.rules
firebase deploy --only firestore:rules
```

### 5. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages**.
3. **Source: Deploy from a branch**, branch `main` (or your default), folder `/ (root)`.
4. Save. In ~1 minute your app is live at
   `https://<you>.github.io/<repo>/`.

That URL is the app. A service worker + web manifest make it installable.

### 6. First-run household setup (both phones)

**Phone 1 (first person):**
1. Open the GitHub Pages URL in Safari.
2. The welcome sheet creates a private **household ID** (e.g. `cedar-2414-spruce`).
3. Tap **who you are** (Brandon or Joey) → **Start deciding**.
4. Tap **Share ID** to send the link to your partner.
5. **Add to Home Screen:** Share → *Add to Home Screen* (the app hints this once).

**Phone 2 (partner):**
1. Open the **shared link** (it contains `#h=<household-id>`).
2. Tap **who you are** (the other name).
3. Add to Home Screen.

Both phones now read/write the same `/households/<id>` document. When one taps a card or checks
a packing item, the other sees it live, and "**Joey is looking now**" appears while you're both
in the app.

> The seed library ships with three realistic placeholder trips (Angel's Rest in the Columbia
> Gorge, Cannon Beach, Sauvie Island). Edit them in **Library** to your own spots.

---

## How it works (brief)

- **Data model:** one document per household — `/households/{id}` with `profile`, `trips[]`,
  `currentWeekend`, and `presence`. See [`firestore.rules`](./firestore.rules) and `data.js`.
- **Live sync:** `onSnapshot` on the household doc. Taps write in the background (optimistic UI).
- **Last-write-wins with a stale guard:** an incoming snapshot only overwrites `currentWeekend`
  if its `updatedAt` is strictly newer than the last local mutation, so a late snapshot can't
  clobber a choice you just made.
- **Presence:** heartbeats `lastSeen` every ~10s while the tab is visible; the partner shows as
  "looking now" within 15s.
- **New-week rollover:** if the stored `weekOf` is older than this week's Friday, `currentWeekend`
  resets automatically (the trip library and profile are kept).
- **Weather → decision:** the Sat/Sun forecast drives a plain-language verdict and highlights a
  default card. Weather **nudges, never locks** — you always choose.
- **Packing:** base list + the trip's extras + weather rules (rain gear ≥ 40% precip, layers if
  low < 45°F, sun kit if clear and high ≥ 70°F) + dog kit (with Odin-specific big-dog items).

## Weather attribution

Weather by [Open-Meteo](https://open-meteo.com) under CC BY 4.0 (also shown in **Settings**).

## Regenerating icons (optional)

```bash
pip install Pillow
python3 scripts/make_icons.py
```

## Privacy / access model

There is intentionally **no login**. This is a two-person personal tool; access control is the
shared, unguessable household slug plus Firestore rules that only ever expose one household
document at a time. Don't post your household link publicly.
