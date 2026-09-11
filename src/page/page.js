/*
 * Browser bootstrap for both the static and the live page. Reads the embedded
 * state and locales, picks the language, remembers the color mode, renders
 * with RoadmapView and keeps relative times ticking. The live page adds
 * live.js on top, which feeds new snapshots into RoadmapPage.setState.
 */
(function () {
  'use strict';
  var V = window.RoadmapView;
  var app = document.getElementById('app');
  var read = function (id) {
    var el = document.getElementById(id);
    try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; }
  };
  var state = read('roadmap-state') || { mode: 'static', data: null };
  var locales = read('roadmap-locales') || {};
  var MODE_KEY = 'roadmap-live-mode';
  var THEME_KEY = 'roadmap-live-theme';
  var themes = Array.isArray(state.themes) ? state.themes : [];
  var theme = state.theme || themes[0] || null;
  // Where the page's own routes live (data, events, comment). The server
  // sets it when it renders the page; a host serving under /p/<id>/ passes
  // that path. Always ends with a slash.
  var base = typeof state.base === 'string' && state.base.charAt(0) === '/' ? state.base : '/';
  var MODES = ['system', 'light', 'dark'];

  // ---- write key: ?key=... once, then remembered per page in this browser --
  // The plain address is read-only. The address with ?key= (printed by the
  // server, or the hosted page's write link) stores the key and drops it from
  // the address bar; from then on the short address writes in this browser.
  var KEY_STORE = 'roadmap-live-key:' + base;
  var key = null;
  try {
    var params = new URLSearchParams(location.search);
    if (params.has('key')) {
      key = params.get('key') || null;
      params.delete('key');
      var rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
      if (key) localStorage.setItem(KEY_STORE, key); else localStorage.removeItem(KEY_STORE);
    } else {
      key = localStorage.getItem(KEY_STORE) || null;
    }
  } catch (e) { /* no storage: the key lives for this page load only */ }
  function forgetKey() {
    key = null;
    try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ }
  }

  // ---- language: ?lang, then roadmap.json / ROADMAP_LANG, then the browser
  function pickLang() {
    var available = Object.keys(locales);
    var norm = function (v) {
      if (!v) return null;
      var base = String(v).toLowerCase().split(/[-_.]/)[0];
      return available.indexOf(base) >= 0 ? base : null;
    };
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { q = null; }
    return norm(q) || norm(state.fixedLang) || norm(navigator.language) || (navigator.languages || []).map(norm).filter(Boolean)[0] || 'en';
  }
  var lang = pickLang();
  var t = V.makeT(locales[lang] || locales.en || {}, locales.en, lang);
  document.documentElement.setAttribute('lang', lang);

  // ---- color mode ------------------------------------------------------------
  var colorMode = 'system';
  try { colorMode = localStorage.getItem(MODE_KEY) || 'system'; } catch (e) { /* ignore */ }
  if (MODES.indexOf(colorMode) < 0) colorMode = 'system';
  function applyMode(m) {
    colorMode = m;
    if (m === 'system') document.documentElement.removeAttribute('data-mode');
    else document.documentElement.setAttribute('data-mode', m);
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ }
  }
  if (colorMode !== 'system') applyMode(colorMode);
  else if (document.documentElement.getAttribute('data-mode') && !document.documentElement.hasAttribute('data-mode-fixed')) {
    document.documentElement.removeAttribute('data-mode');
  }

  // ---- theme: every theme is embedded as its own style element -----------------
  function applyTheme(name) {
    theme = name;
    var styles = document.querySelectorAll('style[data-theme]');
    for (var i = 0; i < styles.length; i++) styles[i].media = styles[i].getAttribute('data-theme') === name ? 'all' : 'not all';
    try { localStorage.setItem(THEME_KEY, name); } catch (e) { /* ignore */ }
  }
  try {
    var storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme && themes.indexOf(storedTheme) >= 0 && storedTheme !== theme) applyTheme(storedTheme);
  } catch (e) { /* ignore */ }

  // ---- render ----------------------------------------------------------------
  var filter = null;
  var showAllDone = false;
  var showAllFeed = false;
  var VIEW_KEY = 'roadmap-live-view';
  var open = {};         // details[data-key] that are open, kept across re-renders
  var showAllTimeline = false;
  var sort = null;       // list view: { key, dir }
  var view = pickView();
  var share = null;      // { note: 'copied' | 'off' | 'enabling' | 'enabled' | 'error', message }
  var shareTimer = null;
  var expanded = {};     // item id -> true
  var pending = [];      // comments sent but not yet in a snapshot
  var prevStatus = null;
  var unseen = false;

  // ---- view: ?view, then the browser's memory, then roadmap.json, then the first
  function pickView() {
    var avail = V.availableViews(state.data);
    var q = null;
    try { q = new URLSearchParams(location.search).get('view'); } catch (e) { q = null; }
    if (q && avail.indexOf(q) >= 0) return q;
    var stored = null;
    try { stored = localStorage.getItem(VIEW_KEY); } catch (e) { stored = null; }
    if (stored && avail.indexOf(stored) >= 0) return stored;
    if (state.data && avail.indexOf(state.data.view) >= 0) return state.data.view;
    return avail[0];
  }
  function setView(v) {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignore */ }
    // An address that names a view keeps naming the current one.
    try {
      var p = new URLSearchParams(location.search);
      if (p.has('view')) { p.set('view', v); history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash); }
    } catch (e) { /* ignore */ }
    render();
  }

  function opts(changed) {
    return { t: t, lang: lang, now: Date.now(), filter: filter, colorMode: colorMode, theme: theme, view: view, showAllFeed: showAllFeed, showAllTimeline: showAllTimeline, sort: sort, open: open, showAllDone: showAllDone, changed: changed || null, expanded: expanded, pending: pending, share: share, canWrite: state.mode === 'live' && !!key };
  }

  function render(changed) {
    // FLIP: remember where every item is, rebuild, then animate from old to new.
    var before = {};
    var old = app.querySelectorAll('.item[data-id]');
    for (var i = 0; i < old.length; i++) before[old[i].getAttribute('data-id')] = old[i].getBoundingClientRect();
    var hadContent = old.length > 0;

    var focused = document.activeElement;
    var keep = null;
    if (focused && focused.matches && focused.matches('.comment-form input')) {
      var focusedForm = focused.closest('form');
      var focusedId = focusedForm.getAttribute('data-id');
      var sameIdForms = app.querySelectorAll('form.comment-form[data-id="' + focusedId.replace(/"/g, '\\"') + '"]');
      keep = { id: focusedId, value: focused.value, pos: focused.selectionStart, index: Array.prototype.indexOf.call(sameIdForms, focusedForm) };
    }

    app.innerHTML = V.renderApp(state, opts(changed));

    if (hadContent) {
      var moved = [];
      var now = app.querySelectorAll('.item[data-id]');
      for (var j = 0; j < now.length; j++) {
        var c = now[j];
        var prev = before[c.getAttribute('data-id')];
        if (!prev) { c.classList.add('enter'); continue; }
        var rect = c.getBoundingClientRect();
        var dx = prev.left - rect.left, dy = prev.top - rect.top;
        if (dx || dy) {
          c.style.transition = 'none';
          c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          moved.push(c);
        }
      }
      if (moved.length) {
        void document.body.offsetHeight;
        var released = false;
        var release = function () {
          if (released) return;
          released = true;
          moved.forEach(function (c) { c.style.transition = ''; c.style.transform = ''; });
        };
        requestAnimationFrame(release);
        setTimeout(release, 50);
      }
    }
    if (keep) {
      var keepForms = app.querySelectorAll('form.comment-form[data-id="' + keep.id.replace(/"/g, '\\"') + '"]');
      var keepForm = keepForms[keep.index] || keepForms[0];
      var again = keepForm ? keepForm.querySelector('input') : null;
      if (again) { again.value = keep.value; again.focus(); try { again.setSelectionRange(keep.pos, keep.pos); } catch (err) { /* ignore */ } }
    }
    setTitle();
    if (window.RoadmapLive && window.RoadmapLive.afterRender) window.RoadmapLive.afterRender();
  }

  function setTitle() {
    if (!state.data) return;
    var pct = V.progressPercent(state.data);
    document.title = (unseen ? '● ' : '') + pct + ' % · ' + state.data.project;
    drawFavicon(pct);
  }

  function drawFavicon(pct) {
    var link = document.getElementById('favicon');
    if (!link) return;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    if (!ctx) return;
    var styles = getComputedStyle(document.documentElement);
    var ink = styles.getPropertyValue('--text').trim() || '#000';
    ctx.lineWidth = 10;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.beginPath(); ctx.arc(32, 32, 24, 0, Math.PI * 2); ctx.stroke();
    if (pct > 0) {
      ctx.strokeStyle = ink;
      ctx.beginPath(); ctx.arc(32, 32, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct / 100); ctx.stroke();
    }
    link.href = c.toDataURL('image/png');
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { unseen = false; setTitle(); }
  });

  // ---- per-second updates ----------------------------------------------------
  function tick() {
    var now = Date.now();
    var i, nodes;
    nodes = app.querySelectorAll('[data-rel]');
    for (i = 0; i < nodes.length; i++) nodes[i].textContent = V.relativeTime(nodes[i].getAttribute('data-rel'), now, lang);
    nodes = app.querySelectorAll('[data-since]');
    for (i = 0; i < nodes.length; i++) nodes[i].lastChild.textContent = V.elapsed(nodes[i].getAttribute('data-since'), now);
  }
  setInterval(tick, 1000);

  // ---- comments ---------------------------------------------------------------
  // The static page never writes: bail out before touching pending/network.
  function sendComment(id, text) {
    text = String(text || '').trim();
    if (!id || !text) return Promise.resolve(false);
    if (state.mode !== 'live' || !key) return Promise.resolve(false);
    // A retry with the same text replaces the earlier failed entry instead
    // of stacking another one below it.
    pending = pending.filter(function (p) { return !(p.failed && p.id === id && p.text === text); });
    var entry = { id: id, text: text, at: new Date().toISOString() };
    pending.push(entry);
    expanded[id] = true;
    render();
    var fail = function () {
      entry.failed = true;
      render();
      return false;
    };
    return fetch(base + 'comment', { method: 'POST', headers: { 'content-type': 'application/json', 'x-roadmap-key': key }, body: JSON.stringify({ id: id, text: text }) })
      .then(function (r) {
        if (r.ok) return true;
        // The key is no longer valid (server restarted with a new one): back
        // to read-only until the write address is opened again.
        if (r.status === 401) forgetKey();
        return fail();
      })
      .catch(fail);
  }

  // Drop pending entries once the snapshot contains them.
  function settlePending() {
    if (!pending.length || !state.data) return;
    pending = pending.filter(function (p) {
      var it = state.data.items.filter(function (x) { return x.id === p.id; })[0];
      return !(it && (it.comments || []).some(function (c) { return c.from === 'human' && c.text === p.text; }));
    });
  }

  // ---- interaction -----------------------------------------------------------
  function setFilter(id) {
    filter = id;
    render();
  }
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    // View names are links (they work without JavaScript); with it, switch in place.
    if (action === 'view') { e.preventDefault(); setView(el.getAttribute('data-view')); return; }
    if (e.target.closest('a')) return;
    if (action === 'theme') applyMode(MODES[(MODES.indexOf(colorMode) + 1) % MODES.length]), render();
    else if (action === 'share') shareLink();
    else if (action === 'enable-pages') enablePages();
    else if (action === 'theme-name') applyTheme(themes[(themes.indexOf(theme) + 1) % themes.length]), render();
    else if (action === 'filter') setFilter(filter === el.getAttribute('data-id') ? null : el.getAttribute('data-id'));
    else if (action === 'clear-filter') setFilter(null);
    else if (action === 'more-done') showAllDone = true, render();
    else if (action === 'more-feed') showAllFeed = true, render();
    else if (action === 'more-timeline') showAllTimeline = true, render();
    else if (action === 'sort') {
      var k = el.getAttribute('data-key');
      // Same column again flips the direction; a new column starts with the
      // direction that is useful for it (newest, highest first).
      if (sort && sort.key === k) sort = { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
      else sort = { key: k, dir: /^(updated|pr|points)$/.test(k) ? 'desc' : 'asc' };
      render();
    }
    else if (action === 'expand') { var id = el.getAttribute('data-id'); if (expanded[id]) delete expanded[id]; else expanded[id] = true; render(); }
    else if (action === 'answer') sendComment(el.getAttribute('data-id'), el.getAttribute('data-text'));
  });
  // Remember which folded lists (done items, resolved points, ...) are open
  // across re-renders.
  app.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d.matches || !d.matches('details[data-key]')) return;
    var k = d.getAttribute('data-key');
    if (d.open) open[k] = true; else delete open[k];
  }, true);
  app.addEventListener('submit', function (e) {
    var form = e.target.closest('form.comment-form');
    if (!form) return;
    e.preventDefault();
    var input = form.querySelector('input[name="text"]');
    var value = input.value;
    input.value = '';
    var id = form.getAttribute('data-id');
    var sameIdForms = app.querySelectorAll('form.comment-form[data-id="' + id.replace(/"/g, '\\"') + '"]');
    var last = { id: id, text: value, index: Array.prototype.indexOf.call(sameIdForms, form) };
    sendComment(id, value).then(function (ok) {
      if (ok) return;
      var forms = app.querySelectorAll('form.comment-form[data-id="' + last.id.replace(/"/g, '\\"') + '"]');
      var target = forms[last.index] || forms[0];
      var again = target ? target.querySelector('input[name="text"]') : null;
      if (again && !again.value) again.value = last.text;
    });
  });
  app.addEventListener('keydown', function (e) {
    var el = e.target.closest('[role="button"][data-action]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && filter) setFilter(null); });

  // ---- share -----------------------------------------------------------------
  function setShare(next, ms) {
    clearTimeout(shareTimer);
    share = next;
    render();
    if (ms) shareTimer = setTimeout(function () { share = null; render(); }, ms);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try { window.prompt(t('page.share.title'), text); resolve(); } catch (e) { reject(e); }
    });
  }
  function shareLink() {
    var url = state.shareUrl || (state.mode !== 'live' ? location.href : null);
    if (url) {
      copyText(url).then(function () { setShare({ note: 'copied' }, 2500); }, function () { setShare({ note: 'error', message: url }, 6000); });
    } else if (state.pages && !state.pages.enabled) {
      setShare({ note: 'off' });
    }
  }
  function enablePages() {
    if (state.mode !== 'live' || !key) return;
    setShare({ note: 'enabling' });
    fetch(base + 'pages/enable', { method: 'POST', headers: { 'content-type': 'application/json', 'x-roadmap-key': key }, body: '{}' })
      .then(function (r) {
        if (r.ok) return setShare({ note: 'enabled' }, 8000);
        if (r.status === 401) forgetKey();
        return r.json().then(function (b) { setShare({ note: 'error', message: b && b.error ? b.error : String(r.status) }, 8000); }, function () { setShare({ note: 'error', message: String(r.status) }, 8000); });
      })
      .catch(function (e) { setShare({ note: 'error', message: e && e.message ? e.message : 'network' }, 8000); });
  }

  // ---- public API for live.js ------------------------------------------------
  window.RoadmapPage = {
    getState: function () { return state; },
    setState: function (next) {
      state = next;
      state.themes = themes;
      state.theme = theme;
      state.base = base;
      settlePending();
      var changed = null;
      if (state.data) {
        var status = {};
        state.data.items.forEach(function (it) { status[it.id] = it.status; });
        if (prevStatus) {
          changed = {};
          var any = false;
          state.data.items.forEach(function (it) { if (prevStatus[it.id] !== undefined && prevStatus[it.id] !== it.status) { changed[it.id] = true; any = true; } });
          if (any && document.visibilityState === 'hidden') unseen = true;
        }
        prevStatus = status;
      }
      render(changed);
    },
    render: render,
    lang: lang,
    t: t,
    base: base,
    sendComment: sendComment,
  };

  render();
  tick();
})();
