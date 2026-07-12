/* NWSA Music — public (student & family) side + shared card renderers.
   Cards always show ALL of an item's information — no truncation anywhere,
   on either side. Directors additionally get edit controls on the same cards. */
'use strict';

/* =========================================================
   Shared building blocks (used by both sides)
   ========================================================= */
const Cards = {};

/* Music-ensemble chip row with per-page memory. Divisions are deliberately
   NOT offered here — they are calendar labels, not classes. */
function ensembleChips(pageKey, value, onChange, opts) {
  opts = opts || {};
  const wrap = U.el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by ensemble' });
  const mk = (val, label, color) => U.el('button', {
    class: 'chip' + (String(value) === String(val) ? ' active' : ''),
    onclick: () => { Store.setFilter(pageKey, val); onChange(val); },
  }, color ? U.el('span', { class: 'swatch', style: { background: color } }) : null, label);
  if (opts.all !== false) wrap.appendChild(mk('all', opts.allLabel || 'All ensembles'));
  for (const e of Store.ensembles()) wrap.appendChild(mk(e.id, e.short || e.name, e.color));
  return wrap;
}

function matchesEnsemble(itemEnsembleIds, filter) {
  if (!filter || filter === 'all') return true;
  if (itemEnsembleIds === 'all' || itemEnsembleIds == null) return true;
  const ids = Array.isArray(itemEnsembleIds) ? itemEnsembleIds : [itemEnsembleIds];
  return ids.length === 0 || ids.includes(filter);
}

Cards.tagFor = function (tag) {
  if (!tag || tag.type === 'all') {
    return U.el('span', { class: 'tag', style: { '--tag-color': 'var(--gold)' } }, 'All ensembles');
  }
  if (tag.type === 'division') {
    const d = Store.divisionById(tag.id);
    return U.el('span', { class: 'tag division', style: { '--tag-color': (d && d.color) || '#888' } }, (d ? d.name : 'Division'));
  }
  const e = Store.ensembleById(tag.id);
  return U.el('span', { class: 'tag', style: { '--tag-color': (e && e.color) || '#888' } }, (e ? e.short || e.name : 'Ensemble'));
};

Cards.ensembleTags = function (ids) {
  if (ids === 'all' || !ids || (Array.isArray(ids) && !ids.length)) {
    return [U.el('span', { class: 'tag', style: { '--tag-color': 'var(--gold)' } }, 'All ensembles')];
  }
  return (Array.isArray(ids) ? ids : [ids]).map(id => Cards.tagFor({ type: 'ensemble', id }));
};

/* ---------- announcement card: everything visible, always ---------- */
Cards.announcement = function (a, opts) {
  opts = opts || {};
  const card = U.el('div', { class: 'card' + (a.pinned ? ' pinned' : '') });
  card.appendChild(U.el('div', { class: 'card-title' }, (a.pinned ? '📌 ' : '') + a.title));
  card.appendChild(U.el('div', { class: 'card-meta' },
    U.el('span', null, 'Posted ' + U.relDate(a.date)),
    Cards.ensembleTags(a.ensembleIds)));
  if ((a.body || '').trim()) {
    card.appendChild(U.el('div', { class: 'card-body', html: U.richText(a.body) }));
  }
  if (opts.director) {
    card.appendChild(U.el('div', { class: 'card-actions' },
      U.el('button', { class: 'btn sm', onclick: () => opts.onEdit(a) }, 'Edit'),
      U.el('button', { class: 'btn sm ghost', onclick: () => opts.onPin(a) }, a.pinned ? 'Unpin' : 'Pin to top'),
      U.el('button', { class: 'btn sm danger', onclick: () => opts.onDelete(a) }, 'Delete')));
  }
  return card;
};

/* ---------- assignment card: everything visible, always ---------- */
Cards.assignment = function (as, opts) {
  opts = opts || {};
  const overdue = U.isPast(as.due);
  const card = U.el('div', { class: 'card' });
  card.appendChild(U.el('div', { class: 'card-title' }, as.title));
  const meta = U.el('div', { class: 'card-meta' },
    U.el('span', null,
      'Due ' + U.relDate(as.due) + (as.dueTime ? ' · ' + U.fmtTime(as.dueTime) : '') + (overdue ? ' (past)' : '')),
    as.points ? U.el('span', null, '· ' + as.points + ' pts') : null,
    Cards.ensembleTags(as.ensembleIds));
  card.appendChild(meta);
  if ((as.details || '').trim()) card.appendChild(U.el('div', { class: 'card-body', html: U.richText(as.details) }));
  if ((as.link || '').trim()) {
    card.appendChild(U.el('div', { class: 'card-body' },
      U.el('a', { href: as.link, target: '_blank', rel: 'noopener' }, as.link)));
  }
  if (opts.director) {
    card.appendChild(U.el('div', { class: 'card-actions' },
      U.el('button', { class: 'btn sm', onclick: () => opts.onEdit(as) }, 'Edit'),
      U.el('button', { class: 'btn sm danger', onclick: () => opts.onDelete(as) }, 'Delete')));
  }
  return card;
};

/* ---------- event card ---------- */
Cards.event = function (ev, opts) {
  opts = opts || {};
  const card = U.el('div', { class: 'card' });
  card.appendChild(U.el('div', { class: 'card-title' }, ev.title));
  card.appendChild(U.el('div', { class: 'card-meta' },
    U.el('span', null, U.fmtRangeDates(ev.date, ev.endDate) + (ev.time ? ' · ' + U.fmtTimeRange(ev.time, ev.endTime) : '')),
    ev.location ? U.el('span', null, '· ' + ev.location) : null,
    Cards.tagFor(ev.tag)));
  if ((ev.details || '').trim()) card.appendChild(U.el('div', { class: 'card-body', html: U.richText(ev.details) }));
  if (opts.director) {
    card.appendChild(U.el('div', { class: 'card-actions' },
      U.el('button', { class: 'btn sm', onclick: () => opts.onEdit(ev) }, 'Edit'),
      U.el('button', { class: 'btn sm danger', onclick: () => opts.onDelete(ev) }, 'Delete')));
  }
  return card;
};

/* ---------- repertoire piece card ---------- */
Cards.piece = function (p, opts) {
  opts = opts || {};
  const e = Store.ensembleById(p.ensembleId);
  const con = Store.data.concerts.find(c => c.id === p.concertId);
  const chart = Store.data.seatingCharts.find(c => c.id === p.chartId);
  const card = U.el('div', { class: 'card' });
  card.appendChild(U.el('div', { class: 'card-title' }, p.title));
  card.appendChild(U.el('div', { class: 'card-meta' },
    U.el('span', null, p.composer + (p.arranger ? ' · ' + p.arranger : '')),
    Cards.tagFor({ type: 'ensemble', id: p.ensembleId }),
    p.status ? U.el('span', { class: 'pill' }, p.status) : null,
    con ? U.el('span', null, '🎤 ' + con.title + ' · ' + U.fmtDate(con.date, 'med')) : null,
    chart ? U.el('span', null, '🪑 Seating: ' + chart.name) : null));
  if ((p.notes || '').trim()) card.appendChild(U.el('div', { class: 'card-body', html: U.richText(p.notes) }));
  const actions = U.el('div', { class: 'card-actions' });
  actions.appendChild(U.el('a', {
    class: 'btn sm', href: (opts.director ? '#/d/repertoire/' : '#/repertoire/') + p.id,
  }, chart ? 'Details & parts' : 'Details'));
  if (opts.director) {
    actions.appendChild(U.el('button', { class: 'btn sm', onclick: () => opts.onEdit(p) }, 'Edit'));
    actions.appendChild(U.el('button', { class: 'btn sm danger', onclick: () => opts.onDelete(p) }, 'Delete'));
  }
  card.appendChild(actions);
  return card;
};

/* ---------- seating chart, student-facing (read-only) ---------- */
Cards.seatingView = function (chart) {
  const wrap = U.el('div');
  wrap.appendChild(U.el('div', { class: 'stage-strip' }, 'Stage / Conductor'));
  for (const sec of chart.sections) {
    const secEl = U.el('div', { class: 'seat-section' });
    secEl.appendChild(U.el('div', { class: 'seat-sec-title' }, sec.name,
      U.el('span', { class: 'hint', style: { textTransform: 'none', letterSpacing: '0' } },
        U.plural(sec.seatIds.length, 'seat'))));
    const list = U.el('div', { class: 'seat-list' });
    sec.seatIds.forEach((sid, i) => {
      const st = Store.studentById(sid);
      list.appendChild(U.el('div', { class: 'seat-item' },
        U.el('span', { class: 'seat-num' }, String(i + 1)),
        U.el('span', { class: 'grow' }, st ? Store.studentName(sid) : '(open seat)'),
        i === 0 ? U.el('span', { class: 'hint' }, sec.name.toLowerCase().startsWith('violin 1') ? 'concertmaster' : 'principal') : null));
    });
    if (!sec.seatIds.length) list.appendChild(U.el('div', { class: 'hint' }, 'No seats assigned yet.'));
    secEl.appendChild(list);
    wrap.appendChild(secEl);
  }
  return wrap;
};

/* Month view helper shared by Announcements / Assignments / Repertoire-by-concert:
   dots on days that have items; clicking a day opens the full cards for it. */
function itemsMonthView(container, opts) {
  const month = opts.month;
  const byDate = opts.byDate; // Map ymd -> [{color, item}]
  container.appendChild(U.monthGrid({
    month,
    onNav: opts.onNav,
    onPick: ymd => {
      const list = byDate.get(ymd) || [];
      if (!list.length) return;
      const body = U.el('div');
      for (const it of list) body.appendChild(opts.renderItem(it.item));
      U.openModal(U.fmtDate(ymd, 'long'), body, { wide: true });
    },
    renderDay: ymd => {
      const list = byDate.get(ymd) || [];
      if (!list.length) return null;
      const dots = U.el('div', { class: 'mcal-dots' });
      list.slice(0, 6).forEach(it => dots.appendChild(U.el('span', { class: 'mcal-dot', style: { '--tag-color': it.color } })));
      if (list.length > 6) dots.appendChild(U.el('span', { class: 'mcal-more' }, '+' + (list.length - 6)));
      return dots;
    },
  }));
  container.appendChild(U.el('div', { class: 'hint', style: { marginTop: '8px' } },
    'Tap a day with dots to see everything for that day.'));
}

/* =========================================================
   Calendar page (shared renderer; director gets add/edit)
   ========================================================= */
function calendarPage(container, opts) {
  opts = opts || {};
  const pageKey = opts.director ? 'd_calendar' : 'pub_calendar';
  const state = calendarPage._state = calendarPage._state || {};
  state.month = state.month || U.todayYmd().slice(0, 7);
  state.mode = state.mode || 'month';
  const filter = Store.getFilter(pageKey, 'all');

  const head = U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Calendar'),
      U.el('div', { class: 'page-sub' }, opts.director
        ? 'Concerts, events and dates for every division — but only music ensembles are classes here.'
        : 'Every date that matters — rehearsals, concerts, and shared-stage events.')),
    opts.director ? U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn primary', onclick: () => DSchedule.eventDialog(null, () => App.render()) }, '+ Add event')) : null);
  container.appendChild(head);

  // toolbar: Show <dropdown with visible chevron> + view toggle
  const toolbar = U.el('div', { class: 'toolbar' });
  toolbar.appendChild(U.el('span', { class: 'toolbar-label' }, 'Show:'));
  const showOptions = [{ value: 'all', label: 'All ensembles & divisions' }]
    .concat(Store.ensembles().map(e => ({ value: e.id, label: e.name })));
  toolbar.appendChild(U.select(showOptions, filter, v => { Store.setFilter(pageKey, v); App.render(); }));
  toolbar.appendChild(U.el('span', { class: 'grow' }));
  toolbar.appendChild(U.segmented(
    [{ value: 'month', label: 'Month' }, { value: 'list', label: 'List' }],
    state.mode, v => { state.mode = v; App.render(); }));
  container.appendChild(toolbar);

  // Build calendar items: events + concerts + assignment due dates (+ changed days marker)
  const items = [];
  for (const ev of Store.data.events) {
    const tag = ev.tag || { type: 'all' };
    if (filter !== 'all') {
      if (tag.type === 'division') continue;              // divisions only under "All"
      if (tag.type === 'ensemble' && tag.id !== filter) continue;
    }
    const color = tag.type === 'division' ? (Store.divisionById(tag.id) || {}).color
      : tag.type === 'ensemble' ? (Store.ensembleById(tag.id) || {}).color : '#b48c3c';
    const span = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
    for (let d = ev.date; d <= span; d = U.addDays(d, 1)) {
      items.push({ date: d, kind: 'event', title: ev.title, color: color || '#888', division: tag.type === 'division', item: ev });
      if (d > U.addDays(ev.date, 60)) break; // guard against runaway ranges
    }
  }
  for (const con of Store.data.concerts) {
    if (filter !== 'all' && !(con.ensembleIds || []).includes(filter)) continue;
    items.push({ date: con.date, kind: 'concert', title: '🎤 ' + con.title, color: 'var-gold', item: con });
  }
  const byDate = new Map();
  for (const it of items) {
    if (!byDate.has(it.date)) byDate.set(it.date, []);
    byDate.get(it.date).push(it);
  }

  const openDay = ymd => {
    const list = byDate.get(ymd) || [];
    const changed = Store.data.scheduleChanges[ymd];
    if (!list.length && !changed) return;
    const body = U.el('div');
    if (changed && Object.keys(changed.changes || {}).length) {
      body.appendChild(U.el('div', { class: 'card' },
        U.el('div', { class: 'card-title' }, '🕐 Rehearsal times changed this day'),
        U.el('div', { class: 'card-body' }, DSchedule.describeDay(ymd)),
        opts.director ? U.el('div', { class: 'card-actions' },
          U.el('a', { class: 'btn sm', href: '#/d/schedule/' + ymd, onclick: () => U.closeModal() }, 'Open in Schedule Changes')) : null));
    }
    for (const it of list) {
      if (it.kind === 'concert') {
        const con = it.item;
        body.appendChild(U.el('div', { class: 'card' },
          U.el('div', { class: 'card-title' }, '🎤 ' + con.title),
          U.el('div', { class: 'card-meta' },
            U.el('span', null, U.fmtDate(con.date, 'med') + (con.time ? ' · ' + U.fmtTime(con.time) : '')),
            con.venue ? U.el('span', null, '· ' + con.venue) : null,
            (con.ensembleIds || []).map(id => Cards.tagFor({ type: 'ensemble', id })))));
      } else {
        body.appendChild(Cards.event(it.item, opts.director ? {
          director: true,
          onEdit: ev => { U.closeModal(); DSchedule.eventDialog(ev, () => App.render()); },
          onDelete: ev => {
            if (!U.confirmBox('Delete "' + ev.title + '"?')) return;
            Store.data.events = Store.data.events.filter(x => x.id !== ev.id);
            Store.save(); U.closeModal(); App.render();
          },
        } : {}));
      }
    }
    U.openModal(U.fmtDate(ymd, 'long'), body, { wide: true });
  };

  if (state.mode === 'month') {
    container.appendChild(U.monthGrid({
      month: state.month,
      onNav: m => { state.month = m; App.render(); },
      onPick: openDay,
      renderDay: ymd => {
        const list = byDate.get(ymd) || [];
        const changed = !!(Store.data.scheduleChanges[ymd] && Object.keys(Store.data.scheduleChanges[ymd].changes || {}).length);
        if (!list.length && !changed) return null;
        const box = U.el('div');
        if (changed) box.appendChild(U.el('span', { class: 'mcal-evt', style: { '--tag-color': 'var(--gold)' } }, '🕐 time change'));
        list.slice(0, 3).forEach(it => box.appendChild(
          U.el('span', {
            class: 'mcal-evt' + (it.division ? ' division' : ''),
            style: { '--tag-color': it.color === 'var-gold' ? 'var(--gold)' : it.color },
          }, it.title)));
        if (list.length > 3) box.appendChild(U.el('span', { class: 'mcal-more' }, '+' + (list.length - 3) + ' more'));
        const dots = U.el('div', { class: 'mcal-dots', style: { display: 'none' } });
        list.slice(0, 5).forEach(it => dots.appendChild(U.el('span', { class: 'mcal-dot', style: { '--tag-color': it.color === 'var-gold' ? 'var(--gold)' : it.color } })));
        box.appendChild(dots);
        return box;
      },
    }));
    // Division legend, so the dashed labels are self-explanatory
    const legend = U.el('div', { class: 'toolbar', style: { marginTop: '10px' } },
      U.el('span', { class: 'hint' }, 'Also on this calendar:'),
      Store.divisions().map(d => U.el('span', { class: 'tag division', style: { '--tag-color': d.color } }, d.name)),
      U.el('span', { class: 'hint' }, '— shared dates from other divisions (not music classes).'));
    if (filter === 'all') container.appendChild(legend);
  } else {
    // list view: upcoming items grouped by date
    const dates = Array.from(byDate.keys()).sort();
    const today = U.todayYmd();
    const upcoming = dates.filter(d => d >= today);
    const past = dates.filter(d => d < today).reverse();
    const listWrap = U.el('div', { class: 'rowlist' });
    const addRows = (dateList, label) => {
      if (!dateList.length) return;
      listWrap.appendChild(U.el('div', { class: 'section-label' }, label));
      for (const d of dateList) {
        for (const it of byDate.get(d)) {
          const dp = U.parseYmd(d);
          listWrap.appendChild(U.el('div', { class: 'rowitem clickable', onclick: () => openDay(d) },
            U.el('div', { class: 'date-pill' + (d < today ? ' past' : '') },
              U.el('div', { class: 'dp-mon' }, dp.toLocaleDateString('en-US', { month: 'short' })),
              U.el('div', { class: 'dp-day' }, String(dp.getDate()))),
            U.el('div', { class: 'row-main' },
              U.el('div', { class: 'row-title' }, it.title),
              U.el('div', { class: 'row-sub' }, U.fmtDate(d, 'med') +
                (it.item.time ? ' · ' + U.fmtTimeRange(it.item.time, it.item.endTime) : '') +
                (it.item.location || it.item.venue ? ' · ' + (it.item.location || it.item.venue) : ''))),
            it.kind === 'concert' ? U.el('span', { class: 'tag', style: { '--tag-color': 'var(--gold)' } }, 'Concert')
              : (it.division ? Cards.tagFor(it.item.tag) : Cards.tagFor(it.item.tag))));
        }
      }
    };
    addRows(upcoming, 'Upcoming');
    addRows(past, 'Past');
    if (!dates.length) listWrap.appendChild(U.empty('🗓️', 'Nothing on the calendar yet', opts.director ? 'Add an event to get started.' : 'Check back soon.'));
    container.appendChild(listWrap);
  }
}

/* =========================================================
   Announcements page (shared; director passes editable=true)
   ========================================================= */
function announcementsPage(container, opts) {
  opts = opts || {};
  const pageKey = opts.director ? 'd_news' : 'pub_news';
  const state = announcementsPage._state = announcementsPage._state || {};
  state.mode = state.mode || 'list';
  state.month = state.month || U.todayYmd().slice(0, 7);
  const filter = Store.getFilter(pageKey, 'all');

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Announcements'),
      U.el('div', { class: 'page-sub' }, opts.director
        ? 'Everything is shown in full — edit or pin any card below.'
        : 'Full details, always — nothing hidden behind a tap.')),
    opts.director ? U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn primary', onclick: () => DContent.announcementDialog(null) }, '+ New announcement')) : null));

  const toolbar = U.el('div', { class: 'toolbar' });
  toolbar.appendChild(ensembleChips(pageKey, filter, () => App.render()));
  toolbar.appendChild(U.el('span', { class: 'grow' }));
  toolbar.appendChild(U.segmented(
    [{ value: 'list', label: 'List' }, { value: 'month', label: 'Month' }],
    state.mode, v => { state.mode = v; App.render(); }));
  container.appendChild(toolbar);

  const all = Store.data.announcements
    .filter(a => matchesEnsemble(a.ensembleIds, filter))
    .sort((a, b) => (b.pinned - a.pinned) || (a.date < b.date ? 1 : -1));

  const dirOpts = opts.director ? {
    director: true,
    onEdit: a => DContent.announcementDialog(a),
    onPin: a => { a.pinned = !a.pinned; Store.save(); App.render(); },
    onDelete: a => {
      if (!U.confirmBox('Delete announcement "' + a.title + '"?')) return;
      Store.data.announcements = Store.data.announcements.filter(x => x.id !== a.id);
      Store.save(); App.render();
    },
  } : {};

  if (!all.length) {
    container.appendChild(U.empty('📣', 'No announcements' + (filter !== 'all' ? ' for this ensemble' : ''),
      opts.director ? 'Post one — it appears on the student side instantly.' : null));
    return;
  }

  if (state.mode === 'list') {
    for (const a of all) container.appendChild(Cards.announcement(a, dirOpts));
  } else {
    const byDate = new Map();
    for (const a of all) {
      if (!byDate.has(a.date)) byDate.set(a.date, []);
      byDate.get(a.date).push({ color: 'var(--gold)', item: a });
    }
    itemsMonthView(container, {
      month: state.month,
      onNav: m => { state.month = m; App.render(); },
      byDate,
      renderItem: a => Cards.announcement(a, dirOpts),
    });
  }
}

/* =========================================================
   Assignments page (shared)
   ========================================================= */
function assignmentsPage(container, opts) {
  opts = opts || {};
  const pageKey = opts.director ? 'd_assignments' : 'pub_assignments';
  const state = assignmentsPage._state = assignmentsPage._state || {};
  state.mode = state.mode || 'list';
  state.month = state.month || U.todayYmd().slice(0, 7);
  const filter = Store.getFilter(pageKey, 'all');

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Assignments'),
      U.el('div', { class: 'page-sub' }, 'Every assignment with its full details' + (opts.director ? ' — edit any card.' : '.'))),
    opts.director ? U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn primary', onclick: () => DContent.assignmentDialog(null) }, '+ New assignment')) : null));

  const toolbar = U.el('div', { class: 'toolbar' });
  toolbar.appendChild(ensembleChips(pageKey, filter, () => App.render()));
  toolbar.appendChild(U.el('span', { class: 'grow' }));
  toolbar.appendChild(U.segmented(
    [{ value: 'list', label: 'List' }, { value: 'month', label: 'Month' }],
    state.mode, v => { state.mode = v; App.render(); }));
  container.appendChild(toolbar);

  const all = Store.data.assignments
    .filter(a => matchesEnsemble(a.ensembleIds, filter))
    .sort((a, b) => (a.due || '') < (b.due || '') ? -1 : 1);

  const dirOpts = opts.director ? {
    director: true,
    onEdit: a => DContent.assignmentDialog(a),
    onDelete: a => {
      if (!U.confirmBox('Delete assignment "' + a.title + '"?')) return;
      Store.data.assignments = Store.data.assignments.filter(x => x.id !== a.id);
      Store.save(); App.render();
    },
  } : {};

  if (!all.length) {
    container.appendChild(U.empty('📝', 'No assignments' + (filter !== 'all' ? ' for this ensemble' : ''),
      opts.director ? 'Post one from the button above.' : 'Nothing due — enjoy it.'));
    return;
  }

  if (state.mode === 'list') {
    const today = U.todayYmd();
    const up = all.filter(a => (a.due || today) >= today);
    const past = all.filter(a => (a.due || today) < today).reverse();
    if (up.length) container.appendChild(U.el('div', { class: 'section-label' }, 'Open'));
    for (const a of up) container.appendChild(Cards.assignment(a, dirOpts));
    if (past.length) container.appendChild(U.el('div', { class: 'section-label' }, 'Past due date'));
    for (const a of past) container.appendChild(Cards.assignment(a, dirOpts));
  } else {
    const byDate = new Map();
    for (const a of all) {
      if (!a.due) continue;
      if (!byDate.has(a.due)) byDate.set(a.due, []);
      const color = (Array.isArray(a.ensembleIds) && a.ensembleIds.length === 1)
        ? (Store.ensembleById(a.ensembleIds[0]) || {}).color : 'var(--gold)';
      byDate.get(a.due).push({ color: color || 'var(--gold)', item: a });
    }
    itemsMonthView(container, {
      month: state.month,
      onNav: m => { state.month = m; App.render(); },
      byDate,
      renderItem: a => Cards.assignment(a, dirOpts),
    });
  }
}

/* =========================================================
   Repertoire page (shared) — By Ensemble | By Concert
   ========================================================= */
function repertoirePage(container, opts) {
  opts = opts || {};
  const pageKey = opts.director ? 'd_repertoire' : 'pub_repertoire';
  const state = repertoirePage._state = repertoirePage._state || {};
  state.tab = state.tab || 'ensemble';
  state.mode = state.mode || 'list';
  state.month = state.month || U.todayYmd().slice(0, 7);
  const filter = Store.getFilter(pageKey, 'all');

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Repertoire'),
      U.el('div', { class: 'page-sub' }, 'What each ensemble is playing — with parts and seating when applied.')),
    opts.director ? U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn', onclick: () => DContent.concertDialog(null) }, '+ Concert'),
      U.el('button', { class: 'btn primary', onclick: () => DContent.pieceDialog(null) }, '+ Add piece')) : null));

  container.appendChild(U.el('div', { class: 'toolbar' },
    U.segmented([{ value: 'ensemble', label: 'By Ensemble' }, { value: 'concert', label: 'By Concert' }],
      state.tab, v => { state.tab = v; App.render(); })));

  const toolbar = U.el('div', { class: 'toolbar' });
  toolbar.appendChild(ensembleChips(pageKey, filter, () => App.render()));
  if (state.tab === 'concert') {
    toolbar.appendChild(U.el('span', { class: 'grow' }));
    toolbar.appendChild(U.segmented(
      [{ value: 'list', label: 'List' }, { value: 'month', label: 'Month' }],
      state.mode, v => { state.mode = v; App.render(); }));
  }
  container.appendChild(toolbar);

  const dirOpts = opts.director ? {
    director: true,
    onEdit: p => DContent.pieceDialog(p),
    onDelete: p => {
      if (!U.confirmBox('Remove "' + p.title + '" from repertoire?')) return;
      Store.data.repertoire = Store.data.repertoire.filter(x => x.id !== p.id);
      Store.save(); App.render();
    },
  } : {};

  if (state.tab === 'ensemble') {
    const groups = filter === 'all' ? Store.ensembles() : [Store.ensembleById(filter)].filter(Boolean);
    let any = false;
    for (const e of groups) {
      const pieces = Store.data.repertoire.filter(p => p.ensembleId === e.id);
      if (!pieces.length) continue;
      any = true;
      container.appendChild(U.el('div', { class: 'section-label' }, e.name));
      const grid = U.el('div', { class: 'grid-2' });
      for (const p of pieces) grid.appendChild(Cards.piece(p, dirOpts));
      container.appendChild(grid);
    }
    if (!any) container.appendChild(U.empty('🎼', 'No repertoire yet' + (filter !== 'all' ? ' for this ensemble' : ''),
      opts.director ? 'Add a piece from the button above.' : null));
  } else {
    // By concert
    const cons = Store.data.concerts
      .filter(c => filter === 'all' || (c.ensembleIds || []).includes(filter))
      .sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
    if (!cons.length) {
      container.appendChild(U.empty('🎤', 'No concerts yet' + (filter !== 'all' ? ' for this ensemble' : ''),
        opts.director ? 'Create a concert, then attach pieces to it.' : null));
      return;
    }
    if (state.mode === 'month') {
      const byDate = new Map();
      for (const c of cons) {
        if (!c.date) continue;
        if (!byDate.has(c.date)) byDate.set(c.date, []);
        byDate.get(c.date).push({ color: 'var(--gold)', item: c });
      }
      itemsMonthView(container, {
        month: state.month,
        onNav: m => { state.month = m; App.render(); },
        byDate,
        renderItem: c => renderConcertCard(c, filter, dirOpts, opts),
      });
    } else {
      for (const c of cons) container.appendChild(renderConcertCard(c, filter, dirOpts, opts));
    }
  }
}

function renderConcertCard(con, filter, dirOpts, opts) {
  const card = U.el('div', { class: 'card' });
  card.appendChild(U.el('div', { class: 'card-title' }, '🎤 ' + con.title));
  card.appendChild(U.el('div', { class: 'card-meta' },
    U.el('span', null, U.fmtDate(con.date, 'long') + (con.time ? ' · ' + U.fmtTime(con.time) : '')),
    con.venue ? U.el('span', null, '· ' + con.venue) : null,
    (con.ensembleIds || []).map(id => Cards.tagFor({ type: 'ensemble', id }))));
  const pieces = Store.data.repertoire.filter(p => p.concertId === con.id)
    .filter(p => filter === 'all' || p.ensembleId === filter);
  if (pieces.length) {
    const body = U.el('div', { class: 'card-body' });
    for (const p of pieces) {
      body.appendChild(U.el('div', { class: 'rowitem', style: { marginTop: '6px' } },
        U.el('div', { class: 'row-main' },
          U.el('div', { class: 'row-title' }, p.title),
          U.el('div', { class: 'row-sub' }, p.composer + (p.arranger ? ' · ' + p.arranger : ''))),
        Cards.tagFor({ type: 'ensemble', id: p.ensembleId }),
        U.el('a', { class: 'btn sm', href: (opts.director ? '#/d/repertoire/' : '#/repertoire/') + p.id }, 'Open')));
    }
    card.appendChild(body);
  } else {
    card.appendChild(U.el('div', { class: 'card-body hint' }, 'No pieces attached to this concert yet.'));
  }
  if (opts.director) {
    card.appendChild(U.el('div', { class: 'card-actions' },
      U.el('button', { class: 'btn sm', onclick: () => DContent.concertDialog(con) }, 'Edit concert'),
      U.el('button', {
        class: 'btn sm danger',
        onclick: () => {
          if (!U.confirmBox('Delete concert "' + con.title + '"? Pieces stay in the repertoire.')) return;
          Store.data.concerts = Store.data.concerts.filter(c => c.id !== con.id);
          for (const p of Store.data.repertoire) if (p.concertId === con.id) p.concertId = '';
          Store.save(); App.render();
        },
      }, 'Delete')));
  }
  return card;
}

/* Piece detail — shared. Shows the applied seating roster so students know
   exactly which part/seat to look for. */
function pieceDetailPage(container, id, opts) {
  opts = opts || {};
  const p = Store.data.repertoire.find(x => x.id === id);
  if (!p) {
    container.appendChild(U.empty('🎼', 'That piece is no longer in the repertoire'));
    container.appendChild(U.el('div', { style: { textAlign: 'center' } },
      U.el('a', { class: 'btn', href: opts.director ? '#/d/repertoire' : '#/repertoire' }, '← Back to repertoire')));
    return;
  }
  const e = Store.ensembleById(p.ensembleId);
  const con = Store.data.concerts.find(c => c.id === p.concertId);
  const chart = Store.data.seatingCharts.find(c => c.id === p.chartId);

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('a', { href: opts.director ? '#/d/repertoire' : '#/repertoire', class: 'hint' }, '← Repertoire'),
      U.el('div', { class: 'page-title' }, p.title),
      U.el('div', { class: 'page-sub' }, p.composer + (p.arranger ? ' · ' + p.arranger : ''))),
    opts.director ? U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn', onclick: () => DContent.pieceDialog(p) }, 'Edit piece')) : null));

  const meta = U.el('div', { class: 'card' });
  const kv = U.el('dl', { class: 'kv' });
  kv.appendChild(U.el('dt', null, 'Ensemble'));
  kv.appendChild(U.el('dd', null, e ? e.name : '—'));
  if (con) {
    kv.appendChild(U.el('dt', null, 'Concert'));
    kv.appendChild(U.el('dd', null, con.title + ' — ' + U.fmtDate(con.date, 'long') + (con.venue ? ' · ' + con.venue : '')));
  }
  if (p.status) { kv.appendChild(U.el('dt', null, 'Status')); kv.appendChild(U.el('dd', null, p.status)); }
  meta.appendChild(kv);
  if ((p.notes || '').trim()) meta.appendChild(U.el('div', { class: 'card-body', html: U.richText(p.notes) }));
  container.appendChild(meta);

  container.appendChild(U.el('div', { class: 'section-label' }, 'Parts & seating for this piece'));
  if (chart) {
    const chartCard = U.el('div', { class: 'card' });
    chartCard.appendChild(U.el('div', { class: 'card-meta' },
      U.el('span', null, '🪑 ' + chart.name),
      opts.director ? U.el('a', { class: 'btn sm', href: '#/d/seating/' + chart.id }, 'Open chart') : null));
    chartCard.appendChild(U.el('div', { style: { marginTop: '10px' } }, Cards.seatingView(chart)));
    container.appendChild(chartCard);
  } else {
    container.appendChild(U.el('div', { class: 'card hint' },
      opts.director
        ? 'No seating chart applied. Open Seating Charts, then use "Apply to piece" to attach one — it will appear here and on the student side automatically.'
        : 'Seating for this piece has not been posted yet.'));
  }
}

/* =========================================================
   Public: Today
   ========================================================= */
Views.public.today = function (container) {
  const today = U.todayYmd();
  const sched = Store.effectiveScheduleFor(today);
  const dayNote = (Store.data.scheduleChanges[today] || {}).note;

  const hero = U.el('div', { class: 'hero' });
  hero.appendChild(U.el('div', { class: 'hero-date' }, U.fmtDate(today, 'long')));
  hero.appendChild(U.el('div', { class: 'hero-title' }, 'Today\'s rehearsals'));
  const list = U.el('div', { class: 'hero-sched' });
  for (const row of sched) {
    const r = U.el('div', { class: 'hero-row' + (row.cancelled ? ' cancelled' : '') });
    const t = U.el('span', { class: 'ht' });
    if (row.cancelled) t.textContent = '—';
    else {
      t.textContent = U.fmtTimeRange(row.start, row.end);
      if (row.changed) t.appendChild(U.el('span', { class: 'was' }, U.fmtTimeRange(row.baseStart, row.baseEnd)));
    }
    r.appendChild(t);
    r.appendChild(U.el('span', { class: 'hname', style: { flex: 1 } }, row.ensemble.name));
    if (row.cancelled) r.appendChild(U.el('span', { class: 'badge cancelled' }, 'No rehearsal'));
    else if (row.changed) r.appendChild(U.el('span', { class: 'badge changed' }, 'Time changed'));
    list.appendChild(r);
  }
  hero.appendChild(list);
  if (dayNote) hero.appendChild(U.el('div', { class: 'hero-note' }, '📝 ' + dayNote));
  container.appendChild(hero);

  // Pinned + recent announcements (full cards)
  const pinned = Store.data.announcements.filter(a => a.pinned);
  const recent = Store.data.announcements.filter(a => !a.pinned).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 2);
  if (pinned.length || recent.length) {
    container.appendChild(U.el('div', { class: 'section-label' }, 'Announcements'));
    for (const a of pinned.concat(recent)) container.appendChild(Cards.announcement(a, {}));
    container.appendChild(U.el('div', { style: { marginTop: '8px' } },
      U.el('a', { class: 'btn sm ghost', href: '#/news' }, 'All announcements →')));
  }

  // Due soon
  const soon = Store.data.assignments
    .filter(a => a.due && a.due >= today && a.due <= U.addDays(today, 7))
    .sort((a, b) => a.due < b.due ? -1 : 1);
  if (soon.length) {
    container.appendChild(U.el('div', { class: 'section-label' }, 'Due in the next 7 days'));
    for (const a of soon) container.appendChild(Cards.assignment(a, {}));
  }

  // Coming up (events & concerts, 14 days)
  const upcoming = [];
  for (const ev of Store.data.events) {
    if (ev.date >= today && ev.date <= U.addDays(today, 14)) upcoming.push({ date: ev.date, node: Cards.event(ev, {}) });
  }
  for (const con of Store.data.concerts) {
    if (con.date >= today && con.date <= U.addDays(today, 14)) {
      upcoming.push({ date: con.date, node: renderConcertCard(con, 'all', {}, {}) });
    }
  }
  if (upcoming.length) {
    container.appendChild(U.el('div', { class: 'section-label' }, 'Coming up'));
    upcoming.sort((a, b) => a.date < b.date ? -1 : 1).forEach(u => container.appendChild(u.node));
  }
};

Views.public.calendar = function (container, arg) {
  // Deep link from the QR kit: #/calendar/<ensembleId> pre-selects that filter.
  if (arg && Store.ensembleById(arg)) {
    Store.setFilter('pub_calendar', arg);
    history.replaceState(null, '', '#/calendar');
  }
  calendarPage(container, { director: false });
};
Views.public.news = container => announcementsPage(container, { director: false });
Views.public.assignments = container => assignmentsPage(container, { director: false });
Views.public.repertoire = (container, arg) =>
  arg ? pieceDetailPage(container, arg, { director: false }) : repertoirePage(container, { director: false });
