/* store.js — state, persistence, catalogs */
'use strict';

const DATA_KEY = 'scorestudy.v1';

/* ---------- Catalogs ---------- */

/* PACER, adapted for the podium. Each score element type maps to a
   type-specific digestion technique (Justin Sung's PACER framework). */
const ELEMENT_TYPES = {
  structural: {
    letter: 'C', label: 'Structural',
    desc: 'The architecture: form, key areas, harmonic plan, orchestration logic.',
    tech: 'Map it — build a nonlinear form/harmony map, then rebuild it from a blank page.',
  },
  gestural: {
    letter: 'P', label: 'Gestural',
    desc: 'Podium mechanics: meter changes, cues, tempo transitions, fermatas, beat subdivisions.',
    tech: 'Practice immediately — conduct it physically the same day you study it.',
  },
  relational: {
    letter: 'A', label: 'Relational',
    desc: 'Theme returns and transformations, cross-movement links, echoes of other repertoire.',
    tech: 'Compare & critique — what is identical, what changed, and why did the composer change it?',
  },
  evidence: {
    letter: 'E', label: 'Evidence',
    desc: 'Pivotal details that explain WHY the passage works: the modulation, the register shift, the color change.',
    tech: 'Capture into your map while studying; rehearse by explaining the passage aloud.',
  },
  reference: {
    letter: 'R', label: 'Reference',
    desc: 'Cold facts: transpositions, rehearsal figures, metronome marks, the entrance/cue list.',
    tech: 'Direct spaced recall — flashcard-style. Do not burn deep-study time on these.',
  },
};

/* Study modes. cat: consume | generate | recall.
   weight feeds encoding depth (generation effect: harder generation = deeper trace). */
const STUDY_MODES = [
  { id: 'listen',        label: 'Listen with score',                cat: 'consume',  weight: 1,
    hint: 'Read like difficult text: chunk by phrase, pause at section boundaries to reflect, and predict what comes next before it sounds.' },
  { id: 'background',    label: 'Read background / analysis',       cat: 'consume',  weight: 1,
    hint: 'Classify as you read: is this Evidence (add to your map) or Reference (flashcard it)? Don’t try to remember everything.' },
  { id: 'analyze',       label: 'Analyze harmony & structure',      cat: 'generate', weight: 3,
    hint: 'Ask the magic question: “How can I organize this?” Group, simplify, and re-draw the composer’s plan in your own shape.' },
  { id: 'mark',          label: 'Mark the score',                   cat: 'generate', weight: 2,
    hint: 'Marking is deciding. Every cue, breath, and structural bracket you write is a prioritization call (Evaluate level).' },
  { id: 'sing',          label: 'Sing / solfège the lines',         cat: 'generate', weight: 3,
    hint: 'Singing forces generation — you can’t sing a line you haven’t truly heard. Rotate through inner voices, not just the tune.' },
  { id: 'piano',         label: 'Play at the piano',                cat: 'generate', weight: 3,
    hint: 'Reduce, don’t reproduce: play the harmonic skeleton and voice-leading. The reduction IS the understanding.' },
  { id: 'conduct-score', label: 'Conduct through with score',       cat: 'generate', weight: 2,
    hint: 'This is Procedural material — gesture is learned by doing, not by reading. Practice transitions, not just the easy stretches.' },
  { id: 'audiate',       label: 'Audiate from memory',              cat: 'recall',   weight: 4,
    hint: 'Inner-hear the passage cold: full orchestration, not just the melody. Note exactly where it goes fuzzy — that’s your next target.' },
  { id: 'conduct-memory',label: 'Conduct from memory',              cat: 'recall',   weight: 4,
    hint: 'Score closed. Cues, meter, tempo transitions from memory, then verify. Struggle is the point — no struggle, no learning.' },
  { id: 'write-out',     label: 'Write out from memory',            cat: 'recall',   weight: 5,
    hint: 'The strongest generation there is. Even a short-score sketch of key voices reveals precisely what you don’t know.' },
  { id: 'blank-map',     label: 'Rebuild form map from blank page', cat: 'recall',   weight: 5,
    hint: 'Weekly synthesis: reconstruct the whole architecture — sections, keys, proportions, events — then diff against your real map.' },
];

const MODE_BY_ID = Object.fromEntries(STUDY_MODES.map(m => [m.id, m]));

const PHASES = {
  new:      { label: 'New',      order: 0 },
  encoding: { label: 'Encoding', order: 1 },
  recalling:{ label: 'Testing',  order: 2 },
  secure:   { label: 'Secure',   order: 3 },
};

const PRIMING_STEPS = [
  { id: 'listen-through', label: 'Listen through once with the score — no stopping, no detail work. Big picture only.' },
  { id: 'form-sketch',    label: 'Sketch the architecture: movements, sections, proportions, key areas, the 3–5 biggest events.' },
  { id: 'first-pass',     label: 'Note what feels familiar (relational links to pieces you know) and what feels alien.' },
  { id: 'critical-scan',  label: 'Pareto scan: mark the ~20% of passages that carry the performance (transitions, exposed spots, tricky meters).' },
];

/* ---------- Date helpers ---------- */

function todayStr(d) {
  const dt = d ? new Date(d) : new Date();
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
function daysBetween(a, b) { // b - a in days
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return daysBetween(todayStr(), dateStr);
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------- Store ---------- */

const Store = {
  state: null,

  defaultState() {
    return {
      version: 1,
      settings: {
        dailyMinimumMinutes: 10,
        notifications: false,
        github: { owner: '', repo: '', branch: '', path: 'data/score-study-data.json', token: '', sha: null },
      },
      works: [],
      sessions: [],   // {id, date, workId, passageId|null, modeId, minutes, struggle, note}
      dayLog: {},     // 'YYYY-MM-DD': { minutes, tests, metMinimum }
      lastSynthesis: {}, // workId -> dateStr
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      this.state = raw ? JSON.parse(raw) : this.defaultState();
    } catch (e) {
      console.error('Failed to load state', e);
      this.state = this.defaultState();
    }
    // forward-compat defaults
    const d = this.defaultState();
    this.state.settings = Object.assign(d.settings, this.state.settings || {});
    this.state.settings.github = Object.assign(d.settings.github, this.state.settings.github || {});
    this.state.dayLog = this.state.dayLog || {};
    this.state.lastSynthesis = this.state.lastSynthesis || {};
    return this.state;
  },

  save() {
    localStorage.setItem(DATA_KEY, JSON.stringify(this.state));
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /* ----- works & passages ----- */

  addWork({ title, composer, performanceDate }) {
    const w = {
      id: this.uid(), title, composer, performanceDate: performanceDate || null,
      status: 'active', createdAt: todayStr(),
      priming: {}, primed: false, primingNotes: '',
      passages: [],
    };
    this.state.works.push(w);
    this.save();
    return w;
  },

  getWork(id) { return this.state.works.find(w => w.id === id); },

  addPassage(work, { name, location, types, critical, criticalBars, difficulty, notes }) {
    const p = {
      id: this.uid(), name, location: location || '',
      types: types && types.length ? types : ['structural'],
      critical: !!critical, criticalBars: criticalBars || '',
      difficulty: difficulty || 3, notes: notes || '',
      phase: 'new', needsReencode: false, createdAt: todayStr(),
      srs: { interval: 0, ease: 2.5, due: null, reps: 0, lapses: 0, history: [] },
    };
    work.passages.push(p);
    this.save();
    return p;
  },

  findPassage(pid) {
    for (const w of this.state.works) {
      const p = w.passages.find(p => p.id === pid);
      if (p) return { work: w, passage: p };
    }
    return null;
  },

  /* ----- sessions ----- */

  logSession({ workId, passageId, modeId, minutes, struggle, note }) {
    const s = {
      id: this.uid(), date: todayStr(), workId, passageId: passageId || null,
      modeId, minutes: minutes || 0, struggle: struggle || 0, note: note || '',
    };
    this.state.sessions.push(s);
    const day = this.state.dayLog[s.date] || { minutes: 0, tests: 0 };
    day.minutes += s.minutes;
    this.state.dayLog[s.date] = day;
    this.save();
    return s;
  },

  passageSessions(pid) { return this.state.sessions.filter(s => s.passageId === pid); },

  /* Encoding depth: sum of weights of DISTINCT generative/recall modes logged
     for this passage (deep, varied generation > repetition of one mode). Cap 15. */
  encodingDepth(pid) {
    const seen = new Set();
    let depth = 0;
    for (const s of this.passageSessions(pid)) {
      const m = MODE_BY_ID[s.modeId];
      if (m && m.cat !== 'consume' && !seen.has(m.id)) { seen.add(m.id); depth += m.weight; }
    }
    return Math.min(depth, 15);
  },

  /* Balance over the last 14 days: generative+recall minutes vs consumption minutes. */
  balance(days = 14) {
    const cutoff = addDays(todayStr(), -days);
    let gen = 0, con = 0, test = 0;
    for (const s of this.state.sessions) {
      if (s.date < cutoff) continue;
      const m = MODE_BY_ID[s.modeId];
      if (!m) continue;
      if (m.cat === 'consume') con += s.minutes;
      else if (m.cat === 'recall') test += s.minutes;
      else gen += s.minutes;
    }
    const active = gen + test;
    const total = active + con;
    return { gen, con, test, active, total, ratio: total ? active / total : null };
  },

  streak() {
    let n = 0;
    let d = todayStr();
    // today counts if met, otherwise start from yesterday
    if (!this.dayMet(d)) d = addDays(d, -1);
    while (this.dayMet(d)) { n++; d = addDays(d, -1); }
    return n;
  },

  dayMet(dateStr) {
    const day = this.state.dayLog[dateStr];
    if (!day) return false;
    return day.minutes >= this.state.settings.dailyMinimumMinutes || (day.tests || 0) >= 1;
  },

  recordTest(dateStr) {
    const day = this.state.dayLog[dateStr] || { minutes: 0, tests: 0 };
    day.tests = (day.tests || 0) + 1;
    this.state.dayLog[dateStr] = day;
    this.save();
  },

  /* ----- import/export ----- */

  exportJSON() { return JSON.stringify(this.state, null, 2); },

  importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.works)) {
      throw new Error('Not a valid Score Study backup file.');
    }
    this.state = obj;
    this.load(); // re-apply defaults
    this.state = Object.assign(this.defaultState(), this.state);
    this.save();
  },

  loadExample() {
    const w = this.addWork({ title: 'Symphony No. 5 in C minor, Op. 67', composer: 'Beethoven', performanceDate: addDays(todayStr(), 56) });
    w.priming = { 'listen-through': true, 'form-sketch': true, 'first-pass': true, 'critical-scan': true };
    w.primed = true;
    w.primingNotes = 'Sonata form mvt I; fate motif saturates every level. Big events: development climax, oboe cadenza, coda expansion.';
    this.addPassage(w, { name: 'Mvt I — Exposition', location: 'mm. 1–124', types: ['structural', 'gestural'], critical: true, criticalBars: 'mm. 1–5 (openings/fermatas), 59–62 (horn call)', difficulty: 4, notes: 'The two opening fermatas are the most exposed podium moment in the piece.' });
    this.addPassage(w, { name: 'Mvt I — Development', location: 'mm. 125–248', types: ['structural', 'relational', 'evidence'], critical: false, difficulty: 3, notes: 'Compare motif fragmentation here vs. exposition — same cell, different function.' });
    this.addPassage(w, { name: 'Mvt I — Oboe cadenza & recap', location: 'mm. 249–302', types: ['gestural', 'evidence'], critical: true, criticalBars: 'm. 268 (cadenza)', difficulty: 4, notes: 'Cadenza handoff: stop time, restart cleanly.' });
    this.addPassage(w, { name: 'Mvt III→IV transition', location: 'mvt III m. 324 – mvt IV m. 1', types: ['gestural', 'structural', 'evidence'], critical: true, criticalBars: 'timpani pedal → C major eruption', difficulty: 5, notes: 'The famous bridge. Pareto passage #1: this transition carries the whole symphony.' });
    this.addPassage(w, { name: 'Reference facts — whole work', location: 'all movements', types: ['reference'], critical: false, difficulty: 2, notes: 'Tempi per movement, key entrances (horns mvt III trio, piccolo/contrabassoon/trombones mvt IV), rehearsal letters.' });
    this.save();
    return w;
  },
};
