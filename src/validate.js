'use strict';

// Schema validation for roadmap.json. Old files (project, milestones, items
// with todo | active | done) stay valid. The fields added by sync (blocked,
// prs, open_points, unplanned, sync, theme, language, stale_after_days) are
// optional and validated only when present.

const fs = require('fs');
const path = require('path');

const AGENT_STATUSES = ['todo', 'active', 'done'];
const STATUSES = ['todo', 'active', 'blocked', 'done'];
// The renderer owns the view list because it must also run in the browser
// without a build step; the validator reads it from there.
const { VIEWS } = require('./page/view');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEFAULT_STALE_DAYS = 7;

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isIso(v) {
  return typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));
}

function checkDate(errors, value, where, optional = true) {
  if (value === undefined) {
    if (!optional) errors.push(`${where} is required`);
    return;
  }
  if (!isIso(value)) errors.push(`${where} must be an ISO 8601 date string (got ${JSON.stringify(value)})`);
}

function checkPrs(errors, prs, where) {
  if (prs === undefined) return;
  if (!Array.isArray(prs)) return errors.push(`${where} must be an array of pull request numbers`);
  prs.forEach((n, i) => {
    if (!Number.isInteger(n) || n <= 0) errors.push(`${where}[${i}] must be a positive integer (got ${JSON.stringify(n)})`);
  });
}

function validateOpenPoints(errors, points, where) {
  if (points === undefined) return;
  if (!Array.isArray(points)) return errors.push(`${where} must be an array`);
  points.forEach((p, i) => {
    const w = `${where}[${i}]`;
    if (!isObject(p)) return errors.push(`${w} must be an object`);
    if (!isText(p.text)) errors.push(`${w}.text must be a non-empty string`);
    if (!isText(p.source)) errors.push(`${w}.source must be a non-empty string`);
    checkDate(errors, p.opened, `${w}.opened`, false);
    if (p.resolved !== null && p.resolved !== undefined && !isIso(p.resolved)) {
      errors.push(`${w}.resolved must be null or an ISO 8601 date string`);
    }
  });
}

const COMMENT_AUTHORS = ['human', 'agent'];
const LARGE_FILE_BYTES = 200 * 1024;

function validateComments(errors, comments, where) {
  if (comments === undefined) return;
  if (!Array.isArray(comments)) return errors.push(`${where} must be an array`);
  comments.forEach((c, i) => {
    const w = `${where}[${i}]`;
    if (!isObject(c)) return errors.push(`${w} must be an object`);
    if (!COMMENT_AUTHORS.includes(c.from)) errors.push(`${w}.from must be "human" or "agent"`);
    if (!isText(c.text)) errors.push(`${w}.text must be a non-empty string`);
    checkDate(errors, c.at, `${w}.at`, false);
  });
}

function validateQuestion(errors, q, where) {
  if (q === undefined) return;
  if (!isObject(q)) return errors.push(`${where} must be an object`);
  if (!isText(q.text)) errors.push(`${where}.text must be a non-empty string`);
  if (q.options !== undefined) {
    if (!Array.isArray(q.options) || q.options.length < 1 || q.options.length > 4 || !q.options.every(isText)) {
      errors.push(`${where}.options must have 1 to 4 entries, each a non-empty string`);
    }
  }
  checkDate(errors, q.asked, `${where}.asked`, false);
}

// A goal is a number an item works towards: { label, target, current?, source?, changed? }.
// The argument after "kind:" is checked only for the kinds this package fetches;
// other kinds (hosted sources) pass so the file stays valid everywhere.
// The argument must not contain whitespace or control characters (C0, DEL, C1):
// it becomes part of a URL in the pulse and a line in the terminal.
const SOURCE_RE = /^[a-z0-9-]+:[^\s\x00-\x1f\x7f-\x9f]+$/;
const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const NPM_NAME_MAX = 214; // npm registry limit
// Stricter than REPO_RE: GitHub owners are alphanumeric with inner hyphens, and
// "." or ".." as a name would point the API request somewhere else.
const GITHUB_REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;
const TAGLINE_MAX = 140;
// Control characters (C0, DEL, C1), line separators and bidi overrides: an id
// from the file must not be able to forge or rewrite a terminal or CI log line.
const CONTROL_RE = /[\x00-\x1f\x7f-\x9f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function stripControls(s) {
  return String(s).replace(CONTROL_RE, '');
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateGoal(errors, goal, where) {
  if (goal === undefined) return;
  if (!isObject(goal)) return errors.push(`${where} must be an object`);
  if (!isText(goal.label)) errors.push(`${where}.label must be a non-empty string`);
  if (!isFiniteNumber(goal.target) || goal.target <= 0) errors.push(`${where}.target must be a finite number greater than 0`);
  if (goal.current !== undefined && (!isFiniteNumber(goal.current) || goal.current < 0)) {
    errors.push(`${where}.current must be a finite number of 0 or more`);
  }
  if (goal.source !== undefined) {
    if (!isText(goal.source) || !SOURCE_RE.test(goal.source)) {
      errors.push(`${where}.source must look like "kind:argument"`);
    } else {
      const kind = goal.source.slice(0, goal.source.indexOf(':'));
      const arg = goal.source.slice(kind.length + 1);
      if (kind === 'github-stars' && !GITHUB_REPO_RE.test(arg)) errors.push(`${where}.source for github-stars must look like "owner/name"`);
      if (kind === 'npm-downloads' && (arg.length > NPM_NAME_MAX || !NPM_NAME_RE.test(arg))) errors.push(`${where}.source for npm-downloads must be an npm package name`);
    }
  }
  checkDate(errors, goal.changed, `${where}.changed`);
}

// Warnings are hints for the human, not errors: the file stays valid.
function warnings(data) {
  const out = [];
  if (!isObject(data)) return out;
  if (data.view === 'prs' || data.view === 'points') {
    const items = Array.isArray(data.items) ? data.items : [];
    const hasPrs = items.some((it) => isObject(it) && Array.isArray(it.prs) && it.prs.length > 0)
      || (Array.isArray(data.unplanned) && data.unplanned.some((u) => isObject(u) && Array.isArray(u.prs) && u.prs.length > 0));
    const hasPoints = items.some((it) => isObject(it) && Array.isArray(it.open_points) && it.open_points.length > 0);
    // The page lists these views only once a sync brought the data; until then it falls back to milestones.
    if (data.view === 'prs' ? !hasPrs : !hasPoints) out.push({ key: 'viewUnavailable', view: data.view });
  }
  if (typeof data.tagline === 'string') {
    const length = [...data.tagline].length; // code points, so an emoji counts once
    if (length > TAGLINE_MAX) out.push({ key: 'taglineLong', length });
  }
  for (const it of Array.isArray(data.items) ? data.items : []) {
    const g = isObject(it) && isObject(it.goal) ? it.goal : null;
    if (!g || typeof g.current !== 'number' || typeof g.target !== 'number') continue;
    const hit = { item: it.id, current: g.current, target: g.target };
    if (it.status === 'done' && g.current < g.target && g.source === undefined) out.push({ key: 'goalDoneUnderTarget', ...hit });
    if (it.status !== 'done' && g.current >= g.target) out.push({ key: 'goalReachedButOpen', ...hit });
  }
  return out;
}

function validate(data) {
  const errors = [];
  if (!isObject(data)) return ['root must be a JSON object'];

  if (!isText(data.project)) errors.push('"project" must be a non-empty string');
  if (data.tagline !== undefined && !isText(data.tagline)) errors.push('"tagline" must be a non-empty string');
  if (data.theme !== undefined && !isText(data.theme)) errors.push('"theme" must be a non-empty string');
  if (data.view !== undefined && !VIEWS.includes(data.view)) errors.push(`"view" must be one of ${VIEWS.join(', ')}`);
  if (data.page_url !== undefined && (!isText(data.page_url) || !/^https?:\/\//.test(data.page_url))) errors.push('"page_url" must be an http(s) URL');
  if (data.language !== undefined && (!isText(data.language) || !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(data.language))) {
    errors.push('"language" must be a language tag such as "en" or "de"');
  }
  if (data.stale_after_days !== undefined && (!Number.isInteger(data.stale_after_days) || data.stale_after_days < 1)) {
    errors.push('"stale_after_days" must be a positive integer');
  }

  const milestoneIds = new Set();
  if (!Array.isArray(data.milestones)) {
    errors.push('"milestones" must be an array');
  } else {
    data.milestones.forEach((m, i) => {
      const where = `milestones[${i}]`;
      if (!isObject(m)) return errors.push(`${where} must be an object`);
      if (!isText(m.id)) errors.push(`${where}.id must be a non-empty string`);
      else if (milestoneIds.has(m.id)) errors.push(`${where}.id "${stripControls(m.id)}" is used more than once`);
      else milestoneIds.add(m.id);
      if (!isText(m.title)) errors.push(`${where}.title must be a non-empty string`);
      if (m.goal !== undefined) errors.push(`${where}.goal is not supported, put goals on items`);
    });
  }

  const itemIds = new Set();
  if (!Array.isArray(data.items)) {
    errors.push('"items" must be an array');
  } else {
    data.items.forEach((it, i) => {
      const label = isObject(it) && isText(it.id) ? `items[${i}] ("${stripControls(it.id)}")` : `items[${i}]`;
      if (!isObject(it)) return errors.push(`${label} must be an object`);
      if (!isText(it.id)) errors.push(`${label}.id must be a non-empty string`);
      else if (itemIds.has(it.id)) errors.push(`${label}.id "${stripControls(it.id)}" is used more than once`);
      else itemIds.add(it.id);
      if (!isText(it.title)) errors.push(`${label}.title must be a non-empty string`);
      if (!isText(it.milestone)) {
        errors.push(`${label}.milestone must be a non-empty string`);
      } else if (Array.isArray(data.milestones) && !milestoneIds.has(it.milestone)) {
        errors.push(`${label}.milestone refers to unknown milestone "${stripControls(it.milestone)}"`);
      }
      if (!STATUSES.includes(it.status)) {
        errors.push(`${label}.status must be one of ${STATUSES.join(', ')} (got ${JSON.stringify(it.status)})`);
      }
      if (it.note !== undefined && typeof it.note !== 'string') {
        errors.push(`${label}.note must be a string`);
      }
      checkDate(errors, it.updated, `${label}.updated`);
      checkPrs(errors, it.prs, `${label}.prs`);
      validateOpenPoints(errors, it.open_points, `${label}.open_points`);
      if (it.branch !== undefined && !isText(it.branch)) errors.push(`${label}.branch must be a non-empty string`);
      validateComments(errors, it.comments, `${label}.comments`);
      validateQuestion(errors, it.question, `${label}.question`);
      validateGoal(errors, it.goal, `${label}.goal`);
    });
  }

  if (data.unplanned !== undefined) {
    if (!Array.isArray(data.unplanned)) {
      errors.push('"unplanned" must be an array');
    } else {
      data.unplanned.forEach((u, i) => {
        const where = `unplanned[${i}]`;
        if (!isObject(u)) return errors.push(`${where} must be an object`);
        if (!isText(u.title)) errors.push(`${where}.title must be a non-empty string`);
        checkPrs(errors, u.prs, `${where}.prs`);
        checkDate(errors, u.first_seen, `${where}.first_seen`, false);
      });
    }
  }

  if (data.sync !== undefined) {
    if (!isObject(data.sync)) {
      errors.push('"sync" must be an object');
    } else {
      checkDate(errors, data.sync.last_run, '"sync.last_run"');
      if (data.sync.repo !== undefined && (!isText(data.sync.repo) || !REPO_RE.test(data.sync.repo))) {
        errors.push('"sync.repo" must look like "owner/name"');
      }
    }
  }
  return errors;
}

function loadRoadmap(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    const msg = e.code === 'ENOENT' ? `file not found: ${file}` : `cannot read file: ${e.message}`;
    return { ok: false, raw: null, data: null, errors: [msg] };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, raw, data: null, errors: [`invalid JSON: ${e.message}`] };
  }
  const errors = validate(data);
  return { ok: errors.length === 0, raw, data: errors.length ? null : data, errors };
}

function displayName(file) {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith('..') ? rel : file;
}

module.exports = {
  validate,
  warnings,
  loadRoadmap,
  displayName,
  isObject,
  isText,
  isIso,
  AGENT_STATUSES,
  STATUSES,
  VIEWS,
  ID_RE,
  REPO_RE,
  DEFAULT_STALE_DAYS,
  LARGE_FILE_BYTES,
  COMMENT_AUTHORS,
  stripControls,
  TAGLINE_MAX,
};
