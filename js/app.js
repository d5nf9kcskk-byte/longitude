/* app.js — routing, events, modals, sync */
'use strict';

const App = {

  init() {
    Store.load();
    window.addEventListener('hashchange', () => this.render());
    document.getElementById('view').addEventListener('click', e => this.onClick(e));
    document.getElementById('view').addEventListener('change', e => this.onChange(e));
    document.getElementById('modal-root').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) this.closeModal();
      this.onClick(e);
    });
    if (!location.hash) location.hash = '#/today';
    this.render();
    this.notifyIfDue();
    setInterval(() => this.notifyIfDue(), 30 * 60 * 1000);
  },

  route() {
    const h = location.hash.replace(/^#\//, '');
    const [page, arg] = h.split('/');
    return { page: page || 'today', arg };
  },

  render() {
    const { page, arg } = this.route();
    const view = document.getElementById('view');
    const pages = {
      today: () => Views.today(),
      works: () => Views.works(),
      work: () => Views.workDetail(arg),
      review: () => Views.review(),
      stats: () => Views.stats(),
      guide: () => Views.guide(),
      settings: () => Views.settings(),
    };
    view.innerHTML = (pages[page] || pages.today)();
    document.querySelectorAll('.nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === `#/${page === 'work' ? 'works' : page}`);
    });
    const due = Scheduler.duePassages().length;
    const badge = document.getElementById('due-badge');
    badge.textContent = due || '';
    badge.style.display = due ? 'inline-flex' : 'none';
  },

  /* ---------- event delegation ---------- */

  onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const pid = el.dataset.pid, wid = el.dataset.wid;
    const actions = {
      'add-work': () => this.workModal(),
      'edit-work': () => this.workModal(Store.getWork(wid)),
      'add-passage': () => this.passageModal(Store.getWork(wid)),
      'edit-passage': () => { const f = Store.findPassage(pid); if (f) this.passageModal(f.work, f.passage); },
      'log-study': () => { const f = Store.findPassage(pid); if (f) this.studyModal(f.work, f.passage); },
      'start-test': () => { const f = Store.findPassage(pid); if (f) this.testModal(f.work, f.passage); },
      'start-synthesis': () => this.synthesisModal(Store.getWork(wid)),
      'export': () => this.exportData(),
      'import': () => this.importData(),
      'load-example': () => { Store.loadExample(); this.toast('Example loaded.'); location.hash = '#/works'; this.render(); },
      'reset-all': () => this.resetAll(),
      'gh-push': () => this.ghPush(),
      'gh-pull': () => this.ghPull(),
      'close-modal': () => this.closeModal(),
    };
    if (actions[a]) { e.preventDefault(); actions[a](); }
  },

  onChange(e) {
    const el = e.target.closest('[data-action], [data-gh]');
    if (!el) return;
    if (el.dataset.gh) {
      Store.state.settings.github[el.dataset.gh] = el.value.trim();
      Store.save();
      return;
    }
    switch (el.dataset.action) {
      case 'prime-step': {
        const w = Store.getWork(el.dataset.wid);
        w.priming[el.dataset.step] = el.checked;
        const done = PRIMING_STEPS.every(s => w.priming[s.id]);
        if (done && !w.primed) { w.primed = true; this.toast('Primed. Now break it into passages.'); }
        w.primed = done;
        Store.save(); this.render();
        break;
      }
      case 'prime-notes': {
        Store.getWork(el.dataset.wid).primingNotes = el.value;
        Store.save();
        break;
      }
      case 'set-minimum':
        Store.state.settings.dailyMinimumMinutes = Math.max(1, parseInt(el.value, 10) || 10);
        Store.save();
        break;
      case 'toggle-notify':
        Store.state.settings.notifications = el.checked;
        Store.save();
        if (el.checked && 'Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
        break;
    }
  },

  /* ---------- modals ---------- */

  openModal(html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    root.style.display = 'block';
    const first = root.querySelector('input, textarea, select, button');
    if (first) first.focus();
  },
  closeModal() {
    const root = document.getElementById('modal-root');
    root.style.display = 'none';
    root.innerHTML = '';
  },

  workModal(work) {
    const w = work || {};
    this.openModal(`
      <h2>${work ? 'Edit work' : 'Add work'}</h2>
      <label class="field">Title<input class="input" id="m-title" value="${esc(w.title || '')}" placeholder="Symphony No. 2 in D major, Op. 43"></label>
      <label class="field">Composer<input class="input" id="m-composer" value="${esc(w.composer || '')}" placeholder="Sibelius"></label>
      <label class="field">Performance date (drives the schedule)<input class="input" id="m-date" type="date" value="${w.performanceDate || ''}"></label>
      ${work ? `<label class="check-row"><input type="checkbox" id="m-archived" ${w.status !== 'active' ? 'checked' : ''}><span>Archived</span></label>` : ''}
      <div class="btn-row right">
        ${work ? '<button class="btn danger" id="m-delete">Delete</button>' : ''}
        <button class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary" id="m-save">${work ? 'Save' : 'Add'}</button>
      </div>`);
    document.getElementById('m-save').onclick = () => {
      const title = document.getElementById('m-title').value.trim();
      if (!title) return this.toast('Title is required.');
      const composer = document.getElementById('m-composer').value.trim();
      const date = document.getElementById('m-date').value || null;
      if (work) {
        work.title = title; work.composer = composer; work.performanceDate = date;
        const arch = document.getElementById('m-archived');
        work.status = arch && arch.checked ? 'archived' : 'active';
        Store.save();
      } else {
        const nw = Store.addWork({ title, composer, performanceDate: date });
        location.hash = `#/work/${nw.id}`;
      }
      this.closeModal(); this.render();
    };
    if (work) {
      const del = document.getElementById('m-delete');
      if (del) del.onclick = () => {
        if (!confirm(`Delete “${work.title}” and all its passages and history? This cannot be undone.`)) return;
        Store.state.works = Store.state.works.filter(x => x.id !== work.id);
        Store.save(); this.closeModal(); location.hash = '#/works'; this.render();
      };
    }
  },

  passageModal(work, passage) {
    const p = passage || { types: ['structural'] };
    const typeChecks = Object.entries(ELEMENT_TYPES).map(([k, t]) => `
      <label class="check-row">
        <input type="checkbox" name="m-type" value="${k}" ${p.types && p.types.includes(k) ? 'checked' : ''}>
        <span><b>${t.letter} · ${t.label}</b> — <span class="dim">${esc(t.desc)}</span></span>
      </label>`).join('');
    this.openModal(`
      <h2>${passage ? 'Edit passage' : `Add passage — ${esc(work.title)}`}</h2>
      <div class="grid-2">
        <label class="field">Name<input class="input" id="m-pname" value="${esc(p.name || '')}" placeholder="Mvt I — Development"></label>
        <label class="field">Location<input class="input" id="m-ploc" value="${esc(p.location || '')}" placeholder="mm. 125–248 / reh. D–H"></label>
      </div>
      <div class="field-label">What kind of material is this? (picks the study & test prompts)</div>
      ${typeChecks}
      <label class="check-row"><input type="checkbox" id="m-critical" ${p.critical ? 'checked' : ''}><span><b>★ Critical</b> — one of the ~20% of passages that carry the performance</span></label>
      <label class="field">Critical bars (Pareto squared — the vital bars inside the passage)
        <input class="input" id="m-critbars" value="${esc(p.criticalBars || '')}" placeholder="mm. 130–134 (meter change)"></label>
      <label class="field">Difficulty (1–5)<input class="input" id="m-diff" type="number" min="1" max="5" value="${p.difficulty || 3}"></label>
      <label class="field">Notes<textarea class="input" id="m-pnotes" rows="2">${esc(p.notes || '')}</textarea></label>
      <div class="btn-row right">
        ${passage ? '<button class="btn danger" id="m-pdelete">Delete</button>' : ''}
        <button class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary" id="m-psave">${passage ? 'Save' : 'Add'}</button>
      </div>`);
    document.getElementById('m-psave').onclick = () => {
      const name = document.getElementById('m-pname').value.trim();
      if (!name) return this.toast('Name is required.');
      const types = [...document.querySelectorAll('input[name="m-type"]:checked')].map(x => x.value);
      const data = {
        name,
        location: document.getElementById('m-ploc').value.trim(),
        types: types.length ? types : ['structural'],
        critical: document.getElementById('m-critical').checked,
        criticalBars: document.getElementById('m-critbars').value.trim(),
        difficulty: Math.min(5, Math.max(1, parseInt(document.getElementById('m-diff').value, 10) || 3)),
        notes: document.getElementById('m-pnotes').value.trim(),
      };
      if (passage) { Object.assign(passage, data); Store.save(); }
      else Store.addPassage(work, data);
      this.closeModal(); this.render();
    };
    if (passage) {
      const del = document.getElementById('m-pdelete');
      if (del) del.onclick = () => {
        if (!confirm(`Delete passage “${passage.name}” and its history?`)) return;
        work.passages = work.passages.filter(x => x.id !== passage.id);
        Store.save(); this.closeModal(); this.render();
      };
    }
  },

  studyModal(work, passage) {
    const opts = STUDY_MODES.map(m =>
      `<option value="${m.id}">${m.label} (${m.cat === 'consume' ? 'consume' : m.cat === 'recall' ? 'recall' : 'generate'})</option>`).join('');
    const typeTips = passage.types.map(t => `<li><b>${ELEMENT_TYPES[t].label}:</b> ${esc(ELEMENT_TYPES[t].tech)}</li>`).join('');
    this.openModal(`
      <h2>Log study — ${esc(passage.name)}</h2>
      <div class="dim small">${esc(work.title)}</div>
      <ul class="tips">${typeTips}</ul>
      <label class="field">What did you do?
        <select class="input" id="m-mode">${opts}</select>
      </label>
      <div class="mode-hint dim small" id="m-hint"></div>
      <div class="grid-2">
        <label class="field">Minutes<input class="input" id="m-min" type="number" min="1" max="600" value="20"></label>
        <label class="field">Struggle (1 easy – 5 hard)<input class="input" id="m-struggle" type="number" min="1" max="5" value="3"></label>
      </div>
      <label class="field">Note (what's still fuzzy?)<textarea class="input" id="m-snote" rows="2"></textarea></label>
      <div class="btn-row right">
        <button class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary" id="m-slog">Log it</button>
      </div>`);
    const modeSel = document.getElementById('m-mode');
    const hint = document.getElementById('m-hint');
    const showHint = () => { hint.textContent = MODE_BY_ID[modeSel.value].hint || ''; };
    modeSel.onchange = showHint; showHint();
    document.getElementById('m-slog').onclick = () => {
      const modeId = modeSel.value;
      const minutes = Math.max(1, parseInt(document.getElementById('m-min').value, 10) || 0);
      const struggle = Math.min(5, Math.max(1, parseInt(document.getElementById('m-struggle').value, 10) || 3));
      Store.logSession({ workId: work.id, passageId: passage.id, modeId, minutes, struggle, note: document.getElementById('m-snote').value.trim() });
      Scheduler.updatePhase(work, passage);
      Scheduler.scheduleFirstTest(passage);
      if (passage.needsReencode && MODE_BY_ID[modeId].cat !== 'consume') {
        passage.needsReencode = false;
        passage.srs.due = todayStr();
      }
      Store.save();
      const m = MODE_BY_ID[modeId];
      if (m.cat === 'generate') this.microModal(m.label);
      else { this.closeModal(); this.render(); this.toast('Logged.'); }
    };
  },

  microModal(modeLabel) {
    this.openModal(`
      <h2>60-second micro-retrieval</h2>
      <p>${esc(Scheduler.microPrompt(modeLabel))}</p>
      <div class="btn-row right">
        <button class="btn" data-action="close-modal">Skip</button>
        <button class="btn primary" id="m-micro-done">Done — locked in</button>
      </div>`);
    document.getElementById('m-micro-done').onclick = () => {
      Store.recordTest(todayStr());
      this.closeModal(); this.render(); this.toast('Session encoded and checked. That’s the whole method.');
    };
  },

  testModal(work, passage) {
    const prompts = Scheduler.prompts(passage);
    this.openModal(`
      <h2>Recall test — ${esc(passage.name)}</h2>
      <div class="dim small">${esc(work.title)}${passage.location ? ' · ' + esc(passage.location) : ''}</div>
      <p class="dim small">Score CLOSED. Work through the prompts — struggle first, check after. Then grade yourself honestly.</p>
      <ol class="prompt-list">${prompts.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      <div class="grade-row">
        <button class="btn grade g0" data-grade="0">Again<span>blank / wrong</span></button>
        <button class="btn grade g1" data-grade="1">Hard<span>major gaps</span></button>
        <button class="btn grade g2" data-grade="2">Good<span>solid, small slips</span></button>
        <button class="btn grade g3" data-grade="3">Easy<span>cold & complete</span></button>
      </div>
      <div class="btn-row right"><button class="btn" data-action="close-modal">Cancel</button></div>`);
    document.querySelectorAll('.grade').forEach(b => {
      b.onclick = () => {
        const grade = parseInt(b.dataset.grade, 10);
        Scheduler.gradeRecall(work, passage, grade);
        this.closeModal(); this.render();
        if (grade === 0) {
          this.toast('Lapse prescribed re-encoding: do a generative session on it before the retest tomorrow.');
        } else {
          this.toast(`Next test: ${fmtDate(passage.srs.due)} (${passage.srs.interval}d).`);
        }
      };
    });
  },

  synthesisModal(work) {
    if (!work) return;
    this.openModal(`
      <h2>Weekly synthesis — ${esc(work.title)}</h2>
      <p>Blank paper. Score closed. Rebuild the whole architecture from memory:</p>
      <ol class="prompt-list">
        <li>Movements/sections in order, with rough proportions.</li>
        <li>Key areas and the harmonic journey.</li>
        <li>The 3–5 biggest events and where they fall.</li>
        <li>Every transition — the connective tissue between your passages.</li>
        <li>Then open the score and diff: mark every miss. Each miss is a target this week.</li>
      </ol>
      <div class="btn-row right">
        <button class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary" id="m-syn-done">Done — log it</button>
      </div>`);
    document.getElementById('m-syn-done').onclick = () => {
      Store.state.lastSynthesis[work.id] = todayStr();
      Store.logSession({ workId: work.id, passageId: null, modeId: 'blank-map', minutes: 15, struggle: 4, note: 'Weekly synthesis' });
      Store.recordTest(todayStr());
      Store.save();
      this.closeModal(); this.render(); this.toast('Synthesis logged. Next one in 7 days.');
    };
  },

  /* ---------- import / export / reset ---------- */

  exportData() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `score-study-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  importData() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      f.text().then(t => {
        try { Store.importJSON(t); this.render(); this.toast('Imported.'); }
        catch (e) { this.toast('Import failed: ' + e.message); }
      });
    };
    inp.click();
  },

  resetAll() {
    if (!confirm('Erase ALL works, passages, and history from this browser? Export a backup first if in doubt.')) return;
    Store.state = Store.defaultState();
    Store.save(); this.render(); this.toast('Erased.');
  },

  /* ---------- GitHub sync ---------- */

  ghUrl() {
    const g = Store.state.settings.github;
    if (!g.owner || !g.repo || !g.path) return null;
    const ref = g.branch ? `?ref=${encodeURIComponent(g.branch)}` : '';
    return { url: `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${g.path}`, ref, g };
  },

  ghStatus(msg) {
    const el = document.getElementById('gh-status');
    if (el) el.textContent = msg;
  },

  async ghPush() {
    const conf = this.ghUrl();
    if (!conf || !conf.g.token) return this.ghStatus('Fill in owner, repo, path, and token first.');
    this.ghStatus('Pushing…');
    try {
      // fetch current sha (if the file exists)
      let sha = null;
      const head = await fetch(conf.url + conf.ref, { headers: this.ghHeaders(conf.g) });
      if (head.ok) sha = (await head.json()).sha;
      const body = {
        message: `score study data ${todayStr()}`,
        content: btoa(unescape(encodeURIComponent(Store.exportJSON()))),
      };
      if (conf.g.branch) body.branch = conf.g.branch;
      if (sha) body.sha = sha;
      const res = await fetch(conf.url, { method: 'PUT', headers: this.ghHeaders(conf.g), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`${res.status} ${(await res.json()).message || ''}`);
      this.ghStatus('✓ Pushed to GitHub.');
    } catch (e) { this.ghStatus('Push failed: ' + e.message); }
  },

  async ghPull() {
    const conf = this.ghUrl();
    if (!conf || !conf.g.token) return this.ghStatus('Fill in owner, repo, path, and token first.');
    if (!confirm('Pulling will REPLACE the data in this browser with the copy on GitHub. Continue?')) return;
    this.ghStatus('Pulling…');
    try {
      const res = await fetch(conf.url + conf.ref, { headers: this.ghHeaders(conf.g) });
      if (!res.ok) throw new Error(`${res.status} — file not found or no access`);
      const json = await res.json();
      const text = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
      const keepGh = JSON.parse(JSON.stringify(Store.state.settings.github));
      Store.importJSON(text);
      Store.state.settings.github = keepGh; // keep local token/config
      Store.save();
      this.render();
      this.ghStatus('✓ Pulled from GitHub.');
    } catch (e) { this.ghStatus('Pull failed: ' + e.message); }
  },

  ghHeaders(g) {
    return {
      'Authorization': `Bearer ${g.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  },

  /* ---------- notifications & toast ---------- */

  notifyIfDue() {
    if (!Store.state.settings.notifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const due = Scheduler.duePassages();
    if (due.length) {
      new Notification('Score Study', {
        body: `${due.length} recall test${due.length > 1 ? 's' : ''} due — catch the memory before it fades.`,
        tag: 'score-study-due',
      });
    }
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
