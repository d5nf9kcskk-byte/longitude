/* NWSA Music — Director Panel: repertoire/assignments/announcements dialogs,
   seating charts (student-view-first), QR kit with a print button that
   actually prints, and settings. Global `DContent`. */
'use strict';

const DContent = {};

/* Director wrappers around the shared pages (same cards, plus edit controls). */
Views.director.news = container => announcementsPage(container, { director: true });
Views.director.assignments = container => assignmentsPage(container, { director: true });
Views.director.repertoire = (container, arg) =>
  arg ? pieceDetailPage(container, arg, { director: true }) : repertoirePage(container, { director: true });

/* ---------- ensemble multi-select (music only) ---------- */
DContent.ensemblePicker = function (selected) {
  const state = { ids: Array.isArray(selected) ? selected.slice() : [], all: selected === 'all' };
  const wrap = U.el('div');
  const allCb = U.el('input', { type: 'checkbox' });
  allCb.checked = state.all;
  const boxes = [];
  allCb.addEventListener('change', () => {
    state.all = allCb.checked;
    boxes.forEach(b => { b.disabled = allCb.checked; });
  });
  wrap.appendChild(U.el('label', { class: 'checkline' }, allCb, U.el('b', null, 'All ensembles')));
  for (const e of Store.ensembles()) {
    const cb = U.el('input', { type: 'checkbox' });
    cb.checked = state.ids.includes(e.id);
    cb.disabled = state.all;
    cb.addEventListener('change', () => {
      if (cb.checked) { if (!state.ids.includes(e.id)) state.ids.push(e.id); }
      else state.ids = state.ids.filter(x => x !== e.id);
    });
    boxes.push(cb);
    wrap.appendChild(U.el('label', { class: 'checkline' }, cb, e.name));
  }
  wrap.value = () => state.all ? 'all' : state.ids.slice();
  return wrap;
};

/* ---------- announcements ---------- */
DContent.announcementDialog = function (a) {
  const isNew = !a;
  const body = U.el('div');
  const title = U.input({ value: a ? a.title : '', placeholder: 'Headline' });
  const text = U.textarea({ placeholder: 'The whole message — it is always shown in full, on every page, both sides.' });
  text.value = a ? (a.body || '') : '';
  const date = U.input({ type: 'date', value: a ? a.date : U.todayYmd() });
  const pinned = U.el('input', { type: 'checkbox' });
  pinned.checked = a ? !!a.pinned : false;
  const picker = DContent.ensemblePicker(a ? a.ensembleIds : 'all');

  body.appendChild(U.field('Title', title));
  body.appendChild(U.field('Message', text));
  body.appendChild(U.el('div', { class: 'field-row' },
    U.field('Post date', date),
    U.field('Pinned', U.el('label', { class: 'checkline' }, pinned, 'Keep at the top'))));
  body.appendChild(U.field('Who is this for?', picker));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!title.value.trim()) { U.toast('Give it a title', 'error'); return; }
        const data = {
          id: a ? a.id : U.uid(),
          title: title.value.trim(), body: text.value.trim(),
          date: date.value || U.todayYmd(), pinned: pinned.checked,
          ensembleIds: picker.value(),
        };
        Store.upsert('announcements', data);
        U.closeModal(); App.render();
        U.toast(isNew ? 'Announcement posted — it\'s on the student side of this hub now' : 'Announcement updated');
      },
    }, isNew ? 'Post announcement' : 'Save changes'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal(isNew ? 'New announcement' : 'Edit announcement', body, { sticky: true });
};

/* ---------- assignments ---------- */
DContent.assignmentDialog = function (a) {
  const isNew = !a;
  const body = U.el('div');
  const title = U.input({ value: a ? a.title : '', placeholder: 'e.g. Practice log — week 3' });
  const details = U.textarea({ placeholder: 'Everything students need — always shown in full.' });
  details.value = a ? (a.details || '') : '';
  const due = U.input({ type: 'date', value: a ? (a.due || '') : U.todayYmd() });
  const dueTime = U.input({ type: 'time', value: a ? (a.dueTime || '') : '' });
  const points = U.input({ value: a ? (a.points || '') : '', placeholder: 'e.g. 10', inputmode: 'numeric' });
  const link = U.input({ value: a ? (a.link || '') : '', placeholder: 'https://… (optional)' });
  const picker = DContent.ensemblePicker(a ? a.ensembleIds : []);

  body.appendChild(U.field('Title', title));
  body.appendChild(U.field('Details', details));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Due date', due), U.field('Due time (optional)', dueTime)));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Points (optional)', points), U.field('Link (optional)', link)));
  body.appendChild(U.field('For which ensembles?', picker));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!title.value.trim()) { U.toast('Give it a title', 'error'); return; }
        if (!due.value) { U.toast('Pick a due date', 'error'); return; }
        const ids = picker.value();
        if (ids !== 'all' && !ids.length) { U.toast('Pick at least one ensemble, or check "All ensembles".', 'error'); return; }
        const data = {
          id: a ? a.id : U.uid(),
          title: title.value.trim(), details: details.value.trim(),
          due: due.value, dueTime: dueTime.value || '',
          points: points.value.trim(), link: link.value.trim(),
          ensembleIds: ids === 'all' ? 'all' : ids,
        };
        Store.upsert('assignments', data);
        U.closeModal(); App.render();
        U.toast(isNew ? 'Assignment posted' : 'Assignment updated');
      },
    }, isNew ? 'Post assignment' : 'Save changes'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal(isNew ? 'New assignment' : 'Edit assignment', body, { sticky: true });
};

/* ---------- repertoire ---------- */
DContent.pieceDialog = function (p) {
  const isNew = !p;
  const body = U.el('div');
  const title = U.input({ value: p ? p.title : '', placeholder: 'Title' });
  const composer = U.input({ value: p ? p.composer : '', placeholder: 'Composer' });
  const arranger = U.input({ value: p ? (p.arranger || '') : '', placeholder: 'Arranger (optional)' });
  const ensSel = U.select(Store.ensembles().map(e => ({ value: e.id, label: e.name })),
    p ? p.ensembleId : Store.ensembles()[0].id, null);
  ensSel.classList.add('block');
  const conSel = U.select([{ value: '', label: '— No concert yet —' }]
    .concat(Store.data.concerts.map(c => ({ value: c.id, label: c.title + ' · ' + U.fmtDate(c.date, 'med') }))),
    p ? (p.concertId || '') : '', null);
  conSel.classList.add('block');
  const status = U.select([
    { value: 'Learning', label: 'Learning' },
    { value: 'In rehearsal', label: 'In rehearsal' },
    { value: 'Performing', label: 'Performing' },
    { value: 'Library', label: 'Library / past' },
  ], p ? (p.status || 'Learning') : 'Learning', null);
  const chartSel = U.select([{ value: '', label: '— No seating chart —' }]
    .concat(Store.data.seatingCharts.map(c => ({ value: c.id, label: c.name }))),
    p ? (p.chartId || '') : '', null);
  chartSel.classList.add('block');
  const notes = U.textarea({ placeholder: 'Program notes, spots, bowings… shown in full on the piece page.' });
  notes.value = p ? (p.notes || '') : '';

  body.appendChild(U.field('Title', title));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Composer', composer), U.field('Arranger', arranger)));
  body.appendChild(U.field('Ensemble', ensSel));
  body.appendChild(U.field('Concert', conSel));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Status', status), null));
  body.appendChild(U.field('Seating chart for this piece', chartSel,
    'Attach a chart and its roster appears on the piece page automatically — students see exactly which part/seat is theirs.'));
  body.appendChild(U.field('Notes', notes));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!title.value.trim()) { U.toast('Give the piece a title', 'error'); return; }
        const data = {
          id: p ? p.id : U.uid(),
          title: title.value.trim(), composer: composer.value.trim(), arranger: arranger.value.trim(),
          ensembleId: ensSel.querySelector('select').value,
          concertId: conSel.querySelector('select').value,
          status: status.querySelector('select').value,
          chartId: chartSel.querySelector('select').value,
          notes: notes.value.trim(),
        };
        Store.upsert('repertoire', data);
        U.closeModal(); App.render();
        U.toast(isNew ? 'Piece added' : 'Piece updated');
      },
    }, isNew ? 'Add piece' : 'Save changes'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal(isNew ? 'Add piece' : 'Edit piece', body, { sticky: true });
};

DContent.concertDialog = function (c) {
  const isNew = !c;
  const body = U.el('div');
  const title = U.input({ value: c ? c.title : '', placeholder: 'e.g. Winter Concert' });
  const date = U.input({ type: 'date', value: c ? c.date : '' });
  const time = U.input({ type: 'time', value: c ? (c.time || '') : '' });
  const venue = U.input({ value: c ? (c.venue || '') : '', placeholder: 'Venue' });
  const picker = DContent.ensemblePicker(c ? (c.ensembleIds || []) : []);
  body.appendChild(U.field('Concert title', title));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Date', date), U.field('Time', time)));
  body.appendChild(U.field('Venue', venue));
  body.appendChild(U.field('Ensembles performing', picker));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!title.value.trim() || !date.value) { U.toast('Title and date are required', 'error'); return; }
        const ids = picker.value();
        if (ids !== 'all' && !ids.length) { U.toast('Pick at least one ensemble, or check "All ensembles".', 'error'); return; }
        const data = {
          id: c ? c.id : U.uid(),
          title: title.value.trim(), date: date.value, time: time.value || '',
          venue: venue.value.trim(),
          ensembleIds: ids === 'all' ? Store.ensembles().map(e => e.id) : ids,
        };
        Store.upsert('concerts', data);
        U.closeModal(); App.render();
        U.toast(isNew ? 'Concert created' : 'Concert updated');
      },
    }, isNew ? 'Create concert' : 'Save concert'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal(isNew ? 'New concert' : 'Edit concert', body, { sticky: true });
};

/* =========================================================
   Seating charts — students-first view, then edit.
   Violin 1 and Violin 2 are first-class sections.
   ========================================================= */
const ORCHESTRA_SECTIONS = ['Violin 1', 'Violin 2', 'Viola', 'Cello', 'Bass', 'Flute', 'Oboe', 'Clarinet', 'Bassoon', 'Horn', 'Trumpet', 'Trombone', 'Tuba', 'Percussion', 'Harp / Piano'];
const BAND_SECTIONS = ['Flute', 'Oboe', 'Clarinet', 'Bass Clarinet', 'Bassoon', 'Alto Sax', 'Tenor Sax', 'Bari Sax', 'Horn', 'Trumpet', 'Trombone', 'Euphonium', 'Tuba', 'Percussion'];
const JAZZ_SECTIONS = ['Alto Sax', 'Tenor Sax', 'Bari Sax', 'Trumpet', 'Trombone', 'Rhythm — Piano', 'Rhythm — Guitar', 'Rhythm — Bass', 'Rhythm — Drums'];

Views.director.seating = function (container, arg) {
  if (arg) { DContent.seatingDetail(container, arg); return; }

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Seating Charts'),
      U.el('div', { class: 'page-sub' }, 'Charts open in the student view first — exactly what they\'ll see — then you can edit. Apply a chart to a piece and its roster shows up on the piece page automatically.')),
    U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn primary', onclick: () => DContent.chartDialog(null) }, '+ New chart'))));

  const charts = Store.data.seatingCharts;
  if (!charts.length) {
    container.appendChild(U.empty('🪑', 'No seating charts yet',
      'Create one — Violin 1 and Violin 2 come ready-made for orchestra charts.'));
    return;
  }
  const grid = U.el('div', { class: 'grid-2' });
  for (const chart of charts) {
    const e = Store.ensembleById(chart.ensembleId);
    const seats = chart.sections.reduce((s, sec) => s + sec.seatIds.length, 0);
    const pieces = Store.data.repertoire.filter(p => p.chartId === chart.id);
    const card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'card-title' }, chart.name));
    card.appendChild(U.el('div', { class: 'card-meta' },
      e ? Cards.tagFor({ type: 'ensemble', id: e.id }) : null,
      U.el('span', null, chart.sections.length + ' sections · ' + U.plural(seats, 'seat')),
      chart.updated ? U.el('span', null, '· updated ' + U.relDate(chart.updated)) : null));
    if (pieces.length) {
      card.appendChild(U.el('div', { class: 'card-body hint' },
        'Applied to: ' + pieces.map(p => p.title).join(' · ')));
    }
    card.appendChild(U.el('div', { class: 'card-actions' },
      U.el('a', { class: 'btn sm primary', href: '#/d/seating/' + chart.id }, 'Open (student view)'),
      U.el('button', { class: 'btn sm', onclick: () => DContent.applyChartDialog(chart) }, 'Apply to piece…'),
      U.el('button', {
        class: 'btn sm danger',
        onclick: () => {
          if (!U.confirmBox('Delete chart "' + chart.name + '"? Pieces using it will show no seating.')) return;
          Store.data.seatingCharts = Store.data.seatingCharts.filter(x => x.id !== chart.id);
          for (const p of Store.data.repertoire) if (p.chartId === chart.id) p.chartId = '';
          Store.save(); App.render();
        },
      }, 'Delete')));
    grid.appendChild(card);
  }
  container.appendChild(grid);
};

/* Chart detail: student view FIRST, edit mode behind a button. */
DContent.seatingDetail = function (container, id) {
  const chart = Store.data.seatingCharts.find(c => c.id === id);
  if (!chart) {
    container.appendChild(U.empty('🪑', 'Chart not found'));
    container.appendChild(U.el('div', { style: { textAlign: 'center' } },
      U.el('a', { class: 'btn', href: '#/d/seating' }, '← All charts')));
    return;
  }
  const state = DContent.seatingDetail._state = DContent.seatingDetail._state || {};
  // Student view first on every NAVIGATION here (App.isFreshNav) — but not on
  // same-page re-renders, or every seat edit would kick us out of edit mode.
  if (state.forId !== id || App.isFreshNav) { state.forId = id; state.editing = false; }

  const e = Store.ensembleById(chart.ensembleId);
  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('a', { href: '#/d/seating', class: 'hint' }, '← Seating charts'),
      U.el('div', { class: 'page-title' }, chart.name),
      U.el('div', { class: 'page-sub' },
        (e ? e.name + ' · ' : '') + (state.editing ? 'Editing — students will see the view mode.' : 'This is the student view — exactly what they see on a piece page.'))),
    U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn', onclick: () => DContent.applyChartDialog(chart) }, 'Apply to piece…'),
      U.el('button', {
        class: 'btn ' + (state.editing ? '' : 'primary'),
        onclick: () => { state.editing = !state.editing; App.render(); },
      }, state.editing ? '👁 Done — back to student view' : '✏️ Edit chart'))));

  if (!state.editing) {
    container.appendChild(Cards.seatingView(chart));
    return;
  }

  /* ---- edit mode ---- */
  const roster = Store.activeStudents(chart.ensembleId).sort(U.byLastName);
  const seatedIds = new Set(chart.sections.flatMap(s => s.seatIds));
  const touch = () => { chart.updated = U.todayYmd(); Store.save(); App.render(); };

  const editWrap = U.el('div');
  chart.sections.forEach((sec, si) => {
    const secEl = U.el('div', { class: 'seat-section' });
    const head = U.el('div', { class: 'seat-sec-title' },
      U.el('span', { style: { flex: 1 } }, sec.name),
      U.el('button', { class: 'icon-btn', title: 'Move section up', onclick: () => { if (si > 0) { chart.sections.splice(si, 1); chart.sections.splice(si - 1, 0, sec); touch(); } } }, '↑'),
      U.el('button', { class: 'icon-btn', title: 'Move section down', onclick: () => { if (si < chart.sections.length - 1) { chart.sections.splice(si, 1); chart.sections.splice(si + 1, 0, sec); touch(); } } }, '↓'),
      U.el('button', { class: 'icon-btn', title: 'Rename section', onclick: () => { const n = window.prompt('Section name:', sec.name); if (n && n.trim()) { sec.name = n.trim(); touch(); } } }, '✏️'),
      U.el('button', {
        class: 'icon-btn', title: 'Remove section',
        onclick: () => { if (U.confirmBox('Remove section "' + sec.name + '"?')) { chart.sections.splice(si, 1); touch(); } },
      }, '🗑'));
    secEl.appendChild(head);

    const list = U.el('div', { class: 'seat-list' });
    sec.seatIds.forEach((sid, i) => {
      const st = Store.studentById(sid);
      const label = !st ? '(removed student)'
        : st.status === 'archived'
          ? st.last + ', ' + (st.preferred || st.first) + ' · archived — students see an open seat'
          : st.last + ', ' + (st.preferred || st.first) + (st.instrument ? ' · ' + st.instrument : '');
      list.appendChild(U.el('div', { class: 'seat-item' },
        U.el('span', { class: 'seat-num' }, String(i + 1)),
        U.el('span', { class: 'grow' }, label),
        U.el('span', { class: 'seat-tools' },
          U.el('button', { class: 'icon-btn', title: 'Move up', onclick: () => { if (i > 0) { sec.seatIds.splice(i, 1); sec.seatIds.splice(i - 1, 0, sid); touch(); } } }, '↑'),
          U.el('button', { class: 'icon-btn', title: 'Move down', onclick: () => { if (i < sec.seatIds.length - 1) { sec.seatIds.splice(i, 1); sec.seatIds.splice(i + 1, 0, sid); touch(); } } }, '↓'),
          U.el('button', { class: 'icon-btn', title: 'Remove from chart', onclick: () => { sec.seatIds.splice(i, 1); touch(); } }, '✕'))));
    });
    const unseated = roster.filter(s => !seatedIds.has(s.id));
    const addSel = U.select(
      [{ value: '', label: '+ Seat a student…' }].concat(
        unseated.map(s => ({ value: s.id, label: s.last + ', ' + s.first + (s.instrument ? ' · ' + s.instrument : '') })),
        roster.filter(s => seatedIds.has(s.id)).map(s => ({ value: s.id, label: s.last + ', ' + s.first + ' (move here)' }))),
      '', v => {
        if (!v) return;
        for (const other of chart.sections) other.seatIds = other.seatIds.filter(x => x !== v);
        sec.seatIds.push(v);
        touch();
      });
    list.appendChild(U.el('div', null, addSel));
    secEl.appendChild(list);
    editWrap.appendChild(secEl);
  });

  const newSecName = U.input({ placeholder: 'New section name (e.g. Violin 2)' });
  const presets = U.el('div', { class: 'block-chips', style: { marginTop: '8px' } });
  const presetFor = e && e.id === 'jazz' ? JAZZ_SECTIONS : (e && (e.id === 'we' || e.id === 'cw') ? BAND_SECTIONS : ORCHESTRA_SECTIONS);
  for (const name of presetFor.filter(n => !chart.sections.some(s => U.norm(s.name) === U.norm(n)))) {
    presets.appendChild(U.el('button', {
      class: 'btn sm',
      onclick: () => { chart.sections.push({ name, seatIds: [] }); touch(); },
    }, '+ ' + name));
  }
  editWrap.appendChild(U.el('div', { class: 'seat-section' },
    U.el('div', { class: 'seat-sec-title' }, 'Add a section'),
    U.el('div', { class: 'field-row', style: { marginTop: '8px' } },
      newSecName,
      U.el('button', {
        class: 'btn',
        onclick: () => {
          const n = newSecName.value.trim();
          if (!n) return;
          if (chart.sections.some(s => U.norm(s.name) === U.norm(n))) { U.toast('That section already exists', 'error'); return; }
          chart.sections.push({ name: n, seatIds: [] });
          touch();
        },
      }, 'Add')),
    presets.children.length ? presets : U.el('div', { class: 'hint', style: { marginTop: '8px' } }, 'All preset sections are in use — type a custom name above.')));

  container.appendChild(editWrap);
};

DContent.chartDialog = function () {
  const body = U.el('div');
  const name = U.input({ placeholder: 'e.g. Symphony — spring setup' });
  const ensSel = U.select(Store.ensembles().map(e => ({ value: e.id, label: e.name })), Store.ensembles()[0].id, null);
  ensSel.classList.add('block');
  body.appendChild(U.field('Chart name', name));
  body.appendChild(U.field('Ensemble', ensSel));
  body.appendChild(U.el('div', { class: 'hint' },
    'Orchestra charts start with Violin 1, Violin 2, Viola, Cello, Bass and winds; band and jazz get their own presets. You can rename, add or remove sections while editing.'));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!name.value.trim()) { U.toast('Name the chart', 'error'); return; }
        const eid = ensSel.querySelector('select').value;
        const preset = eid === 'jazz' ? JAZZ_SECTIONS : (eid === 'we' || eid === 'cw') ? BAND_SECTIONS : ORCHESTRA_SECTIONS;
        const chart = {
          id: U.uid(), name: name.value.trim(), ensembleId: eid, updated: U.todayYmd(),
          // Seed the whole instrumentation — empty sections are cheap to
          // delete, missing brass/percussion is annoying to rebuild.
          sections: preset.map(n => ({ name: n, seatIds: [] })),
        };
        Store.data.seatingCharts.push(chart);
        Store.save(); U.closeModal();
        location.hash = '#/d/seating/' + chart.id;
      },
    }, 'Create chart'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal('New seating chart', body);
};

DContent.applyChartDialog = function (chart) {
  const pieces = Store.data.repertoire.filter(p => p.ensembleId === chart.ensembleId);
  const body = U.el('div');
  if (!pieces.length) {
    body.appendChild(U.el('div', { class: 'card-body' },
      'No repertoire for ' + ((Store.ensembleById(chart.ensembleId) || {}).name || 'this ensemble') +
      ' yet. Add a piece first, then apply this chart to it.'));
    body.appendChild(U.el('div', { class: 'card-actions' },
      U.el('button', { class: 'btn', onclick: () => U.closeModal() }, 'OK')));
    U.openModal('Apply to piece', body);
    return;
  }
  body.appendChild(U.el('div', { class: 'card-body' },
    'Pick the piece(s) that use this seating. The chart\'s roster then shows on each piece page — students see exactly which part to look for.'));
  const boxes = pieces.map(p => {
    const cb = U.el('input', { type: 'checkbox' });
    cb.checked = p.chartId === chart.id;
    body.appendChild(U.el('label', { class: 'checkline' }, cb,
      U.el('span', null, U.el('b', null, p.title), ' — ' + p.composer +
        (p.chartId && p.chartId !== chart.id ? ' (currently: ' + ((Store.data.seatingCharts.find(c => c.id === p.chartId) || {}).name || '?') + ')' : ''))));
    return { p, cb };
  });
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        for (const { p, cb } of boxes) {
          // re-resolve by id — Store.data may have been reloaded meanwhile
          const live = Store.data.repertoire.find(x => x.id === p.id);
          if (!live) continue;
          if (cb.checked) live.chartId = chart.id;
          else if (live.chartId === chart.id) live.chartId = '';
        }
        Store.save(); U.closeModal(); App.render();
        U.toast('Seating applied — visible on those piece pages now');
      },
    }, 'Apply'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal('Apply "' + chart.name + '" to pieces', body);
};

/* =========================================================
   QR Kit — posters that point students at the app. Print works.
   ========================================================= */
Views.director.qr = function (container) {
  const s = Store.data.settings;
  const base = (s.baseUrl || '').trim() || (location.origin !== 'null' ? location.origin + location.pathname : '');

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'QR Kit'),
      U.el('div', { class: 'page-sub' }, 'Print-ready codes that send students and families straight to the hub.')),
    U.el('div', { class: 'page-actions' },
      U.el('button', {
        class: 'btn primary',
        onclick: () => {
          document.body.classList.add('printing-qr');
          const done = () => { document.body.classList.remove('printing-qr'); window.removeEventListener('afterprint', done); };
          window.addEventListener('afterprint', done);
          // Fallback for browsers that never fire afterprint
          setTimeout(done, 4000);
          window.print();
        },
      }, '🖨 Print all'))));

  const urlField = U.input({
    value: base,
    placeholder: 'https://your-site/ensembles/',
    onchange: e => { Store.data.settings.baseUrl = e.target.value.trim(); Store.save(); App.render(); },
  });
  container.appendChild(U.el('div', { class: 'card', style: { marginBottom: '14px' } },
    U.field('App address the codes point to', urlField,
      'Auto-filled from where the app is running. Change it if you post the hub somewhere else.'),
    U.el('div', { class: 'hint' },
      'Heads-up: this hub stores its content per device/browser (see Settings → Your data). ',
      'Students scanning a code see the hub at that address with whatever data lives there — ',
      'so keep the posted address pointed at the copy you actually maintain.')));

  const targets = [{ name: (s.appName || 'NWSA Music') + ' — Student Hub', url: base, sub: 'Today\'s schedule, announcements, assignments, repertoire' }]
    .concat(Store.ensembles().map(e => ({
      name: e.name, url: base + '#/calendar/' + e.id, sub: 'Opens the calendar filtered to ' + (e.short || e.name),
    })));

  const grid = U.el('div', { class: 'qr-grid' });
  const sheet = U.el('div', { class: 'qr-print-sheet' });
  const printGrid = U.el('div', { class: 'qr-grid' });
  for (const t of targets) {
    const svg = QR.svg(t.url, 150);
    const card = U.el('div', { class: 'card qr-card' },
      U.el('div', { html: svg }),
      U.el('div', { class: 'qr-name' }, t.name),
      U.el('div', { class: 'qr-url' }, t.url));
    grid.appendChild(card);
    printGrid.appendChild(card.cloneNode(true));
  }
  container.appendChild(grid);

  // Hidden duplicate that becomes the print layout (see @media print CSS).
  sheet.className = 'qr-print-sheet qr-print-only';
  sheet.appendChild(U.el('div', { style: { textAlign: 'center', margin: '10px 0 18px' } },
    U.el('div', { style: { fontSize: '22px', fontWeight: '800' } }, s.appName || 'NWSA Music'),
    U.el('div', null, 'Scan for schedules, announcements, and everything ensemble.')));
  sheet.appendChild(printGrid);
  document.getElementById('print-root').innerHTML = '';
  document.getElementById('print-root').appendChild(sheet);
};

/* =========================================================
   Settings
   ========================================================= */
Views.director.settings = function (container) {
  // Live accessor, not a captured ref — a cross-tab reload swaps Store.data
  // and a stale `s` would silently drop whatever gets typed next.
  const S = () => Store.data.settings;
  const s = S();
  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Settings'),
      U.el('div', { class: 'page-sub' }, 'App identity, director access, blocks, and your data.'))));

  // identity
  const nameIn = U.input({ value: s.appName || '', onchange: e => { S().appName = e.target.value.trim() || 'NWSA Music'; Store.save(); App.render(); } });
  const subIn = U.input({ value: s.subtitle || '', onchange: e => { S().subtitle = e.target.value.trim(); Store.save(); App.render(); } });
  container.appendChild(U.el('div', { class: 'card' },
    U.el('div', { class: 'card-title' }, 'Identity'),
    U.el('div', { style: { marginTop: '10px' } },
      U.field('App name', nameIn),
      U.field('Public subtitle', subIn))));

  // director PIN
  const pin = U.input({ type: 'password', inputmode: 'numeric', placeholder: s.pin ? '••••  (set)' : 'No PIN set', autocomplete: 'new-password' });
  container.appendChild(U.el('div', { class: 'card' },
    U.el('div', { class: 'card-title' }, 'Director access'),
    U.el('div', { class: 'card-body' }, 'A PIN keeps students on the student side. You\'ll be asked once per browser session.'),
    U.el('div', { class: 'field-row', style: { marginTop: '8px' } },
      pin,
      U.el('button', {
        class: 'btn',
        onclick: () => {
          S().pin = pin.value.trim();
          Store.save();
          U.toast(S().pin ? 'PIN set' : 'PIN removed');
          pin.value = '';
        },
      }, 'Save PIN'),
      s.pin ? U.el('button', { class: 'btn ghost', onclick: () => { S().pin = ''; Store.save(); U.toast('PIN removed'); App.render(); } }, 'Remove') : null)));

  // blocks & ensembles
  const blocksCard = U.el('div', { class: 'card' });
  blocksCard.appendChild(U.el('div', { class: 'card-title' }, 'Rehearsal blocks & home blocks'));
  blocksCard.appendChild(U.el('div', { class: 'card-body' },
    'The two school blocks power the one-tap buttons in Schedule Changes.'));
  for (const b of Store.data.blocks) {
    const liveBlock = () => Store.data.blocks.find(x => x.id === b.id) || b;
    const st = U.input({ type: 'time', value: b.start, onchange: e => { const lb = liveBlock(); lb.start = e.target.value || lb.start; Store.cleanupNoopOverrides(); App.render(); } });
    const en = U.input({ type: 'time', value: b.end, onchange: e => { const lb = liveBlock(); lb.end = e.target.value || lb.end; Store.cleanupNoopOverrides(); App.render(); } });
    blocksCard.appendChild(U.el('div', { class: 'field-row', style: { marginTop: '8px', alignItems: 'center' } },
      U.el('b', { style: { flex: '0 0 80px' } }, b.label), st, en));
  }
  blocksCard.appendChild(U.el('hr', { class: 'divider' }));
  for (const e of Store.ensembles()) {
    const sel = U.select(Store.data.blocks.map(b => ({ value: b.id, label: b.label + ' · ' + U.fmtTimeRange(b.start, b.end) })),
      e.blockId, v => {
        const live = Store.ensembleById(e.id);
        if (live) { live.blockId = v; Store.cleanupNoopOverrides(); App.render(); }
      }, { id: 'block-sel-' + e.id });
    blocksCard.appendChild(U.el('div', { class: 'field-row', style: { marginTop: '8px', alignItems: 'center' } },
      U.el('b', { style: { flex: '1' } }, e.name), sel));
  }
  container.appendChild(blocksCard);

  // data
  const dataCard = U.el('div', { class: 'card' });
  dataCard.appendChild(U.el('div', { class: 'card-title' }, 'Your data'));
  dataCard.appendChild(U.el('div', { class: 'card-body' },
    'Everything lives in this browser on this device. Download a backup before switching devices, then restore it there. Rosters and contacts never leave your device.'));
  const fileIn = U.el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const res = Store.importJson(String(r.result || ''));
      if (res.ok) { U.toast('Backup restored'); App.render(); }
      else U.toast(res.error, 'error');
    };
    r.readAsText(f);
  });
  dataCard.appendChild(fileIn);
  dataCard.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn',
      onclick: () => U.download('nwsa-music-backup-' + U.todayYmd() + '.json', Store.exportJson()),
    }, '⬇ Download backup'),
    U.el('button', { class: 'btn', onclick: () => fileIn.click() }, '⬆ Restore backup'),
    U.el('button', {
      class: 'btn',
      onclick: () => {
        if (!U.confirmBox('Load the demo data? This replaces the CONTENT currently on this device (a recovery copy is kept). Your settings and director PIN are not touched.')) return;
        Store.stashRecovery(localStorage.getItem(Store.KEY) || '');
        Store.loadSample(); App.render();
        U.toast('Sample data loaded — explore both sides');
      },
    }, 'Load sample data'),
    U.el('button', {
      class: 'btn danger',
      onclick: () => {
        if (!U.confirmBox('Erase ALL data on this device? A recovery copy is stashed, but download a backup first if this data matters.')) return;
        Store.stashRecovery(localStorage.getItem(Store.KEY) || '');
        Store.data = Store.defaults();
        Store.loadIssues = [];   // a deliberate wipe resolves old warnings
        Store.save(); App.render();
      },
    }, 'Erase everything')));
  container.appendChild(dataCard);

  // recovery stashes
  const recs = Store.recoveryKeys();
  if (recs.length) {
    const rc = U.el('div', { class: 'card' });
    rc.appendChild(U.el('div', { class: 'card-title' }, 'Recovery'));
    rc.appendChild(U.el('div', { class: 'card-body' },
      'Snapshots kept automatically before anything risky (corrupt load, restore, erase).'));
    for (const k of recs) {
      const label = k.replace(Store.RECOVERY_PREFIX, '').replace(/T/, ' ').slice(0, 16);
      rc.appendChild(U.el('div', { class: 'card-actions' },
        U.el('span', { class: 'hint', style: { alignSelf: 'center' } }, label),
        U.el('button', {
          class: 'btn sm',
          onclick: () => { try { U.download('nwsa-music-recovery-' + label + '.json', localStorage.getItem(k) || ''); } catch (e) { U.toast('Could not read that snapshot', 'error'); } },
        }, 'Download'),
        U.el('button', {
          class: 'btn sm',
          onclick: () => {
            if (!U.confirmBox('Restore this snapshot? Current data is stashed first.')) return;
            try {
              const res = Store.importJson(localStorage.getItem(k) || '');
              if (res.ok) { U.toast('Snapshot restored'); App.render(); }
              else U.toast(res.error, 'error');
            } catch (e) { U.toast('Could not restore', 'error'); }
          },
        }, 'Restore')));
    }
    container.appendChild(rc);
  }
};
