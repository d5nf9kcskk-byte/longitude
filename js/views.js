/* views.js — all rendering + interaction */
'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const Views = {

  /* ================= TODAY ================= */

  today() {
    const due = Scheduler.duePassages();
    const bal = Store.balance();
    const streak = Store.streak();
    const tasks = Scheduler.todaysPlan();
    const works = Store.state.works.filter(w => w.status === 'active');

    const nearest = works
      .map(w => ({ w, d: daysUntil(w.performanceDate) }))
      .filter(x => x.d !== null && x.d >= 0)
      .sort((a, b) => a.d - b.d)[0];

    const today = todayStr();
    const dayInfo = Store.state.dayLog[today] || { minutes: 0, tests: 0 };
    const met = Store.dayMet(today);

    const tiles = `
      <div class="tiles">
        <div class="tile"><div class="tile-num">${due.length}</div><div class="tile-label">recall tests due</div></div>
        <div class="tile"><div class="tile-num">${streak}<span class="tile-unit">d</span></div><div class="tile-label">study streak</div></div>
        <div class="tile"><div class="tile-num">${bal.ratio === null ? '—' : Math.round(bal.ratio * 100) + '%'}</div><div class="tile-label">generative (14d)</div></div>
        <div class="tile">
          <div class="tile-num">${nearest ? nearest.d : '—'}${nearest ? '<span class="tile-unit">d</span>' : ''}</div>
          <div class="tile-label">${nearest ? 'until ' + esc(nearest.w.title.slice(0, 24)) : 'no performance set'}</div>
        </div>
      </div>`;

    const first = tasks[0];
    const starterCard = first ? `
      <div class="card starter-card">
        <div class="card-kicker">Just start — the win is starting, not finishing</div>
        <div class="starter-title">${esc(first.title)}</div>
        ${first.starter ? `<div class="starter-mini">⏱ ${esc(first.starter)}</div>` : ''}
        <div class="starter-actions">${this.taskButton(first, 'primary')}</div>
      </div>` : `
      <div class="card starter-card">
        <div class="card-kicker">All clear</div>
        <div class="starter-title">Nothing due. Add a work — or run a cold audiation of a secure passage for interleaving.</div>
        <div class="starter-actions"><button class="btn primary" data-action="add-work">Add a work</button></div>
      </div>`;

    const taskList = tasks.length <= 1 ? '' : `
      <div class="card">
        <div class="card-kicker">Today's plan — in method order</div>
        <ul class="task-list">
          ${tasks.slice(1).map(t => `
            <li class="task">
              <div class="task-main">
                <div class="task-title">${esc(t.title)}</div>
                <div class="task-sub">${esc(t.sub)}</div>
                ${t.why ? `<div class="task-why">${esc(t.why)}</div>` : ''}
              </div>
              <div class="task-act">${this.taskButton(t)}</div>
            </li>`).join('')}
        </ul>
      </div>`;

    const minCard = `
      <div class="card minline ${met ? 'met' : ''}">
        <span>${met ? '✓ Worst-day minimum met' : `Worst-day minimum: ${Store.state.settings.dailyMinimumMinutes} min or 1 recall test`}</span>
        <span class="minline-detail">${dayInfo.minutes} min · ${dayInfo.tests || 0} tests today</span>
      </div>`;

    return `<h1>Today</h1>${tiles}${starterCard}${taskList}${minCard}`;
  },

  taskButton(t, cls = '') {
    const c = cls ? `btn ${cls}` : 'btn';
    switch (t.kind) {
      case 'test': return `<button class="${c}" data-action="start-test" data-pid="${t.passageId}">Test now</button>`;
      case 'more-tests': return `<a class="${c}" href="#/review">Review queue</a>`;
      case 'prime': return `<a class="${c}" href="#/work/${t.workId}">Prime it</a>`;
      case 'add-passages': return `<a class="${c}" href="#/work/${t.workId}">Add passages</a>`;
      case 'encode': return `<button class="${c}" data-action="log-study" data-pid="${t.passageId}">Log a session</button>`;
      case 'synthesis': return `<button class="${c}" data-action="start-synthesis" data-wid="${t.workId}">Run synthesis</button>`;
      case 'balance': return `<a class="${c}" href="#/guide">See why</a>`;
      default: return '';
    }
  },

  /* ================= WORKS ================= */

  works() {
    const works = Store.state.works;
    const active = works.filter(w => w.status === 'active');
    const archived = works.filter(w => w.status !== 'active');
    const card = w => {
      const d = daysUntil(w.performanceDate);
      const counts = this.phaseCounts(w);
      return `
        <a class="card work-card" href="#/work/${w.id}">
          <div class="work-head">
            <div>
              <div class="work-title">${esc(w.title)}</div>
              <div class="work-sub">${esc(w.composer)}${w.performanceDate ? ` · ${fmtDate(w.performanceDate)}${d !== null && d >= 0 ? ` (${d}d)` : ''}` : ''}</div>
            </div>
            ${!w.primed ? '<span class="chip warn">needs priming</span>' : ''}
          </div>
          ${this.phaseBar(counts)}
        </a>`;
    };
    return `
      <div class="page-head"><h1>Works</h1><button class="btn primary" data-action="add-work">+ Add work</button></div>
      ${active.length ? active.map(card).join('') : '<div class="card empty">No works yet. Add the score you\'re studying — or load the example from Settings.</div>'}
      ${archived.length ? `<h2 class="dim">Archived</h2>${archived.map(card).join('')}` : ''}`;
  },

  phaseCounts(w) {
    const c = { new: 0, encoding: 0, recalling: 0, secure: 0 };
    for (const p of w.passages) c[p.phase] = (c[p.phase] || 0) + 1;
    return c;
  },

  /* Ordinal single-hue ramp (validated): phase progress light→dark. */
  phaseBar(c) {
    const total = c.new + c.encoding + c.recalling + c.secure;
    if (!total) return '<div class="phasebar-empty">no passages yet</div>';
    const seg = (n, cls, label) => n ? `<div class="phase-seg ${cls}" style="flex:${n}" title="${label}: ${n}"></div>` : '';
    return `
      <div class="phasebar">
        ${seg(c.new, 'ph-new', 'New')}${seg(c.encoding, 'ph-enc', 'Encoding')}${seg(c.recalling, 'ph-rec', 'Testing')}${seg(c.secure, 'ph-sec', 'Secure')}
      </div>
      <div class="phasebar-legend">
        <span><i class="dot ph-new"></i>New ${c.new}</span>
        <span><i class="dot ph-enc"></i>Encoding ${c.encoding}</span>
        <span><i class="dot ph-rec"></i>Testing ${c.recalling}</span>
        <span><i class="dot ph-sec"></i>Secure ${c.secure}</span>
      </div>`;
  },

  workDetail(id) {
    const w = Store.getWork(id);
    if (!w) return '<div class="card empty">Work not found. <a href="#/works">Back to works</a></div>';
    const d = daysUntil(w.performanceDate);

    const priming = !w.primed ? `
      <div class="card prime-card">
        <div class="card-kicker">Prime first — architecture before detail</div>
        <p class="dim small">Fast and high-level. No detail work yet: the scaffold you build here makes every later session encode better.</p>
        ${PRIMING_STEPS.map(s => `
          <label class="check-row">
            <input type="checkbox" data-action="prime-step" data-wid="${w.id}" data-step="${s.id}" ${w.priming[s.id] ? 'checked' : ''}>
            <span>${esc(s.label)}</span>
          </label>`).join('')}
        <textarea class="input" rows="3" placeholder="Priming notes: the shape of the piece in your own words…" data-action="prime-notes" data-wid="${w.id}">${esc(w.primingNotes)}</textarea>
      </div>` : `
      <div class="card minline met"><span>✓ Primed</span><span class="minline-detail">${esc(w.primingNotes || '')}</span></div>`;

    const passages = w.passages.map(p => this.passageRow(w, p)).join('');

    return `
      <div class="page-head">
        <div>
          <h1>${esc(w.title)}</h1>
          <div class="work-sub">${esc(w.composer)}${w.performanceDate ? ` · performance ${fmtDate(w.performanceDate)}${d !== null && d >= 0 ? ` — ${d} days` : ''}` : ''}</div>
        </div>
        <div class="btn-row">
          <button class="btn" data-action="edit-work" data-wid="${w.id}">Edit</button>
          <button class="btn" data-action="start-synthesis" data-wid="${w.id}">Synthesis test</button>
        </div>
      </div>
      ${this.phaseBar(this.phaseCounts(w))}
      ${priming}
      <div class="page-head sub"><h2>Passages</h2><button class="btn primary" data-action="add-passage" data-wid="${w.id}">+ Add passage</button></div>
      <p class="dim small">Break the work along its structural seams (your form sketch), keep transitions as their own passages, and star the ~20% that carry the performance.</p>
      ${passages || '<div class="card empty">No passages yet.</div>'}`;
  },

  passageRow(w, p) {
    const depth = Store.encodingDepth(p.id);
    const due = p.srs.due;
    const overdue = due && due <= todayStr();
    const typeChips = p.types.map(t => `<span class="chip type" title="${esc(ELEMENT_TYPES[t].tech)}">${ELEMENT_TYPES[t].letter} ${ELEMENT_TYPES[t].label}</span>`).join('');
    return `
      <div class="card passage ${p.needsReencode ? 'lapsed' : ''}">
        <div class="passage-head">
          <div>
            <div class="passage-title">${p.critical ? '<span class="star" title="Critical (Pareto) passage">★</span> ' : ''}${esc(p.name)}</div>
            <div class="passage-sub">${esc(p.location)}${p.criticalBars ? ` · critical bars: ${esc(p.criticalBars)}` : ''}</div>
          </div>
          <span class="chip phase ph-${p.phase === 'new' ? 'new' : p.phase === 'encoding' ? 'enc' : p.phase === 'recalling' ? 'rec' : 'sec'}">${PHASES[p.phase].label}</span>
        </div>
        <div class="passage-chips">${typeChips}</div>
        <div class="passage-meta">
          <span title="Distinct generative modes logged — deeper encoding earns longer intervals">encoding depth <b>${depth}</b>/15</span>
          <span>${p.srs.reps} successful recalls</span>
          <span class="${overdue ? 'due-now' : ''}">${due ? (overdue ? 'test due now' : `next test ${fmtDate(due)}`) : 'no test scheduled yet'}</span>
          ${p.needsReencode ? '<span class="due-now">re-encode before retesting</span>' : ''}
        </div>
        ${p.notes ? `<div class="passage-notes">${esc(p.notes)}</div>` : ''}
        <div class="btn-row">
          <button class="btn small primary" data-action="log-study" data-pid="${p.id}">Log study</button>
          <button class="btn small" data-action="start-test" data-pid="${p.id}">Test now</button>
          <button class="btn small" data-action="edit-passage" data-pid="${p.id}">Edit</button>
        </div>
      </div>`;
  },

  /* ================= REVIEW ================= */

  review() {
    const due = Scheduler.duePassages();
    if (!due.length) {
      return `<h1>Review</h1><div class="card empty">Nothing due. That's the system working — come back when the schedule calls.
        <div class="dim small" style="margin-top:8px">Want extra reps anyway? Run a cold test from any passage's “Test now” button — interleaved, unscheduled retrieval is fine as a supplement.</div></div>`;
    }
    return `
      <h1>Review <span class="count-badge">${due.length}</span></h1>
      <p class="dim small">Hunt for mistakes, not validation. Genuine struggle before checking the score is what makes this work.</p>
      ${due.map(d => `
        <div class="card task">
          <div class="task-main">
            <div class="task-title">${d.passage.critical ? '★ ' : ''}${esc(d.passage.name)}</div>
            <div class="task-sub">${esc(d.work.title)}${d.overdue > 0 ? ` · ${d.overdue}d overdue` : ''}</div>
          </div>
          <div class="task-act"><button class="btn primary" data-action="start-test" data-pid="${d.passage.id}">Test</button></div>
        </div>`).join('')}`;
  },

  /* ================= STATS ================= */

  stats() {
    const bal = Store.balance();
    const streak = Store.streak();
    const works = Store.state.works.filter(w => w.status === 'active');
    let totalP = 0, secure = 0, tests = 0;
    for (const w of works) {
      totalP += w.passages.length;
      secure += w.passages.filter(p => p.phase === 'secure').length;
      for (const p of w.passages) tests += p.srs.history.length;
    }

    return `
      <h1>Progress</h1>
      <div class="tiles">
        <div class="tile"><div class="tile-num">${secure}<span class="tile-unit">/${totalP}</span></div><div class="tile-label">passages secure</div></div>
        <div class="tile"><div class="tile-num">${tests}</div><div class="tile-label">recall tests taken</div></div>
        <div class="tile"><div class="tile-num">${streak}<span class="tile-unit">d</span></div><div class="tile-label">streak</div></div>
        <div class="tile"><div class="tile-num">${bal.ratio === null ? '—' : Math.round(bal.ratio * 100) + '%'}</div><div class="tile-label">generative (14d)</div></div>
      </div>
      <div class="card">
        <div class="card-kicker">Last 14 days — minutes by kind of work</div>
        ${this.activityChart()}
        <div class="chart-legend">
          <span><i class="dot c-gen"></i>Generate</span>
          <span><i class="dot c-test"></i>Recall / test</span>
          <span><i class="dot c-con"></i>Consume</span>
        </div>
        <p class="dim small">Target: at least two-thirds generative (the podium version of the 5:1 practice-to-theory rule). Listening and reading are fuel, not the fire.</p>
      </div>
      ${works.map(w => `
        <div class="card">
          <div class="card-kicker">${esc(w.title)}</div>
          ${this.phaseBar(this.phaseCounts(w))}
        </div>`).join('')}`;
  },

  activityChart() {
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(addDays(todayStr(), -i));
    const per = days.map(d => {
      let gen = 0, con = 0, test = 0;
      for (const s of Store.state.sessions) {
        if (s.date !== d) continue;
        const m = MODE_BY_ID[s.modeId];
        if (!m) continue;
        if (m.cat === 'consume') con += s.minutes;
        else if (m.cat === 'recall') test += s.minutes;
        else gen += s.minutes;
      }
      return { d, gen, con, test, total: gen + con + test };
    });
    const max = Math.max(30, ...per.map(x => x.total));
    const W = 560, H = 120, gap = 6;
    const bw = (W - gap * 13) / 14;
    let bars = '';
    per.forEach((x, i) => {
      const xpos = i * (bw + gap);
      let y = H;
      const seg = (v, cls) => {
        if (!v) return '';
        const h = Math.max(2, (v / max) * (H - 4));
        y -= h;
        const r = `<rect class="${cls}" x="${xpos}" y="${y}" width="${bw}" height="${h - 1.5}" rx="2"><title>${fmtDate(x.d)}: ${v} min</title></rect>`;
        return r;
      };
      bars += seg(x.gen, 'c-gen') + seg(x.test, 'c-test') + seg(x.con, 'c-con');
      if (x.total) bars += `<text class="bar-label" x="${xpos + bw / 2}" y="${Math.max(10, y - 4)}" text-anchor="middle">${x.total}</text>`;
    });
    const ticks = per.map((x, i) => i % 3 === 0
      ? `<text class="axis-label" x="${i * (bw + gap) + bw / 2}" y="${H + 14}" text-anchor="middle">${x.d.slice(5).replace('-', '/')}</text>` : '').join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Study minutes per day, last 14 days">
      <line class="baseline" x1="0" y1="${H}" x2="${W}" y2="${H}"/>${bars}${ticks}</svg>`;
  },

  /* ================= GUIDE ================= */

  guide() {
    return `
      <h1>The Method</h1>
      <p>This app adapts Justin Sung's learning framework to score study. His material targets textbook-and-exam learning; a score is a different animal — nonverbal, multi-layered, and destined for a podium, not a test paper. Here is the translation, and how the app enforces it.</p>

      <div class="card"><div class="card-kicker">1 · Encoding beats reviewing</div>
      <p>Sung's central critique: active recall and spaced repetition are <em>retrieval</em> tools. If material is poorly encoded, no review schedule saves you — the forgetting curve is too steep. For scores this means flashcarding rehearsal numbers while never truly <em>hearing</em> the piece internally.</p>
      <p><b>In the app:</b> every passage tracks <b>encoding depth</b> — how many <em>distinct</em> generative activities you've done (singing lines, piano reduction, harmonic analysis, writing out from memory). Deeper encoding earns longer test intervals; a failed recall prescribes <em>re-encoding</em>, not just another rep.</p></div>

      <div class="card"><div class="card-kicker">2 · Prime before detail</div>
      <p>His "priming" is a fast, high-level scaffold built <em>before</em> the main learning event. The score-study equivalent is the classic conductor's first pass: architecture before bar-by-bar work.</p>
      <p><b>In the app:</b> a new work starts with a four-step priming checklist (listen through, sketch the form, note relational links, Pareto-scan for critical passages). The scheduler won't push passage-level work until the work is primed.</p></div>

      <div class="card"><div class="card-kicker">3 · PACER, translated for the podium</div>
      <p>Sung's PACER classifies information so each kind gets the right treatment. The score version:</p>
      <table class="guide-table">
        <tr><th>Type</th><th>In a score</th><th>Right treatment</th></tr>
        <tr><td><b>P</b> · Gestural (procedural)</td><td>Meter changes, cues, transitions, fermatas</td><td>Practice physically, same day — gesture is learned by doing</td></tr>
        <tr><td><b>A</b> · Relational (analogous)</td><td>Theme returns, cross-movement links, echoes of other works</td><td>Compare & critique: what changed and why?</td></tr>
        <tr><td><b>C</b> · Structural (conceptual)</td><td>Form, key plan, orchestration logic</td><td>Map it — nonlinear form maps, rebuilt from blank paper</td></tr>
        <tr><td><b>E</b> · Evidence</td><td>The pivotal modulation, the color change that makes it work</td><td>Capture into your map; rehearse by explaining aloud</td></tr>
        <tr><td><b>R</b> · Reference</td><td>Transpositions, rehearsal figures, tempi, entrance lists</td><td>Direct spaced recall — don't burn deep-study time here</td></tr>
      </table>
      <p><b>In the app:</b> passages carry type tags, and recall prompts are generated per type.</p></div>

      <div class="card"><div class="card-kicker">4 · Generate, don't re-read</div>
      <p>The generation effect: producing beats reviewing. Re-listening with the score open is the musician's re-reading — comfortable, and weak. The generative versions: audiate cold, sing inner voices, conduct from memory, write the passage out.</p>
      <p><b>In the app:</b> study modes are classed <em>consume / generate / recall</em>. The dashboard tracks your generative ratio over 14 days (podium version of the 5-hours-practice-per-1-hour-theory rule) and nags when consumption creeps past half.</p></div>

      <div class="card"><div class="card-kicker">5 · Start at the top of Bloom's ladder</div>
      <p>Sung: study at the Evaluate level and the lower levels come free. For a score: don't start by memorizing what happens at rehearsal 12 — ask what matters most in this passage, what the audience must feel, which cues actually save the ensemble.</p>
      <p><b>In the app:</b> every recall test ends with an evaluate-level question ("So what? What must the audience experience here, and what must you do to cause it?"), and comparison prompts (Analyze) generate automatically for relational passages.</p></div>

      <div class="card"><div class="card-kicker">6 · Pareto: star what carries the performance</div>
      <p>80% of the performance risk lives in 20% of the bars: transitions, exposed entrances, tempo changes. "Pareto squared": within a critical passage, name the critical bars.</p>
      <p><b>In the app:</b> star passages as critical and note their critical bars. Critical passages jump the queue in the daily plan and the review order.</p></div>

      <div class="card"><div class="card-kicker">7 · Test to the max, then micro-retrieve</div>
      <p>Frequent, hard self-testing corrects wrong hypotheses early. Micro-retrieval — testing immediately after studying — cheaply locks in a session.</p>
      <p><b>In the app:</b> after you log any generative session, the app offers a 60-second micro-retrieval. A weekly <em>synthesis test</em> per work has you rebuild the entire form map from a blank page — the whole-work recall that passage-level tests can't cover.</p></div>

      <div class="card"><div class="card-kicker">8 · Deadline-aware scheduling</div>
      <p>Textbook spaced repetition optimizes for retention forever. You need retention to peak on a specific date — the performance.</p>
      <p><b>In the app:</b> intervals compress as the performance approaches (never longer than a third of the remaining runway), so every passage gets multiple confirmations before the downbeat.</p></div>

      <div class="card"><div class="card-kicker">9 · The system survives your worst day</div>
      <p>Systems beat willpower: design for the exhausted-after-rehearsal evening, not the inspired morning. And the Zeigarnik effect — redefine winning as <em>starting</em>.</p>
      <p><b>In the app:</b> a worst-day minimum (default 10 minutes or one recall test) keeps the streak honest, and every recommended task ships with a two-minute starter version.</p></div>

      <div class="card"><div class="card-kicker">10 · Read the score like difficult text</div>
      <p>Sung's four steps for dense reading map directly onto score reading: <b>chunk</b> by phrase and harmonic unit, not bar by bar; <b>allocate</b> your inner ear deliberately (skim the routine, slow down for the dense); <b>reflect</b> at section boundaries; <b>predict</b> what comes next before you turn the page or press play.</p>
      <p><b>In the app:</b> these appear as hints attached to the listening and analysis study modes.</p></div>`;
  },

  /* ================= SETTINGS ================= */

  settings() {
    const st = Store.state.settings;
    const gh = st.github;
    return `
      <h1>Settings</h1>
      <div class="card">
        <div class="card-kicker">Daily system</div>
        <label class="field">Worst-day minimum (minutes)
          <input class="input" type="number" min="1" max="240" value="${st.dailyMinimumMinutes}" data-action="set-minimum">
        </label>
        <label class="check-row">
          <input type="checkbox" data-action="toggle-notify" ${st.notifications ? 'checked' : ''}>
          <span>Browser notifications when tests are due (while the app is open)</span>
        </label>
      </div>
      <div class="card">
        <div class="card-kicker">Backup</div>
        <div class="btn-row">
          <button class="btn" data-action="export">Export JSON</button>
          <button class="btn" data-action="import">Import JSON</button>
        </div>
        <p class="dim small">Data lives in this browser's local storage. Export regularly, or set up GitHub sync below to move between devices.</p>
      </div>
      <div class="card">
        <div class="card-kicker">GitHub sync (optional)</div>
        <p class="dim small">Stores your data as a JSON file in a GitHub repo, so any device can push/pull it. Create a <b>fine-grained personal access token</b> with <em>Contents: read & write</em> on just that repo. The token is kept only in this browser.</p>
        <div class="grid-2">
          <label class="field">Owner<input class="input" value="${esc(gh.owner)}" data-gh="owner" placeholder="your-username"></label>
          <label class="field">Repo<input class="input" value="${esc(gh.repo)}" data-gh="repo" placeholder="longitude"></label>
          <label class="field">Branch (blank = default)<input class="input" value="${esc(gh.branch)}" data-gh="branch"></label>
          <label class="field">File path<input class="input" value="${esc(gh.path)}" data-gh="path"></label>
        </div>
        <label class="field">Token<input class="input" type="password" value="${esc(gh.token)}" data-gh="token" placeholder="github_pat_…"></label>
        <div class="btn-row">
          <button class="btn primary" data-action="gh-push">Push to GitHub</button>
          <button class="btn" data-action="gh-pull">Pull from GitHub</button>
        </div>
        <div id="gh-status" class="dim small"></div>
      </div>
      <div class="card">
        <div class="card-kicker">Starter</div>
        <div class="btn-row"><button class="btn" data-action="load-example">Load example work (Beethoven 5)</button></div>
      </div>
      <div class="card danger">
        <div class="card-kicker">Danger zone</div>
        <div class="btn-row"><button class="btn danger" data-action="reset-all">Erase all data</button></div>
      </div>`;
  },
};
