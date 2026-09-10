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
 * opts = { t, lang, now, filter, colorMode, showAllDone, changed }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoadmapView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_STALE_DAYS = 7;
  var FEED_MAX = 8;
  var DONE_VISIBLE = 3;

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

  function relativeTime(iso, now, lang) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var diff = (t - now) / 1000;
    var abs = Math.abs(diff);
    var rtf;
    try { rtf = new Intl.RelativeTimeFormat(lang || 'en', { numeric: 'auto' }); } catch (e) { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }); }
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
    try { return new Intl.DateTimeFormat(lang || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(d); } catch (e) { return d.toISOString(); }
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

  // ---- derived data --------------------------------------------------------

  function milestoneStats(data) {
    var stats = data.milestones.map(function (m) {
      var items = data.items.filter(function (it) { return it.milestone === m.id; });
      var done = items.filter(function (it) { return it.status === 'done'; }).length;
      return { m: m, total: items.length, done: done, complete: items.length > 0 && done === items.length };
    });
    var current = null;
    for (var i = 0; i < stats.length; i++) {
      if (stats[i].total > 0 && !stats[i].complete) { current = stats[i]; break; }
    }
    return { stats: stats, current: current };
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
      if (p.id === it.id) list.push({ from: 'human', text: p.text, at: p.at, pending: true });
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
      rest.push({ kind: 'unplanned', at: u.first_seen, pr: u.prs && u.prs.length ? u.prs[u.prs.length - 1] : null, label: null, text: t('page.feed.unplanned', { title: u.title }), tag: t('page.feed.notOnRoadmap'), attention: true });
    });
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
    parts.push('<button type="button" class="theme" data-action="theme" title="' + esc(t('page.themeTitle')) + '">' + esc(t('page.theme.' + (opts.colorMode || 'system'))) + '</button>');
    return '<header class="top"><h1>' + esc(data ? data.project : 'roadmap-live') + '</h1><div class="meta">' + parts.join('') + '</div></header>';
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
    return '<section class="since"><h2 class="section">' + esc(t('page.since.title')) + '</h2>' +
      (rows.length ? '<ul>' + rows.join('') + '</ul>' : '<div class="none">' + esc(t('page.since.empty')) + '</div>') + '</section>';
  }

  function renderWaiting(state, opts) {
    var t = opts.t;
    var asking = state.data.items.filter(function (it) { return it.question && it.question.text && openItem(it); });
    if (!asking.length) return '';
    var rows = asking.map(function (it) {
      var q = it.question;
      var out = '<li><span class="label attention">' + esc(it.title) + '</span><div class="q">' + esc(q.text);
      if (state.mode === 'live') {
        out += '<div class="answers">';
        (q.options || []).forEach(function (o) {
          out += '<button type="button" data-action="answer" data-id="' + esc(it.id) + '" data-text="' + esc(o) + '">' + esc(o) + '</button>';
        });
        out += '</div>' + renderCommentForm(it, t);
      } else {
        out += '<div class="hint">' + esc(t('page.waiting.hint')) + '</div>';
      }
      return out + '</div></li>';
    });
    return '<section class="waiting"><h2 class="section">' + esc(t('page.waiting.title')) + '</h2><ul>' + rows.join('') + '</ul></section>';
  }

  function renderCommentForm(it, t) {
    return '<form class="comment-form" data-id="' + esc(it.id) + '"><input name="text" type="text" maxlength="2000" autocomplete="off" placeholder="' + esc(t('page.comments.placeholder')) + '"><button type="submit">' + esc(t('page.comments.send')) + '</button></form>';
  }

  function renderConversation(state, opts, it) {
    var t = opts.t;
    var list = commentsOf(it, opts);
    var items = list.map(function (c) {
      var who = c.from === 'agent' ? t('page.comments.agent') : t('page.comments.you');
      var when = c.pending ? esc(t('page.comments.sent')) : time(c.at, opts.now, opts.lang);
      return '<li class="' + esc(c.from) + '"><span class="label">' + esc(who) + '</span><span class="text">' + esc(c.text) + '</span><span class="when">' + when + '</span></li>';
    });
    var out = items.length ? '<ul class="conv">' + items.join('') + '</ul>' : '';
    if (state.mode === 'live') out += renderCommentForm(it, t);
    return out;
  }

  function renderNow(state, opts) {
    var t = opts.t, data = state.data;
    var titles = {};
    data.milestones.forEach(function (m) { titles[m.id] = m.title; });
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
      var info = milestoneStats(data);
      var next = null;
      if (info.current) next = data.items.filter(function (it) { return it.status === 'todo' && it.milestone === info.current.m.id; })[0] || null;
      out += '<div class="eyebrow"><span>' + esc(next ? t('page.now.idle') : t('page.now.allDone')) + '</span></div><div class="idle">';
      if (next) out += esc(t('page.now.next', { title: '' })).replace(/\s*$/, '') + ' <b>' + esc(next.title) + '</b>';
      else if (data.items.length) out += esc(t('page.now.summary', { n: data.milestones.length, items: data.items.length }));
      else out += esc(t('page.now.empty'));
      out += '</div>';
    }
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

  function sortItems(items, order, status) {
    return items.slice().sort(function (a, b) {
      if (status === 'done') {
        var ta = Date.parse(a.updated) || 0, tb = Date.parse(b.updated) || 0;
        if (ta !== tb) return tb - ta;
      }
      if (status === 'active' && a.status !== b.status) return a.status === 'blocked' ? -1 : 1;
      return (order[a.milestone] || 0) - (order[b.milestone] || 0);
    });
  }

  function renderItem(state, opts, it, titles) {
    var t = opts.t;
    var changed = opts.changed && opts.changed[it.id];
    var sub = [];
    if (it.prs && it.prs.length) {
      sub.push('<span>' + (it.prs.length === 1 ? prLabel(state, t, it.prs[0]) : esc(t('page.prs', { list: '' })).trim() + ' ' + it.prs.map(function (n) { var u = prUrl(state, n); return u ? '<a href="' + esc(u) + '">#' + n + '</a>' : '#' + n; }).join(', ')) + '</span>');
    }
    if (it.branch) sub.push('<span>' + esc(it.branch) + '</span>');
    var pts = openPoints(it).length;
    if (pts) sub.push('<span>' + esc(t('page.openPoints', { n: pts })) + '</span>');
    if (!it.prs || !it.prs.length) sub.push('<span>' + esc(titles[it.milestone] || it.milestone) + '</span>');
    if (it.updated && it.status !== 'active') sub.push(time(it.updated, opts.now, opts.lang));
    if (it.note) sub.push('<span class="note">' + esc(it.note) + '</span>');
    var comments = commentsOf(it, opts);
    var expanded = opts.expanded && opts.expanded[it.id];
    if (openItem(it) && (comments.length || state.mode === 'live')) {
      var label = comments.length ? t('page.comments.count', { n: comments.length }) : t('page.comments.placeholder');
      sub.push('<button type="button" class="toggle" data-action="expand" data-id="' + esc(it.id) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '">' + esc(label) + ' &middot; ' + esc(t(expanded ? 'page.comments.hide' : 'page.comments.show')) + '</button>');
    } else if (comments.length) {
      sub.push('<span>' + esc(t('page.comments.count', { n: comments.length })) + '</span>');
    }
    var thread = expanded && openItem(it) ? renderConversation(state, opts, it) : '';
    return '<article class="item' + (changed ? ' flash' : '') + '" data-id="' + esc(it.id) + '" data-status="' + esc(it.status) + '">' +
      '<div class="title"><span>' + esc(it.title) + '</span>' + (it.status === 'blocked' ? '<span class="label attention">' + esc(t('page.blocked')) + '</span>' : '') + '</div>' +
      (sub.length ? '<div class="sub">' + sub.join('') + '</div>' : '') + thread + '</article>';
  }

  function renderBoard(state, opts) {
    var t = opts.t, data = state.data;
    var order = {}, titles = {};
    data.milestones.forEach(function (m, i) { order[m.id] = i; titles[m.id] = m.title; });
    var visible = opts.filter ? data.items.filter(function (it) { return it.milestone === opts.filter; }) : data.items;
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

  function renderUnplanned(state, opts) {
    var t = opts.t;
    var list = (state.data.unplanned || []).slice().sort(function (a, b) { return (Date.parse(b.first_seen) || 0) - (Date.parse(a.first_seen) || 0); });
    if (!list.length) return '';
    var rows = list.map(function (u) {
      var pr = u.prs && u.prs.length ? u.prs[u.prs.length - 1] : null;
      return '<li><span class="label attention">' + (pr ? prLabel(state, t, pr) : esc(t('page.feed.notOnRoadmap'))) + '</span><span class="text">' + esc(u.title) + '</span><span class="when">' + time(u.first_seen, opts.now, opts.lang) + '</span></li>';
    });
    return '<section class="unplanned"><h2 class="section">' + esc(t('page.unplannedTitle')) + ' &middot; ' + esc(t('page.feed.notOnRoadmap')) + '</h2><ul>' + rows.join('') + '</ul></section>';
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
    out += renderHeader(state, opts);
    out += renderProgress(state, opts);
    out += renderFeed(state, opts);
    out += renderWaiting(state, opts);
    var now = renderNow(state, opts);
    if (state.mode === 'live') out += '<section class="live">' + now + renderHistory(state, opts) + '</section>';
    else if (now) out += '<section class="live single">' + now + '</section>';
    out += renderBoard(state, opts);
    out += renderUnplanned(state, opts);
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
    computeFeed: computeFeed,
    milestoneStats: milestoneStats,
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
