# Longitude

This repo hosts the **Longitude** app collection. The root landing page is `index.html`; each app lives in its own folder so they never collide:

- **`score-study/`** — 🎼 Score Study (below)
- *(root)* — reserved for the Longitude app itself

---

# 🎼 Score Study

A browser-based coach for learning musical scores as efficiently as possible — built by adapting Justin Sung's learning-science framework (encoding-first study, PACER information types, priming, generative effort, deadline-aware spaced recall) to the specific realities of score study.

**No build, no server, no dependencies.** Static HTML/CSS/JS; your data lives in the browser's local storage, with JSON export/import and optional GitHub sync.

## What it does

- **Decides for you** — a daily plan in method order: due recall tests first, then priming for new works, then re-encoding for lapsed passages, then deep encoding for weak/critical passages, then the weekly synthesis test. Every task says *why* it's next and ships with a two-minute starter version (the win is starting, not finishing).
- **Tracks progress** — every passage moves through phases (**New → Encoding → Testing → Secure**) with per-work progress bars, an activity chart, streaks, and a generative-vs-consumptive balance meter.
- **Reminds you to test yourself** — an encoding-weighted, deadline-aware spaced-recall scheduler tells you exactly when to recall each passage, with prompts generated from what *kind* of material it is.
- **Keeps the method honest** — failed recalls prescribe *re-encoding* (not just more reps), consumption-heavy weeks trigger a rebalance nudge, and a worst-day minimum keeps the streak alive on exhausted evenings.

## The method, in one paragraph

Retrieval practice (flashcards, spaced repetition) is a *check*, not the engine — if a passage is weakly encoded, no review schedule saves it. So the app makes you **prime** each work first (architecture before detail), classify passages by material type (**PACER, translated for the podium**: Gestural / Relational / Structural / Evidence / Reference), and encode them with *generative* work — singing lines, piano reduction, harmonic analysis, conducting from memory, writing out from memory. Only then does spaced recall kick in, with intervals lengthened by encoding depth and compressed as the performance date approaches, so retention peaks on the day it matters. The full mapping from the source videos to score study is on the app's **Method** page.

### Where each idea came from

| Source video (Justin Sung) | Adapted for score study as… |
|---|---|
| *The PROBLEM with Active Recall and Spaced Repetition* | Encoding depth drives the schedule; lapses prescribe re-encoding |
| *5 Techniques of Every Successful Student* (priming) | Mandatory priming checklist before passage-level work |
| *How to Remember Everything You Read* (PACER) | Passage types: Gestural (P), Relational (A), Structural (C), Evidence (E), Reference (R) — each with its own study treatment and test prompts |
| *6 Levels of Thinking* (Bloom's, start at Evaluate) | Every recall test ends with an evaluate-level "so what?" prompt |
| *How to Learn ANYTHING Faster* (generation, iteration) | Consume/generate/recall mode classes; micro-retrieval after every generative session; weekly synthesis test |
| *How To Learn Any Skill So Fast It Feels Illegal* (5:1 practice:theory) | 14-day generative-ratio meter with a rebalance nudge |
| *How To Be So Productive That It Feels ILLEGAL* (Pareto, Zeigarnik) | ★ critical passages (and critical bars) jump the queue; two-minute starters on every task |
| *How to Build Systems to Actually Achieve Your Goals* | Worst-day minimum + streak; the plan survives the tired day |
| *4 Steps to Read Difficult Texts Faster* | Chunk / allocate inner ear / reflect / predict — attached as hints to listening & analysis modes |

## Running it

It's a static site — open `score-study/index.html` in a browser, or serve the repo root:

```bash
python3 -m http.server 8000   # then open http://localhost:8000/score-study/
```

### GitHub Pages (recommended)

A workflow (`.github/workflows/pages.yml`) deploys the whole repo on every push (data-sync commits under `data/` are ignored). One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The app then lives at `https://<user>.github.io/<repo>/score-study/`.

### Data & sync

- Data is stored in `localStorage`, keyed per browser.
- **Settings → Backup**: export/import a JSON snapshot.
- **Settings → GitHub sync** (multi-device): with auto-sync on, the app loads the newest copy of your data (`data/score-study-data.json` in this repo) when opened and quietly pushes changes a few seconds after you make them — newest timestamp wins. One-time setup per device: create a **fine-grained personal access token** scoped to *only* this repo with *Contents: read & write* and paste it into Settings. The token never leaves the browser and is stripped from all backups and synced files. Note: in a public repo, the synced data file (titles, passages, notes) is publicly readable.
- Browser notifications (optional) fire while the app is open when tests come due. A static page can't push notifications when closed — the Today page is the source of truth.

## Suggested workflow

1. **Add a work** with its performance date (this drives the whole schedule).
2. **Prime it** — the four-step big-picture pass. Don't skip; don't go deep.
3. **Break it into passages** along the structural seams. Keep transitions as their own passages. Star the ~20% that carry the performance.
4. Each day, open **Today** and do what it says. Log every session honestly — including the struggle rating.
5. When a recall test comes due, score closed, struggle first, grade honestly. `Again` means the encoding needs fixing, and the app will say so.
6. Once a week per work, run the **synthesis test**: rebuild the whole form map from a blank page.
