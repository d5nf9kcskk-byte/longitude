/* scheduler.js — spaced recall scheduling, phases, decision engine, prompts */
'use strict';

const Scheduler = {

  /* ---------- Spaced recall (encoding-weighted, deadline-aware SM-2 variant) ----------
     Philosophy (from “The PROBLEM with Active Recall and Spaced Repetition”):
     retrieval practice is the CHECK, encoding is the ENGINE. So:
     - deeper encoding (more distinct generative work) grants longer early intervals;
     - a failed recall doesn't just reset the clock — it prescribes RE-ENCODING;
     - intervals compress as a performance date approaches (retention must peak on the day). */

  gradeRecall(work, passage, grade /* 0 Again, 1 Hard, 2 Good, 3 Easy */) {
    const s = passage.srs;
    const today = todayStr();

    if (grade === 0) {
      s.lapses += 1;
      s.reps = 0;
      s.interval = 0;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.due = addDays(today, 1);
      passage.needsReencode = true; // don't just re-test: fix the encoding first
    } else {
      s.reps += 1;
      if (grade === 1) s.ease = Math.max(1.3, s.ease - 0.15);
      if (grade === 3) s.ease = s.ease + 0.15;

      let next;
      if (s.reps === 1) next = grade === 3 ? 2 : 1;
      else if (s.reps === 2) next = grade === 3 ? 5 : 3;
      else {
        const mult = grade === 1 ? 1.2 : grade === 2 ? s.ease : s.ease * 1.3;
        next = Math.round(Math.max(s.interval, 1) * mult);
      }

      // Encoding-depth bonus on early reps: well-encoded material decays slower.
      if (s.reps <= 2) {
        const depth = Store.encodingDepth(passage.id);
        next = Math.round(next * (1 + depth / 15)); // up to 2x
      }

      // Deadline compression: never schedule past a third of the remaining runway,
      // so every passage gets multiple confirmations before the performance.
      const dl = daysUntil(work.performanceDate);
      if (dl !== null && dl > 0) next = Math.min(next, Math.max(1, Math.floor(dl / 3)));

      s.interval = Math.max(1, next);
      s.due = addDays(today, s.interval);
      passage.needsReencode = false;
    }

    s.history.push({ date: today, grade });
    this.updatePhase(work, passage);
    Store.recordTest(today);
    Store.save();
  },

  updatePhase(work, passage) {
    const s = passage.srs;
    const hasStudy = Store.passageSessions(passage.id).length > 0;
    const successes = s.history.filter(h => h.grade >= 2).length;
    const recent = s.history.slice(-3);
    const noRecentLapse = recent.length === 3 && recent.every(h => h.grade >= 2);

    if (!hasStudy && s.history.length === 0) passage.phase = 'new';
    else if (successes === 0) passage.phase = 'encoding';
    else if (s.reps >= 4 && s.interval >= 10 && noRecentLapse) passage.phase = 'secure';
    else passage.phase = 'recalling';
  },

  /* First test becomes available once the passage has real encoding behind it. */
  scheduleFirstTest(passage) {
    if (passage.srs.due) return;
    const depth = Store.encodingDepth(passage.id);
    if (depth >= 2) {
      passage.srs.due = todayStr(); // micro-retrieval: test the same day you encode
      Store.save();
    }
  },

  duePassages() {
    const today = todayStr();
    const due = [];
    for (const w of Store.state.works) {
      if (w.status !== 'active') continue;
      for (const p of w.passages) {
        if (p.srs.due && p.srs.due <= today) {
          due.push({ work: w, passage: p, overdue: daysBetween(p.srs.due, today) });
        }
      }
    }
    // urgency: nearest deadline first, then critical, then most overdue
    due.sort((a, b) => {
      const da = daysUntil(a.work.performanceDate) ?? 9999;
      const db = daysUntil(b.work.performanceDate) ?? 9999;
      if (da !== db) return da - db;
      if (a.passage.critical !== b.passage.critical) return a.passage.critical ? -1 : 1;
      return b.overdue - a.overdue;
    });
    return due;
  },

  synthesisDue(work) {
    if (!work.primed || work.passages.length === 0) return false;
    const last = Store.state.lastSynthesis[work.id];
    return !last || daysBetween(last, todayStr()) >= 7;
  },

  /* ---------- Decision engine ----------
     Answers “what should I do right now?” in method order:
     1. Due recall tests (retrieval checks, deadline-urgent first)
     2. Priming for any unprimed work (architecture before detail)
     3. Prescribed re-encoding for lapsed passages
     4. Encoding for weak passages — critical (Pareto) first
     5. Weekly synthesis test (rebuild the form map)
     6. Balance correction (too much consuming → force generation) */

  todaysPlan() {
    const tasks = [];
    const works = Store.state.works.filter(w => w.status === 'active');

    // 1. due tests
    const due = this.duePassages();
    for (const d of due.slice(0, 8)) {
      tasks.push({
        kind: 'test', workId: d.work.id, passageId: d.passage.id,
        title: `Recall test — ${d.passage.name}`,
        sub: `${d.work.title}${d.overdue > 0 ? ` · ${d.overdue}d overdue` : ''}`,
        why: 'Retrieval on schedule: catching the memory just before it fades is what makes the next interval longer.',
        starter: 'Two-minute version: audiate just the opening bars, score closed.',
      });
    }
    if (due.length > 8) {
      tasks.push({ kind: 'more-tests', title: `…and ${due.length - 8} more due tests`, sub: 'Open the Review queue', why: '', starter: '' });
    }

    // 2. priming
    for (const w of works) {
      if (!w.primed) {
        tasks.push({
          kind: 'prime', workId: w.id,
          title: `Prime — ${w.title}`,
          sub: w.composer,
          why: 'Architecture before detail: a big-picture scaffold lowers cognitive load for every later session (priming).',
          starter: 'Two-minute version: skim the movement headings and note the overall proportions.',
        });
      } else if (w.passages.length === 0) {
        tasks.push({
          kind: 'add-passages', workId: w.id,
          title: `Break down — ${w.title}`,
          sub: 'Turn your form sketch into passages',
          why: 'Chunking: passages are the units the scheduler can track, test, and prioritize.',
          starter: 'Two-minute version: add just the single most critical passage.',
        });
      }
    }

    // 3. re-encoding prescriptions
    for (const w of works) {
      for (const p of w.passages) {
        if (p.needsReencode) {
          tasks.push({
            kind: 'encode', workId: w.id, passageId: p.id,
            title: `Re-encode — ${p.name}`,
            sub: `${w.title} · failed last recall`,
            why: 'A failed recall is an encoding problem, not a repetition problem. Fix the trace, then re-test.',
            starter: 'Two-minute version: sing the line that broke down, three times.',
          });
        }
      }
    }

    // 4. encoding for weak passages, critical first (Pareto)
    const weak = [];
    for (const w of works) {
      if (!w.primed) continue;
      for (const p of w.passages) {
        if (p.needsReencode) continue;
        const depth = Store.encodingDepth(p.id);
        if ((p.phase === 'new' || p.phase === 'encoding') && depth < 8) {
          weak.push({ w, p, depth });
        }
      }
    }
    weak.sort((a, b) => {
      if (a.p.critical !== b.p.critical) return a.p.critical ? -1 : 1;
      const da = daysUntil(a.w.performanceDate) ?? 9999;
      const db = daysUntil(b.w.performanceDate) ?? 9999;
      if (da !== db) return da - db;
      return a.depth - b.depth;
    });
    for (const { w, p, depth } of weak.slice(0, 3)) {
      tasks.push({
        kind: 'encode', workId: w.id, passageId: p.id,
        title: `Encode — ${p.name}`,
        sub: `${w.title}${p.critical ? ' · ★ critical' : ''} · depth ${depth}/15`,
        why: p.critical
          ? 'Pareto: this is one of the passages that carries the performance. Deep encoding here pays 80% of the dividend.'
          : 'Encoding first: varied generative work now means far fewer reviews later.',
        starter: 'Two-minute version: play (or sing) just the bass line and name the key areas.',
      });
    }

    // 5. weekly synthesis
    for (const w of works) {
      if (this.synthesisDue(w)) {
        tasks.push({
          kind: 'synthesis', workId: w.id,
          title: `Weekly synthesis — ${w.title}`,
          sub: 'Rebuild the form map from a blank page',
          why: 'Test to the max: weekly whole-work reconstruction finds the gaps between passages that passage-tests can’t see.',
          starter: 'Two-minute version: list the sections of one movement from memory.',
        });
      }
    }

    // 6. balance correction
    const bal = Store.balance();
    if (bal.total >= 60 && bal.ratio !== null && bal.ratio < 0.5) {
      tasks.push({
        kind: 'balance',
        title: 'Rebalance: more generation, less consumption',
        sub: `Only ${Math.round(bal.ratio * 100)}% of the last 14 days was generative`,
        why: 'The effort–time exchange: listening and reading feel productive but encode weakly. Sing, play, write, audiate.',
        starter: 'Two-minute version: close the score and audiate anything you listened to today.',
      });
    }

    return tasks;
  },

  /* ---------- Recall prompt generation ----------
     Prompts are generative and pitched at the top of Bloom's ladder
     (evaluate/analyze first — the lower levels come along for free). */

  prompts(passage) {
    const out = [];
    const t = passage.types;
    const loc = passage.location ? ` (${passage.location})` : '';
    if (t.includes('structural')) {
      out.push(`Score closed: sketch the form of “${passage.name}”${loc} — sections, key areas, proportions, the main events. Then check against the score.`);
      out.push(`Audiate the passage from memory — the full orchestration, not just the tune. Where does the sound go fuzzy?`);
    }
    if (t.includes('gestural')) {
      out.push(`Conduct “${passage.name}” from memory: meter changes, cues, tempo transitions. Then verify every cue against the score.`);
    }
    if (t.includes('relational')) {
      out.push(`Compare this passage with its counterpart (earlier statement, parallel movement, or the work it echoes): what is identical, what changed, and why did the composer change it?`);
    }
    if (t.includes('evidence')) {
      out.push(`Explain WHY this passage works: name the pivotal harmonic/orchestral details and what each one does.`);
    }
    if (t.includes('reference')) {
      out.push(`Recite the cold facts: rehearsal figures, tempo marks, key entrances/cues, transpositions in “${passage.name}”.`);
    }
    // Higher-order add-on (evaluate level)
    out.push(`So what? What is the single most important thing the audience must experience in this passage — and what must YOU do to make it happen?`);
    return out;
  },

  microPrompt(modeLabel) {
    return `Micro-retrieval: close the score. For 60 seconds, audiate what you just worked on (${modeLabel}). ` +
      `Notice exactly where it goes fuzzy — that fuzz is tomorrow's first target.`;
  },
};
