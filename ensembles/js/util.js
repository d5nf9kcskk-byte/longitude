/* NWSA Music — shared utilities. Plain JS, global namespace `U`. */
'use strict';

const U = {};

/* View registry — public.js / d*.js register their pages here; app.js routes. */
const Views = { public: {}, director: {} };

/* ---------- ids ---------- */
U.uid = function () {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};

/* ---------- dates (all local, YYYY-MM-DD strings) ---------- */
U.pad2 = n => String(n).padStart(2, '0');

U.ymd = function (d) {
  d = d || new Date();
  return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
};

U.todayYmd = () => U.ymd(new Date());

U.parseYmd = function (s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  // Reject impossible dates (2027-02-29) instead of silently rolling forward.
  if (d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
  return d;
};

U.addDays = function (ymdStr, n) {
  const d = U.parseYmd(ymdStr) || new Date();
  d.setDate(d.getDate() + n);
  return U.ymd(d);
};

U.addMonths = function (ymdStr, n) {
  const d = U.parseYmd(ymdStr) || new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return U.ymd(d);
};

U.monthKey = ymdStr => (ymdStr || '').slice(0, 7);

U.fmtDate = function (ymdStr, style) {
  const d = U.parseYmd(ymdStr);
  if (!d) return ymdStr || '';
  const opts = style === 'long'
    ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
    : style === 'med'
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
};

U.fmtMonth = function (ymOrYmd) {
  const s = (ymOrYmd || '').slice(0, 7) + '-01';
  const d = U.parseYmd(s);
  return d ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
};

U.fmtRangeDates = function (from, to) {
  if (!to || to === from) return U.fmtDate(from, 'med');
  return U.fmtDate(from, 'med') + ' – ' + U.fmtDate(to, 'med');
};

U.isPast = ymdStr => ymdStr && ymdStr < U.todayYmd();
U.inRange = (day, from, to) => day >= (from || day) && day <= (to || from || day);

/* Relative label: Today / Tomorrow / Yesterday / weekday-date */
U.relDate = function (ymdStr) {
  const t = U.todayYmd();
  if (ymdStr === t) return 'Today';
  if (ymdStr === U.addDays(t, 1)) return 'Tomorrow';
  if (ymdStr === U.addDays(t, -1)) return 'Yesterday';
  return U.fmtDate(ymdStr, 'med');
};

/* ---------- times ('HH:MM' 24h internal) ---------- */
U._validHm = function (hm) {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm)) return false;
  const [h, m] = hm.split(':').map(Number);
  return h <= 23 && m <= 59;
};

U.fmtTime = function (hm) {
  if (!U._validHm(hm)) return hm || '';
  let [h, m] = hm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + U.pad2(m) + ' ' + ap;
};

U.fmtTimeShort = function (hm) { // "1:10" — no AM/PM, for compact ranges
  if (!U._validHm(hm)) return hm || '';
  let [h, m] = hm.split(':').map(Number);
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + U.pad2(m);
};

U.fmtTimeRange = function (start, end) {
  if (!start) return '';
  if (!end) return U.fmtTime(start);
  return U.fmtTimeShort(start) + '–' + U.fmtTime(end);
};

/* ---------- text ---------- */
U.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

U.plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

U.norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* Multiline body text → safe HTML with paragraphs + clickable links. */
U.richText = function (s) {
  const esc = U.esc(s);
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return linked.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
};

/* ---------- score order ---------- */
/* Orchestral/band score order rank. Sections (Violin 1 vs 2) rank ahead of
   bare instrument names so roll sheets read like the top of a score. */
U.SCORE_ORDER = [
  ['piccolo'], ['flute'], ['oboe'], ['english horn', 'cor anglais'],
  ['eb clarinet', 'e flat clarinet'], ['clarinet 1'], ['clarinet 2'], ['clarinet 3'], ['clarinet'],
  ['bass clarinet'], ['bassoon'], ['contrabassoon'],
  ['soprano sax', 'soprano saxophone'], ['alto sax 1'], ['alto sax 2'], ['alto sax', 'alto saxophone'],
  ['tenor sax', 'tenor saxophone'], ['bari sax', 'baritone sax', 'baritone saxophone'],
  ['horn 1'], ['horn 2'], ['horn 3'], ['horn 4'], ['horn', 'french horn'],
  ['trumpet 1'], ['trumpet 2'], ['trumpet 3'], ['trumpet', 'cornet'], ['flugelhorn'],
  ['trombone 1'], ['trombone 2'], ['trombone', 'tenor trombone'], ['bass trombone'],
  ['euphonium', 'baritone horn', 'baritone bc', 'baritone tc'], ['tuba', 'sousaphone'],
  ['timpani'], ['percussion 1'], ['percussion 2'], ['percussion', 'drums', 'drum set', 'drumset'],
  ['mallets', 'vibraphone', 'marimba', 'xylophone'],
  ['harp'], ['piano', 'keyboard', 'keys'], ['celesta'], ['guitar', 'electric guitar'],
  ['violin 1', '1st violin', 'first violin', 'violin i'],
  ['violin 2', '2nd violin', 'second violin', 'violin ii'],
  ['violin'], ['viola'], ['cello', 'violoncello'],
  ['double bass', 'string bass', 'upright bass', 'bass', 'contrabass', 'electric bass', 'bass guitar'],
  ['voice', 'vocals', 'vocalist'],
];

U._scoreRankMap = null;
U.scoreRank = function (label) {
  if (!U._scoreRankMap) {
    U._scoreRankMap = new Map();
    U.SCORE_ORDER.forEach((aliases, i) => aliases.forEach(a => U._scoreRankMap.set(a, i)));
  }
  const n = U.norm(label);
  if (!n) return 9000;
  if (U._scoreRankMap.has(n)) return U._scoreRankMap.get(n);
  // "violin 1" style fuzzing: try collapsing roman numerals / ordinals
  const alt = n.replace(/\biii\b/, '3').replace(/\bii\b/, '2').replace(/\bi\b/, '1')
    .replace(/\b(1st|first)\b/, '1').replace(/\b(2nd|second)\b/, '2').replace(/\b(3rd|third)\b/, '3');
  if (U._scoreRankMap.has(alt)) return U._scoreRankMap.get(alt);
  // try instrument word without part number ("trumpet 4" → "trumpet")
  const bare = alt.replace(/\s*\d+$/, '').trim();
  if (U._scoreRankMap.has(bare)) return U._scoreRankMap.get(bare) + 0.5;
  return 9000;
};

/* Rank a student: section first (Violin 1 ≠ Violin 2), else instrument. */
U.studentScoreRank = function (st) {
  const bySection = U.scoreRank(st.section);
  if (bySection < 9000) return bySection;
  return U.scoreRank(st.instrument);
};

U.byLastName = function (a, b) {
  const la = U.norm(a.last), lb = U.norm(b.last);
  if (la !== lb) return la < lb ? -1 : 1;
  const fa = U.norm(a.first), fb = U.norm(b.first);
  return fa < fb ? -1 : fa > fb ? 1 : 0;
};

U.byScoreOrder = function (a, b) {
  const ra = U.studentScoreRank(a), rb = U.studentScoreRank(b);
  if (ra !== rb) return ra - rb;
  return U.byLastName(a, b);
};

/* Group students by their score-order label for section headers. */
U.scoreOrderGroups = function (students) {
  const sorted = students.slice().sort(U.byScoreOrder);
  const groups = [];
  let cur = null;
  for (const st of sorted) {
    const label = st.section || st.instrument || 'Unassigned';
    if (!cur || cur.label !== label) { cur = { label, students: [] }; groups.push(cur); }
    cur.students.push(st);
  }
  return groups;
};

/* ---------- DOM ---------- */
U.el = function (tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, val); // custom props need setProperty
        else node.style[prop] = val;
      }
    }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
};

U.frag = function (...children) {
  const f = document.createDocumentFragment();
  for (const c of children.flat(Infinity)) if (c != null && c !== false) f.appendChild(c);
  return f;
};

U.toast = function (msg, kind) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(U._toastTimer);
  U._toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
};

U.confirmBox = function (msg) { return window.confirm(msg); };

/* ---------- modal ---------- */
U.openModal = function (title, bodyNode, opts) {
  opts = opts || {};
  U.closeModal();
  U._modalOpener = document.activeElement;
  const root = document.getElementById('modal-root');
  const box = U.el('div', {
    class: 'modal-box' + (opts.wide ? ' wide' : ''),
    role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
  },
    U.el('div', { class: 'modal-head' },
      U.el('div', { class: 'modal-title' }, title),
      U.el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => U.closeModal() }, '✕')),
    U.el('div', { class: 'modal-body' }, bodyNode));

  box.addEventListener('keydown', e => {
    // Enter in a single-line field acts as "save" (textareas keep newlines).
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !['checkbox', 'radio', 'file'].includes(e.target.type)) {
      const primary = box.querySelector('.modal-body .btn.primary');
      if (primary) { e.preventDefault(); primary.click(); }
    }
    // Keep Tab inside the dialog.
    if (e.key === 'Tab') {
      const focusables = Array.from(box.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(el => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  U._modalEsc = e => {
    if (e.key === 'Escape' && !opts.sticky) { e.preventDefault(); U.closeModal(); }
  };
  document.addEventListener('keydown', U._modalEsc);

  root.innerHTML = '';
  root.appendChild(U.el('div', {
    class: 'modal-backdrop',
    onclick: e => { if (e.target.classList.contains('modal-backdrop') && !opts.sticky) U.closeModal(); },
  }, box));
  root.style.display = 'block';
  document.body.classList.add('modal-open');
  if (!opts.noAutofocus) {
    const f = box.querySelector('input,select,textarea,button.primary');
    if (f) setTimeout(() => f.focus(), 30);
  } else {
    const c = box.querySelector('.modal-head .icon-btn');
    if (c) setTimeout(() => c.focus(), 30);
  }
  return box;
};

U.closeModal = function () {
  const root = document.getElementById('modal-root');
  if (root) { root.innerHTML = ''; root.style.display = 'none'; }
  document.body.classList.remove('modal-open');
  if (U._modalEsc) { document.removeEventListener('keydown', U._modalEsc); U._modalEsc = null; }
  if (U._modalOpener && U._modalOpener.isConnected && U._modalOpener.focus) {
    try { U._modalOpener.focus(); } catch (e) { /* ignore */ }
  }
  U._modalOpener = null;
};

/* Make any element keyboard-activatable (Enter/Space fire its onclick). */
U.keyActivate = function (attrs) {
  return Object.assign(attrs, {
    tabindex: '0', role: 'button',
    onkeydown: e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
    },
  });
};

/* ---------- form field helpers ---------- */
U.field = function (label, inputNode, hint) {
  return U.el('label', { class: 'field' },
    U.el('span', { class: 'field-label' }, label),
    inputNode,
    hint ? U.el('span', { class: 'field-hint' }, hint) : null);
};

U.input = function (attrs) { return U.el('input', Object.assign({ class: 'input' }, attrs)); };
U.textarea = function (attrs) { return U.el('textarea', Object.assign({ class: 'input textarea' }, attrs)); };

/* Custom-styled select: wrapper adds an unmistakable chevron and keeps the
   text from being clipped (min-width sized to content). */
U.select = function (options, value, onChange, attrs) {
  const sel = U.el('select', Object.assign({ class: 'select-native' }, attrs || {}));
  for (const o of options) {
    sel.appendChild(U.el('option', { value: o.value, selected: String(o.value) === String(value) ? true : null }, o.label));
  }
  if (onChange) {
    sel.addEventListener('change', () => {
      const id = sel.id;
      onChange(sel.value);
      // If the handler re-rendered the page, put keyboard focus back on the
      // rebuilt control (same id) so arrow-key users can keep stepping.
      if (id && !document.body.contains(sel)) {
        const again = document.getElementById(id);
        if (again) again.focus();
      }
    });
  }
  return U.el('span', { class: 'select-wrap' }, sel, U.el('span', { class: 'select-arrow', 'aria-hidden': 'true' }, '▾'));
};

/* ---------- segmented view control (Day / Month / List etc.) ---------- */
U.segmented = function (options, value, onChange, cls) {
  const wrap = U.el('div', { class: 'segmented ' + (cls || ''), role: 'tablist' });
  for (const o of options) {
    wrap.appendChild(U.el('button', {
      class: 'seg-btn' + (o.value === value ? ' active' : ''),
      role: 'tab', 'aria-selected': o.value === value ? 'true' : 'false',
      onclick: () => onChange(o.value),
    }, o.label));
  }
  return wrap;
};

/* ---------- month grid calendar (reused by every month view) ----------
   opts: { month:'YYYY-MM', onPick(ymd), onNav(newMonth), renderDay(ymd)->nodes,
           selected: ymd, title } */
U.monthGrid = function (opts) {
  const month = opts.month || U.todayYmd().slice(0, 7);
  const first = U.parseYmd(month + '-01');
  const wrap = U.el('div', { class: 'mcal' });

  wrap.appendChild(U.el('div', { class: 'mcal-head' },
    U.el('button', { class: 'btn ghost sm', 'aria-label': 'Previous month', onclick: () => opts.onNav(U.monthKey(U.addMonths(month + '-01', -1))) }, '‹'),
    U.el('div', { class: 'mcal-title' }, U.fmtMonth(month)),
    U.el('button', { class: 'btn ghost sm', onclick: () => opts.onNav(U.todayYmd().slice(0, 7)) }, 'Today'),
    U.el('button', { class: 'btn ghost sm', 'aria-label': 'Next month', onclick: () => opts.onNav(U.monthKey(U.addMonths(month + '-01', 1))) }, '›')));

  const dow = U.el('div', { class: 'mcal-grid mcal-dow' });
  for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) dow.appendChild(U.el('div', { class: 'mcal-dowcell' }, d));
  wrap.appendChild(dow);

  const grid = U.el('div', { class: 'mcal-grid' });
  const startDow = first.getDay();
  const start = new Date(first); start.setDate(1 - startDow);
  const today = U.todayYmd();
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const dy = U.ymd(d);
    const inMonth = dy.slice(0, 7) === month;
    const extra = opts.renderDay ? opts.renderDay(dy, inMonth) : null;
    // Empty days are only interactive when the caller wants every day
    // clickable (opts.pickAll, e.g. the schedule-change day picker) —
    // otherwise a tap that does nothing is a lying affordance.
    const interactive = !!opts.onPick && (opts.pickAll || !!extra);
    const cell = U.el('div', {
      class: 'mcal-cell' + (inMonth ? '' : ' out') + (dy === today ? ' today' : '') + (opts.selected === dy ? ' selected' : ''),
      tabindex: interactive ? '0' : null,
      role: interactive ? 'button' : null,
      onclick: interactive ? () => opts.onPick(dy) : null,
      onkeydown: interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onPick(dy); } } : null,
    }, U.el('div', { class: 'mcal-daynum' }, String(d.getDate())));
    if (extra) cell.appendChild(extra);
    grid.appendChild(cell);
  }
  // Drop a trailing week that is entirely outside the month.
  const cells = Array.from(grid.children);
  if (cells.length === 42 && cells.slice(35).every(c => c.classList.contains('out'))) {
    cells.slice(35).forEach(c => c.remove());
  }
  wrap.appendChild(grid);
  return wrap;
};

/* ---------- empty state (optional action node so users aren't given
   instructions with nothing to tap) ---------- */
U.empty = function (icon, title, sub, action) {
  return U.el('div', { class: 'empty' },
    U.el('div', { class: 'empty-icon' }, icon),
    U.el('div', { class: 'empty-title' }, title),
    sub ? U.el('div', { class: 'empty-sub' }, sub) : null,
    action ? U.el('div', { style: { marginTop: '14px' } }, action) : null);
};

/* Right-edge fade cue for horizontally scrollable strips (nav, chips). */
U.scrollCue = function (el) {
  const update = () => {
    el.classList.toggle('more-right', el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
  };
  el.addEventListener('scroll', update, { passive: true });
  if (window.requestAnimationFrame) requestAnimationFrame(update); else setTimeout(update, 0);
  return el;
};

/* ---------- CSV / TSV parsing (handles quoted fields) ---------- */
U.parseDelimited = function (text) {
  text = String(text || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  if (!text.trim()) return [];
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  // Pick the most frequent of tab / comma / semicolon — European Excel
  // exports use ';' and would otherwise collapse every row into one cell.
  const counts = [
    ['\t', (firstLine.match(/\t/g) || []).length],
    [';', (firstLine.match(/;/g) || []).length],
    [',', (firstLine.match(/,/g) || []).length],
  ].sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ',';
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur);
  if (row.length > 1 || row[0].trim() !== '') rows.push(row);
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
};

U.download = function (filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
};
