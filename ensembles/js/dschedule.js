/* NWSA Music — Director Panel: calendar events, schedule changes,
   temporary roster changes (the feature formerly called "Subs & Pull-Outs").
   Global `DSchedule`. */
'use strict';

const DSchedule = {};

/* =========================================================
   Director calendar (shared renderer + event dialog)
   ========================================================= */
Views.director.calendar = container => calendarPage(container, { director: true });

DSchedule.eventDialog = function (ev, onDone) {
  const isNew = !ev;
  const body = U.el('div');
  const title = U.input({ value: ev ? ev.title : '', placeholder: 'e.g. Sectionals — brass' });
  const date = U.input({ type: 'date', value: ev ? ev.date : U.todayYmd() });
  const endDate = U.input({ type: 'date', value: ev ? (ev.endDate || '') : '' });
  const time = U.input({ type: 'time', value: ev ? (ev.time || '') : '' });
  const endTime = U.input({ type: 'time', value: ev ? (ev.endTime || '') : '' });
  const location = U.input({ value: ev ? (ev.location || '') : '', placeholder: 'Room / venue' });
  const details = U.textarea({ placeholder: 'Anything students and families should know — shown in full, everywhere.' });
  details.value = ev ? (ev.details || '') : '';

  // Tag: music ensembles as real classes; divisions as calendar-only labels.
  const tagOptions = [{ value: 'all', label: 'All ensembles' }]
    .concat(Store.ensembles().map(e => ({ value: 'ensemble:' + e.id, label: e.name })))
    .concat(Store.divisions().map(d => ({ value: 'division:' + d.id, label: d.name + ' (label only — not a music class)' })));
  const curTag = ev && ev.tag
    ? (ev.tag.type === 'all' ? 'all' : ev.tag.type + ':' + ev.tag.id)
    : 'all';
  const tagSel = U.select(tagOptions, curTag, null);
  tagSel.classList.add('block');

  body.appendChild(U.field('Event title', title));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Date', date), U.field('Last day (optional)', endDate)));
  body.appendChild(U.el('div', { class: 'field-row' }, U.field('Start (optional)', time), U.field('End', endTime)));
  body.appendChild(U.field('Location', location));
  body.appendChild(U.field('Shows under', tagSel,
    'Dance / Theater / Visual Arts appear on the calendar as labels only — they never become ensembles or filters anywhere else.'));
  body.appendChild(U.field('Details', details));

  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!title.value.trim()) { U.toast('Give the event a title', 'error'); return; }
        if (!date.value) { U.toast('Pick a date', 'error'); return; }
        if (endDate.value && endDate.value < date.value) { U.toast('Last day is before the first day', 'error'); return; }
        if (endDate.value && endDate.value > U.addDays(date.value, 180)) {
          U.toast('Multi-day events are capped at 180 days — split longer spans into separate events.', 'error'); return;
        }
        const v = tagSel.querySelector('select').value;
        const tag = v === 'all' ? { type: 'all' } : { type: v.split(':')[0], id: v.split(':')[1] };
        const data = {
          id: ev ? ev.id : U.uid(),
          title: title.value.trim(), date: date.value, endDate: endDate.value || '',
          time: time.value || '', endTime: endTime.value || '',
          location: location.value.trim(), tag, details: details.value.trim(),
        };
        Store.upsert('events', data);
        U.closeModal();
        if (onDone) onDone();
        U.toast(isNew ? 'Event added to the calendar' : 'Event updated');
      },
    }, isNew ? 'Add event' : 'Save event'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));

  U.openModal(isNew ? 'Add calendar event' : 'Edit event', body, { sticky: true });
};

/* =========================================================
   Schedule Changes — Day editor (default) | Month | List
   The whole day mixes up, not just two ensembles: every ensemble gets its
   own block buttons, a one-tap Block swap, custom times, or no-rehearsal.
   ========================================================= */
DSchedule.describeDay = function (date) {
  const parts = [];
  for (const row of Store.effectiveScheduleFor(date)) {
    if (!row.changed) continue;
    if (row.cancelled) parts.push(row.ensemble.short + ': no rehearsal');
    else parts.push(row.ensemble.short + ' → ' + U.fmtTimeRange(row.start, row.end));
  }
  const note = (Store.data.scheduleChanges[date] || {}).note;
  let s = parts.join(' · ') || 'No time changes';
  if (note) s += ' — “' + note + '”';
  return s;
};

/* Swap one ensemble to the opposite block (as an override on `date`).
   If the result equals its normal time, the override is simply removed. */
DSchedule.blockSwap = function (date, ensemble) {
  const blocks = Store.data.blocks;
  const eff = Store.effectiveScheduleFor(date).find(r => r.ensemble.id === ensemble.id);
  const base = Store.baseTimes(ensemble);
  let target;
  if (eff.cancelled) {
    target = blocks.find(b => b.id !== base.blockId) || blocks[0];
  } else {
    const curBlock = blocks.find(b => b.start === eff.start && b.end === eff.end);
    target = curBlock
      ? blocks.find(b => b.id !== curBlock.id) || blocks[0]
      : blocks.find(b => b.id !== base.blockId) || blocks[0];
  }
  if (target.start === base.start && target.end === base.end) {
    Store.setScheduleChange(date, ensemble.id, null);       // back to normal
  } else {
    Store.setScheduleChange(date, ensemble.id, { start: target.start, end: target.end });
  }
};

Views.director.schedule = function (container, arg) {
  const state = Views.director.schedule._state = Views.director.schedule._state || {};
  if (arg && U.parseYmd(arg)) {
    state.date = arg; state.mode = 'day';
    history.replaceState(null, '', '#/d/schedule');
    App.syncRouteKey();   // else the next re-render looks "fresh" and snaps back to today
  } else if (App.isFreshNav || !state.mode) {
    // Fresh visits land on today's Day editor — the default.
    state.mode = 'day';
    state.date = U.todayYmd();
    state.month = U.todayYmd().slice(0, 7);
  }
  const blocks = Store.data.blocks;

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Schedule Changes'),
      U.el('div', { class: 'page-sub' },
        'When one ensemble moves, the whole day usually mixes up — every ensemble below gets its own block buttons, a one-tap block swap, or custom times. Changed days are easy to spot and easy to undo.'))));

  container.appendChild(U.el('div', { class: 'toolbar' },
    U.segmented([{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'list', label: 'List' }],
      state.mode, v => { state.mode = v; App.render(); })));

  if (state.mode === 'day') {
    const dateInput = U.input({ type: 'date', value: state.date, style: { maxWidth: '170px' } });
    dateInput.addEventListener('change', () => { if (dateInput.value) { state.date = dateInput.value; App.render(); } });
    container.appendChild(U.el('div', { class: 'toolbar' },
      U.el('button', { class: 'btn sm', onclick: () => { state.date = U.addDays(state.date, -1); App.render(); } }, '‹'),
      dateInput,
      U.el('button', { class: 'btn sm', onclick: () => { state.date = U.addDays(state.date, 1); App.render(); } }, '›'),
      state.date !== U.todayYmd() ? U.el('button', { class: 'btn sm ghost', onclick: () => { state.date = U.todayYmd(); App.render(); } }, 'Today') : null,
      U.el('span', { class: 'grow' }),
      U.el('button', {
        class: 'btn',
        onclick: () => { for (const e of Store.ensembles()) DSchedule.blockSwap(state.date, e); App.render(); },
      }, '⇄ Swap all blocks'),
      U.el('button', {
        class: 'btn',
        onclick: () => {
          Store.makeDayNormal(state.date); App.render();
          U.toast('Back to the normal schedule for ' + U.relDate(state.date));
        },
      }, '↺ Make day normal')));

    const anyChanges = Store.effectiveScheduleFor(state.date).some(r => r.changed);
    container.appendChild(U.el('div', { class: 'hint', style: { margin: '-6px 0 12px' } },
      anyChanges
        ? '● ' + U.relDate(state.date) + ' is a changed day: ' + DSchedule.describeDay(state.date)
        : U.relDate(state.date) + ' runs on the normal schedule.'));

    const listWrap = U.el('div', { class: 'rowlist' });
    for (const row of Store.effectiveScheduleFor(state.date)) {
      const e = row.ensemble;
      const r = U.el('div', { class: 'sched-row' + (row.changed ? ' changed' : '') + (row.cancelled ? ' cancelled' : '') });

      const t = U.el('div', { class: 'sched-time' });
      if (row.cancelled) t.appendChild(U.el('span', null, 'No rehearsal'));
      else {
        t.appendChild(U.el('span', null, U.fmtTimeRange(row.start, row.end)));
        if (row.changed) t.appendChild(U.el('span', { class: 'was' }, 'was ' + U.fmtTimeRange(row.baseStart, row.baseEnd)));
      }
      r.appendChild(t);

      r.appendChild(U.el('div', { style: { flex: '1 1 140px', minWidth: '120px' } },
        U.el('div', { style: { fontWeight: 750 } },
          U.el('span', { class: 'swatch', style: { background: e.color, display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', marginRight: '7px' } }),
          e.name),
        row.changed ? U.el('span', { class: 'badge changed' }, row.cancelled ? 'Cancelled today' : 'Changed') : null));

      const chips = U.el('div', { class: 'block-chips' });
      for (const b of blocks) {
        const isCur = !row.cancelled && row.start === b.start && row.end === b.end;
        chips.appendChild(U.el('button', {
          class: 'btn sm' + (isCur ? ' primary' : ''),
          title: b.label,
          onclick: () => {
            const base = Store.baseTimes(e);
            if (b.start === base.start && b.end === base.end) Store.setScheduleChange(state.date, e.id, null);
            else Store.setScheduleChange(state.date, e.id, { start: b.start, end: b.end });
            App.render();
          },
        }, b.label + ' · ' + U.fmtTimeRange(b.start, b.end)));
      }
      chips.appendChild(U.el('button', {
        class: 'btn sm', onclick: () => { DSchedule.blockSwap(state.date, e); App.render(); },
      }, '⇄ Block swap'));
      chips.appendChild(U.el('button', {
        class: 'btn sm', onclick: () => DSchedule.customTimeDialog(state.date, e),
      }, 'Custom…'));
      chips.appendChild(U.el('button', {
        class: 'btn sm' + (row.cancelled ? ' primary' : ''),
        onclick: () => {
          if (row.cancelled) Store.setScheduleChange(state.date, e.id, null);
          else Store.setScheduleChange(state.date, e.id, { cancelled: true });
          App.render();
        },
      }, row.cancelled ? 'Restore' : 'No rehearsal'));
      if (row.changed) {
        chips.appendChild(U.el('button', {
          class: 'btn sm ghost',
          onclick: () => { Store.setScheduleChange(state.date, e.id, null); App.render(); },
        }, '↺ Revert'));
      }
      r.appendChild(chips);
      listWrap.appendChild(r);
    }
    container.appendChild(listWrap);

    // day note
    const dayRec = Store.data.scheduleChanges[state.date] || {};
    const note = U.input({
      value: dayRec.note || '',
      placeholder: 'Optional note for this day — students see it on their Today page (e.g. "All ensembles flipped for the Dance dress rehearsal").',
    });
    note.addEventListener('change', () => {
      const sc = Store.data.scheduleChanges;
      if (!sc[state.date]) sc[state.date] = { changes: {} };
      sc[state.date].note = note.value.trim();
      if (!note.value.trim() && !Object.keys(sc[state.date].changes || {}).length) delete sc[state.date];
      Store.save();
    });
    container.appendChild(U.el('div', { style: { marginTop: '14px' } }, U.field('Day note', note)));

  } else if (state.mode === 'month') {
    container.appendChild(U.el('div', { class: 'hint', style: { marginBottom: '8px' } },
      'Days marked ● have time changes. Tap any day to edit it.'));
    container.appendChild(U.monthGrid({
      month: state.month,
      pickAll: true,   // ANY day opens its editor — that's the point of this view
      onNav: m => { state.month = m; App.render(); },
      onPick: ymd => { state.date = ymd; state.mode = 'day'; App.render(); },
      renderDay: ymd => {
        const day = Store.data.scheduleChanges[ymd];
        if (!day) return null;
        const n = Object.keys(day.changes || {}).length;
        if (!n && !day.note) return null;
        const box = U.el('div');
        box.appendChild(U.el('span', { class: 'mcal-evt', style: { '--tag-color': 'var(--gold)' } },
          n ? U.plural(n, 'change') : '📝 note'));
        // phones hide .mcal-evt — give them a dot so changed days stay visible
        const dots = U.el('div', { class: 'mcal-dots compact' });
        dots.appendChild(U.el('span', { class: 'mcal-dot', style: { '--tag-color': 'var(--gold)' } }));
        box.appendChild(dots);
        return box;
      },
    }));
  } else {
    const dates = Store.changedDates();
    const today = U.todayYmd();
    const upcoming = dates.filter(d => d >= today);
    const past = dates.filter(d => d < today).reverse();
    if (!dates.length) {
      container.appendChild(U.empty('🕐', 'No changed days', 'Every ensemble is running its normal block schedule.'));
      return;
    }
    const section = (label, ds) => {
      if (!ds.length) return;
      container.appendChild(U.el('div', { class: 'section-label' }, label));
      const l = U.el('div', { class: 'rowlist' });
      for (const d of ds) {
        const dp = U.parseYmd(d);
        l.appendChild(U.el('div', { class: 'rowitem' },
          U.el('div', { class: 'date-pill' + (d < today ? ' past' : '') },
            U.el('div', { class: 'dp-mon' }, dp.toLocaleDateString('en-US', { month: 'short' })),
            U.el('div', { class: 'dp-day' }, String(dp.getDate()))),
          U.el('div', { class: 'row-main' },
            U.el('div', { class: 'row-title' }, U.relDate(d)),
            U.el('div', { class: 'row-sub' }, DSchedule.describeDay(d))),
          U.el('button', { class: 'btn sm', onclick: () => { state.date = d; state.mode = 'day'; App.render(); } }, 'Edit'),
          U.el('button', {
            class: 'btn sm ghost',
            onclick: () => {
              if (!U.confirmBox('Return ' + U.fmtDate(d, 'med') + ' to the normal schedule?')) return;
              Store.makeDayNormal(d); App.render();
            },
          }, '↺ Make normal')));
      }
      container.appendChild(l);
    };
    section('Upcoming changed days', upcoming);
    section('Past changed days', past);
  }
};

/* Custom time editor with the default blocks one tap away. */
DSchedule.customTimeDialog = function (date, ensemble) {
  const eff = Store.effectiveScheduleFor(date).find(r => r.ensemble.id === ensemble.id);
  const body = U.el('div');
  const start = U.input({ type: 'time', value: eff.cancelled ? '' : (eff.start || '') });
  const end = U.input({ type: 'time', value: eff.cancelled ? '' : (eff.end || '') });

  // the two school blocks as one-tap defaults, custom times below
  const quick = U.el('div', { class: 'block-chips', style: { marginBottom: '12px' } });
  for (const b of Store.data.blocks) {
    quick.appendChild(U.el('button', {
      class: 'btn sm',
      onclick: () => { start.value = b.start; end.value = b.end; },
    }, b.label + ' · ' + U.fmtTimeRange(b.start, b.end)));
  }
  body.appendChild(U.field('One-tap defaults', quick));
  body.appendChild(U.el('div', { class: 'field-row' },
    U.field('Start', start), U.field('End', end)));
  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!start.value || !end.value) { U.toast('Set both start and end', 'error'); return; }
        if (end.value <= start.value) { U.toast('End must be after start', 'error'); return; }
        const base = Store.baseTimes(ensemble);
        if (start.value === base.start && end.value === base.end) Store.setScheduleChange(date, ensemble.id, null);
        else Store.setScheduleChange(date, ensemble.id, { start: start.value, end: end.value });
        U.closeModal(); App.render();
      },
    }, 'Set time for ' + U.fmtDate(date, 'med')),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));
  U.openModal(ensemble.name + ' — custom time', body);
};

/* =========================================================
   Temporary Roster Changes (formerly "Subs & Pull-Outs" — renamed because
   those words were confusing; inside the dialog "sub in" / "pull out" still
   describe the two directions).  List (default) | Month, music ensembles only.
   ========================================================= */
Views.director.temp = function (container) {
  const state = Views.director.temp._state = Views.director.temp._state || {};
  if (App.isFreshNav || !state.mode) {
    state.mode = 'list';
    state.month = U.todayYmd().slice(0, 7);
  }
  const filter = Store.getFilter('d_temp', 'all');

  container.appendChild(U.el('div', { class: 'page-head' },
    U.el('div', null,
      U.el('div', { class: 'page-title' }, 'Temporary Roster Changes'),
      U.el('div', { class: 'page-sub' }, 'Short-term moves between ensembles: sub a student in for a concert cycle, or pull one out for a production. Take Roll follows these automatically on the affected days.')),
    U.el('div', { class: 'page-actions' },
      U.el('button', { class: 'btn primary', onclick: () => DSchedule.tempDialog(null) }, '+ New change'))));

  const toolbar = U.el('div', { class: 'toolbar' });
  toolbar.appendChild(ensembleChips('d_temp', filter, () => App.render()));
  toolbar.appendChild(U.el('span', { class: 'grow' }));
  toolbar.appendChild(U.segmented(
    [{ value: 'month', label: 'Month' }, { value: 'list', label: 'List' }],
    state.mode, v => { state.mode = v; App.render(); }));
  container.appendChild(toolbar);

  const entries = Store.data.tempChanges
    .filter(t => (filter === 'all' || t.ensembleId === filter) && Store.isVisibleStudent(t.studentId))
    .sort((a, b) => a.from < b.from ? -1 : 1);

  const rowFor = t => {
    const st = Store.studentById(t.studentId);
    const e = Store.ensembleById(t.ensembleId);
    const dir = t.type === 'sub-in'
      ? { icon: '➕', verb: 'subbing into', cls: 'new' }
      : { icon: '➖', verb: 'pulled out of', cls: 'cancelled' };
    return U.el('div', { class: 'rowitem' },
      U.el('span', { style: { fontSize: '18px' } }, dir.icon),
      U.el('div', { class: 'row-main' },
        U.el('div', { class: 'row-title' }, (st ? st.last + ', ' + (st.preferred || st.first) : '(removed student)')),
        U.el('div', { class: 'row-sub' },
          dir.verb + ' ' + (e ? e.name : '?') + ' · ' + U.fmtRangeDates(t.from, t.to) + (t.note ? ' — ' + t.note : ''))),
      U.el('span', { class: 'badge ' + dir.cls }, t.type === 'sub-in' ? 'Sub in' : 'Pull out'),
      U.el('button', { class: 'btn sm', onclick: () => DSchedule.tempDialog(t) }, 'Edit'),
      U.el('button', {
        class: 'btn sm danger',
        onclick: () => {
          if (!U.confirmBox('Remove this temporary change?')) return;
          Store.data.tempChanges = Store.data.tempChanges.filter(x => x.id !== t.id);
          Store.save(); App.render();
        },
      }, 'Remove'));
  };

  if (!entries.length) {
    container.appendChild(U.empty('🔁', 'No temporary roster changes' + (filter !== 'all' ? ' for this ensemble' : ''),
      'Use “+ New change” when a student subs into another ensemble or is pulled out for a while.'));
    return;
  }

  if (state.mode === 'list') {
    const today = U.todayYmd();
    const active = entries.filter(t => U.inRange(today, t.from, t.to || t.from));
    const upcoming = entries.filter(t => t.from > today);
    const past = entries.filter(t => (t.to || t.from) < today).reverse();
    const section = (label, list) => {
      if (!list.length) return;
      container.appendChild(U.el('div', { class: 'section-label' }, label));
      const l = U.el('div', { class: 'rowlist' });
      list.forEach(t => l.appendChild(rowFor(t)));
      container.appendChild(l);
    };
    section('Active today', active);
    section('Upcoming', upcoming);
    section('Past', past);
  } else {
    container.appendChild(U.el('div', { class: 'hint', style: { marginBottom: '8px' } }, 'Tap a day to see its changes.'));
    container.appendChild(U.monthGrid({
      month: state.month,
      onNav: m => { state.month = m; App.render(); },
      onPick: ymd => {
        const hits = entries.filter(t => U.inRange(ymd, t.from, t.to || t.from));
        if (!hits.length) return;
        const body = U.el('div', { class: 'rowlist' });
        hits.forEach(t => body.appendChild(rowFor(t)));
        U.openModal('Temporary changes — ' + U.fmtDate(ymd, 'long'), body, { wide: true });
      },
      renderDay: ymd => {
        const hits = entries.filter(t => U.inRange(ymd, t.from, t.to || t.from));
        if (!hits.length) return null;
        const dots = U.el('div', { class: 'mcal-dots' });
        hits.slice(0, 6).forEach(t => dots.appendChild(U.el('span', {
          class: 'mcal-dot',
          style: { '--tag-color': (Store.ensembleById(t.ensembleId) || {}).color || '#888' },
        })));
        if (hits.length > 6) dots.appendChild(U.el('span', { class: 'mcal-more' }, '+' + (hits.length - 6)));
        return dots;
      },
    }));
  }
};

DSchedule.tempDialog = function (t) {
  const isNew = !t;
  const students = Store.activeStudents().sort(U.byLastName);
  if (!students.length && isNew) { U.toast('Add students to the roster first.', 'error'); return; }
  const body = U.el('div');

  let type = t ? t.type : 'sub-in';
  const typeWrap = U.el('div');
  const mkRadio = (val, label, hint) => {
    const r = U.el('input', { type: 'radio', name: 'temp-type' });
    r.checked = type === val;
    r.addEventListener('change', () => { if (r.checked) type = val; });
    return U.el('label', { class: 'checkline' }, r, U.el('span', null, U.el('b', null, label), ' — ' + hint));
  };
  typeWrap.appendChild(mkRadio('sub-in', 'Sub in', 'student temporarily JOINS the ensemble below'));
  typeWrap.appendChild(mkRadio('pull-out', 'Pull out', 'student temporarily LEAVES the ensemble below'));
  body.appendChild(U.field('What\'s happening?', typeWrap));

  const stSel = U.select(DRoster.studentOptions(t && t.studentId),
    t ? t.studentId : students[0].id, null);
  stSel.classList.add('block');
  body.appendChild(U.field('Student', stSel));

  const ensSel = U.select(Store.ensembles().map(e => ({ value: e.id, label: e.name })),
    t ? t.ensembleId : Store.ensembles()[0].id, null);
  ensSel.classList.add('block');
  body.appendChild(U.field('Ensemble (music only)', ensSel));

  const from = U.input({ type: 'date', value: t ? t.from : U.todayYmd() });
  const to = U.input({ type: 'date', value: t ? (t.to || '') : '' });
  body.appendChild(U.el('div', { class: 'field-row' },
    U.field('From', from), U.field('Through (optional)', to, 'Leave empty for a single day.')));
  const note = U.input({ value: t ? (t.note || '') : '', placeholder: 'e.g. Covering 2nd oboe for the fall concert' });
  body.appendChild(U.field('Note', note));

  body.appendChild(U.el('div', { class: 'card-actions' },
    U.el('button', {
      class: 'btn primary',
      onclick: () => {
        if (!from.value) { U.toast('Pick a start date', 'error'); return; }
        if (to.value && to.value < from.value) { U.toast('"Through" is before "From"', 'error'); return; }
        const entry = {
          id: t ? t.id : U.uid(),
          type,
          studentId: stSel.querySelector('select').value,
          ensembleId: ensSel.querySelector('select').value,
          from: from.value, to: to.value || '', note: note.value.trim(),
        };
        Store.upsert('tempChanges', entry);
        U.closeModal(); App.render();
        U.toast('Temporary change saved — Take Roll follows it on those days');
      },
    }, isNew ? 'Save change' : 'Save'),
    U.el('button', { class: 'btn ghost', onclick: () => U.closeModal() }, 'Cancel')));

  U.openModal(isNew ? 'New temporary roster change' : 'Edit temporary change', body);
};
