/* NWSA Music — data layer. One JSON doc in localStorage, defensive load,
   JSON export/import, roster import with merge. Global namespace `Store`.

   Privacy note: this file ships with generic sample data only. Real rosters,
   contacts, and notes are entered through the UI and live in the browser's
   localStorage on the director's own device — never in this public repo. */
'use strict';

const Store = {
  KEY: 'nwsa_music_hub_v1',
  RECOVERY_PREFIX: 'nwsa_music_hub_recovery_',
  data: null,
  loadIssues: [],       // human-readable list of sections that failed to load
  _saveFailed: false,

  /* ---------- defaults ---------- */
  blocksDefault() {
    return [
      { id: 'b1', label: 'Block 1', start: '13:10', end: '14:25' },
      { id: 'b2', label: 'Block 2', start: '14:30', end: '15:45' },
    ];
  },

  ensemblesDefault() {
    // Music ensembles ONLY. Dance / Theater / Visual Arts are divisions
    // (calendar labels), never ensembles — see divisionsDefault().
    return [
      { id: 'sym',  name: 'Symphony Orchestra', short: 'Symphony',      color: '#c98a2b', blockId: 'b1' },
      { id: 'we',   name: 'Wind Ensemble',      short: 'Wind Ens.',     color: '#3f8efc', blockId: 'b2' },
      { id: 'jazz', name: 'Jazz Band',          short: 'Jazz',          color: '#9b59d0', blockId: 'b2' },
      { id: 'cw',   name: 'Chamber Winds',      short: 'Chamber Winds', color: '#2fa87c', blockId: 'b1' },
    ];
  },

  divisionsDefault() {
    return [
      { id: 'dance',   name: 'Dance',       color: '#e0558f' },
      { id: 'theater', name: 'Theater',     color: '#d3573b' },
      { id: 'visual',  name: 'Visual Arts', color: '#5b8c5a' },
    ];
  },

  defaults() {
    return {
      version: 1,
      settings: {
        appName: 'NWSA Music',
        subtitle: 'Ensembles Hub',
        baseUrl: '',          // used by the QR kit; auto-filled from location
        pin: '',              // director PIN ('' = not set yet)
        lastFilter: {},       // per-page ensemble-chip memory, e.g. {repertoire:'sym'}
        rollSort: 'last',     // 'last' | 'score'
      },
      blocks: this.blocksDefault(),
      ensembles: this.ensemblesDefault(),
      divisions: this.divisionsDefault(),
      students: [],
      events: [],             // {id,date,endDate?,title,time?,endTime?,location,tag:{type:'ensemble'|'division'|'all',id},details}
      announcements: [],      // {id,title,body,ensembleIds:[]|'all',date,pinned}
      assignments: [],        // {id,title,details,ensembleIds:[],due,dueTime?,points,link}
      concerts: [],           // {id,title,date,time?,venue,ensembleIds:[]}
      repertoire: [],         // {id,title,composer,arranger,ensembleId,concertId,status,notes,chartId}
      seatingCharts: [],      // {id,name,ensembleId,sections:[{name,seatIds:[]}],updated}
      attendance: {},         // {date:{ensembleId:{studentId:'P'|'A'|'T'|'E'}}}
      whosOut: [],            // {id,studentId,from,to,reason,note}
      tempChanges: [],        // {id,studentId,type:'sub-in'|'pull-out',ensembleId,fromEnsembleId?,from,to,note}
      scheduleChanges: {},    // {date:{note?,changes:{ensembleId:{start,end}|{cancelled:true}}}}
    };
  },

  SECTION_KINDS: {
    settings: 'object', blocks: 'array', ensembles: 'array', divisions: 'array',
    students: 'array', events: 'array', announcements: 'array', assignments: 'array',
    concerts: 'array', repertoire: 'array', seatingCharts: 'array',
    attendance: 'object', whosOut: 'array', tempChanges: 'array', scheduleChanges: 'object',
  },

  /* ---------- load / save ----------
     The old app could greet directors with a vague "some data couldn't load"
     banner. Here a corrupt store is (1) stashed untouched under a recovery
     key so nothing is ever silently lost, (2) loaded section-by-section so
     one bad section doesn't take down the rest, and (3) reported with a
     specific, actionable message (see app.js banner). */
  load() {
    this.loadIssues = [];
    const base = this.defaults();
    let raw = null;
    try { raw = localStorage.getItem(this.KEY); }
    catch (e) { this.loadIssues.push('Browser storage is unavailable (private mode?). Changes will not be saved.'); }

    if (!raw) { this.data = base; return this.data; }

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.stashRecovery(raw);
      this.loadIssues.push('Saved data was unreadable. It was preserved as a recovery backup (Settings → Recovery) and the app restarted with defaults.');
      this.data = base;
      return this.data;
    }

    let stashed = false;
    for (const [key, kind] of Object.entries(this.SECTION_KINDS)) {
      const v = parsed[key];
      if (v === undefined) continue; // fine — new section since last save
      const ok = kind === 'array' ? Array.isArray(v) : (v && typeof v === 'object' && !Array.isArray(v));
      if (ok) base[key] = v;
      else {
        if (!stashed) { this.stashRecovery(raw); stashed = true; }
        this.loadIssues.push(`The "${key}" section was unreadable and was reset. The original was preserved as a recovery backup (Settings → Recovery).`);
      }
    }
    base.version = parsed.version || 1;
    try {
      this.data = this.migrate(base);
    } catch (e) {
      // A corrupt element inside an otherwise valid section must never brick
      // the app — stash everything and restart with defaults, loudly.
      if (!stashed) this.stashRecovery(raw);
      this.loadIssues.push('Saved data contained unreadable entries and was reset. The original was preserved as a recovery backup (Settings → Recovery).');
      this.data = this.defaults();
    }
    return this.data;
  },

  migrate(d) {
    // Drop corrupt (non-object) elements from every list before touching them.
    const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
    for (const key of Object.keys(this.SECTION_KINDS)) {
      if (this.SECTION_KINDS[key] === 'array' && Array.isArray(d[key])) d[key] = d[key].filter(isObj);
    }
    for (const k of ['attendance', 'scheduleChanges']) {
      if (isObj(d[k])) for (const day of Object.keys(d[k])) { if (!isObj(d[k][day])) delete d[k][day]; }
    }
    // …and one level deeper, so a corrupt group can never brick roll-taking
    // or block-chip taps for that day.
    if (isObj(d.attendance)) {
      for (const day of Object.values(d.attendance)) {
        for (const eid of Object.keys(day)) if (!isObj(day[eid])) delete day[eid];
      }
    }
    if (isObj(d.scheduleChanges)) {
      for (const rec of Object.values(d.scheduleChanges)) {
        if (!isObj(rec.changes)) rec.changes = {};
        for (const eid of Object.keys(rec.changes)) if (!isObj(rec.changes[eid])) delete rec.changes[eid];
      }
    }
    d.settings = Object.assign(this.defaults().settings, isObj(d.settings) ? d.settings : {});
    if (!Array.isArray(d.blocks) || d.blocks.length < 2) d.blocks = this.blocksDefault();
    if (!Array.isArray(d.ensembles) || !d.ensembles.length) d.ensembles = this.ensemblesDefault();
    if (!Array.isArray(d.divisions)) d.divisions = this.divisionsDefault();
    // Divisions must never masquerade as ensembles (older data had them mixed).
    const divNames = new Set(['dance', 'theater', 'theatre', 'visual arts', 'visual']);
    const strays = d.ensembles.filter(e => divNames.has(U.norm(e.name)) || divNames.has(U.norm(e.short)));
    if (strays.length) {
      d.ensembles = d.ensembles.filter(e => !strays.includes(e));
      for (const s of strays) {
        if (!d.divisions.some(v => U.norm(v.name) === U.norm(s.name))) {
          d.divisions.push({ id: s.id, name: s.name, color: s.color || '#888' });
        }
      }
    }
    for (const st of d.students) {
      if (!st.id) st.id = U.uid();
      if (!st.status) st.status = 'active';
      if (!Array.isArray(st.contacts)) st.contacts = [];
      st.contacts = st.contacts.filter(isObj);
      if (!Array.isArray(st.ensembleIds)) st.ensembleIds = [];
      if (!st.extra || typeof st.extra !== 'object') st.extra = {};
    }
    for (const chart of d.seatingCharts) {
      if (!Array.isArray(chart.sections)) chart.sections = [];
      chart.sections = chart.sections.filter(isObj);
      for (const sec of chart.sections) if (!Array.isArray(sec.seatIds)) sec.seatIds = [];
    }
    return d;
  },

  stashRecovery(raw) {
    try {
      const key = this.RECOVERY_PREFIX + new Date().toISOString().replace(/[:.]/g, '-');
      localStorage.setItem(key, raw);
      // keep only the 3 newest recovery stashes
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.RECOVERY_PREFIX)) keys.push(k);
      }
      keys.sort().slice(0, -3).forEach(k => localStorage.removeItem(k));
    } catch (e) { /* storage full — nothing more we can do */ }
  },

  recoveryKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.RECOVERY_PREFIX)) keys.push(k);
      }
    } catch (e) { /* ignore */ }
    return keys.sort().reverse();
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
      this._saveFailed = false;
    } catch (e) {
      if (!this._saveFailed) U.toast('Could not save — browser storage is full or blocked.', 'error');
      this._saveFailed = true;
    }
  },

  exportJson() {
    return JSON.stringify(this.data, null, 2);
  },

  importJson(text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { ok: false, error: 'That file is not valid JSON.' }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !this.SECTION_KINDS.settings) {
      return { ok: false, error: 'That file does not look like a backup from this app.' };
    }
    const looksRight = ['students', 'ensembles', 'settings'].some(k => k in parsed);
    if (!looksRight) return { ok: false, error: 'That file does not look like a backup from this app.' };
    try { this.stashRecovery(localStorage.getItem(this.KEY) || ''); } catch (e) { /* ignore */ }
    const base = this.defaults();
    for (const [key, kind] of Object.entries(this.SECTION_KINDS)) {
      const v = parsed[key];
      const ok = v !== undefined && (kind === 'array' ? Array.isArray(v) : (v && typeof v === 'object' && !Array.isArray(v)));
      if (ok) base[key] = v;
      else if (v === undefined && this.data && this.data[key] !== undefined) {
        // Section absent from the backup (partial/hand-edited file): keep
        // what's on the device rather than resetting to defaults — this is
        // what protects the PIN and block setup from a content-only file.
        base[key] = this.data[key];
      }
    }
    // Anything invalid gets dropped — but never silently (req: no vague or
    // silent data-loss; the director is told exactly which sections fell back).
    const dropped = [];
    for (const [key, kind] of Object.entries(this.SECTION_KINDS)) {
      const v = parsed[key];
      if (v === undefined) continue;
      const okv = kind === 'array' ? Array.isArray(v) : (v && typeof v === 'object' && !Array.isArray(v));
      if (!okv) dropped.push(key);
    }
    try {
      this.data = this.migrate(base);
    } catch (e) {
      this.data = this.load(); // put the previous data back
      return { ok: false, error: 'That backup contains unreadable entries and was not restored.' };
    }
    this.save();
    // A successful restore resolves any earlier issues; a partial one
    // replaces them with the specifics of what was dropped.
    this.loadIssues = dropped.map(k => `The backup's "${k}" section was unreadable and was not restored (everything else was). The previous data is under Settings → Recovery.`);
    return { ok: true, dropped };
  },

  /* ---------- lookups ---------- */
  ensembles() { return this.data.ensembles; },
  divisions() { return this.data.divisions; },
  ensembleById(id) { return this.data.ensembles.find(e => e.id === id) || null; },
  divisionById(id) { return this.data.divisions.find(d => d.id === id) || null; },
  blockById(id) { return this.data.blocks.find(b => b.id === id) || this.data.blocks[0]; },
  studentById(id) { return this.data.students.find(s => s.id === id) || null; },
  studentName(id, opts) {
    const s = this.studentById(id);
    if (!s) return '(removed student)';
    const first = s.preferred || s.first;
    return (opts && opts.lastFirst) ? `${s.last}, ${first}` : `${first} ${s.last}`;
  },

  activeStudents(ensembleId) {
    return this.data.students.filter(s =>
      s.status !== 'archived' && (!ensembleId || ensembleId === 'all' || s.ensembleIds.includes(ensembleId)));
  },
  archivedStudents() {
    return this.data.students.filter(s => s.status === 'archived');
  },

  ensembleNames(ids) {
    if (ids === 'all' || !ids || !ids.length) return 'All ensembles';
    return ids.map(id => (this.ensembleById(id) || {}).short || '?').join(' · ');
  },

  /* ---------- per-page ensemble-filter memory ---------- */
  getFilter(page, fallback) {
    const v = (this.data.settings.lastFilter || {})[page];
    if (v && (v === 'all' || this.ensembleById(v))) return v;
    return fallback || 'all';
  },
  setFilter(page, value) {
    if (!this.data.settings.lastFilter) this.data.settings.lastFilter = {};
    this.data.settings.lastFilter[page] = value;
    this.save();
  },

  /* ---------- schedule ---------- */
  baseTimes(ensemble) {
    const b = this.blockById(ensemble.blockId);
    return { start: b.start, end: b.end, blockId: b.id };
  },

  /* Effective rehearsal schedule for a date, changes applied. */
  effectiveScheduleFor(date) {
    const day = this.data.scheduleChanges[date];
    return this.data.ensembles.map(e => {
      const base = this.baseTimes(e);
      const ch = day && day.changes ? day.changes[e.id] : null;
      if (ch && ch.cancelled) {
        return { ensemble: e, cancelled: true, changed: true, baseStart: base.start, baseEnd: base.end };
      }
      if (ch && ch.start) {
        return {
          ensemble: e, start: ch.start, end: ch.end, changed: true,
          baseStart: base.start, baseEnd: base.end,
        };
      }
      return { ensemble: e, start: base.start, end: base.end, changed: false, baseStart: base.start, baseEnd: base.end };
    }).sort((a, b) => (a.start || '99') < (b.start || '99') ? -1 : 1);
  },

  setScheduleChange(date, ensembleId, change) {
    const sc = this.data.scheduleChanges;
    if (!sc[date]) sc[date] = { changes: {} };
    if (!sc[date].changes) sc[date].changes = {};
    if (change == null) delete sc[date].changes[ensembleId];
    else sc[date].changes[ensembleId] = change;
    if (!Object.keys(sc[date].changes).length && !(sc[date].note || '').trim()) delete sc[date];
    this.save();
  },

  makeDayNormal(date) {
    delete this.data.scheduleChanges[date];
    this.save();
  },

  /* After block times or an ensemble's home block change in Settings, an old
     override can become identical to the new normal time — sweep those so
     days don't stay marked "changed" for no visible reason. */
  cleanupNoopOverrides() {
    for (const [date, rec] of Object.entries(this.data.scheduleChanges)) {
      for (const [eid, ch] of Object.entries(rec.changes || {})) {
        if (!ch || ch.cancelled) continue;
        const e = this.ensembleById(eid);
        if (!e) { delete rec.changes[eid]; continue; }
        const base = this.baseTimes(e);
        if (ch.start === base.start && ch.end === base.end) delete rec.changes[eid];
      }
      if (!Object.keys(rec.changes || {}).length && !(rec.note || '').trim()) {
        delete this.data.scheduleChanges[date];
      }
    }
    this.save();
  },

  changedDates() {
    return Object.keys(this.data.scheduleChanges)
      .filter(d => this.data.scheduleChanges[d] && Object.keys(this.data.scheduleChanges[d].changes || {}).length)
      .sort();
  },

  /* ---------- attendance ---------- */
  roll(date, ensembleId) {
    return ((this.data.attendance[date] || {})[ensembleId]) || {};
  },
  setRollMark(date, ensembleId, studentId, code) {
    const a = this.data.attendance;
    if (!a[date]) a[date] = {};
    if (!a[date][ensembleId]) a[date][ensembleId] = {};
    if (code == null) delete a[date][ensembleId][studentId];
    else a[date][ensembleId][studentId] = code;
    if (!Object.keys(a[date][ensembleId]).length) delete a[date][ensembleId];
    if (!Object.keys(a[date]).length) delete a[date];
    this.save();
  },
  /* Only marks belonging to visible (non-archived, still-existing) students
     count anywhere — an archived student leaves no phantom rolls behind. */
  rollHasVisible(date, ensembleId) {
    const g = (this.data.attendance[date] || {})[ensembleId];
    return !!g && Object.keys(g).some(sid => this.isVisibleStudent(sid));
  },
  rollDates(ensembleId) {
    return Object.keys(this.data.attendance)
      .filter(d => {
        const day = this.data.attendance[d];
        const eids = ensembleId && ensembleId !== 'all' ? [ensembleId] : Object.keys(day);
        return eids.some(eid => this.rollHasVisible(d, eid));
      })
      .sort();
  },
  rollSummary(date, ensembleId) {
    const out = { P: 0, A: 0, T: 0, E: 0, total: 0 };
    const day = this.data.attendance[date] || {};
    const groups = ensembleId && ensembleId !== 'all' ? [day[ensembleId] || {}] : Object.values(day);
    for (const g of groups) {
      for (const [sid, code] of Object.entries(g)) {
        if (!this.isVisibleStudent(sid)) continue;
        if (out[code] != null) out[code]++;
        out.total++;
      }
    }
    return out;
  },
  /* Remove a whole day's roll for an ensemble — including marks left behind
     by students who were archived or moved since. */
  clearRoll(date, ensembleId) {
    const a = this.data.attendance;
    if (a[date]) {
      delete a[date][ensembleId];
      if (!Object.keys(a[date]).length) delete a[date];
    }
    this.save();
  },

  /* Roll roster for a date: active members, minus pull-outs covering the
     date, plus sub-ins covering the date (temporary roster changes). */
  rosterOn(date, ensembleId) {
    const changes = this.data.tempChanges.filter(t =>
      t.ensembleId === ensembleId && U.inRange(date, t.from, t.to || t.from));
    const pulledIds = new Set(changes.filter(t => t.type === 'pull-out').map(t => t.studentId));
    const subInIds = new Set(changes.filter(t => t.type === 'sub-in').map(t => t.studentId));
    const students = this.activeStudents(ensembleId).filter(s => !pulledIds.has(s.id));
    for (const sid of subInIds) {
      const st = this.studentById(sid);
      if (st && st.status !== 'archived' && !students.some(s => s.id === sid)) students.push(st);
    }
    return { students, subInIds, pulledIds };
  },

  /* ---------- who's out ---------- */
  /* Archived students are invisible here too — their history stays stored,
     but nothing about them surfaces anywhere in the app. */
  isVisibleStudent(id) {
    const s = this.studentById(id);
    return !!s && s.status !== 'archived';
  },
  outOn(date) {
    const manual = this.data.whosOut.filter(w =>
      U.inRange(date, w.from, w.to || w.from) && this.isVisibleStudent(w.studentId));
    const pulls = this.data.tempChanges.filter(t =>
      t.type === 'pull-out' && U.inRange(date, t.from, t.to || t.from) && this.isVisibleStudent(t.studentId));
    const absent = [];
    const day = this.data.attendance[date] || {};
    for (const [eid, marks] of Object.entries(day)) {
      for (const [sid, code] of Object.entries(marks)) {
        if ((code === 'A' || code === 'E') && this.isVisibleStudent(sid)) {
          absent.push({ studentId: sid, ensembleId: eid, code });
        }
      }
    }
    return { manual, pulls, absent };
  },

  /* ---------- roster import ----------
     Header auto-mapping. Every column lands somewhere: recognized fields map
     directly, parent/guardian columns group into contact slots, and anything
     unrecognized is preserved verbatim under "extra" so no spreadsheet data
     is ever dropped. */
  autoMapHeaders(headers) {
    const contactSlots = new Map(); // prefix → slot index
    return headers.map(h => {
      const n = U.norm(h);
      const spec = { header: h, kind: 'extra' };
      if (!n) return Object.assign(spec, { kind: 'skip' });

      const contact = n.match(/^(.*?)(?:\s|^)(name|first name|last name|e ?mail|email address|phone|cell|mobile|telephone|number|relationship|relation)\s*(\d)?$/);
      const prefixed = n.match(/^(parent|guardian|mother|father|mom|dad|emergency(?: contact)?|contact|grandparent|stepmother|stepfather|caregiver)\s*(\d)?\s*('?s)?\s*(.*)$/);

      if (prefixed) {
        const role = prefixed[1] + (prefixed[2] ? ' ' + prefixed[2] : '');
        const rest = U.norm(prefixed[4] || '');
        let field = null;
        if (/e ?mail/.test(rest)) field = 'email';
        else if (/phone|cell|mobile|telephone|number/.test(rest)) field = 'phone';
        else if (/relation/.test(rest)) field = 'relation';
        else if (/name|^$/.test(rest)) field = 'name';
        if (field) {
          if (!contactSlots.has(role)) contactSlots.set(role, contactSlots.size);
          return Object.assign(spec, { kind: 'contact', slot: contactSlots.get(role), role, field });
        }
      }

      if (/^(student\s*)?(id|number)$/.test(n)) return Object.assign(spec, { kind: 'sid' });
      if (/^(first(\s*name)?|given name)$/.test(n)) return Object.assign(spec, { kind: 'first' });
      if (/^(last(\s*name)?|surname|family name)$/.test(n)) return Object.assign(spec, { kind: 'last' });
      if (/^((student|full)\s*)?name$/.test(n)) return Object.assign(spec, { kind: 'full' });
      if (/^(preferred(\s*name)?|nickname|goes by)$/.test(n)) return Object.assign(spec, { kind: 'preferred' });
      if (/^grade(\s*level)?$/.test(n) || n === 'year') return Object.assign(spec, { kind: 'grade' });
      if (/instrument/.test(n)) return Object.assign(spec, { kind: 'instrument' });
      if (/^(section|part|chair)$/.test(n)) return Object.assign(spec, { kind: 'section' });
      if (/^ensembles?$|^class(es)?$|^group/.test(n)) return Object.assign(spec, { kind: 'ensembles' });
      if (/^(student\s*)?e ?mail(\s*address)?$/.test(n)) return Object.assign(spec, { kind: 'email' });
      if (/^(student\s*)?(phone|cell|mobile)(\s*number)?$/.test(n)) return Object.assign(spec, { kind: 'phone' });
      if (/^notes?$/.test(n)) return Object.assign(spec, { kind: 'notes' });
      if (contact && !prefixed) {
        // e.g. "Email 2" / "Phone 2" with no role prefix — student's own extras
        return spec; // keep as extra
      }
      return spec; // unrecognized → extra (never dropped)
    });
  },

  rowToStudent(row, mapping) {
    const st = {
      first: '', last: '', preferred: '', grade: '', instrument: '', section: '',
      ensembleIds: [], email: '', phone: '', sid: '', notes: '',
      contacts: [], extra: {},
    };
    const slots = {};
    // When two columns target the same scalar field ("Phone" + "Cell",
    // duplicate headers…), the second value must not vanish — it overflows
    // into `extra` under its own header so ALL spreadsheet data survives.
    const setScalar = (field, val, header) => {
      if (!st[field]) { st[field] = val; return; }
      if (st[field] === val) return;
      let key = header || field;
      while (key in st.extra && st.extra[key] !== val) key += ' (2)';
      st.extra[key] = val;
    };
    mapping.forEach((spec, i) => {
      const val = String(row[i] == null ? '' : row[i]).trim();
      if (!val || spec.kind === 'skip') return;
      switch (spec.kind) {
        case 'first': setScalar('first', val, spec.header); break;
        case 'last': setScalar('last', val, spec.header); break;
        case 'preferred': setScalar('preferred', val, spec.header); break;
        case 'grade': setScalar('grade', val.replace(/^grade\s*/i, ''), spec.header); break;
        case 'instrument': setScalar('instrument', val, spec.header); break;
        case 'section': setScalar('section', val, spec.header); break;
        case 'email': setScalar('email', val, spec.header); break;
        case 'phone': setScalar('phone', val, spec.header); break;
        case 'sid': setScalar('sid', val, spec.header); break;
        case 'notes': st.notes = st.notes ? st.notes + '\n' + val : val; break;
        case 'full': {
          if (val.includes(',')) {
            // split on the FIRST comma only — "Lopez, Maria, Jr" keeps its suffix
            const idx = val.indexOf(',');
            st.last = st.last || val.slice(0, idx).trim();
            st.first = st.first || val.slice(idx + 1).trim();
          } else {
            const parts = val.split(/\s+/);
            st.first = st.first || parts.slice(0, -1).join(' ') || parts[0];
            st.last = st.last || (parts.length > 1 ? parts[parts.length - 1] : '');
          }
          break;
        }
        case 'ensembles': {
          const names = val.split(/[;,/|]+/).map(x => U.norm(x)).filter(Boolean);
          for (const e of Store.data.ensembles) {
            if (names.some(nm => nm === U.norm(e.name) || nm === U.norm(e.short) || U.norm(e.name).includes(nm) || nm.includes(U.norm(e.short)))) {
              if (!st.ensembleIds.includes(e.id)) st.ensembleIds.push(e.id);
            }
          }
          st.extra['Ensembles (as imported)'] = val;
          break;
        }
        case 'contact': {
          if (!slots[spec.slot]) {
            slots[spec.slot] = { name: '', relation: spec.role ? spec.role.replace(/\b\w/g, c => c.toUpperCase()) : '', email: '', phone: '' };
          }
          // Append rather than overwrite so "Parent 1 First Name" + "Parent 1
          // Last Name" become "Maria Lopez" instead of losing the first name.
          if (spec.field === 'name') slots[spec.slot].name = slots[spec.slot].name ? slots[spec.slot].name + ' ' + val : val;
          else if (spec.field === 'relation') slots[spec.slot].relation = val;
          else if (spec.field === 'email') slots[spec.slot].email = slots[spec.slot].email ? slots[spec.slot].email + ', ' + val : val;
          else if (spec.field === 'phone') slots[spec.slot].phone = slots[spec.slot].phone ? slots[spec.slot].phone + ', ' + val : val;
          break;
        }
        default: {
          let key = spec.header || 'Column ' + (i + 1);
          while (key in st.extra && st.extra[key] !== val) key += ' (2)';
          st.extra[key] = val;
        }
      }
    });
    st.contacts = Object.keys(slots).sort((a, b) => a - b).map(k => slots[k])
      .filter(c => c.name || c.email || c.phone);
    return st;
  },

  matchKey(st) {
    if (st.sid) return 'sid:' + U.norm(st.sid);
    if (st.email) return 'em:' + U.norm(st.email);
    return 'nm:' + U.norm(st.first + ' ' + st.last);
  },

  /* Merge imported students into the roster.
     mode 'update': update matches in place (new file wins on conflicting
       fields), add unknowns; notes/status/attendance history always kept.
     mode 'add': only add students that don't match anyone.
     Returns a report; also lists active students NOT present in the file so
     the UI can offer to archive them at semester turnover. */
  mergeImport(incoming, mode) {
    const report = { added: [], updated: [], unchanged: [], restored: [], notInFile: [], skippedNoName: 0 };
    const index = new Map();
    for (const s of this.data.students) index.set(this.matchKey(s), s);
    // also index by plain name so a file without emails still matches
    for (const s of this.data.students) {
      const nk = 'nm:' + U.norm(s.first + ' ' + s.last);
      if (!index.has(nk)) index.set(nk, s);
    }
    const seen = new Set();
    for (const inc of incoming) {
      if (!(inc.first || '').trim() && !(inc.last || '').trim()) { report.skippedNoName++; continue; }
      const keys = [this.matchKey(inc), 'nm:' + U.norm(inc.first + ' ' + inc.last)];
      const match = keys.map(k => index.get(k)).find(Boolean);
      if (match) {
        seen.add(match.id);
        if (mode === 'add') { report.unchanged.push(match); continue; }
        if (match.status === 'archived') {
          // They're in the new semester's file — they're back. Restore them.
          match.status = 'active';
          delete match.archivedAt;
          report.restored.push(match);
        }
        let changed = false;
        for (const f of ['first', 'last', 'preferred', 'grade', 'instrument', 'section', 'email', 'phone', 'sid']) {
          if ((inc[f] || '').trim() && inc[f] !== match[f]) { match[f] = inc[f]; changed = true; }
        }
        if (inc.ensembleIds.length && JSON.stringify(inc.ensembleIds) !== JSON.stringify(match.ensembleIds)) {
          match.ensembleIds = inc.ensembleIds; changed = true;
        }
        if (inc.contacts.length) {
          // New file is the source of truth for contact info — replace, don't append.
          if (JSON.stringify(inc.contacts) !== JSON.stringify(match.contacts)) { match.contacts = inc.contacts; changed = true; }
        }
        for (const [k, v] of Object.entries(inc.extra)) {
          if (match.extra[k] !== v) { match.extra[k] = v; changed = true; }
        }
        if (inc.notes && !(match.notes || '').includes(inc.notes)) {
          match.notes = match.notes ? match.notes + '\n' + inc.notes : inc.notes; changed = true;
        }
        (changed ? report.updated : report.unchanged).push(match);
      } else {
        const st = Object.assign({ id: U.uid(), status: 'active', createdAt: U.todayYmd() }, inc);
        this.data.students.push(st);
        // Index new students under BOTH keys so a second row for the same
        // person later in the same file updates instead of duplicating.
        index.set(this.matchKey(st), st);
        index.set('nm:' + U.norm(st.first + ' ' + st.last), st);
        seen.add(st.id);
        report.added.push(st);
      }
    }
    report.notInFile = this.data.students.filter(s => s.status !== 'archived' && !seen.has(s.id));
    this.save();
    return report;
  },

  archiveStudent(id, label) {
    const s = this.studentById(id);
    if (!s) return;
    s.status = 'archived';
    s.archivedAt = U.todayYmd();
    if (label) s.archivedLabel = label;
    this.save();
  },
  restoreStudent(id) {
    const s = this.studentById(id);
    if (!s) return;
    s.status = 'active';
    delete s.archivedAt;
    this.save();
  },

  /* ---------- sample data (generic, fictional — repo is public) ---------- */
  loadSample() {
    // Sample data replaces CONTENT only — the director's PIN, app identity,
    // and preferences survive (wiping the PIN silently would reopen the panel).
    const keepSettings = this.data ? this.data.settings : null;
    const d = this.defaults();
    if (keepSettings) d.settings = Object.assign(d.settings, keepSettings);
    const mk = (first, last, grade, instrument, section, ens, extraContacts) => ({
      id: U.uid(), first, last, preferred: '', grade, instrument, section,
      ensembleIds: ens, email: U.norm(first) + '.' + U.norm(last) + '@example.org',
      phone: '', sid: '', notes: '', status: 'active', extra: {},
      contacts: extraContacts || [
        { name: 'Sample Parent', relation: 'Parent 1', email: 'parent@example.org', phone: '(305) 555-0100' },
      ],
    });
    d.students = [
      mk('Ava', 'Alonso', '11', 'Violin', 'Violin 1', ['sym']),
      mk('Ben', 'Brooks', '10', 'Violin', 'Violin 2', ['sym']),
      mk('Cara', 'Chen', '12', 'Viola', 'Viola', ['sym']),
      mk('Dre', 'Dorsey', '11', 'Cello', 'Cello', ['sym']),
      mk('Eli', 'Estrada', '10', 'Flute', 'Flute', ['we', 'cw']),
      mk('Fay', 'Fields', '11', 'Clarinet', 'Clarinet 1', ['we', 'sym']),
      mk('Gil', 'Gomez', '12', 'Trumpet', 'Trumpet 1', ['we', 'jazz'], [
        { name: 'Sample Parent A', relation: 'Mother', email: 'parent.a@example.org', phone: '(305) 555-0101' },
        { name: 'Sample Parent B', relation: 'Father', email: 'parent.b@example.org', phone: '(305) 555-0102' },
        { name: 'Sample Grandparent', relation: 'Emergency', email: '', phone: '(305) 555-0103' },
      ]),
      mk('Hana', 'Hart', '9', 'Alto Sax', 'Alto Sax 1', ['jazz', 'we']),
      mk('Ian', 'Ibarra', '10', 'Trombone', 'Trombone 1', ['jazz', 'we']),
      mk('Joy', 'Jules', '11', 'Piano', 'Piano', ['jazz']),
      mk('Kai', 'Kim', '9', 'Horn', 'Horn 1', ['cw', 'we']),
      mk('Lia', 'Lopez', '10', 'Oboe', 'Oboe', ['cw', 'sym']),
      mk('Sample', 'Bassist', '11', 'Double Bass', 'Bass', ['sym', 'jazz']),
    ];
    // one graduated senior in the archive, to show the alumni area
    const grad = mk('Zoe', 'Zamora', '12', 'Violin', 'Violin 1', ['sym']);
    grad.status = 'archived'; grad.archivedAt = U.todayYmd(); grad.archivedLabel = 'Class of 2026';
    d.students.push(grad);

    const t = U.todayYmd();
    d.events = [
      { id: U.uid(), date: U.addDays(t, 3), title: 'Sectionals — strings', time: '15:50', endTime: '16:40', location: 'Room 301', tag: { type: 'ensemble', id: 'sym' }, details: 'Concertmaster leads. Bring pencils.' },
      { id: U.uid(), date: U.addDays(t, 6), title: 'Jazz combo night', time: '19:00', endTime: '21:00', location: 'Black Box', tag: { type: 'ensemble', id: 'jazz' }, details: 'Call time 6:15 PM. Concert black.' },
      { id: U.uid(), date: U.addDays(t, 8), title: 'Dance division showcase', time: '19:30', location: 'Main Stage', tag: { type: 'division', id: 'dance' }, details: 'Shared stage — no music rehearsals after 5 PM.' },
      { id: U.uid(), date: U.addDays(t, 12), title: 'Visual Arts gallery opening', time: '18:00', location: 'Gallery Hall', tag: { type: 'division', id: 'visual' }, details: '' },
      { id: U.uid(), date: U.addDays(t, 15), title: 'Theater tech week begins', tag: { type: 'division', id: 'theater' }, details: 'Main Stage unavailable all week.' },
    ];
    d.concerts = [
      { id: 'con-fall', title: 'Fall Concert (sample)', date: U.addDays(t, 20), time: '19:30', venue: 'Main Stage', ensembleIds: ['sym', 'we'] },
      { id: 'con-jazz', title: 'Jazz Café (sample)', date: U.addDays(t, 34), time: '19:00', venue: 'Black Box', ensembleIds: ['jazz'] },
    ];
    d.repertoire = [
      { id: 'rep-1', title: 'New England Triptych', composer: 'William Schuman', arranger: '', ensembleId: 'sym', concertId: 'con-fall', status: 'In rehearsal', notes: 'Mvt III first.', chartId: 'chart-sym' },
      { id: 'rep-2', title: 'Symphony No. 3 — Finale', composer: 'Florence Price', arranger: '', ensembleId: 'sym', concertId: 'con-fall', status: 'In rehearsal', notes: '', chartId: '' },
      { id: 'rep-3', title: 'First Suite in E-flat', composer: 'Gustav Holst', arranger: '', ensembleId: 'we', concertId: 'con-fall', status: 'Learning', notes: '', chartId: '' },
      { id: 'rep-4', title: 'Take the "A" Train', composer: 'Billy Strayhorn', arranger: 'arr. sample', ensembleId: 'jazz', concertId: 'con-jazz', status: 'Performing', notes: '', chartId: '' },
    ];
    const sid = name => (d.students.find(s => s.first === name) || {}).id;
    d.seatingCharts = [{
      id: 'chart-sym', name: 'Symphony — fall setup', ensembleId: 'sym', updated: t,
      sections: [
        { name: 'Violin 1', seatIds: [sid('Ava')].filter(Boolean) },
        { name: 'Violin 2', seatIds: [sid('Ben')].filter(Boolean) },
        { name: 'Viola', seatIds: [sid('Cara')].filter(Boolean) },
        { name: 'Cello', seatIds: [sid('Dre')].filter(Boolean) },
        { name: 'Bass', seatIds: [sid('Sample')].filter(Boolean) },
        { name: 'Winds', seatIds: [sid('Lia'), sid('Fay')].filter(Boolean) },
      ],
    }];
    d.announcements = [
      { id: U.uid(), title: 'Welcome back — first rehearsal details', body: 'All ensembles meet in their regular rooms this week.\n\nBring your instrument, a pencil, and your charged tablet. Lockers are assigned during Block 1 on Tuesday.', ensembleIds: 'all', date: t, pinned: true },
      { id: U.uid(), title: 'Concert black reminder', body: 'Full concert black for the Fall Concert: long sleeves, floor-length or dress pants, black shoes. No jewelry that catches stage light.', ensembleIds: ['sym', 'we'], date: U.addDays(t, -1), pinned: false },
    ];
    d.assignments = [
      { id: U.uid(), title: 'Practice log — week 2', details: 'Log 120 minutes across at least 4 days. Focus spots: measures 45–68 of the Schuman.', ensembleIds: ['sym'], due: U.addDays(t, 4), points: '10', link: '' },
      { id: U.uid(), title: 'Scale check: concert B-flat & F', details: 'Two octaves, quarter = 80, memorized. Sign up for a slot outside class or play during sectionals.', ensembleIds: ['we', 'cw'], due: U.addDays(t, 7), points: '20', link: '' },
    ];
    if (!d.settings.baseUrl) {
      d.settings.baseUrl = (typeof location !== 'undefined' && location.origin !== 'null')
        ? location.origin + location.pathname : '';
    }
    this.data = d;
    this.loadIssues = [];   // fresh, known-good content — old warnings are moot
    this.save();
  },

  /* Upsert by id into a top-level collection. Dialog save handlers use this
     instead of mutating captured object refs — a cross-tab storage reload can
     swap Store.data underneath an open dialog, and assigning into the old
     detached object would silently lose the edit behind a success toast. */
  upsert(coll, data) {
    const list = this.data[coll];
    const live = list.find(x => x.id === data.id);
    if (live) { Object.assign(live, data); this.save(); return live; }
    list.push(data);
    this.save();
    return data;
  },
};

/* Node test hook (harmless in the browser). */
if (typeof module !== 'undefined' && module.exports) module.exports = { Store };
