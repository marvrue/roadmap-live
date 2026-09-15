/* Shared rule checks for Node and the browser. No I/O and no model calls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoadmapCheckpoint = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EVENTS = ['check', 'start', 'complete', 'scope', 'milestone'];
  function text(s) { return typeof s === 'string' && s.trim().length > 0; }
  function sorted(items) { return items.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }); }
  function criteria(item, evidence) {
    return sorted(item.acceptance || []).map(function (c) {
      var result = { id: c.id, text: c.text };
      if (evidence) result.evidence = c.evidence || '';
      return result;
    });
  }
  function checkpointScope(data, milestone) {
    var m = data.milestones.find(function (entry) { return entry.id === milestone; });
    return {
      outcome: m ? m.outcome || '' : '',
      limit: m && m.limit !== undefined ? m.limit : 7,
      items: sorted(data.items.filter(function (i) { return i.milestone === milestone; })).map(function (i) {
        return { id: i.id, title: i.title, acceptance: criteria(i, false), goal: i.goal ? { label: i.goal.label, target: i.goal.target, source: i.goal.source || null } : null };
      }),
    };
  }
  // Exact, serializable input, not a probabilistic hash. Intentionally ignores
  // checkpoint itself, timestamps, themes, and notes: they do not change rules.
  function checkpointInput(data) {
    if (!data.focus) return null;
    return {
      focus: JSON.parse(JSON.stringify(data.focus)),
      scope: checkpointScope(data, data.focus.milestone),
      items: sorted(data.items.filter(function (i) { return i.milestone === data.focus.milestone || i.status === 'active'; })).map(function (i) {
        return {
          id: i.id, title: i.title, milestone: i.milestone, status: i.status, branch: i.branch || null,
          acceptance: criteria(i, true), question: i.question || null,
          points: (i.open_points || []).filter(function (p) { return !p.resolved; }).map(function (p) { return { text: p.text, source: p.source || '' }; }),
          goal: i.goal ? { label: i.goal.label, current: i.goal.current === undefined ? null : i.goal.current, target: i.goal.target, source: i.goal.source || null } : null,
        };
      }),
    };
  }
  function checkpointCurrent(data) {
    return !!data.checkpoint && JSON.stringify(data.checkpoint.input) === JSON.stringify(checkpointInput(data));
  }
  function inspectCheckpoint(data, opts) {
    opts = opts || {};
    var event = opts.event || 'check';
    var findings = [];
    var report = { event: event, item: opts.item || null, milestone: data.focus ? data.focus.milestone : null, result: 'continue', findings: findings, criteria: { total: 0, evidenced: 0 } };
    function add(code, params) { findings.push({ code: code, params: params || {} }); report.result = 'review'; }
    if (EVENTS.indexOf(event) < 0) { add('invalidEvent'); return report; }
    if (!data.focus) {
      if (event === 'check') report.result = 'disabled';
      else add('focusRequired');
      return report;
    }
    var milestone = data.milestones.find(function (m) { return m.id === data.focus.milestone; });
    if (!milestone) { add('focusRequired'); return report; }
    var items = data.items.filter(function (i) { return i.milestone === milestone.id; });
    var subject = data.items.find(function (i) { return i.id === opts.item; });
    if ((event === 'start' || event === 'complete') && !subject) add('unknownItem', { item: opts.item || '' });
    if (subject && subject.milestone !== milestone.id) add('wrongMilestone', { item: subject.title, milestone: milestone.title });
    if (!text(milestone.outcome)) add('missingOutcome', { milestone: milestone.title });
    if (!items.length) add('emptyMilestone');
    var scope = checkpointScope(data, milestone.id);
    if (JSON.stringify(scope) !== JSON.stringify(data.focus.baseline)) add('scopeChanged');
    var open = items.filter(function (i) { return i.status !== 'done'; }).length;
    if (open > scope.limit) add('tooManyItems', { count: open, limit: scope.limit });
    data.items.filter(function (i) { return i.status === 'active'; }).forEach(function (i) {
      if (i.milestone !== milestone.id && i !== subject) add('wrongMilestone', { item: i.title, milestone: milestone.title });
      if (event === 'start' && i !== subject) add('finishCurrent', { item: i.title });
    });
    if (subject && event === 'start' && subject.status === 'done') add('finishedItem', { item: subject.title });
    if (subject && event === 'complete' && subject.status === 'todo') add('notStarted', { item: subject.title });
    items.forEach(function (i) {
      var acceptance = i.acceptance || [];
      report.criteria.total += acceptance.length;
      report.criteria.evidenced += acceptance.filter(function (c) { return text(c.evidence); }).length;
      var closing = event === 'milestone' || (event === 'complete' && i === subject);
      var relevant = closing || i === subject || i.status === 'active' || i.status === 'blocked' || i.status === 'done';
      if (relevant && !acceptance.length) add('missingCriteria', { item: i.title });
      if (closing || i.status === 'done') acceptance.forEach(function (c) {
        if (!text(c.evidence)) add('missingEvidence', { item: i.title, criterion: c.text });
      });
      if (relevant && i.question) add('openQuestion', { item: i.title });
      if (relevant && (i.open_points || []).some(function (p) { return !p.resolved; })) add('reviewPoints', { item: i.title });
      if (i.status === 'blocked' && !closing) add('blocked', { item: i.title });
      if (event === 'milestone' && i.status !== 'done') add('unfinishedItem', { item: i.title });
      // A windowed source may fall after completion; keep the existing goal rule.
      if (i.goal && (closing || (i.status === 'done' && !i.goal.source)) && !(typeof i.goal.current === 'number' && i.goal.current >= i.goal.target)) {
        add('goalPending', { item: i.title, label: i.goal.label, target: i.goal.target });
      }
    });
    return report;
  }
  return { EVENTS: EVENTS, inspectCheckpoint: inspectCheckpoint, checkpointScope: checkpointScope, checkpointInput: checkpointInput, checkpointCurrent: checkpointCurrent };
});
