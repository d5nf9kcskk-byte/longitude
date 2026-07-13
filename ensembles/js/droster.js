/* NWSA Music — Director Panel: dashboard, roster (import/archive), take roll,
   who's out. Global `DRoster` for dialogs shared across views. */
'use strict';

const DRoster = {};

/* =========================================================
   Director dashboard (Today)
   ========================================================= */
Views.director.home = function (container) {
  const today = U.todayYmd();
  container.appendChild(Cards.scheduleHero('Today at a glance'));

  // First run: a real path in, instead of a dashboard of zeros.
  if (!Store.data.students.length) {
    container.appendChild(U.el('div', { class: 'card', style: { marginTop: '16px' } },
      U.el('div', { class: 'card-title' }, '👋 Welcome — let\'s set up your hub'),
      U.el('div', { class: 'card-body' },
        'Start with your roster: import the school\'s spreadsheet (every column is kept — all parents, emails, phones), or add students by hand. Prefer to look around first? Load the sample data and explore both sides; your settings and PIN are kept.'),
      U.el('div', { class: 'card-actions' },
        U.el('button', { class: 'btn primary', onclick: () => DRoster.importDialog() }, '⇪ Import roster spreadsheet'),
        U.el('a', { class: 'btn', href: '#/d/roster' }, '+ Add students by hand'),
        U.el('button', {
          class: 'btn ghost',
          onclick: () => {
            Store.stashRecovery(localStorage.getItem(Store.KEY) || '');
            Store.loadSample(); App.render();
            U.toast('Sample data loaded — explore both sides');
          },
        }, 'Load sample data'))));
  }

  // quick stats
  const out = Store.outOn(today);
  const outCount = out.manual.length + out.pulls.length + out.absent.length;
  const rollsToday = Object.keys(Store.data.attendance[today] || {}).length;
  const changedUpcoming = Store.changedDates().filter(d => d >= today).length;
  const active = Store.activeStudents().length;

  const stats = U.el('div', { class: 'grid-2', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' } });
  const stat = (to, big, label) => U.el('a', { class: 'card clickable', href: to, style: { textDecoration: 'none', color: 'inherit' } },
    U.el('div', { class: 'page-title' }, String(big)),
    U.el('div', { class: 'card-meta' }, label));
  stats.appendChild(stat('#/d/roll', rollsToday + ' / ' + Store.ensembles().length, 'rolls taken today'));
  stats.appendChild(stat('#/d/out', outCount, 'students out today'));
  stats.appendChild(stat('#/d/schedule', changedUpcoming, 'upcoming changed days'));
  stats.appendChild(stat('#/d/roster', active, 'active students'));
  container.appendChild(U.el('div', { class: 'section-label' }, 'Quick status'));
  container.appendChild(stats);

  container.appendChild(U.el('div', { class: 'section-label' }, 'Jump to'));
  container.appendChild(U.el('div', { class: 'toolbar' },
    U.el('a', { class: 'btn', href: '#/d/roll' }, 'Take roll'),
    U.el('a', { class: 'btn', href: '#/d/schedule/' + today }, 'Change today\'s schedule'),
    U.el('a', { class: 'btn', href: '#/d/news' }, 'Post announcement'),
    U.el('a', { class: 'btn', href: '#/d/qr' }, 'QR kit')));
};

/* =========================================================
   Roster
   ========================================================= */
Views.director.roster = function (container) {
  const state = Views.director.roster._state = Views.director.roster._state || {};
  state.q = state.q || '';
  const filter = Store.getFilter('d_roster', 'all');

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Roster'),
      U.el('div', { class: 'page-sub' }, 'Tap a student for full contact info and notes. Graduated students live in the Archived area below — kept, but out of every other page.')),
    U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn', onclick: () => DRoster.importDialog() }, '⇪ Import spreadsheet'),
      U.el('button', { class: 'btn primary', onclick: () => DRoster.studentDialog(null) }, '+ Add student'))));

  const toolbar = U.el('div', { class: 'toolbar' });
  toolbar.appendChild(ensembleChips('d_roster', filter, () => App.render()));
  container.appendChild(toolbar);

  const search = U.input({
    placeholder: 'Search name, instrument, contact…', value: state.q,
    oninput: e => { state.q = e.target.value; renderTables(); },
  });
  const bulk = U.el('button', {
    class: 'btn',
    onclick: () => DRoster.archiveSeniorsDialog(),
  }, '🎓 Archive graduated seniors');
  container.appendChild(U.el('div', { class: 'toolbar' },
    U.el('span', { class: 'searchbox', style: { flex: '1 1 220px' } }, search), bulk));

  const tablesWrap = U.el('div');
  container.appendChild(tablesWrap);

  function matches(st, q) {
    if (!q) return true;
    const hay = [st.first, st.last, st.preferred, st.instrument, st.section, st.email, st.phone, st.grade,
      ...(st.contacts || []).flatMap(c => [c.name, c.email, c.phone, c.relation])].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function studentTable(students, archived) {
    const t = U.el('table', { class: 'roster' });
    t.appendChild(U.el('thead', null, U.el('tr', null,
      U.el('th', null, 'Name'),
      U.el('th', null, archived ? 'Archived' : 'Grade'),
      U.el('th', null, 'Instrument · Section'),
      U.el('th', null, 'Ensembles'),
      U.el('th', null, 'Contacts'))));
    const tb = U.el('tbody');
    for (const st of students) {
      tb.appendChild(U.el('tr', U.keyActivate({ class: 'clickable', onclick: () => DRoster.studentDetail(st.id) }),
        U.el('td', null, U.el('b', null, st.last + ', ' + (st.preferred || st.first))),
        U.el('td', null, archived ? (st.archivedLabel || st.archivedAt || '—') : (st.grade || '—')),
        U.el('td', null, [st.instrument, st.section].filter(Boolean).join(' · ') || '—'),
        U.el('td', null, st.ensembleIds.map(id => (Store.ensembleById(id) || {}).short || '?').join(', ') || '—'),
        U.el('td', null, st.contacts.length ? U.plural(st.contacts.length, 'contact') : '—')));
    }
    t.appendChild(tb);
    return U.el('div', { class: 'tablewrap' }, t);
  }

  function renderTables() {
    tablesWrap.innerHTML = '';
    const q = state.q.trim();
    const act = Store.activeStudents(filter).filter(s => matches(s, q)).sort(U.byLastName);
    tablesWrap.appendChild(U.el('div', { class: 'section-label' }, 'Active students (' + act.length + ')'));
    if (act.length) tablesWrap.appendChild(studentTable(act, false));
    else tablesWrap.appendChild(U.empty('🧑‍🎓', q ? 'No matches' : 'No students yet',
      q ? 'Try a different search.' : 'Add students by hand or import your roster spreadsheet — every column comes along.'));

    const arch = Store.archivedStudents()
      .filter(s => (filter === 'all' || s.ensembleIds.includes(filter)) && matches(s, q))
      .sort(U.byLastName);
    const det = U.el('details', { style: { marginTop: '22px' } },
      U.el('summary', { style: { cursor: 'pointer', fontWeight: '800', fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' } },
        '🎓 Archived · Alumni (' + arch.length + ') — info & notes kept, hidden from the rest of the app'));
    if (arch.length) det.appendChild(U.el('div', { style: { marginTop: '10px' } }, studentTable(arch, true)));
    else det.appendChild(U.el('div', { class: 'hint', style: { padding: '10px 2px' } },
      'Nobody here yet. Archive a student from their profile, or use "Archive graduated seniors".'));
    tablesWrap.appendChild(det);
  }
  renderTables();
};

/* ---------- student detail (everything, always) ---------- */
DRoster.studentDetail = function (id) {
  const st = Store.studentById(id);
  if (!st) return;
  const body = U.el('div');

  const kv = U.el('dl', { class: 'kv' });
  const add = (k, v) => { if (v) { kv.appendChild(U.el('dt', null, k)); kv.appendChild(U.el('dd', null, v)); } };
  add('Grade', st.grade);
  add('Instrument', st.instrument);
  add('Section', st.section);
  add('Ensembles', st.ensembleIds.map(i => (Store.ensembleById(i) || {}).name || '?').join(', '));
  add('Student email', st.email);
  add('Student phone', st.phone);
  add('Student ID', st.sid);
  if (st.status === 'archived') add('Archived', (st.archivedLabel ? st.archivedLabel + ' · ' : '') + (st.archivedAt || ''));
  body.appendChild(kv);

  body.appendChild(U.el('div', { class: 'section-label' }, 'Family & emergency contacts (' + st.contacts.length + ')'));
  if (st.contacts.length) {
    for (const c of st.contacts) {
      body.appendChild(U.el('div', { class: 'contact-block' },
        U.el('div', { class: 'contact-line' }, U.el('b', null, c.name || '(no name)'), c.relation ? ' — ' + c.relation : ''),
        c.email ? U.el('div', { class: 'contact-line' }, '✉️ ', U.el('a', { href: 'mailto:' + c.email }, c.email)) : null,
        c.phone ? U.el('div', { class: 'contact-line' }, '📞 ', U.el('a', { href: 'tel:' + String(c.phone).replace(/[^+\d]/g, '') }, c.phone)) : null,
        c.note ? U.el('div', { class: 'contact-line' }, '📝 ' + c.note) : null));
    }
  } else body.appendChild(U.el('div', { class: 'hint' }, 'No contacts on file. Edit the student or re-import your spreadsheet — every parent/guardian column is captured.'));

  const extraKeys = Object.keys(st.extra || {});
  if (extraKeys.length) {
    body.appendChild(U.el('div', { class: 'section-label' }, 'Everything else from the spreadsheet'));
    const kv2 = U.el('dl', { class: 'kv' });
    for (const k of extraKeys) {
      kv2.appendChild(U.el('dt', null, k));
      kv2.appendChild(U.el('dd', null, String(st.extra[k])));
    }
    body.appendChild(kv2);
  }

  body.appendChild(U.el('div', { class: 'section-label' }, 'Notes'));
  const notes = U.textarea({ value: st.notes || '', placeholder: 'Private director notes — kept when you archive or re-import.' });
  notes.value = st.notes || '';
  body.appendChild(notes);

  const actions = U.el('div', { class: 'card-actions' });
  actions.appendChild(U.el('button', {
    class: 'btn primary',
    onclick: () => {
      // Re-resolve by id — a cross-tab reload may have swapped Store.data
      // while this profile was open; writing to the captured ref would
      // silently lose the note behind a success toast.
      const live = Store.studentById(st.id);
      if (!live) { U.toast('This student no longer exists on this device.', 'error'); return; }
      live.notes = notes.value;
      Store.save();
      U.toast('Notes saved');
    },
  }, 'Save notes'));
  actions.appendChild(U.el('button', { class: 'btn', onclick: () => { U.closeModal(); DRoster.studentDialog(st); } }, 'Edit'));
  if (st.status === 'archived') {
    actions.appendChild(U.el('button', {
      class: 'btn',
      onclick: () => { Store.restoreStudent(st.id); U.closeModal(); U.toast('Restored to active roster'); App.render(); },
    }, 'Restore to active'));
    actions.appendChild(U.el('button', {
      class: 'btn danger',
      onclick: () => {
        if (!U.confirmBox('Permanently delete ' + st.first + ' ' + st.last + '? This also removes them from charts and history. Archiving is usually better.')) return;
        DRoster.removeStudentEverywhere(st.id);
        U.closeModal(); App.render();
      },
    }, 'Delete forever'));
  } else {
    actions.appendChild(U.el('button', {
      class: 'btn',
      onclick: () => {
        const year = new Date().getFullYear();
        const label = window.prompt('Label for the archive (kept with their info):', 'Class of ' + year);
        if (label === null) return;
        Store.archiveStudent(st.id, label || undefined);
        U.closeModal(); U.toast('Moved to Archived · Alumni'); App.render();
      },
    }, '🎓 Archive'));
  }
  body.appendChild(actions);

  // noAutofocus: focusing the Notes textarea would pop the phone keyboard
  // over the contact info the director opened this card to read.
  U.openModal(st.first + ' ' + st.last, body, { wide: true, noAutofocus: true });
};

DRoster.removeStudentEverywhere = function (id) {
  const d = Store.data;
  d.students = d.students.filter(s => s.id !== id);
  for (const chart of d.seatingCharts) for (const sec of chart.sections) sec.seatIds = sec.seatIds.filter(x => x !== id);
  d.whosOut = d.whosOut.filter(w => w.studentId !== id);
  d.tempChanges = d.tempChanges.filter(t => t.studentId !== id);
  for (const [dateKey, day] of Object.entries(d.attendance)) {
    for (const [eid, marks] of Object.entries(day)) {
      delete marks[id];
      if (!Object.keys(marks).length) delete day[eid];   // no phantom roll days
    }
    if (!Object.keys(day).length) delete d.attendance[dateKey];
  }
  Store.save();
};

/* ---------- add / edit student ---------- */
DRoster.studentDialog = function (st) {
  const isNew = !st;
  const draft = st ? JSON.parse(JSON.stringify(st)) : {
    first: '', last: '', preferred: '', grade: '', instrument: '', section: '',
    ensembleIds: [], email: '', phone: '', sid: '', notes: '', contacts: [], extra: {}, status: 'active',
  };

  const body = U.el('div');
  const first = U.input({ value: draft.first, placeholder: 'First name' });
  const last = U.input({ value: draft.last, placeholder: 'Last name' });
  const preferred = U.input({ value: draft.preferred, placeholder: 'Preferred (optional)' });
  const grade = U.input({ value: draft.grade, placeholder: 'e.g. 11' });
  const instrument = U.input({ value: draft.instrument, placeholder: 'e.g. Violin' });
  const section = U.input({ value: draft.section, placeholder: 'e.g. Violin 2' });
  const email = U.input({ value: draft.email, placeholder: 'student@…', type: 'email' });
  const phone = U.input({ value: draft.phone, placeholder: '(305) …' });

  body.appendChild(U.el('div', { class: 'field-row' }, U.field('First name', first), U.field('Last name', last)));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Preferred name', preferred), U.field('Grade', grade)));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Instrument', instrument), U.field('Section', section, 'Used for score-order sorting and seating (e.g. Violin 1 vs Violin 2).')));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Student email', email), U.field('Student phone', phone)));

  // Music ensembles only — divisions are not classes and never appear here.
  const ensWrap = U.el('div');
  for (const e of Store.ensembles()) {
    const cb = U.el('input', { type: 'checkbox' });
    cb.checked = draft.ensembleIds.includes(e.id);
    cb.addEventListener('change', () => {
      if (cb.checked) { if (!draft.ensembleIds.includes(e.id)) draft.ensembleIds.push(e.id); }
      else draft.ensembleIds = draft.ensembleIds.filter(x => x !== e.id);
    });
    ensWrap.appendChild(U.el('label', { class: 'checkline' }, cb, e.name));
  }
  body.appendChild(U.field('Ensembles', ensWrap));

  // contacts editor — unlimited entries
  body.appendChild(U.el('div', { class: 'section-label' }, 'Family & emergency contacts'));
  const contactsWrap = U.el('div');
  const renderContacts = () => {
    contactsWrap.innerHTML = '';
    draft.contacts.forEach((c, i) => {
      const name = U.input({ value: c.name || '', placeholder: 'Name', oninput: e => { c.name = e.target.value; } });
      const rel = U.input({ value: c.relation || '', placeholder: 'Relation (Mother, Guardian 2…)', oninput: e => { c.relation = e.target.value; } });
      const em = U.input({ value: c.email || '', placeholder: 'Email', oninput: e => { c.email = e.target.value; } });
      const ph = U.input({ value: c.phone || '', placeholder: 'Phone', oninput: e => { c.phone = e.target.value; } });
      contactsWrap.appendChild(U.el('div', { class: 'contact-block' },
        U.el('div', { class: 'field-row' }, name, rel),
        U.el('div', { class: 'field-row', style: { marginTop: '6px' } }, em, ph),
        U.el('div', { style: { marginTop: '6px', textAlign: 'right' } },
          U.el('button', { class: 'btn sm danger', onclick: () => { draft.contacts.splice(i, 1); renderContacts(); } }, 'Remove'))));
    });
    contactsWrap.appendChild(U.el('button', {
      class: 'btn sm', style: { marginTop: '6px' },
      onclick: () => { draft.contacts.push({ name: '', relation: '', email: '', phone: '' }); renderContacts(); },
    }, '+ Add contact'));
  };
  renderContacts();
  body.appendChild(contactsWrap);

  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!first.value.trim() && !last.value.trim()) { U.toast('A name is required', 'error'); return; }
        Object.assign(draft, {
          first: first.value.trim(), last: last.value.trim(), preferred: preferred.value.trim(),
          grade: grade.value.trim(), instrument: instrument.value.trim(), section: section.value.trim(),
          email: email.value.trim(), phone: phone.value.trim(),
        });
        draft.contacts = draft.contacts.filter(c => (c.name || c.email || c.phone || '').trim());
        if (isNew) draft.id = U.uid();
        Store.upsert('students', draft);
        U.closeModal(); App.render();
        U.toast(isNew ? 'Student added' : 'Student updated');
      },
    }, isNew ? 'Add student' : 'Save changes'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));

  U.openModal(isNew ? 'Add student' : 'Edit ' + (st.first || 'student'), body, { wide: true });
};

/* ---------- archive graduated seniors ---------- */
DRoster.archiveSeniorsDialog = function () {
  const seniors = Store.activeStudents().filter(s => String(s.grade).trim() === '12');
  const year = new Date().getFullYear();
  const body = U.el('div');
  if (!seniors.length) {
    body.appendChild(U.el('div', { class: 'card-body' },
      'No active students with grade 12. Set grades on student profiles (or import them) and this button rotates the whole senior class into the Archived · Alumni area in one tap — info and notes kept, hidden everywhere else.'));
    body.appendChild(U.el('div', { class: 'card-actions' }, U.el('button', { class: 'btn', onclick: () => U.closeModal() }, 'OK')));
    U.openModal('Archive graduated seniors', body);
    return;
  }
  const label = U.input({ value: 'Class of ' + year });
  body.appendChild(U.el('div', { class: 'card-body' },
    'This moves ' + U.plural(seniors.length, 'senior') + ' to Archived · Alumni. They keep all info, contacts and notes, and disappear from Take Roll, seating, Who\'s Out and every other page. You can restore anyone later.'));
  const listEl = U.el('ul', { style: { margin: '10px 0 4px 18px', fontSize: '13.5px' } });
  for (const s of seniors) listEl.appendChild(U.el('li', null, s.last + ', ' + s.first));
  body.appendChild(listEl);
  body.appendChild(U.field('Archive label', label));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        for (const s of seniors) Store.archiveStudent(s.id, label.value.trim() || 'Class of ' + year);
        U.closeModal(); U.toast(seniors.length + ' seniors archived — see Archived · Alumni at the bottom of the roster');
        App.render();
      },
    }, 'Archive ' + seniors.length + ' seniors'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal('🎓 Archive graduated seniors', body);
};

/* ---------- spreadsheet import ---------- */
DRoster.importDialog = function () {
  const body = U.el('div');
  body.appendChild(U.el('div', { class: 'card-body' },
    'Paste your roster (or choose a .csv exported from Excel / Google Sheets). ',
    U.el('b', null, 'Every column is kept'), ' — multiple parents/guardians with names, emails and phone numbers land as separate contacts, and anything unrecognized is preserved on the student\'s profile.'));

  const file = U.el('input', { type: 'file', accept: '.csv,.tsv,.txt', class: 'input', style: { padding: '7px' } });
  const ta = U.textarea({ placeholder: 'Paste spreadsheet cells here (with the header row)…', style: { minHeight: '140px' } });
  body.appendChild(U.field('Spreadsheet file', file));
  body.appendChild(U.field('…or paste it', ta));

  const next = U.el('button', { class: 'btn primary' }, 'Next: check columns →');
  body.appendChild(U.el('div', { class: 'card-actions' }, next,
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));

  next.addEventListener('click', () => {
    const go = text => {
      if (text.startsWith('PK') || text.startsWith('PK\x03\x04')) {
        U.toast('That looks like an Excel file. Export it as CSV first (File → Save As / Download → CSV), then import that.', 'error');
        return;
      }
      const rows = U.parseDelimited(text);
      if (rows.length < 2) { U.toast('Need a header row plus at least one student.', 'error'); return; }
      DRoster.mappingDialog(rows);
    };
    const f = file.files && file.files[0];
    if (f) {
      if (/\.(xlsx?|numbers)$/i.test(f.name)) {
        U.toast('"' + f.name + '" is a spreadsheet app file. Export it as CSV first (File → Save As / Download → CSV), then import that.', 'error');
        return;
      }
      const r = new FileReader();
      r.onload = () => go(String(r.result || ''));
      r.onerror = () => U.toast('Could not read that file.', 'error');
      r.readAsText(f);
    } else if (ta.value.trim()) {
      go(ta.value);
    } else {
      U.toast('Choose a file or paste your roster first.', 'error');
    }
  });

  U.openModal('Import roster spreadsheet', body, { wide: true, sticky: true });
};

DRoster.mappingDialog = function (rows) {
  const headers = rows[0].map(h => String(h).trim());
  const mapping = Store.autoMapHeaders(headers);
  const body = U.el('div');

  body.appendChild(U.el('div', { class: 'card-body' },
    'Check that each column landed in the right place. Anything set to "Keep as extra info" is still saved on the student profile — nothing is dropped.'));

  const FIELD_OPTS = [
    { value: 'skip', label: 'Ignore column' },
    { value: 'extra', label: 'Keep as extra info' },
    { value: 'first', label: 'First name' }, { value: 'last', label: 'Last name' },
    { value: 'full', label: 'Full name' }, { value: 'preferred', label: 'Preferred name' },
    { value: 'grade', label: 'Grade' }, { value: 'instrument', label: 'Instrument' },
    { value: 'section', label: 'Section / part' }, { value: 'ensembles', label: 'Ensembles' },
    { value: 'email', label: 'Student email' }, { value: 'phone', label: 'Student phone' },
    { value: 'sid', label: 'Student ID' }, { value: 'notes', label: 'Notes' },
  ];
  // Offer at least 6 contact slots, or as many as the auto-mapping actually
  // used — so a 7th guardian column never shows a lying "Ignore column".
  const maxAutoSlot = Math.max(-1, ...mapping.filter(m => m.kind === 'contact').map(m => m.slot));
  const slotCount = Math.max(6, maxAutoSlot + 2);
  for (let slot = 0; slot < slotCount; slot++) {
    for (const f of ['name', 'relation', 'email', 'phone']) {
      FIELD_OPTS.push({ value: 'contact:' + slot + ':' + f, label: 'Contact ' + (slot + 1) + ' — ' + f });
    }
  }
  const specToValue = spec => spec.kind === 'contact' ? 'contact:' + spec.slot + ':' + spec.field : spec.kind;
  const valueToSpec = (v, header) => {
    if (v.startsWith('contact:')) {
      const [, slot, field] = v.split(':');
      return { kind: 'contact', slot: +slot, field, role: '', header };
    }
    return { kind: v, header };
  };

  const t = U.el('table', { class: 'roster' });
  t.appendChild(U.el('thead', null, U.el('tr', null,
    U.el('th', null, 'Your column'), U.el('th', null, 'Example'), U.el('th', null, 'Imports as'))));
  const tb = U.el('tbody');
  headers.forEach((h, i) => {
    const example = (rows[1] && rows[1][i]) || (rows[2] && rows[2][i]) || '';
    tb.appendChild(U.el('tr', null,
      U.el('td', null, U.el('b', null, h || '(blank)')),
      U.el('td', null, String(example).slice(0, 40)),
      U.el('td', null, U.select(FIELD_OPTS, specToValue(mapping[i]), v => { mapping[i] = Object.assign(valueToSpec(v, h), { role: mapping[i].role || '' }); }))));
  });
  t.appendChild(tb);
  body.appendChild(U.el('div', { class: 'tablewrap', style: { maxHeight: '320px', overflowY: 'auto' } }, t));

  const modeWrap = U.el('div', { style: { marginTop: '12px' } });
  let mode = 'update';
  const radio = (val, label, hint) => {
    const r = U.el('input', { type: 'radio', name: 'imp-mode' });
    r.checked = mode === val;
    r.addEventListener('change', () => { if (r.checked) mode = val; });
    return U.el('label', { class: 'checkline' }, r, U.el('span', null, U.el('b', null, label), ' — ' + hint));
  };
  modeWrap.appendChild(radio('update', 'Update & add (recommended)', 'matches existing students by ID, email or name; the new file wins on differing info; your notes and attendance history are kept.'));
  modeWrap.appendChild(radio('add', 'Add new only', 'never touches students already in the roster.'));
  body.appendChild(modeWrap);

  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        const incoming = rows.slice(1).map(r => Store.rowToStudent(r, mapping));
        // Parse sanity check BEFORE touching the roster: if not a single row
        // produced a student name, the file/mapping is wrong — importing
        // would add nothing and then offer to archive everyone "missing".
        if (!incoming.some(inc => (inc.first || '').trim() || (inc.last || '').trim())) {
          U.toast('No student names found in any row — check the delimiter and the name column mapping above. Nothing was imported.', 'error');
          return;
        }
        const report = Store.mergeImport(incoming, mode);
        DRoster.importReport(report);
      },
    }, 'Import ' + U.plural(rows.length - 1, 'row')),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));

  // noAutofocus: focusing a <select> inside the scrollable table would yank
  // it sideways past the "Your column / Example" columns on phones.
  U.openModal('Check columns', body, { wide: true, sticky: true, noAutofocus: true });
};

DRoster.importReport = function (report) {
  const body = U.el('div');
  const line = (n, one, many) => U.el('div', { class: 'checkline' },
    U.el('b', { style: { minWidth: '34px' } }, String(n)), n === 1 ? one : many);
  body.appendChild(line(report.added.length, 'new student added', 'new students added'));
  body.appendChild(line(report.updated.length,
    'existing student updated with the file\'s info (conflicting fields replaced; notes & history kept)',
    'existing students updated with the file\'s info (conflicting fields replaced; notes & history kept)'));
  if (report.restored && report.restored.length) {
    body.appendChild(line(report.restored.length,
      'returning student restored from Archived · Alumni (they were in the new file)',
      'returning students restored from Archived · Alumni (they were in the new file)'));
  }
  body.appendChild(line(report.unchanged.length, 'already up to date', 'already up to date'));
  if (report.skippedNoName) {
    body.appendChild(U.el('div', { class: 'checkline', style: { color: 'var(--tardy)' } },
      U.el('b', { style: { minWidth: '34px' } }, String(report.skippedNoName)),
      (report.skippedNoName === 1 ? 'row was skipped — it had no student name. ' : 'rows were skipped — they had no student name. ') +
      'If those rows are real students, re-import and check which column is mapped to the name.'));
  }
  if (report.notInFile.length) {
    body.appendChild(U.el('hr', { class: 'divider' }));
    body.appendChild(U.el('div', { class: 'card-body' },
      U.el('b', null, report.notInFile.length + ' active students were NOT in this file'),
      ' — usually last semester\'s graduates or transfers. You can move them to Archived · Alumni in one tap (info and notes kept). ',
      U.el('b', null, 'Only bulk-archive from a FULL roster file'),
      ' — a single-ensemble file lists everyone from the other ensembles here too.'));
    const listEl = U.el('ul', { style: { margin: '8px 0 4px 18px', fontSize: '13.5px' } });
    for (const s of report.notInFile.slice(0, 30)) listEl.appendChild(U.el('li', null, s.last + ', ' + s.first + (s.grade ? ' (gr ' + s.grade + ')' : '')));
    if (report.notInFile.length > 30) listEl.appendChild(U.el('li', null, '…and ' + (report.notInFile.length - 30) + ' more'));
    body.appendChild(listEl);
    const label = U.input({ value: 'Class of ' + new Date().getFullYear() });
    body.appendChild(U.field('Archive label', label));
    body.appendChild(U.el('div', { class: 'card-actions' },
      U.el('button', {
        class: 'btn',
        onclick: () => {
          for (const s of report.notInFile) Store.archiveStudent(s.id, label.value.trim() || undefined);
          U.closeModal(); U.toast(report.notInFile.length + ' students archived'); App.render();
        },
      }, 'Archive all ' + report.notInFile.length),
      U.el('button', { class: 'btn ghost', onclick: () => { U.closeModal(); App.render(); } }, 'Keep them active')));
  } else {
    body.appendChild(U.el('div', { class: 'card-actions' },
      U.el('button', { class: 'btn primary', onclick: () => { U.closeModal(); App.render(); } }, 'Done')));
  }
  U.openModal('Import finished', body, { wide: true, sticky: true });
};

/* =========================================================
   Take Roll — Day (default) | Month | List · sort by last name / score order
   ========================================================= */
Views.director.roll = function (container) {
  const state = Views.director.roll._state = Views.director.roll._state || {};
  // Every fresh visit starts on today's Day view — the required default —
  // while same-page re-renders (marking, sorting) keep their place.
  if (App.isFreshNav || !state.mode) {
    state.mode = 'day';
    state.date = U.todayYmd();
    state.month = U.todayYmd().slice(0, 7);
  }
  const ensembles = Store.ensembles();
  let eid = Store.getFilter('d_roll', ensembles[0] && ensembles[0].id);
  if (eid === 'all' || !Store.ensembleById(eid)) eid = ensembles[0] && ensembles[0].id;
  const sort = Store.data.settings.rollSort === 'score' ? 'score' : 'last';

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Take Roll'),
      U.el('div', { class: 'page-sub' }, 'P present · A absent · T tardy · E excused. Day is the default; Month and List review past rolls.'))));

  container.appendChild(U.el('div', { class: 'toolbar' },
    ensembleChips('d_roll', eid, () => App.render(), { all: false })));

  const toolbar = U.el('div', { class: 'toolbar' });
  toolbar.appendChild(U.segmented(
    [{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'list', label: 'List' }],
    state.mode, v => { state.mode = v; App.render(); }));
  toolbar.appendChild(U.el('span', { class: 'grow' }));
  // Label + control wrap as ONE unit so "Sort:" never orphans on small screens.
  toolbar.appendChild(U.el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px', flex: 'none' } },
    U.el('span', { class: 'toolbar-label' }, 'Sort:'),
    U.segmented(
      [{ value: 'last', label: 'Last name' }, { value: 'score', label: 'Score order' }],
      sort, v => { Store.data.settings.rollSort = v; Store.save(); App.render(); })));
  container.appendChild(toolbar);

  if (!eid) { container.appendChild(U.empty('🎺', 'No ensembles configured')); return; }

  if (state.mode === 'day') {
    // date navigation (arrows + a real date picker, like Schedule Changes)
    const dateInput = U.input({ type: 'date', value: state.date, style: { maxWidth: '165px' }, 'aria-label': 'Roll date' });
    dateInput.addEventListener('change', () => { if (dateInput.value) { state.date = dateInput.value; App.render(); } });
    const nav = U.el('div', { class: 'toolbar' },
      U.el('button', { class: 'btn sm', 'aria-label': 'Previous day', onclick: () => { state.date = U.addDays(state.date, -1); App.render(); } }, '‹'),
      dateInput,
      U.el('button', { class: 'btn sm', 'aria-label': 'Next day', onclick: () => { state.date = U.addDays(state.date, 1); App.render(); } }, '›'),
      U.el('b', { style: { fontSize: '14px' } }, U.relDate(state.date)),
      state.date !== U.todayYmd() ? U.el('button', { class: 'btn sm ghost', onclick: () => { state.date = U.todayYmd(); App.render(); } }, 'Jump to today') : null);
    container.appendChild(nav);

    const { students, subInIds, pulledIds } = Store.rosterOn(state.date, eid);
    if (!students.length) {
      container.appendChild(U.empty('🧑‍🎓', 'No active students in this ensemble',
        'Archived students never appear here.',
        U.el('a', { class: 'btn primary', href: '#/d/roster' }, 'Open the Roster to add students')));
      return;
    }
    if (subInIds.size || pulledIds.size) {
      container.appendChild(U.el('div', { class: 'hint', style: { marginBottom: '8px' } },
        '🔁 Temporary roster changes are applied to this day' +
        (subInIds.size ? ' · ' + U.plural(subInIds.size, 'sub-in') : '') +
        (pulledIds.size ? ' · ' + U.plural(pulledIds.size, 'pull-out hidden') : '') + '.'));
    }

    const marks = Store.roll(state.date, eid);
    const summary = U.el('div', { class: 'roll-summary', style: { marginBottom: '12px' } });
    const renderSummary = () => {
      const s = Store.rollSummary(state.date, eid);
      const fresh = Store.roll(state.date, eid);
      const unmarked = students.filter(st => !fresh[st.id]).length;
      summary.innerHTML = '';
      summary.appendChild(U.el('span', { class: 'pill P' }, s.P + ' present'));
      summary.appendChild(U.el('span', { class: 'pill A' }, s.A + ' absent'));
      summary.appendChild(U.el('span', { class: 'pill T' }, s.T + ' tardy'));
      summary.appendChild(U.el('span', { class: 'pill E' }, s.E + ' excused'));
      summary.appendChild(U.el('span', { class: 'pill' }, unmarked + ' unmarked'));
    };
    renderSummary();
    container.appendChild(U.el('div', { class: 'toolbar' },
      U.el('button', {
        class: 'btn sm',
        onclick: () => {
          // Read the CURRENT roll, not the render-time snapshot — otherwise
          // absences tapped since page load would be flipped to present.
          const cur = Store.roll(state.date, eid);
          for (const st of students) if (!cur[st.id]) Store.setRollMark(state.date, eid, st.id, 'P');
          App.render();
        },
      }, '✓ Mark all unmarked present'),
      U.el('button', {
        class: 'btn sm ghost',
        onclick: () => {
          if (!U.confirmBox('Clear this day\'s roll for ' + (Store.ensembleById(eid) || {}).name + '?')) return;
          // Clears the STORED day, so marks from since-archived students
          // can't linger as phantom counts.
          Store.clearRoll(state.date, eid);
          App.render();
        },
      }, 'Clear day')));
    container.appendChild(summary);

    const listWrap = U.el('div', { class: 'rowlist' });
    const rowFor = st => {
      const row = U.el('div', { class: 'roll-row' });
      const nameLabel = sort === 'last'
        ? st.last + ', ' + (st.preferred || st.first)
        : (st.preferred || st.first) + ' ' + st.last;
      row.appendChild(U.el('div', { class: 'roll-name' }, nameLabel + ' ',
        U.el('span', { class: 'roll-inst' }, st.section || st.instrument || ''),
        subInIds.has(st.id) ? U.el('span', { class: 'badge new', style: { marginLeft: '6px' } }, 'Sub in') : null));
      const btns = U.el('div', { class: 'roll-btns' });
      for (const code of ['P', 'A', 'T', 'E']) {
        const b = U.el('button', {
          class: 'roll-btn ' + code + (marks[st.id] === code ? ' on' : ''),
          'aria-label': ({ P: 'Present', A: 'Absent', T: 'Tardy', E: 'Excused' })[code] + ' — ' + st.first + ' ' + st.last,
          onclick: () => {
            const cur = Store.roll(state.date, eid)[st.id];
            Store.setRollMark(state.date, eid, st.id, cur === code ? null : code);
            btns.querySelectorAll('.roll-btn').forEach(x => x.classList.remove('on'));
            if (cur !== code) b.classList.add('on');
            renderSummary();
          },
        }, code);
        btns.appendChild(b);
      }
      row.appendChild(btns);
      return row;
    };

    if (sort === 'score') {
      for (const group of U.scoreOrderGroups(students)) {
        listWrap.appendChild(U.el('div', { class: 'roll-section' }, group.label));
        for (const st of group.students) listWrap.appendChild(rowFor(st));
      }
    } else {
      for (const st of students.slice().sort(U.byLastName)) listWrap.appendChild(rowFor(st));
    }
    container.appendChild(listWrap);

  } else if (state.mode === 'month') {
    container.appendChild(U.el('div', { class: 'hint', style: { marginBottom: '8px' } },
      'Days with a dot have a saved roll for ' + ((Store.ensembleById(eid) || {}).name || '') + '. Tap one to open it.'));
    container.appendChild(U.monthGrid({
      month: state.month,
      onNav: m => { state.month = m; App.render(); },
      pickAll: true,   // any day opens the day view to take/see that roll
      onPick: ymd => { state.date = ymd; state.mode = 'day'; App.render(); },
      renderDay: ymd => {
        if (!Store.rollHasVisible(ymd, eid)) return null;
        const s = Store.rollSummary(ymd, eid);
        const box = U.el('div');
        box.appendChild(U.el('span', { class: 'mcal-evt', style: { '--tag-color': (Store.ensembleById(eid) || {}).color } },
          s.P + 'P' + (s.A ? ' · ' + s.A + 'A' : '') + (s.T ? ' · ' + s.T + 'T' : '') + (s.E ? ' · ' + s.E + 'E' : '')));
        const dots = U.el('div', { class: 'mcal-dots' });
        dots.appendChild(U.el('span', { class: 'mcal-dot', style: { '--tag-color': (Store.ensembleById(eid) || {}).color } }));
        box.appendChild(dots);
        return box;
      },
    }));
  } else {
    // list of days with rolls
    const dates = Store.rollDates(eid).reverse();
    if (!dates.length) {
      container.appendChild(U.empty('📋', 'No rolls saved yet for this ensemble', 'It saves as you tap.',
        U.el('button', {
          class: 'btn primary',
          onclick: () => { state.mode = 'day'; state.date = U.todayYmd(); App.render(); },
        }, "Take today's roll")));
      return;
    }
    const listWrap = U.el('div', { class: 'rowlist' });
    for (const d of dates) {
      const s = Store.rollSummary(d, eid);
      const dp = U.parseYmd(d);
      listWrap.appendChild(U.el('div', U.keyActivate({
        class: 'rowitem clickable',
        onclick: () => { state.date = d; state.mode = 'day'; App.render(); },
      }),
        U.el('div', { class: 'date-pill' + (d < U.todayYmd() ? ' past' : '') },
          U.el('div', { class: 'dp-mon' }, dp.toLocaleDateString('en-US', { month: 'short' })),
          U.el('div', { class: 'dp-day' }, String(dp.getDate()))),
        U.el('div', { class: 'row-main' },
          U.el('div', { class: 'row-title' }, U.relDate(d)),
          U.el('div', { class: 'row-sub' }, U.fmtDate(d, 'long'))),
        U.el('div', { class: 'roll-summary' },
          U.el('span', { class: 'pill P' }, String(s.P)),
          U.el('span', { class: 'pill A' }, String(s.A)),
          U.el('span', { class: 'pill T' }, String(s.T)),
          U.el('span', { class: 'pill E' }, String(s.E)))));
    }
    container.appendChild(listWrap);
  }
};

/* =========================================================
   Who's Out — Today (default) | Month | List
   ========================================================= */
Views.director.out = function (container) {
  const state = Views.director.out._state = Views.director.out._state || {};
  // Fresh visits always land on Today — the required default.
  if (App.isFreshNav || !state.mode) {
    state.mode = 'today';
    state.month = U.todayYmd().slice(0, 7);
  }

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, "Who's Out"),
      U.el('div', { class: 'page-sub' }, 'Planned absences, pull-outs, and today\'s roll — in one place.')),
    U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn primary', onclick: () => DRoster.outDialog(null) }, '+ Mark someone out'))));

  container.appendChild(U.el('div', { class: 'toolbar' },
    U.segmented([{ value: 'today', label: 'Today' }, { value: 'month', label: 'Month' }, { value: 'list', label: 'List' }],
      state.mode, v => { state.mode = v; App.render(); })));

  const outCard = (w, showDates) => {
    const st = Store.studentById(w.studentId);
    return U.el('div', { class: 'rowitem' },
      U.el('div', { class: 'row-main' },
        U.el('div', { class: 'row-title' }, st ? st.last + ', ' + (st.preferred || st.first) : '(removed student)'),
        U.el('div', { class: 'row-sub' },
          (showDates ? U.fmtRangeDates(w.from, w.to) + ' · ' : '') + (w.reason || 'out') + (w.note ? ' — ' + w.note : ''))),
      U.el('button', { class: 'btn sm', onclick: () => DRoster.outDialog(w) }, 'Edit'),
      U.el('button', {
        class: 'btn sm danger',
        onclick: () => {
          if (!U.confirmBox('Remove this out entry?')) return;
          Store.data.whosOut = Store.data.whosOut.filter(x => x.id !== w.id);
          Store.save(); App.render();
        },
      }, 'Remove'));
  };

  if (state.mode === 'today') {
    const today = U.todayYmd();
    const { manual, pulls, absent } = Store.outOn(today);
    container.appendChild(U.el('div', { class: 'section-label' }, 'Marked out today (' + manual.length + ')'));
    if (manual.length) {
      const l = U.el('div', { class: 'rowlist' });
      manual.forEach(w => l.appendChild(outCard(w, true)));
      container.appendChild(l);
    } else container.appendChild(U.el('div', { class: 'hint' }, 'Nobody marked out for today.'));

    container.appendChild(U.el('div', { class: 'section-label' }, 'Pulled out today — temporary roster changes (' + pulls.length + ')'));
    if (pulls.length) {
      const l = U.el('div', { class: 'rowlist' });
      for (const t of pulls) {
        const st = Store.studentById(t.studentId);
        const e = Store.ensembleById(t.ensembleId);
        l.appendChild(U.el('div', { class: 'rowitem' },
          U.el('div', { class: 'row-main' },
            U.el('div', { class: 'row-title' }, st ? st.last + ', ' + (st.preferred || st.first) : '(removed student)'),
            U.el('div', { class: 'row-sub' }, 'pulled from ' + (e ? e.name : '?') + ' · ' + U.fmtRangeDates(t.from, t.to) + (t.note ? ' — ' + t.note : ''))),
          U.el('a', { class: 'btn sm', href: '#/d/temp' }, 'Open')));
      }
      container.appendChild(l);
    } else container.appendChild(U.el('div', { class: 'hint' }, 'No pull-outs today.'));

    container.appendChild(U.el('div', { class: 'section-label' }, 'Absent or excused at roll today (' + absent.length + ')'));
    if (absent.length) {
      const l = U.el('div', { class: 'rowlist' });
      for (const a of absent) {
        const st = Store.studentById(a.studentId);
        const e = Store.ensembleById(a.ensembleId);
        l.appendChild(U.el('div', { class: 'rowitem' },
          U.el('div', { class: 'row-main' },
            U.el('div', { class: 'row-title' }, st ? st.last + ', ' + (st.preferred || st.first) : '(removed student)'),
            U.el('div', { class: 'row-sub' }, (a.code === 'A' ? 'Absent' : 'Excused') + ' in ' + (e ? e.name : '?'))),
          U.el('a', { class: 'btn sm', href: '#/d/roll' }, 'Roll')));
      }
      container.appendChild(l);
    } else container.appendChild(U.el('div', { class: 'hint' }, 'No absences marked at roll yet today.'));

  } else if (state.mode === 'month') {
    container.appendChild(U.el('div', { class: 'hint', style: { marginBottom: '8px' } },
      'Dots mark planned absences and pull-outs. Tap a day to see everyone out that day (including roll absences).'));
    container.appendChild(U.monthGrid({
      month: state.month,
      onNav: m => { state.month = m; App.render(); },
      onPick: ymd => {
        const o = Store.outOn(ymd);
        const n = o.manual.length + o.pulls.length;
        if (!n && !o.absent.length) return;
        const body = U.el('div', { class: 'rowlist' });
        o.manual.forEach(w => body.appendChild(outCard(w, true)));
        for (const t of o.pulls) {
          const st = Store.studentById(t.studentId);
          body.appendChild(U.el('div', { class: 'rowitem' },
            U.el('div', { class: 'row-main' },
              U.el('div', { class: 'row-title' }, st ? st.last + ', ' + st.first : '?'),
              U.el('div', { class: 'row-sub' }, 'pull-out · ' + U.fmtRangeDates(t.from, t.to)))));
        }
        for (const a of o.absent) {
          const st = Store.studentById(a.studentId);
          body.appendChild(U.el('div', { class: 'rowitem' },
            U.el('div', { class: 'row-main' },
              U.el('div', { class: 'row-title' }, st ? st.last + ', ' + st.first : '?'),
              U.el('div', { class: 'row-sub' }, (a.code === 'A' ? 'absent' : 'excused') + ' at roll'))));
        }
        U.openModal("Who's out — " + U.fmtDate(ymd, 'long'), body, { wide: true });
      },
      renderDay: ymd => {
        // Dots = planned outages (marked-out + pull-outs) — the same set the
        // List view shows, so nothing "vanishes" between the two views.
        // (Roll absences still appear in the tapped day's detail.)
        const o = Store.outOn(ymd);
        const n = o.manual.length + o.pulls.length;
        if (!n && !o.absent.length) return null;
        const dots = U.el('div', { class: 'mcal-dots' });
        for (let i = 0; i < Math.min(n, 6); i++) dots.appendChild(U.el('span', { class: 'mcal-dot', style: { '--tag-color': 'var(--absent)' } }));
        if (n > 6) dots.appendChild(U.el('span', { class: 'mcal-more' }, '+' + (n - 6)));
        if (!n && o.absent.length) dots.appendChild(U.el('span', { class: 'mcal-more' }, o.absent.length + ' at roll'));
        return dots;
      },
    }));
  } else {
    // List view covers the same ground as Today/Month: planned absences AND
    // pull-outs, so nothing that shows as a dot can "vanish" here.
    const today = U.todayYmd();
    const entries = Store.data.whosOut
      .filter(w => Store.isVisibleStudent(w.studentId))
      .sort((a, b) => a.from < b.from ? -1 : 1);
    const pulls = Store.data.tempChanges
      .filter(t => t.type === 'pull-out' && Store.isVisibleStudent(t.studentId))
      .sort((a, b) => a.from < b.from ? -1 : 1);
    const current = entries.filter(w => (w.to || w.from) >= today);
    const past = entries.filter(w => (w.to || w.from) < today).reverse();
    if (!entries.length && !pulls.length) {
      container.appendChild(U.empty('🏝️', 'No out entries yet', 'Use "+ Mark someone out" for planned absences — field trips, auditions, illness.'));
      return;
    }
    if (current.length) {
      container.appendChild(U.el('div', { class: 'section-label' }, 'Marked out — current & upcoming'));
      const l = U.el('div', { class: 'rowlist' });
      current.forEach(w => l.appendChild(outCard(w, true)));
      container.appendChild(l);
    }
    if (pulls.length) {
      container.appendChild(U.el('div', { class: 'section-label' }, 'Pull-outs (temporary roster changes)'));
      const l = U.el('div', { class: 'rowlist' });
      for (const t of pulls) {
        const st = Store.studentById(t.studentId);
        const e = Store.ensembleById(t.ensembleId);
        l.appendChild(U.el('div', { class: 'rowitem' },
          U.el('div', { class: 'row-main' },
            U.el('div', { class: 'row-title' }, st ? st.last + ', ' + (st.preferred || st.first) : '(removed student)'),
            U.el('div', { class: 'row-sub' }, 'pulled from ' + (e ? e.name : '?') + ' · ' + U.fmtRangeDates(t.from, t.to) + (t.note ? ' — ' + t.note : ''))),
          U.el('a', { class: 'btn sm', href: '#/d/temp' }, 'Open')));
      }
      container.appendChild(l);
    }
    if (past.length) {
      container.appendChild(U.el('div', { class: 'section-label' }, 'Marked out — past'));
      const l = U.el('div', { class: 'rowlist' });
      past.forEach(w => l.appendChild(outCard(w, true)));
      container.appendChild(l);
    }
  }
};

/* Student options for pickers. When editing an entry whose student is now
   archived (or gone), keep that student selectable — otherwise the browser
   silently preselects someone else and Save reassigns the entry. */
DRoster.studentOptions = function (currentId) {
  const opts = Store.activeStudents().sort(U.byLastName)
    .map(s => ({ value: s.id, label: s.last + ', ' + s.first + (s.instrument ? ' · ' + s.instrument : '') }));
  if (currentId && !opts.some(o => o.value === currentId)) {
    const st = Store.studentById(currentId);
    opts.unshift({ value: currentId, label: st ? st.last + ', ' + st.first + ' (archived)' : '(removed student)' });
  }
  return opts;
};

DRoster.outDialog = function (w) {
  const isNew = !w;
  const students = Store.activeStudents().sort(U.byLastName);
  if (!students.length && isNew) { U.toast('Add students to the roster first.', 'error'); return; }
  const body = U.el('div');
  const stSel = U.select(DRoster.studentOptions(w && w.studentId), w ? w.studentId : students[0].id, null);
  stSel.classList.add('block');
  const from = U.input({ type: 'date', value: w ? w.from : U.todayYmd() });
  const to = U.input({ type: 'date', value: w ? (w.to || '') : '' });
  const reason = U.input({ value: w ? (w.reason || '') : '', placeholder: 'e.g. College audition, illness, field trip' });
  const note = U.input({ value: w ? (w.note || '') : '', placeholder: 'Optional note' });
  body.appendChild(U.field('Student', stSel));
  body.appendChild(U.el('div', { class: 'field-row' },
    U.field('From', from), U.field('Through (optional)', to)));
  body.appendChild(U.field('Reason', reason));
  body.appendChild(U.field('Note', note));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        const sel = stSel.querySelector('select');
        if (!from.value) { U.toast('Pick a start date', 'error'); return; }
        if (to.value && to.value < from.value) { U.toast('"Through" is before "From"', 'error'); return; }
        const entry = {
          id: w ? w.id : U.uid(),
          studentId: sel.value, from: from.value, to: to.value || '',
          reason: reason.value.trim(), note: note.value.trim(),
        };
        Store.upsert('whosOut', entry);
        U.closeModal(); App.render();
      },
    }, isNew ? 'Mark out' : 'Save'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal(isNew ? 'Mark someone out' : 'Edit out entry', body);
};
