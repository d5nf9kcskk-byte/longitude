# Longitude

Grant Gilman's personal operating hub — marking where you are on a long
trajectory. One app, seven modules:

| Module | Route | What it does |
|---|---|---|
| **Season Planner** | `#/season` | Program five NWSA ensembles, track the American-music percentage |
| **Schwarz Workbench** | `#/workbench` | Thesis, sectioned draft, research notes, and an AI editorial reader for the Schwarz recording-legacy article |
| **Syllabus Essentials** | `#/syllabi` | One core objective per course; keep/cut lists, units, assessments |
| **Recruitment** | `#/recruiting` | Prospect pipeline, June→September timeline, editable email templates |
| **Study Log** | `#/practice` | Score study / baton / piano / listening sessions, weekly minutes, streak |
| **Idea Capture** | `#/ideas` | Quick capture with tags (American Muse, programming, writing…) |
| **Task Board** | `#/tasks` | Now · Next · Later · Done, tagged by area |

## Companion apps

Standalone static apps live in their own top-level folders and are copied
into the Pages deployment beside the Vite build:

- **`score-study/`** — 🎼 Score Study, an encoding-first score-learning
  coach (spaced recall, PACER passage types, deadline-aware scheduling).
  Static HTML/CSS/JS with localStorage + optional GitHub sync into
  `data/` (which the deploy workflow ignores as a trigger). Served at
  `/score-study/`; see its own README/Method page for the framework.

## How it works

- **React 19 + Vite**, plain JSX, no CSS framework — the whole UI is the
  dark chart-room look with a gold meridian accent.
- **Firebase Firestore** holds all data (one document per module in the
  `modules` collection), synced in real time across devices, with a
  localStorage mirror for offline resilience. **Everything is private** —
  Firestore rules allow only the allowlisted Google account(s) in
  `firestore.rules`.
- **Google sign-in** gates the whole app.
- **GitHub Pages** hosts it; pushes to `main` deploy automatically.
- **AI Reader** (Schwarz Workbench) never exposes an API key in the
  browser: the app queues requests in Firestore, and the `AI Reader`
  GitHub Action answers them with the Claude API every ~15 minutes (or
  on demand from the Actions tab).

> **Note:** this repo is public (free GitHub Pages requires it), so nothing
> personal belongs in the code — names, phone numbers, prospect data all
> live in Firestore behind sign-in. Keep it that way.

## Local development

```bash
npm install
cp .env.local.template .env.local   # fill in your Firebase web config
npm run dev
```

## One-time setup

### 1. Firebase (~10 min)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
   (free Spark plan) — e.g. `longitude-gg`.
2. **Firestore Database** → Create database (production mode).
3. **Authentication** → Sign-in method → enable **Google**.
4. **Project settings → Your apps → Web app** (`</>`) → register → copy the
   config values into `.env.local` (template provided).

### 2. Security rules

Edit the email allowlist in `firestore.rules` if needed, then either paste
the file's contents into Firebase Console → Firestore → Rules → Publish, or:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

### 3. GitHub Pages

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions** → add:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Push to `main` → live at `https://<owner>.github.io/longitude/`.
4. Firebase Console → **Authentication → Settings → Authorized domains** →
   add `<owner>.github.io` so Google sign-in works on the hosted site.

### 4. AI Reader (optional)

Two more Actions secrets:

- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Console → Project settings →
  Service accounts → Generate new private key → paste the whole JSON file
  as the secret value

The workflow runs every 15 minutes (GitHub cron is best-effort) and can be
run immediately via *Actions → AI Reader → Run workflow*. Note that GitHub
disables cron schedules on repos with no pushes for 60 days — a single
commit re-enables it.

## Add to your phone

Open the site in Safari (iOS) → Share → **Add to Home Screen**. It runs
standalone and syncs with your other devices through Firestore.
