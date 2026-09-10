'use strict';

// Schema validation for roadmap.json. Old files (project, milestones, items
// with todo | active | done) stay valid. The fields added by sync (blocked,
// prs, open_points, unplanned, sync, theme, language, stale_after_days) are
// optional and validated only when present.

const fs = require('fs');
const path = require('path');

const AGENT_STATUSES = ['todo', 'active', 'done'];
const STATUSES = ['todo', 'active', 'blocked', 'done'];
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

function validate(data) {
  const errors = [];
  if (!isObject(data)) return ['root must be a JSON object'];

  if (!isText(data.project)) errors.push('"project" must be a non-empty string');
  if (data.theme !== undefined && !isText(data.theme)) errors.push('"theme" must be a non-empty string');
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
      else if (milestoneIds.has(m.id)) errors.push(`${where}.id "${m.id}" is used more than once`);
      else milestoneIds.add(m.id);
      if (!isText(m.title)) errors.push(`${where}.title must be a non-empty string`);
    });
  }

  const itemIds = new Set();
  if (!Array.isArray(data.items)) {
    errors.push('"items" must be an array');
  } else {
    data.items.forEach((it, i) => {
      const label = isObject(it) && isText(it.id) ? `items[${i}] ("${it.id}")` : `items[${i}]`;
      if (!isObject(it)) return errors.push(`${label} must be an object`);
      if (!isText(it.id)) errors.push(`${label}.id must be a non-empty string`);
      else if (itemIds.has(it.id)) errors.push(`${label}.id "${it.id}" is used more than once`);
      else itemIds.add(it.id);
      if (!isText(it.title)) errors.push(`${label}.title must be a non-empty string`);
      if (!isText(it.milestone)) {
        errors.push(`${label}.milestone must be a non-empty string`);
      } else if (Array.isArray(data.milestones) && !milestoneIds.has(it.milestone)) {
        errors.push(`${label}.milestone refers to unknown milestone "${it.milestone}"`);
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
  loadRoadmap,
  displayName,
  isObject,
  isText,
  isIso,
  AGENT_STATUSES,
  STATUSES,
  ID_RE,
  REPO_RE,
  DEFAULT_STALE_DAYS,
};
