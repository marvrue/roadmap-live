/*
 * Shared page renderer. Runs in Node (static render, live server) and in the
 * browser (live updates, language and filter changes). It renders HTML from a
 * state object and a translator; it never touches the DOM or the filesystem.
 *
 * state = {
 *   mode: 'live' | 'static',
 *   data: roadmap | null, ok, error, file,
 *   updatedAt, changes: [...],        live view
 *   changelog: [lines], generatedAt,  static view
 *   repoUrl, roadmapUrl
 * }
 * opts = { t, lang, now, filter, colorMode, theme, view, showAllDone, showAllFeed,
 *          sort, open, expanded, pending, share, canWrite, changed }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoadmapView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_STALE_DAYS = 7;
  var FEED_MAX = 8;
  var FEED_SHORT = 4;
  // Views, in the order of the row above the content. Adding one: a render
  // function, a case in renderView, an entry here, a label under
  // page.views.<name> in the locales. Views that need synced data (prs,
  // points) are listed only when the roadmap has such data; see availableViews.
  var VIEWS = ['milestones', 'board', 'focus', 'timeline', 'conversations', 'points', 'prs', 'signals', 'list'];
  var DONE_VISIBLE = 3;
  var TIMELINE_SHORT = 40;
  var LIST_COLS = ['status', 'title', 'milestone', 'pr', 'updated', 'points'];
  // Columns whose first click sorts descending (newest, highest first).
  var LIST_DESC_FIRST = { updated: true, pr: true, points: true };
  var STATUS_ORDER = { blocked: 0, active: 1, todo: 2, done: 3 };

  // ---- small helpers ------------------------------------------------------

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function get(obj, key) {
    return key.split('.').reduce(function (o, k) { return o && o[k] !== undefined ? o[k] : undefined; }, obj);
  }

  function interpolate(str, params) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return params && params[k] !== undefined ? String(params[k]) : m;
    });
  }

  function makeT(dict, fallback, lang) {
    var rules = null;
    try { rules = new Intl.PluralRules(lang || 'en'); } catch (e) { rules = null; }
    var t = function (key, params) {
      var value = get(dict, key);
      if (value === undefined && fallback) value = get(fallback, key);
      if (value === undefined) return key;
      if (value && typeof value === 'object') {
        var n = params && typeof params.n === 'number' ? params.n : 0;
        var cat = rules ? rules.select(n) : (n === 1 ? 'one' : 'other');
        value = value[cat] !== undefined ? value[cat] : value.other;
      }
      return interpolate(value, params);
    };
    t.lang = lang || 'en';
    return t;
  }

  // Intl formatters are the expensive part of a render; one per language
  // and option set serves every row.
  var formatters = {};
  function formatter(kind, lang, options) {
    var key = kind + ':' + (lang || 'en') + ':' + JSON.stringify(options);
    if (!formatters[key]) {
      var Ctor = Intl[kind];
      try { formatters[key] = new Ctor(lang || 'en', options); } catch (e) { formatters[key] = new Ctor('en', options); }
    }
    return formatters[key];
  }

  function relativeTime(iso, now, lang) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var diff = (t - now) / 1000;
    var abs = Math.abs(diff);
    var rtf = formatter('RelativeTimeFormat', lang, { numeric: 'auto' });
    if (abs < 45) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
    if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month');
    return rtf.format(Math.round(diff / (86400 * 365)), 'year');
  }

  function formatDateTime(iso, lang) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return formatter('DateTimeFormat', lang, { dateStyle: 'medium', timeStyle: 'short' }).format(d); } catch (e) { return d.toISOString(); }
  }

  function elapsed(iso, now) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.max(0, Math.floor((now - t) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    if (h >= 48) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
  }

  function isSameDay(iso, now) {
    var d = new Date(iso), n = new Date(now);
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function time(iso, now, lang, cls) {
    if (!iso) return '';
    return '<time class="' + (cls || '') + '" datetime="' + esc(iso) + '" data-rel="' + esc(iso) + '" title="' + esc(formatDateTime(iso, lang)) + '">' + esc(relativeTime(iso, now, lang)) + '</time>';
  }

  function prFromSource(source) {
    var m = /^pr:(\d+)/.exec(source || '');
    return m ? Number(m[1]) : null;
  }

  function lastPr(item) {
    return item.prs && item.prs.length ? item.prs[item.prs.length - 1] : null;
  }

  function prUrl(state, number) {
    return state.repoUrl ? state.repoUrl + '/pull/' + number : null;
  }

  function prLabel(state, t, number) {
    var text = t('page.pr', { number: number });
    var url = prUrl(state, number);
    return url ? '<a href="' + esc(url) + '">' + esc(text) + '</a>' : esc(text);
  }

  // "#44, #45", each a link when the repository is known.
  function prLinks(state, prs) {
    return prs.map(function (n) { var u = prUrl(state, n); return u ? '<a href="' + esc(u) + '">#' + n + '</a>' : '#' + n; }).join(', ');
  }

  // "PR #44", or "PRs #44, #45" for items with several pull requests.
  function prList(state, t, it) {
    if (it.prs.length === 1) return prLabel(state, t, it.prs[0]);
    return esc(t('page.prs', { list: '' })).trim() + ' ' + prLinks(state, it.prs);
  }

  // The GitHub address of the comment an open point came from. Sources look
  // like pr:44#review_comment:2001, pr:42#comment:1893 or pr:42#review:7.
  function pointUrl(state, source) {
    var m = /^pr:(\d+)(?:#(review_comment|comment|review):(\d+))?/.exec(source || '');
    if (!m) return null;
    var base = prUrl(state, m[1]);
    if (!base) return null;
    if (m[2] === 'review_comment') return base + '#discussion_r' + m[3];
    if (m[2] === 'comment') return base + '#issuecomment-' + m[3];
    if (m[2] === 'review') return base + '#pullrequestreview-' + m[3];
    return base;
  }

  function pointLabel(state, t, p) {
    var n = prFromSource(p.source);
    if (!n) return '';
    var url = pointUrl(state, p.source);
    var text = t('page.pr', { number: n });
    return url ? '<a href="' + esc(url) + '">' + esc(text) + '</a>' : esc(text);
  }

  function formatDay(iso, now, lang, t) {
    var d = new Date(iso), n = new Date(now);
    if (isNaN(d.getTime())) return '';
    if (isSameDay(iso, now)) return t('page.timeline.today');
    var y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (isSameDay(iso, y.getTime())) return t('page.timeline.yesterday');
    var o = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== n.getFullYear()) o.year = 'numeric';
    try { return formatter('DateTimeFormat', lang, o).format(d); } catch (e) { return d.toDateString(); }
  }

  function formatClock(iso, lang) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return formatter('DateTimeFormat', lang, { hour: '2-digit', minute: '2-digit' }).format(d); } catch (e) { return ''; }
  }

  // The views this roadmap can show. Pull requests and open points only
  // exist after a sync; until then their views would be empty, so their
  // names stay out of the row.
  function availableViews(data) {
    if (!data) return VIEWS.slice();
    var hasPrs = data.items.some(function (it) { return it.prs && it.prs.length; }) || (data.unplanned || []).some(function (u) { return u.prs && u.prs.length; });
    var hasPoints = data.items.some(function (it) { return it.open_points && it.open_points.length; });
    return VIEWS.filter(function (v) { return v === 'prs' ? hasPrs : v === 'points' ? hasPoints : true; });
  }

  function resolveView(data, v) {
    var avail = availableViews(data);
    return avail.indexOf(v) >= 0 ? v : avail[0];
  }

  function visibleItems(data, opts) {
    return opts.filter ? data.items.filter(function (it) { return it.milestone === opts.filter; }) : data.items;
  }

  function isOpen(opts, key) {
    return !!(opts.open && opts.open[key]);
  }

  // A folded list that remembers being open across re-renders by its key.
  function fold(opts, key, summary, body, cls, attrs) {
    return '<details class="' + (cls ? cls + ' ' : '') + 'fold" data-key="' + esc(key) + '"' + (attrs || '') + (isOpen(opts, key) ? ' open' : '') + '><summary>' + summary + '</summary>' + body + '</details>';
  }

  function hasQuestion(it) {
    return !!(it.question && it.question.text && openItem(it));
  }

  function milestoneIndex(data) {
    var order = {}, titles = {};
    data.milestones.forEach(function (m, i) { order[m.id] = i; titles[m.id] = m.title; });
    return { order: order, titles: titles };
  }

  function sortedUnplanned(data) {
    return (data.unplanned || []).slice().sort(function (a, b) { return (Date.parse(b.first_seen) || 0) - (Date.parse(a.first_seen) || 0); });
  }

  // One row of the shared grammar: mono label, text, mono time on the right.
  // label and text are HTML, at is an ISO time.
  function row(opts, label, text, at, labelCls) {
    return '<li><span class="label' + (labelCls ? ' ' + labelCls : '') + '">' + label + '</span><span class="text">' + text + '</span><span class="when">' + time(at, opts.now, opts.lang) + '</span></li>';
  }

  // ---- derived data --------------------------------------------------------

  // The current milestone is the first in order that is not complete. A
  // milestone without items is not started, not finished: a fresh project
  // shows its empty first milestone as current, not a later seeded one.
  function milestoneStats(data) {
    var stats = data.milestones.map(function (m) {
      var items = data.items.filter(function (it) { return it.milestone === m.id; });
      var done = items.filter(function (it) { return it.status === 'done'; }).length;
      return { m: m, total: items.length, done: done, complete: items.length > 0 && done === items.length };
    });
    var current = null;
    for (var i = 0; i < stats.length; i++) {
      if (!stats[i].complete) { current = stats[i]; break; }
    }
    return { stats: stats, current: current };
  }

  // Goal numbers: plain integers below COMPACT_FROM, then a hand-rolled compact
  // form (12.3k, 1.5M) that reads the same in every language and fits the label
  // column. Intl's compact notation would print "12.000" in German. Rounding
  // that lands on 1000 of a unit moves up a unit (999,950 is 1M, not 1000k).
  var COMPACT_FROM = 10000;
  var UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  function formatCount(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    if (Math.abs(Math.round(n)) < COMPACT_FROM) return String(Math.round(n));
    var i = UNITS.length - 1;
    while (i > 0 && Math.abs(n) >= UNITS[i - 1][0]) i--;
    for (;;) {
      var v = n / UNITS[i][0];
      var s = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
      if (Math.abs(s) < 1000 || i === 0) return String(s) + UNITS[i][1];
      i--;
    }
  }

  function measured(goal) {
    return typeof goal.current === 'number';
  }

  function goalText(goal) {
    return (measured(goal) ? formatCount(goal.current) : '–') + '/' + formatCount(goal.target);
  }

  function goalReached(goal) {
    return measured(goal) && goal.current >= goal.target;
  }

  function hasGoal(it) {
    return it.goal && typeof it.goal === 'object' && typeof it.goal.target === 'number';
  }

  function lastActivity(item) {
    var times = [];
    if (item.updated) times.push(Date.parse(item.updated));
    (item.open_points || []).forEach(function (p) {
      if (p.opened) times.push(Date.parse(p.opened));
      if (p.resolved) times.push(Date.parse(p.resolved));
    });
    times = times.filter(function (x) { return !isNaN(x); });
    return times.length ? Math.max.apply(null, times) : null;
  }

  // Stale: active or blocked, or linked to PRs and not done, with no activity
  // for stale_after_days. Computed here, never stored.
  function staleDays(item, now, staleAfter) {
    var busy = item.status === 'active' || item.status === 'blocked' || (item.prs && item.prs.length && item.status !== 'done');
    if (!busy) return 0;
    var last = lastActivity(item);
    if (last === null) return 0;
    var days = Math.floor((now - last) / 86400000);
    return days >= staleAfter ? days : 0;
  }

  function openPoints(item) {
    return (item.open_points || []).filter(function (p) { return !p.resolved; });
  }

  function openItem(it) {
    return it.status !== 'done';
  }

  function commentsOf(it, opts) {
    var list = (it.comments || []).slice();
    (opts.pending || []).forEach(function (p) {
      if (p.id === it.id) list.push({ from: 'human', text: p.text, at: p.at, pending: true, failed: p.failed });
    });
    return list;
  }

  // "Since you last looked": newest first, max 8. Stale items come first
  // because they are a current signal; the time on the right is the last
  // activity.
  function computeFeed(data, now, t) {
    var staleAfter = data.stale_after_days || DEFAULT_STALE_DAYS;
    var stale = [], rest = [];
    data.items.forEach(function (it) {
      var days = staleDays(it, now, staleAfter);
      if (days) {
        stale.push({ kind: 'stale', at: new Date(lastActivity(it)).toISOString(), label: t('page.feed.stale'), attention: true, text: t('page.feed.staleText', { n: days, title: it.title }), id: it.id });
      }
      if (it.updated && it.status !== 'todo') {
        var pr = lastPr(it);
        rest.push({ kind: 'status', at: it.updated, pr: pr, label: pr ? null : t('page.status.' + it.status), text: t('page.feed.statusChange', { title: it.title, status: t('page.status.' + it.status) }), id: it.id, attention: it.status === 'blocked' });
      }
      openPoints(it).forEach(function (p) {
        rest.push({ kind: 'point', at: p.opened, pr: prFromSource(p.source), label: null, text: t('page.feed.openPoint', { title: it.title, text: p.text }), id: it.id });
      });
      (it.comments || []).forEach(function (c) {
        if (c.from === 'agent' && openItem(it)) {
          rest.push({ kind: 'comment', at: c.at, pr: null, label: t('page.feed.agent'), text: it.title + ': ' + c.text, id: it.id });
        }
      });
    });
    (data.unplanned || []).forEach(function (u) {
      rest.push({ kind: 'unplanned', at: u.first_seen, pr: lastPr(u), label: null, text: t('page.feed.unplanned', { title: u.title }), tag: t('page.feed.notOnRoadmap'), attention: true });
    });
    // At most one goal row, the latest change: a daily pulse must not turn the
    // feed into a ticker. A moving number is a message, not an attention signal.
    var latestGoal = null;
    data.items.forEach(function (it) {
      // A row needs a measured value and a parsable time; one bad entry must not win by comparing against NaN.
      if (!hasGoal(it) || !measured(it.goal) || isNaN(Date.parse(it.goal.changed))) return;
      if (!latestGoal || Date.parse(it.goal.changed) > Date.parse(latestGoal.goal.changed)) latestGoal = it;
    });
    if (latestGoal) {
      rest.push({ kind: 'goal', at: latestGoal.goal.changed, pr: null, label: goalText(latestGoal.goal), text: latestGoal.title + ': ' + latestGoal.goal.label, id: latestGoal.id });
    }
    var byTime = function (a, b) { return (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0); };
    stale.sort(byTime);
    rest.sort(byTime);
    return stale.concat(rest).slice(0, FEED_MAX);
  }

  // ---- sections ------------------------------------------------------------

  function renderBanner(state, t) {
    if (!state.error) return '';
    return '<div class="banner"><strong>' + esc(t('page.invalid', { file: state.file || 'roadmap.json' })) + '</strong>\n' + esc(state.error) + '</div>';
  }

  function latestPr(data) {
    var best = null;
    data.items.forEach(function (it) { (it.prs || []).forEach(function (n) { if (best === null || n > best) best = n; }); });
    (data.unplanned || []).forEach(function (u) { (u.prs || []).forEach(function (n) { if (best === null || n > best) best = n; }); });
    return best;
  }

  function latestUpdate(data) {
    var best = null;
    data.items.forEach(function (it) {
      var l = lastActivity(it);
      if (l !== null && (best === null || l > best)) best = l;
    });
    if (data.sync && data.sync.last_run) {
      var s = Date.parse(data.sync.last_run);
      if (!isNaN(s) && (best === null || s > best)) best = s;
    }
    return best === null ? null : new Date(best).toISOString();
  }

  function renderHeader(state, opts) {
    var t = opts.t;
    var data = state.data;
    var parts = [];
    if (state.mode === 'live') {
      parts.push('<span id="conn" class="conn off">' + esc(t('page.disconnected')) + '</span>');
      parts.push('<span id="updated">' + (state.updatedAt ? esc(t('page.updated', { time: '' })).trim() + ' ' + time(state.updatedAt, opts.now, opts.lang) : esc(t('page.noData'))) + '</span>');
      if (state.git && state.git.branch) {
        var g = [esc(state.git.branch)];
        if (state.git.ahead) g.push(esc(t('page.git.ahead', { n: state.git.ahead })));
        if (state.git.changed) g.push(esc(t('page.git.changed', { n: state.git.changed })));
        parts.push('<span class="sep">&middot;</span><span class="git">' + g.join(' &middot; ') + '</span>');
      }
    } else if (data) {
      var upd = latestUpdate(data);
      parts.push('<span>' + (upd ? esc(t('page.updated', { time: '' })).trim() + ' ' + time(upd, opts.now, opts.lang) : esc(t('page.updatedNever'))) + '</span>');
      var pr = latestPr(data);
      if (pr) parts.push('<span class="sep">&middot;</span><span>' + prLabel(state, t, pr) + '</span>');
    }
    if (opts.theme && state.themes && state.themes.length > 1) {
      parts.push('<button type="button" class="theme" data-action="theme-name" title="' + esc(t('page.pickTheme', { list: state.themes.join(', ') })) + '">' + esc(opts.theme) + '</button>');
    }
    parts.push('<button type="button" class="theme" data-action="theme" title="' + esc(t('page.themeTitle')) + '">' + esc(t('page.theme.' + (opts.colorMode || 'system'))) + '</button>');
    var canShare = state.mode !== 'live' || state.shareUrl || (state.pages && !state.pages.enabled);
    if (canShare) parts.push('<button type="button" class="theme" data-action="share" title="' + esc(t('page.share.title')) + '">' + esc(t('page.share.button')) + '</button>');
    var note = opts.share && opts.share.note;
    if (note === 'copied') parts.push('<span class="share-note">' + esc(t('page.share.copied')) + '</span>');
    else if (note === 'off') parts.push('<span class="share-note attention">' + esc(t('page.share.off')) + '<button type="button" data-action="enable-pages">' + esc(t('page.share.enable')) + '</button></span>');
    else if (note === 'enabling') parts.push('<span class="share-note">' + esc(t('page.share.enabling')) + '</span>');
    else if (note === 'enabled') parts.push('<span class="share-note">' + esc(t('page.share.enabled')) + '</span>');
    else if (note === 'error') parts.push('<span class="share-note attention">' + esc(t('page.share.error', { message: opts.share.message || '' })) + '</span>');
    var brand = '<h1>' + esc(data ? data.project : 'roadmap-live') + '</h1>';
    if (data && typeof data.tagline === 'string' && data.tagline.trim()) brand += '<p class="tagline">' + esc(data.tagline) + '</p>';
    return '<header class="top"><div class="brand">' + brand + '</div><div class="meta">' + parts.join('') + '</div></header>';
  }

  function renderProgress(state, opts) {
    var t = opts.t, data = state.data;
    var info = milestoneStats(data);
    var segs = info.stats.map(function (s) {
      var cls = 'seg' + (s.complete ? ' is-done' : '') + (s === info.current ? ' is-current' : '') + (opts.filter === s.m.id ? ' is-filter' : '');
      var pct = s.total ? (100 * s.done / s.total) : 0;
      return '<div class="' + cls + '" role="button" tabindex="0" data-action="filter" data-id="' + esc(s.m.id) + '" aria-pressed="' + (opts.filter === s.m.id ? 'true' : 'false') + '" style="flex-grow:' + Math.max(s.total, 1) + '" title="' + esc(t('page.milestoneTitle', { title: s.m.title, done: s.done, total: s.total })) + '">' +
        '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div>' +
        '<div class="info"><span class="name">' + esc(s.m.title) + '</span><span class="count">' + s.done + '/' + s.total + '</span></div></div>';
    });
    var total = data.items.length;
    var done = data.items.filter(function (it) { return it.status === 'done'; }).length;
    var pct = total ? Math.round(100 * done / total) : 0;
    var today = data.items.filter(function (it) { return it.status === 'done' && it.updated && isSameDay(it.updated, opts.now); }).length;
    var filterbar = '';
    if (opts.filter) {
      var ms = data.milestones.filter(function (m) { return m.id === opts.filter; })[0];
      if (ms) filterbar = '<div class="filterbar"><span>' + esc(t('page.filterOnly', { title: ms.title })) + '</span><button type="button" data-action="clear-filter">' + esc(t('page.filterClear')) + '</button></div>';
    }
    return '<section class="progress"><div class="segments">' + segs.join('') + '</div>' +
      '<div class="total"><span class="big">' + done + '/' + total + ' &middot; ' + pct + ' %</span>' + (today ? '<span class="today">' + esc(t('page.todayDone', { n: today })) + '</span>' : '') + '</div></section>' + filterbar;
  }

  function renderFeed(state, opts) {
    var t = opts.t;
    var feed = computeFeed(state.data, opts.now, t);
    var rows = feed.map(function (e) {
      var label = e.pr ? prLabel(state, t, e.pr) : esc(e.label || '');
      return '<li data-kind="' + e.kind + '"><span class="label' + (e.attention ? ' attention' : '') + '">' + label + '</span>' +
        '<span class="text">' + esc(e.text) + (e.tag ? '<span class="tag">' + esc(e.tag) + '</span>' : '') + '</span>' +
        '<span class="when">' + time(e.at, opts.now, opts.lang) + '</span></li>';
    });
    var more = '';
    if (!opts.showAllFeed && rows.length > FEED_SHORT) {
      more = '<div class="more"><button type="button" data-action="more-feed">' + esc(t('page.since.showAll', { n: rows.length })) + '</button></div>';
      rows = rows.slice(0, FEED_SHORT);
    }
    return '<section class="since"><h2 class="section">' + esc(t('page.since.title')) + '</h2>' +
      (rows.length ? '<ul class="rows">' + rows.join('') + '</ul>' + more : '<div class="none">' + esc(t('page.since.empty')) + '</div>') + '</section>';
  }

  function renderWaiting(state, opts) {
    var t = opts.t;
    var asking = state.data.items.filter(hasQuestion);
    if (!asking.length) return '';
    var rows = asking.map(function (it) {
      return '<li><span class="label attention">' + esc(it.title) + '</span><div class="q">' + renderQuestionBody(state, opts, it, false) + '</div></li>';
    });
    return '<section class="waiting"><h2 class="section">' + esc(t('page.waiting.title')) + '</h2><ul>' + rows.join('') + '</ul></section>';
  }

  // The question text with its answer buttons. inThread: the item's
  // conversation follows and brings its own field and read-only hint.
  function renderQuestionBody(state, opts, it, inThread) {
    var t = opts.t, q = it.question;
    var out = esc(q.text);
    if (writable(state, opts)) {
      out += '<div class="answers">';
      (q.options || []).forEach(function (o) {
        out += '<button type="button" data-action="answer" data-id="' + esc(it.id) + '" data-text="' + esc(o) + '">' + esc(o) + '</button>';
      });
      out += '</div>' + (inThread ? '' : renderCommentForm(it, t));
    } else if (!inThread || state.mode !== 'live') {
      out += '<div class="hint">' + esc(t(state.mode === 'live' ? 'page.readOnly' : 'page.waiting.hint')) + '</div>';
    }
    return out;
  }

  // A question inside an item block (focus, conversations).
  function renderQuestion(state, opts, it) {
    if (!hasQuestion(it)) return '';
    return '<div class="q"><span class="label attention">' + esc(opts.t('page.signals.question')) + '</span>' + renderQuestionBody(state, opts, it, true) + '</div>';
  }

  // Writing needs the live page and the write key in the browser. The
  // server renders without the key; the page re-renders once it holds one.
  function writable(state, opts) {
    return state.mode === 'live' && opts.canWrite === true;
  }

  function renderCommentForm(it, t) {
    return '<form class="comment-form" data-id="' + esc(it.id) + '"><input name="text" type="text" maxlength="2000" autocomplete="off" placeholder="' + esc(t('page.comments.placeholder')) + '"><button type="submit">' + esc(t('page.comments.send')) + '</button></form>';
  }

  function renderConversation(state, opts, it) {
    var t = opts.t;
    var list = commentsOf(it, opts);
    var items = list.map(function (c) {
      var who = c.from === 'agent' ? t('page.comments.agent') : t('page.comments.you');
      var when = c.pending ? esc(t(c.failed ? 'page.comments.failed' : 'page.comments.sent')) : time(c.at, opts.now, opts.lang);
      var whenCls = 'when' + (c.failed ? ' attention' : '');
      return '<li class="' + esc(c.from) + '"><span class="label">' + esc(who) + '</span><span class="text">' + esc(c.text) + '</span><span class="' + whenCls + '">' + when + '</span></li>';
    });
    var out = items.length ? '<ul class="conv">' + items.join('') + '</ul>' : '';
    if (writable(state, opts)) out += renderCommentForm(it, t);
    else if (state.mode === 'live') out += '<div class="hint">' + esc(t('page.readOnly')) + '</div>';
    return out;
  }

  function renderNow(state, opts) {
    var t = opts.t, data = state.data;
    var titles = milestoneIndex(data).titles;
    var active = data.items.filter(function (it) { return it.status === 'active'; });
    if (state.mode !== 'live' && !active.length) return '';
    var out = '<div id="now" class="now' + (active.length ? ' has-active' : '') + '">';
    if (active.length) {
      out += '<div class="eyebrow"><span>' + esc(active.length === 1 ? t('page.now.inProgress') : t('page.now.inProgressN', { n: active.length })) + '</span></div>';
      active.forEach(function (it) {
        out += '<div class="item"><div class="head"><div class="title">' + esc(it.title) + '</div>';
        if (it.updated) out += '<div class="elapsed" data-since="' + esc(it.updated) + '"><small>' + esc(t('page.now.since')) + '</small><span>' + elapsed(it.updated, opts.now) + '</span></div>';
        out += '</div><div class="sub"><span>' + esc(titles[it.milestone] || it.milestone) + '</span>';
        if (it.updated) out += time(it.updated, opts.now, opts.lang);
        out += '</div>';
        if (it.note) out += '<p class="note">' + esc(it.note) + '</p>';
        out += '</div>';
      });
    } else {
      out += renderIdle(state, opts);
    }
    return out + '</div>';
  }

  // Nothing in progress: name the next open item of the current milestone,
  // or of the given items when a milestone filter narrows the view.
  function renderIdle(state, opts, items) {
    var t = opts.t, data = state.data;
    var next = null;
    if (items) {
      next = items.filter(function (it) { return it.status === 'todo'; })[0] || null;
    } else {
      var info = milestoneStats(data);
      if (info.current) next = data.items.filter(function (it) { return it.status === 'todo' && it.milestone === info.current.m.id; })[0] || null;
      // An empty current milestone has nothing to start; point at the first open item in milestone order.
      if (!next) {
        var order = {};
        data.milestones.forEach(function (m, i) { order[m.id] = i; });
        next = sortItems(data.items.filter(function (it) { return it.status === 'todo'; }), order, 'todo')[0] || null;
      }
    }
    var out = '<div class="eyebrow"><span>' + esc(next ? t('page.now.idle') : t('page.now.allDone')) + '</span></div><div class="idle">';
    if (next) out += esc(t('page.now.next', { title: '' })).replace(/\s*$/, '') + ' <b>' + esc(next.title) + '</b>';
    else if (data.items.length) out += esc(t('page.now.summary', { n: data.milestones.length, items: data.items.length }));
    else out += esc(t('page.now.empty'));
    return out + '</div>';
  }

  function renderHistory(state, opts) {
    var t = opts.t;
    var changes = state.changes || [];
    var items = changes.map(function (c) {
      var kind = c.from === null && c.to !== 'done' && c.to !== 'active' && c.to !== 'blocked' ? 'added' : c.to;
      return '<li><span class="what" title="' + esc(c.title + ': ' + (c.from || '–') + ' → ' + c.to) + '">' + esc(c.title) + '<em>' + esc(t('page.change.' + kind)) + '</em></span><span class="when">' + time(c.at, opts.now, opts.lang) + '</span></li>';
    });
    return '<aside class="history"><h2 class="section">' + esc(t('page.history.title')) + '</h2><ul id="history">' +
      (items.length ? items.join('') : '<li class="none">' + esc(t('page.history.empty')) + '</li>') + '</ul></aside>';
  }

  // mode: a board column ('todo', 'active', 'done') or 'focus'. Done sorts
  // newest first, the active column puts blocked first, focus puts active
  // first; everything else follows the milestone order.
  function sortItems(items, order, mode) {
    return items.slice().sort(function (a, b) {
      if (mode === 'done') {
        var ta = Date.parse(a.updated) || 0, tb = Date.parse(b.updated) || 0;
        if (ta !== tb) return tb - ta;
      }
      if (mode === 'active' && a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (mode === 'focus' && a.status !== b.status) return (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1);
      return (order[a.milestone] || 0) - (order[b.milestone] || 0);
    });
  }

  function renderItem(state, opts, it, titles) {
    var t = opts.t;
    var changed = opts.changed && opts.changed[it.id];
    var sub = [];
    var goal = hasGoal(it) ? it.goal : null;
    // The subline carries the goal with its label; in the milestones view the
    // label column shows the numbers for open and done items, while active and
    // blocked items keep their status word (blocked keeps its attention color).
    if (goal) sub.push('<span class="goal' + (goalReached(goal) ? ' reached' : '') + '"' + (measured(goal) ? '' : ' title="' + esc(t('page.goal.unmeasured')) + '"') + '>' + esc(goalText(goal) + ' ' + goal.label) + '</span>');
    if (it.prs && it.prs.length) sub.push('<span>' + prList(state, t, it) + '</span>');
    if (it.branch) sub.push('<span>' + esc(it.branch) + '</span>');
    var pts = openPoints(it).length;
    if (pts) sub.push('<span>' + esc(t('page.openPoints', { n: pts })) + '</span>');
    if ((!it.prs || !it.prs.length) && !opts.statusLabel) sub.push('<span>' + esc(titles[it.milestone] || it.milestone) + '</span>');
    if (it.updated && it.status !== 'active') sub.push(time(it.updated, opts.now, opts.lang));
    if (it.note) sub.push('<span class="note">' + esc(it.note) + '</span>');
    var comments = commentsOf(it, opts);
    var expanded = opts.expanded && opts.expanded[it.id];
    if (openItem(it) && (comments.length || writable(state, opts))) {
      var toggleText = comments.length ? t('page.comments.count', { n: comments.length }) : t('page.comments.add');
      sub.push('<button type="button" class="toggle" data-action="expand" data-id="' + esc(it.id) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '">' + esc(toggleText) + ' &middot; ' + esc(t(expanded ? 'page.comments.hide' : 'page.comments.show')) + '</button>');
    } else if (comments.length) {
      sub.push('<span>' + esc(t('page.comments.count', { n: comments.length })) + '</span>');
    }
    var thread = expanded && openItem(it) ? renderConversation(state, opts, it) : '';
    var label = '';
    if (opts.statusLabel) {
      if (goal && (it.status === 'todo' || it.status === 'done')) {
        label = '<span class="label status goal"' + (measured(goal) ? '' : ' title="' + esc(t('page.goal.unmeasured')) + '"') + '>' + esc(goalText(goal)) + '</span>';
      } else {
        label = '<span class="label status' + (it.status === 'blocked' ? ' attention' : '') + '">' + esc(t('page.status.' + it.status)) + '</span>';
      }
    }
    return '<article class="item' + (changed ? ' flash' : '') + '" data-id="' + esc(it.id) + '" data-status="' + esc(it.status) + '">' +
      '<div class="title">' + label + '<span>' + esc(it.title) + '</span>' + (!opts.statusLabel && it.status === 'blocked' ? '<span class="label attention">' + esc(t('page.blocked')) + '</span>' : '') + '</div>' +
      (sub.length ? '<div class="sub">' + sub.join('') + '</div>' : '') + thread + '</article>';
  }

  function renderBoard(state, opts) {
    var t = opts.t, data = state.data;
    var mi = milestoneIndex(data), order = mi.order, titles = mi.titles;
    var visible = visibleItems(data, opts);
    var cols = [
      { key: 'todo', match: function (it) { return it.status === 'todo'; } },
      { key: 'active', match: function (it) { return it.status === 'active' || it.status === 'blocked'; } },
      { key: 'done', match: function (it) { return it.status === 'done'; } },
    ];
    var html = cols.map(function (col) {
      var items = sortItems(visible.filter(col.match), order, col.key);
      var hint = '';
      if (col.key === 'active') {
        var running = items.filter(function (it) { return it.status === 'active'; }).length;
        if (running >= 2) hint = '<span class="hint">' + esc(t('page.parallel', { n: running })) + '</span>';
      }
      var shown = items;
      var more = '';
      if (col.key === 'done' && !opts.showAllDone && items.length > DONE_VISIBLE) {
        shown = items.slice(0, DONE_VISIBLE);
        more = '<div class="more"><button type="button" data-action="more-done">' + esc(t('page.andMore', { n: items.length - DONE_VISIBLE })) + '</button></div>';
      }
      var body = shown.length ? shown.map(function (it) { return renderItem(state, opts, it, titles); }).join('') : '<div class="empty">' + esc(t('page.empty')) + '</div>';
      return '<section class="col ' + col.key + '" data-status="' + col.key + '"><header><h2>' + esc(t('page.columns.' + col.key)) + '</h2><span class="count">' + items.length + '</span>' + hint + '</header><div class="items">' + body + more + '</div></section>';
    });
    return '<main class="board">' + html.join('') + '</main>';
  }

  // One list per milestone: open items first with a status label, done
  // items collapsed. Answers "where are we" without clicking.
  function renderMilestones(state, opts) {
    var t = opts.t, data = state.data;
    var mi = milestoneIndex(data), order = mi.order, titles = mi.titles;
    var info = milestoneStats(data);
    var itemOpts = Object.assign({}, opts, { statusLabel: true });
    var sections = info.stats.filter(function (s) { return !opts.filter || s.m.id === opts.filter; }).map(function (s) {
      var items = data.items.filter(function (it) { return it.milestone === s.m.id; });
      var open = sortItems(items.filter(function (it) { return it.status !== 'done'; }), order, 'active');
      var done = sortItems(items.filter(function (it) { return it.status === 'done'; }), order, 'done');
      var cls = 'ms' + (s === info.current ? ' is-current' : '') + (s.complete ? ' is-done' : '');
      var tag = s === info.current ? t('page.milestoneCurrent') : s.complete ? t('page.milestoneComplete') : '';
      var out = '<section class="' + cls + '" data-milestone="' + esc(s.m.id) + '"><header><h2>' + esc(s.m.title) + '</h2><span class="count">' + s.done + '/' + s.total + '</span>' + (tag ? '<span class="label">' + esc(tag) + '</span>' : '') + '</header>';
      if (open.length) out += '<div class="items">' + open.map(function (it) { return renderItem(state, itemOpts, it, titles); }).join('') + '</div>';
      else if (!done.length) out += '<div class="empty">' + esc(t('page.empty')) + '</div>';
      if (done.length) {
        out += fold(opts, 'ms:' + s.m.id, esc(t('page.doneCount', { n: done.length })), '<div class="items">' + done.map(function (it) { return renderItem(state, itemOpts, it, titles); }).join('') + '</div>', 'ms-done', ' data-milestone="' + esc(s.m.id) + '"');
      }
      return out + '</section>';
    });
    if (!sections.length) return '<main class="milestones"><div class="empty">' + esc(t('page.now.empty')) + '</div></main>';
    return '<main class="milestones">' + sections.join('') + '</main>';
  }

  // The active item as a whole block: title and timer large, then note,
  // open points, question and conversation. Blocked items follow the active
  // ones with the blocked label where the timer would be.
  function renderFocus(state, opts) {
    var t = opts.t, data = state.data;
    var mi = milestoneIndex(data), order = mi.order, titles = mi.titles;
    var list = sortItems(visibleItems(data, opts).filter(function (it) { return it.status === 'active' || it.status === 'blocked'; }), order, 'focus');
    if (!list.length) return '<main class="focus"><div class="now">' + renderIdle(state, opts, opts.filter ? visibleItems(data, opts) : null) + '</div></main>';
    var out = list.map(function (it) {
      var h = '<article class="item" data-id="' + esc(it.id) + '" data-status="' + esc(it.status) + '"><div class="head"><h2 class="title">' + esc(it.title) + '</h2>';
      if (it.status === 'blocked') h += '<span class="label attention state">' + esc(t('page.blocked')) + '</span>';
      else if (it.updated) h += '<div class="elapsed" data-since="' + esc(it.updated) + '"><small>' + esc(t('page.now.since')) + '</small><span>' + elapsed(it.updated, opts.now) + '</span></div>';
      h += '</div>';
      var sub = ['<span>' + esc(titles[it.milestone] || it.milestone) + '</span>'];
      if (it.prs && it.prs.length) sub.push('<span>' + prList(state, t, it) + '</span>');
      if (it.branch) sub.push('<span>' + esc(it.branch) + '</span>');
      if (it.updated) sub.push(time(it.updated, opts.now, opts.lang));
      h += '<div class="sub">' + sub.join('') + '</div>';
      if (it.note) h += '<p class="note">' + esc(it.note) + '</p>';
      var pts = openPoints(it);
      if (pts.length) h += '<ul class="rows pts">' + pts.map(function (p) { return row(opts, pointLabel(state, t, p), esc(p.text), p.opened); }).join('') + '</ul>';
      h += renderQuestion(state, opts, it);
      h += renderConversation(state, opts, it);
      return h + '</article>';
    });
    return '<main class="focus">' + out.join('') + '</main>';
  }

  // Everything with a time, newest first: status changes, open points
  // opened and resolved, comments, questions, unplanned work, sync runs.
  function computeTimeline(state, opts) {
    var t = opts.t, data = state.data;
    var rows = [];
    visibleItems(data, opts).forEach(function (it) {
      if (it.updated && it.status !== 'todo') {
        var pr = lastPr(it);
        rows.push({ kind: 'status', at: it.updated, label: pr ? prLabel(state, t, pr) : esc(t('page.status.' + it.status)), attention: it.status === 'blocked', text: esc(t('page.feed.statusChange', { title: it.title, status: t('page.status.' + it.status) })), id: it.id });
      }
      (it.open_points || []).forEach(function (p) {
        var text = esc(t('page.feed.openPoint', { title: it.title, text: p.text }));
        if (p.opened) rows.push({ kind: 'point', at: p.opened, label: pointLabel(state, t, p), text: text, id: it.id });
        if (p.resolved) rows.push({ kind: 'resolved', at: p.resolved, label: pointLabel(state, t, p), text: text, tag: t('page.timeline.resolved'), quiet: true, id: it.id });
      });
      (it.comments || []).forEach(function (c) {
        rows.push({ kind: 'comment', at: c.at, label: esc(t(c.from === 'agent' ? 'page.comments.agent' : 'page.comments.you')), text: esc(it.title + ': ' + c.text), quiet: c.from === 'agent', id: it.id });
      });
      if (hasQuestion(it) && it.question.asked) {
        rows.push({ kind: 'question', at: it.question.asked, label: esc(t('page.signals.question')), attention: true, text: esc(it.title + ': ' + it.question.text), id: it.id });
      }
    });
    if (!opts.filter) {
      (data.unplanned || []).forEach(function (u) {
        var pr = lastPr(u);
        rows.push({ kind: 'unplanned', at: u.first_seen, label: pr ? prLabel(state, t, pr) : esc(t('page.unplannedTitle')), attention: true, text: esc(u.title), tag: t('page.feed.notOnRoadmap') });
      });
      if (data.sync && data.sync.last_run) {
        rows.push({ kind: 'sync', at: data.sync.last_run, label: esc(t('page.timeline.sync')), text: esc(t('page.timeline.syncText', { repo: data.sync.repo || '' })), quiet: true });
      }
    }
    rows = rows.filter(function (r) { return !isNaN(Date.parse(r.at)); });
    rows.sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
    return rows;
  }

  // Rows grouped by the viewer's local day, newest day first.
  function daySections(rows, opts) {
    var t = opts.t, days = [];
    rows.forEach(function (r) {
      var k = new Date(r.at).toDateString();
      if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, at: r.at, rows: [] });
      days[days.length - 1].rows.push(r);
    });
    return days.map(function (d) {
      return '<section class="day"><h2>' + esc(formatDay(d.at, opts.now, opts.lang, t)) + '</h2><ul>' + d.rows.map(function (r) {
        return '<li data-kind="' + r.kind + '"' + (r.quiet ? ' class="is-quiet"' : '') + '><time class="at" datetime="' + esc(r.at) + '" title="' + esc(formatDateTime(r.at, opts.lang)) + '">' + esc(formatClock(r.at, opts.lang)) + '</time>' +
          '<span class="label' + (r.attention ? ' attention' : '') + '">' + r.label + '</span>' +
          '<span class="text">' + r.text + (r.tag ? '<span class="tag' + (r.attention ? '' : ' quiet') + '">' + esc(r.tag) + '</span>' : '') + '</span></li>';
      }).join('') + '</ul></section>';
    }).join('');
  }

  // The first 40 rows stand open; the rest fold away in a native <details>,
  // so the static page shows everything without JavaScript.
  function renderTimeline(state, opts) {
    var t = opts.t;
    var rows = computeTimeline(state, opts);
    if (!rows.length) return '<main class="timeline"><div class="empty">' + esc(t('page.timeline.empty')) + '</div></main>';
    var out = '<main class="timeline">' + daySections(rows.slice(0, TIMELINE_SHORT), opts);
    if (rows.length > TIMELINE_SHORT) out += fold(opts, 'timeline:more', esc(t('page.since.showAll', { n: rows.length })), daySections(rows.slice(TIMELINE_SHORT), opts));
    return out + '</main>';
  }

  function lastComment(it) {
    var c = it.comments || [];
    return c.length ? c[c.length - 1] : null;
  }

  // Open items with a thread or a question: questions first, then threads
  // waiting for the agent, then by the last comment. On the live page with
  // the key, the remaining open items fold away below to start a thread.
  function renderConversations(state, opts) {
    var t = opts.t, data = state.data;
    var titles = milestoneIndex(data).titles;
    var open = visibleItems(data, opts).filter(openItem);
    var withThread = open.filter(function (it) { return commentsOf(it, opts).length || hasQuestion(it); });
    var rank = function (it) {
      if (hasQuestion(it)) return 0;
      var last = lastComment(it);
      return last && last.from === 'human' ? 1 : 2;
    };
    var lastAt = function (it) {
      var list = commentsOf(it, opts);
      var last = list[list.length - 1];
      if (last) return Date.parse(last.at) || 0;
      return hasQuestion(it) ? Date.parse(it.question.asked) || 0 : 0;
    };
    withThread.sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      return ra !== rb ? ra - rb : lastAt(b) - lastAt(a);
    });
    var out = withThread.map(function (it) {
      var last = lastComment(it);
      var unanswered = last && last.from === 'human' && !hasQuestion(it);
      var h = '<article class="item" data-id="' + esc(it.id) + '" data-status="' + esc(it.status) + '">' +
        '<div class="title"><span>' + esc(it.title) + '</span>' + (unanswered ? '<span class="label">' + esc(t('page.conversations.unanswered')) + '</span>' : '') + '</div>' +
        '<div class="sub"><span>' + esc(titles[it.milestone] || it.milestone) + '</span><span' + (it.status === 'blocked' ? ' class="attention"' : '') + '>' + esc(t('page.status.' + it.status)) + '</span></div>';
      h += renderQuestion(state, opts, it);
      h += renderConversation(state, opts, it);
      return h + '</article>';
    });
    var body = out.length ? out.join('') : '<div class="empty">' + esc(t('page.conversations.empty')) + '</div>';
    if (writable(state, opts)) {
      var others = open.filter(function (it) { return withThread.indexOf(it) < 0; });
      if (others.length) {
        var itemOpts = Object.assign({}, opts, { statusLabel: true });
        body += fold(opts, 'conv:others', esc(t('page.conversations.others', { n: others.length })), '<div class="items">' + others.map(function (it) { return renderItem(state, itemOpts, it, titles); }).join('') + '</div>');
      }
    }
    return '<main class="conversations">' + body + '</main>';
  }

  // Reviewer requests grouped by item: items with open points first, oldest
  // open point on top; resolved points fold away per item.
  function renderPoints(state, opts) {
    var t = opts.t, data = state.data;
    var titles = milestoneIndex(data).titles;
    var items = visibleItems(data, opts).filter(function (it) { return it.open_points && it.open_points.length; });
    var oldestOpen = function (it) {
      var o = openPoints(it).map(function (p) { return Date.parse(p.opened) || 0; });
      return o.length ? Math.min.apply(null, o) : null;
    };
    var lastResolved = function (it) { return Math.max.apply(null, [0].concat((it.open_points || []).map(function (p) { return Date.parse(p.resolved) || 0; }))); };
    items.sort(function (a, b) {
      var oa = oldestOpen(a), ob = oldestOpen(b);
      if ((oa === null) !== (ob === null)) return oa === null ? 1 : -1;
      if (oa !== null) return oa - ob;
      return lastResolved(b) - lastResolved(a);
    });
    var anyOpen = false;
    var out = items.map(function (it) {
      var open = openPoints(it), resolved = (it.open_points || []).filter(function (p) { return p.resolved; });
      if (open.length) anyOpen = true;
      var h = '<section class="group' + (open.length ? '' : ' is-done') + '" data-id="' + esc(it.id) + '"><header><h2>' + esc(it.title) + '</h2><span class="meta">' + esc(titles[it.milestone] || it.milestone) + '</span>' + (open.length ? '<span class="meta">' + esc(t('page.points.open', { n: open.length })) + '</span>' : '') + '</header>';
      if (open.length) h += '<ul class="rows pts">' + open.map(function (p) { return row(opts, pointLabel(state, t, p), esc(p.text), p.opened); }).join('') + '</ul>';
      if (resolved.length) {
        h += fold(opts, 'pt:' + it.id, esc(t('page.points.resolved', { n: resolved.length })), '<ul class="rows pts resolved">' + resolved.map(function (p) { return row(opts, pointLabel(state, t, p), esc(p.text), p.resolved); }).join('') + '</ul>');
      }
      return h + '</section>';
    });
    return '<main class="points">' + (anyOpen ? '' : '<div class="empty">' + esc(t('page.points.empty')) + '</div>') + out.join('') + '</main>';
  }

  // Grouped by pull request number, newest first: linked items with their
  // status, then the reviewer points from that pull request, then unplanned
  // work it brought. The page knows no PR state and claims none.
  function renderPrs(state, opts) {
    var t = opts.t, data = state.data;
    var titles = milestoneIndex(data).titles;
    var groups = {};
    var group = function (n) { return groups[n] || (groups[n] = { items: [], points: [], unplanned: [] }); };
    visibleItems(data, opts).forEach(function (it) {
      (it.prs || []).forEach(function (n) { group(n).items.push(it); });
      (it.open_points || []).forEach(function (p) { var n = prFromSource(p.source); if (n) group(n).points.push({ p: p, it: it }); });
    });
    if (!opts.filter) (data.unplanned || []).forEach(function (u) { (u.prs || []).forEach(function (n) { group(n).unplanned.push(u); }); });
    var numbers = Object.keys(groups).map(Number).sort(function (a, b) { return b - a; });
    if (!numbers.length) return '<main class="prs"><div class="empty">' + esc(t('page.pullRequests.empty')) + '</div></main>';
    var out = numbers.map(function (n) {
      var g = groups[n];
      var open = g.points.filter(function (x) { return !x.p.resolved; }), resolved = g.points.filter(function (x) { return x.p.resolved; });
      var h = '<section class="group" data-pr="' + n + '"><header><h2>' + prLabel(state, t, n) + '</h2>' +
        (g.items.length ? '<span class="meta">' + esc(t('page.pullRequests.items', { n: g.items.length })) + '</span>' : '') +
        (open.length ? '<span class="meta">' + esc(t('page.points.open', { n: open.length })) + '</span>' : '') + '</header>';
      if (g.items.length) {
        h += '<ul class="rows">' + g.items.map(function (it) {
          return '<li><span class="label' + (it.status === 'blocked' ? ' attention' : '') + '">' + esc(t('page.status.' + it.status)) + '</span><span class="text">' + esc(it.title) + '</span><span class="when">' + esc(titles[it.milestone] || it.milestone) + '</span></li>';
        }).join('') + '</ul>';
      }
      if (g.unplanned.length) h += '<ul class="rows">' + g.unplanned.map(function (u) { return row(opts, esc(t('page.unplannedTitle')), esc(u.title) + '<span class="tag">' + esc(t('page.feed.notOnRoadmap')) + '</span>', u.first_seen, 'attention'); }).join('') + '</ul>';
      if (open.length) h += '<ul class="rows pts">' + open.map(function (x) { return row(opts, esc(t('page.pullRequests.review')), esc(x.it.title + ': ' + x.p.text), x.p.opened); }).join('') + '</ul>';
      if (resolved.length) {
        h += fold(opts, 'pr:' + n, esc(t('page.points.resolved', { n: resolved.length })), '<ul class="rows pts resolved">' + resolved.map(function (x) { return row(opts, esc(t('page.pullRequests.review')), esc(x.it.title + ': ' + x.p.text), x.p.resolved); }).join('') + '</ul>');
      }
      return h + '</section>';
    });
    return '<main class="prs">' + out.join('') + '</main>';
  }

  // Only what needs the human: questions, blocked, stale, unplanned. Empty
  // is the message.
  function renderSignals(state, opts) {
    var t = opts.t, data = state.data;
    var staleAfter = data.stale_after_days || DEFAULT_STALE_DAYS;
    var items = visibleItems(data, opts);
    var lists = [];
    var asking = items.filter(hasQuestion);
    if (asking.length) lists.push({ key: 'questions', rows: asking.map(function (it) { return row(opts, esc(t('page.signals.question')), esc(it.title + ': ' + it.question.text), it.question.asked, 'attention'); }) });
    var blocked = items.filter(function (it) { return it.status === 'blocked'; });
    if (blocked.length) lists.push({ key: 'blocked', rows: blocked.map(function (it) { var pr = lastPr(it); return row(opts, pr ? prLabel(state, t, pr) : esc(t('page.blocked')), esc(it.title) + (it.note ? '<span class="note">' + esc(it.note) + '</span>' : ''), it.updated, 'attention'); }) });
    var stale = items.map(function (it) { return { it: it, days: staleDays(it, opts.now, staleAfter) }; }).filter(function (x) { return x.days; }).sort(function (a, b) { return b.days - a.days; });
    if (stale.length) lists.push({ key: 'stale', rows: stale.map(function (x) { return row(opts, esc(t('page.feed.stale')), esc(t('page.feed.staleText', { n: x.days, title: x.it.title })), new Date(lastActivity(x.it)).toISOString(), 'attention'); }) });
    var unplanned = opts.filter ? [] : sortedUnplanned(data);
    if (unplanned.length) lists.push({ key: 'unplanned', rows: unplanned.map(function (u) { var pr = lastPr(u); return row(opts, pr ? prLabel(state, t, pr) : esc(t('page.unplannedTitle')), esc(u.title), u.first_seen, 'attention'); }) });
    if (!lists.length) {
      var count = function (s) { return items.filter(function (it) { return it.status === s; }).length; };
      return '<main class="signals"><div class="calm"><p class="big">' + esc(t('page.signals.calm')) + '</p><p class="counts">' + esc(t('page.signals.counts', { active: count('active'), open: count('todo'), done: count('done') })) + '</p></div></main>';
    }
    return '<main class="signals">' + lists.map(function (l) {
      return '<section class="sig" data-kind="' + l.key + '"><h2 class="section attention">' + esc(t('page.signals.' + l.key)) + '</h2><ul class="rows">' + l.rows.join('') + '</ul></section>';
    }).join('') + '</main>';
  }

  // Every item as one table row. Default order: milestone, then blocked,
  // in progress, open, done. A column header sorts; opts.sort = { key, dir }.
  function renderList(state, opts) {
    var t = opts.t, data = state.data;
    var mi = milestoneIndex(data), order = mi.order, titles = mi.titles;
    var items = visibleItems(data, opts).slice();
    if (!items.length) return '<main class="list-view"><div class="empty">' + esc(t('page.empty')) + '</div></main>';
    var sort = opts.sort && LIST_COLS.indexOf(opts.sort.key) >= 0 ? opts.sort : null;
    var keyOf = {
      status: function (it) { return STATUS_ORDER[it.status] || 0; },
      title: function (it) { return String(it.title).toLowerCase(); },
      milestone: function (it) { return order[it.milestone] || 0; },
      pr: function (it) { return lastPr(it) || 0; },
      updated: function (it) { return Date.parse(it.updated) || 0; },
      points: function (it) { return openPoints(it).length; },
    };
    items.sort(function (a, b) {
      if (sort) {
        var ka = keyOf[sort.key](a), kb = keyOf[sort.key](b);
        if (ka !== kb) return (ka < kb ? -1 : 1) * (sort.dir === 'desc' ? -1 : 1);
      }
      var d = (order[a.milestone] || 0) - (order[b.milestone] || 0);
      return d || (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0);
    });
    var head = LIST_COLS.map(function (c) {
      var active = sort && sort.key === c;
      return '<th class="c-' + c + '"' + (active ? ' aria-sort="' + (sort.dir === 'desc' ? 'descending' : 'ascending') + '"' : '') + '><button type="button" data-action="sort" data-key="' + c + '" data-dir="' + (LIST_DESC_FIRST[c] ? 'desc' : 'asc') + '" title="' + esc(t('page.list.sortTitle', { col: t('page.list.' + c) })) + '">' + esc(t('page.list.' + c)) + '</button></th>';
    }).join('');
    var rows = items.map(function (it) {
      var pts = openPoints(it).length;
      return '<tr data-id="' + esc(it.id) + '"' + (it.status === 'done' ? ' class="is-done"' : '') + '>' +
        '<td class="c-status mono' + (it.status === 'blocked' ? ' attention' : '') + '">' + esc(t('page.status.' + it.status)) + '</td>' +
        '<td class="c-title">' + esc(it.title) + '</td>' +
        '<td class="c-milestone mono">' + esc(titles[it.milestone] || it.milestone) + '</td>' +
        '<td class="c-pr mono">' + (it.prs && it.prs.length ? prLinks(state, it.prs) : '') + '</td>' +
        '<td class="c-updated mono">' + (it.updated ? time(it.updated, opts.now, opts.lang) : '') + '</td>' +
        '<td class="c-points mono">' + (pts || '') + '</td></tr>';
    });
    return '<main class="list-view"><table class="list"><thead><tr>' + head + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></main>';
  }

  // The row of view names above the content. Links, so every view has an
  // address: the live server renders the named view before any script runs,
  // the browser switches in place, the static page switches once its script
  // has run.
  function renderViewsNav(state, opts, current) {
    var t = opts.t;
    return '<nav class="views" aria-label="' + esc(t('page.viewTitle')) + '">' + availableViews(state.data).map(function (v) {
      return '<a href="?view=' + esc(v) + '" data-action="view" data-view="' + esc(v) + '"' + (v === current ? ' aria-current="page"' : '') + '>' + esc(t('page.views.' + v)) + '</a>';
    }).join('') + '</nav>';
  }

  function renderView(state, opts, v) {
    switch (v) {
      case 'board': return renderBoard(state, opts);
      case 'focus': return renderFocus(state, opts);
      case 'timeline': return renderTimeline(state, opts);
      case 'conversations': return renderConversations(state, opts);
      case 'points': return renderPoints(state, opts);
      case 'prs': return renderPrs(state, opts);
      case 'signals': return renderSignals(state, opts);
      case 'list': return renderList(state, opts);
      default: return renderMilestones(state, opts);
    }
  }

  function renderUnplanned(state, opts) {
    var t = opts.t;
    var list = sortedUnplanned(state.data);
    if (!list.length) return '';
    var rows = list.map(function (u) {
      var pr = lastPr(u);
      return '<li><span class="label attention">' + (pr ? prLabel(state, t, pr) : esc(t('page.feed.notOnRoadmap'))) + '</span><span class="text">' + esc(u.title) + '</span><span class="when">' + time(u.first_seen, opts.now, opts.lang) + '</span></li>';
    });
    return '<section class="unplanned"><h2 class="section">' + esc(t('page.unplannedTitle')) + ' &middot; ' + esc(t('page.feed.notOnRoadmap')) + '</h2><ul class="rows">' + rows.join('') + '</ul></section>';
  }

  function renderChangelog(state, opts) {
    var t = opts.t;
    var lines = (state.changelog || []).map(function (l) { return l.replace(/^\s*[-*]\s+/, ''); });
    return '<section class="changelog"><h2 class="section">' + esc(t('page.changelog.title')) + '</h2>' +
      (lines.length ? '<ul>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<div class="none">' + esc(t('page.changelog.empty')) + '</div>') + '</section>';
  }

  function renderFooter(state, opts) {
    var t = opts.t;
    var parts = [];
    if (state.repoUrl) parts.push('<a href="' + esc(state.repoUrl) + '">' + esc(t('page.footer.repo')) + '</a>');
    if (state.roadmapUrl) parts.push('<a href="' + esc(state.roadmapUrl) + '">' + esc(t('page.footer.roadmap')) + '</a>');
    parts.push('<a href="https://github.com/marvrue/roadmap-live">' + esc(t('page.footer.builtWith')) + '</a>');
    return '<footer class="foot">' + parts.join('') + '</footer>';
  }

  // ---- page ----------------------------------------------------------------

  function renderApp(state, opts) {
    var out = renderBanner(state, opts.t);
    if (!state.data) {
      return out + renderHeader(state, opts) + renderFooter(state, opts);
    }
    var v = resolveView(state.data, opts.view);
    out += renderHeader(state, opts);
    out += renderProgress(state, opts);
    out += renderFeed(state, opts);
    // Conversations show the questions in their threads, focus is the now
    // block at full size (the live history steps aside with it; the timeline
    // holds the file's history), signals list the unplanned work: no duplicates.
    if (v !== 'conversations') out += renderWaiting(state, opts);
    if (v !== 'focus') {
      var now = renderNow(state, opts);
      if (state.mode === 'live') out += '<section class="live">' + now + renderHistory(state, opts) + '</section>';
      else if (now) out += '<section class="live single">' + now + '</section>';
    }
    out += renderViewsNav(state, opts, v);
    out += renderView(state, opts, v);
    if (v !== 'signals') out += renderUnplanned(state, opts);
    if (state.mode !== 'live') out += renderChangelog(state, opts);
    out += renderFooter(state, opts);
    return out;
  }

  function progressPercent(data) {
    var total = data.items.length;
    var done = data.items.filter(function (it) { return it.status === 'done'; }).length;
    return total ? Math.round(100 * done / total) : 0;
  }

  return {
    renderApp: renderApp,
    VIEWS: VIEWS,
    availableViews: availableViews,
    resolveView: resolveView,
    computeFeed: computeFeed,
    computeTimeline: computeTimeline,
    milestoneStats: milestoneStats,
    formatCount: formatCount,
    goalText: goalText,
    staleDays: staleDays,
    lastActivity: lastActivity,
    progressPercent: progressPercent,
    makeT: makeT,
    relativeTime: relativeTime,
    formatDateTime: formatDateTime,
    elapsed: elapsed,
    esc: esc,
    DEFAULT_STALE_DAYS: DEFAULT_STALE_DAYS,
  };
});
