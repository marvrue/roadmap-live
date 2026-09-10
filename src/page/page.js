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
  var MODES = ['system', 'light', 'dark'];

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

  // ---- render ----------------------------------------------------------------
  var filter = null;
  var showAllDone = false;
  var prevStatus = null;
  var unseen = false;

  function opts(changed) {
    return { t: t, lang: lang, now: Date.now(), filter: filter, colorMode: colorMode, showAllDone: showAllDone, changed: changed || null };
  }

  function render(changed) {
    // FLIP: remember where every item is, rebuild, then animate from old to new.
    var before = {};
    var old = app.querySelectorAll('.item[data-id]');
    for (var i = 0; i < old.length; i++) before[old[i].getAttribute('data-id')] = old[i].getBoundingClientRect();
    var hadContent = old.length > 0;

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

  // ---- interaction -----------------------------------------------------------
  function setFilter(id) {
    filter = id;
    render();
  }
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (e.target.closest('a')) return;
    var action = el.getAttribute('data-action');
    if (action === 'theme') applyMode(MODES[(MODES.indexOf(colorMode) + 1) % MODES.length]), render();
    else if (action === 'filter') setFilter(filter === el.getAttribute('data-id') ? null : el.getAttribute('data-id'));
    else if (action === 'clear-filter') setFilter(null);
    else if (action === 'more-done') showAllDone = true, render();
  });
  app.addEventListener('keydown', function (e) {
    var el = e.target.closest('[role="button"][data-action]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && filter) setFilter(null); });

  // ---- public API for live.js ------------------------------------------------
  window.RoadmapPage = {
    getState: function () { return state; },
    setState: function (next) {
      state = next;
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
  };

  render();
  tick();
})();
