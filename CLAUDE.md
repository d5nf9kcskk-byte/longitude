# Longitude

Grant Gilman's personal operating hub. Conductor, Director of Orchestras at
New World School of the Arts, doctorate from CCM (studied with Meier and
Thakar). Podcast: *American Muse*. Book in progress: *Secrets of American
Orchestral Music*.

## Privacy model — read before adding any content

This repo is **public** (free GitHub Pages requires it). The rule: nothing
personal, tactical, or identifying goes into committed source — code, seed
data, docs, or comments. All real data (prospects, drafts, tasks, ideas,
career strategy, contact details) lives in Firestore behind the Google
sign-in gate defined in `firestore.rules`, or is entered directly through
the app's UI. Default/placeholder data in `DEFAULT_DATA` constants must stay
generic. When in doubt, treat this repo like it will be read by anyone
Grant has ever mentioned in it — because it can be.

## Grant's artistic positioning (safe to reference — this is his public brand)

Working thesis: *executive directors call Grant when they need a William
Schuman symphony (or equivalent American symphonic repertoire) rehearsed to
the standard of a core European romantic work — one that measurably moves
subscriptions, not just applause.*

Repertoire spine: the American symphonic tradition from the Second New
England School (Chadwick, Beach) through the postwar symphonists (Hanson,
Piston, Schuman, Mennin, Creston), read alongside the contemporary
reappraisal of Florence Price and William Grant Still. This is the frame
for the Schwarz Workbench article and should inform any AI-reader tuning —
vague affirmational language ("honesty, sincerity, joy") is the opposite of
this brand; feedback should push toward specific, stakes-bearing claims.

## Modules

| Module | File | Storage key |
|---|---|---|
| Season Planner | `src/modules/SeasonPlanner.jsx` | `nwsa_season_planner_v1` |
| Schwarz Workbench | `src/modules/SchwarzWorkbench.jsx` | `schwarz_workbench_v1` |
| Syllabus Essentials | `src/modules/SyllabusEssentials.jsx` | `nwsa_syllabi_v1` |
| Recruitment Tracker | `src/modules/RecruitmentTracker.jsx` | `nwsa_recruitment_v1` |
| Study Log | `src/modules/PracticeLog.jsx` | `practice_log_v1` |
| Idea Capture | `src/modules/IdeaCapture.jsx` | `idea_capture_v1` |
| Task Board | `src/modules/TaskBoard.jsx` | `task_board_v1` |

Each module owns one Firestore doc in the `modules` collection (see
`src/storage.js`) with a localStorage mirror for offline resilience.

## Companion apps

`score-study/` (and any future sibling folder) is a **standalone static
app** built by a separate session — plain HTML/CSS/JS, its own storage,
not part of the Vite build. The deploy workflow copies it into `dist/`
so it ships at `/score-study/` beside Longitude. Don't import from it,
don't run it through Vite, and don't let a second Pages workflow appear
alongside `.github/workflows/deploy.yml` (two workflows deploying the
same Pages site race each other). Its GitHub-sync data lands in `data/`,
which the deploy trigger ignores.

## AI Reader architecture

The Schwarz Workbench's AI Reader never calls Anthropic from the browser.
The app writes a request doc to the `aiRequests` collection; the
`AI Reader` GitHub Action (`scripts/ai-reader.mjs`, cron every 15 min plus
manual dispatch) picks it up, calls the Claude API server-side, and writes
the response back. Editorial framing for that assistant lives in
`scripts/ai-reader.mjs`'s `SYSTEM_PROMPT` — keep it to public-facing
artistic/editorial context (repertoire, outlets, craft standard), not
relationship strategy toward named individuals.
