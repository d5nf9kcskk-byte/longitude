/* NWSA Music — router, chrome (banner/topbar/nav), director gate. */
'use strict';

const App = {
  UNLOCK_KEY: 'nwsa_hub_director_unlocked',

  PUBLIC_NAV: [
    ['today', 'Today'],
    ['calendar', 'Calendar'],
    ['news', 'Announcements'],
    ['assignments', 'Assignments'],
    ['repertoire', 'Repertoire'],
  ],
  DIRECTOR_NAV: [
    ['home', 'Today'],
    ['roll', 'Take Roll'],
    ['out', "Who's Out"],
    ['schedule', 'Schedule Changes'],
    ['temp', 'Temporary Roster Changes'],
    ['sep1', null],
    ['roster', 'Roster'],
    ['seating', 'Seating Charts'],
    ['sep2', null],
    ['calendar', 'Calendar'],
    ['repertoire', 'Repertoire'],
    ['assignments', 'Assignments'],
    ['news', 'Announcements'],
    ['sep3', null],
    ['qr', 'QR Kit'],
    ['settings', 'Settings'],
  ],

  route() {
    const h = (location.hash || '#/today').replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    if (parts[0] === 'd') {
      return { side: 'director', page: parts[1] || 'home', arg: parts.slice(2).join('/') || null };
    }
    return { side: 'public', page: parts[0] || 'today', arg: parts.slice(1).join('/') || null };
  },

  go(hash) { location.hash = hash; },

  unlocked() {
    try { return sessionStorage.getItem(this.UNLOCK_KEY) === '1'; } catch (e) { return this._memUnlock === true; }
  },
  setUnlocked(v) {
    try { v ? sessionStorage.setItem(this.UNLOCK_KEY, '1') : sessionStorage.removeItem(this.UNLOCK_KEY); }
    catch (e) { this._memUnlock = v; }
  },

  render() {
    const r = this.route();
    const gated = r.side === 'director' && !this.unlocked();

    // Views can ask "did the user just navigate here?" (vs a same-page
    // re-render after an edit) to decide whether to reset transient state.
    const routeKey = r.side + '/' + r.page + '/' + (r.arg || '');
    this.isFreshNav = routeKey !== this._lastRouteKey;
    this._lastRouteKey = routeKey;

    document.body.className = 'side-' + (r.side === 'director' ? 'director' : 'public');
    this.renderChrome(r, gated);
    this.renderIssues();
    this.renderFooter(r);

    const view = document.getElementById('view');
    view.innerHTML = '';
    window.scrollTo(0, 0);

    if (r.side === 'director' && gated) { this.renderGate(view); return; }

    const table = r.side === 'director' ? Views.director : Views.public;
    const fn = table[r.page] || table[r.side === 'director' ? 'home' : 'today'];
    try {
      fn(view, r.arg);
    } catch (err) {
      console.error(err);
      view.appendChild(U.el('div', { class: 'card' },
        U.el('div', { class: 'card-title' }, 'Something went wrong drawing this page'),
        U.el('div', { class: 'card-body' },
          'The rest of the app is unaffected. Try another tab, or reload. Details: ' + (err && err.message ? err.message : err))));
    }
  },

  renderChrome(r, gated) {
    const chrome = document.getElementById('chrome');
    chrome.innerHTML = '';
    const isDir = r.side === 'director';

    if (isDir) {
      // The unmistakable back-end marker: dark strip + gold rule, always on top.
      chrome.appendChild(U.el('div', { class: 'director-banner', role: 'note' },
        U.el('span', { class: 'dot' }),
        U.el('span', null, 'Director Panel'),
        U.el('span', { class: 'sub' }, gated ? '· sign in required' : '· editing area — the student side shows what you set here')));
    }

    const s = Store.data.settings;
    const navItems = isDir ? this.DIRECTOR_NAV : this.PUBLIC_NAV;
    const base = isDir ? '#/d/' : '#/';

    const nav = U.el('nav', { class: 'nav', 'aria-label': 'Main navigation' });
    if (!(isDir && gated)) {
      for (const [key, label] of navItems) {
        if (label === null) { nav.appendChild(U.el('span', { class: 'nav-sep' })); continue; }
        nav.appendChild(U.el('a', {
          href: base + key,
          class: r.page === key ? 'active' : '',
          'aria-current': r.page === key ? 'page' : null,
        }, label));
      }
    }

    // Phones: cue that the nav scrolls while tabs remain offscreen.
    const updateNavCue = () => {
      nav.classList.toggle('more-right', nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 8);
    };
    nav.addEventListener('scroll', updateNavCue, { passive: true });
    requestAnimationFrame(updateNavCue);

    chrome.appendChild(U.el('header', { class: 'topbar' },
      U.el('div', { class: 'topbar-inner' },
        U.el('div', { class: 'brandline' },
          U.el('a', { class: 'brand', href: isDir ? '#/d/home' : '#/today' },
            U.el('span', { class: 'brand-mark' }, '🎻'),
            U.el('span', { class: 'brand-name' }, s.appName || 'NWSA Music'),
            U.el('span', { class: 'brand-sub' }, isDir ? 'Director Panel' : (s.subtitle || 'Ensembles Hub'))),
          U.el('span', { class: 'spacer' }),
          isDir
            ? U.el('a', { class: 'side-switch', href: '#/today', onclick: () => {} }, '← Student side')
            : U.el('a', { class: 'side-switch', href: '#/d/home' }, 'Director Login')),
        nav)));
  },

  renderIssues() {
    const root = document.getElementById('issue-root');
    root.innerHTML = '';
    if (!Store.loadIssues.length || this._issuesDismissed) return;
    const inner = U.el('div', { class: 'issue-banner-inner' },
      U.el('b', null, 'Heads up — part of your saved data could not be read.'),
      U.el('ul', null, Store.loadIssues.map(i => U.el('li', null, i))),
      U.el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        U.el('button', {
          class: 'btn sm',
          onclick: () => { U.download('nwsa-music-recovery.json', Store.exportJson()); },
        }, 'Download current data'),
        U.el('button', {
          class: 'btn sm ghost',
          onclick: () => { this._issuesDismissed = true; this.renderIssues(); },
        }, 'Dismiss')));
    root.appendChild(U.el('div', { class: 'issue-banner' }, inner));
  },

  renderFooter(r) {
    const root = document.getElementById('footer-root');
    root.innerHTML = '';
    const isDir = r.side === 'director';
    root.appendChild(U.el('div', { class: 'footer' },
      isDir
        ? U.el('span', null, 'Director Panel · ', U.el('a', { href: '#/today' }, 'Exit to student side'))
        : U.el('span', null, 'Students & families view · ', U.el('a', { href: '#/d/home' }, 'Director Login'))));
  },

  renderGate(view) {
    const s = Store.data.settings;
    const hasPin = !!(s.pin && String(s.pin).length);
    const box = U.el('div', { class: 'card', style: { maxWidth: '430px', margin: '8vh auto 0' } });
    box.appendChild(U.el('div', { class: 'card-title' }, 'Director Login'));
    box.appendChild(U.el('div', { class: 'card-body' },
      hasPin
        ? 'Enter the director PIN to open the Director Panel.'
        : 'The Director Panel is the editing area of this app — darker colors and the gold banner up top mean you are editing, not viewing.'));

    if (hasPin) {
      const pin = U.input({ type: 'password', inputmode: 'numeric', placeholder: 'PIN', autocomplete: 'off' });
      const msg = U.el('div', { class: 'hint', style: { marginTop: '8px' } });
      const tryUnlock = () => {
        if (pin.value === String(s.pin)) { this.setUnlocked(true); this.render(); }
        else { msg.textContent = 'That PIN does not match.'; pin.value = ''; pin.focus(); }
      };
      pin.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
      box.appendChild(U.el('div', { style: { marginTop: '12px' } }, pin, msg));
      box.appendChild(U.el('div', { class: 'card-actions' },
        U.el('button', { class: 'btn primary', onclick: tryUnlock }, 'Enter Director Panel'),
        U.el('a', { class: 'btn ghost', href: '#/today' }, 'Back to student side')));
    } else {
      box.appendChild(U.el('div', { class: 'card-actions' },
        U.el('button', {
          class: 'btn primary',
          onclick: () => { this.setUnlocked(true); this.render(); },
        }, 'Enter Director Panel'),
        U.el('a', { class: 'btn ghost', href: '#/today' }, 'Back to student side')));
      box.appendChild(U.el('div', { class: 'hint', style: { marginTop: '10px' } },
        'Tip: set a director PIN under Director Panel → Settings so students can\'t wander in.'));
    }
    view.appendChild(box);
  },
};

/* ---------- boot ---------- */
try {
  Store.load();
} catch (e) {
  // Never a blank page: whatever happened, come up with defaults and say so.
  console.error(e);
  Store.data = Store.defaults();
  Store.loadIssues = ['Saved data could not be read at all (' + (e && e.message ? e.message : 'unknown error') + '). The app restarted with defaults; check Settings → Recovery.'];
}
window.addEventListener('hashchange', () => App.render());
if (!location.hash) location.hash = '#/today';
App.render();
