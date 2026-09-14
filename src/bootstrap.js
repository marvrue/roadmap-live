'use strict';

// Bootstrap for `roadmap-live init`: reconstructs a first roadmap.json from
// what the repository already holds (commit subjects, README headings, pull
// request titles), so the first page is about the real project instead of an
// empty milestone. This is one-time seeding, not a fourth writer: after init
// the file belongs to the coding agent and to sync, as AGENTS.md describes.
//
// Everything here is best effort. No git history, no GitHub access and no
// provider each narrow what the draft can say; none of them may stop init from
// setting the project up.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { validate, AGENT_STATUSES, ID_RE, isObject, isText } = require('./validate');
const { extractJson } = require('./classify');

const TIMEOUT_MS = 5000;
const MAX_COMMITS = 200;
const MAX_HEADINGS = 40;
const MAX_PRS = 60;
const MAX_MILESTONES = 6;
const MAX_ITEMS = 40;
const TITLE_MAX = 120;
const NOTE_MAX = 200;
const ID_MAX = 60;

const LANGUAGE_NAMES = { en: 'English', de: 'German' };

const SCHEMA_EXAMPLE = {
  project: 'storefront',
  milestones: [{ id: 'm1', title: 'Buying flow' }],
  items: [
    { id: 'listing-editor', title: 'Listing editor', milestone: 'm1', status: 'done', note: 'Merged in #42' },
    { id: 'checkout', title: 'Checkout with reserved copies', milestone: 'm1', status: 'active' },
  ],
};

const SYSTEM = 'You reconstruct a product roadmap from the history of a software repository. You answer with one JSON object and nothing else: no prose, no Markdown, no code fences.';

function trim(text, max) {
  const s = String(text === undefined || text === null ? '' : text).replace(/\r\n/g, '\n').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ---- sources ------------------------------------------------------------

function run(exec, dir, args) {
  return new Promise((resolve) => {
    try {
      exec('git', args, { cwd: dir, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        resolve(err ? null : String(stdout).trim());
      });
    } catch {
      resolve(null);
    }
  });
}

// Commit subjects, newest first. Merges are left out: they carry branch names,
// not intent. Empty outside a git repository.
async function gitHistory(dir, exec = execFile) {
  const out = await run(exec, dir, ['log', '--no-merges', `-n${MAX_COMMITS}`, '--date=short', '--pretty=format:%ad\t%s']);
  if (out === null) return [];
  return out
    .split('\n')
    .map((line) => {
      const tab = line.indexOf('\t');
      return tab < 0 ? { date: null, subject: line.trim() } : { date: line.slice(0, tab).trim(), subject: line.slice(tab + 1).trim() };
    })
    .filter((c) => c.subject);
}

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.markdown'];

// Headings of the README, the closest thing most repositories have to a
// statement of what their parts are called. Fenced blocks are skipped so a
// shell comment in an example does not read as a heading.
function readmeHeadings(dir) {
  for (const name of README_NAMES) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    const out = [];
    let fenced = false;
    for (const line of text.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) out.push({ level: m[1].length, text: m[2].trim() });
      if (out.length >= MAX_HEADINGS) break;
    }
    return out;
  }
  return [];
}

// What the repository can say about itself. Every source is optional.
async function collectSources({ dir, exec, prs = [] } = {}) {
  return {
    project: path.basename(path.resolve(dir)),
    commits: await gitHistory(dir, exec),
    headings: readmeHeadings(dir),
    prs: prs.slice(0, MAX_PRS),
  };
}

// With no commits, no pull requests and no README headings there is nothing to
// reconstruct from, and the empty skeleton is the honest answer.
function hasSources(sources) {
  return !!sources && (sources.commits.length > 0 || sources.prs.length > 0 || sources.headings.length > 0);
}

function skeleton(project) {
  return { project, milestones: [{ id: 'm1', title: 'MVP' }], items: [] };
}

// ---- prompt -------------------------------------------------------------

// Everything the model sees about the repository, in a stable text form.
function buildPrompt({ sources, lang = 'en' }) {
  const lines = [];
  lines.push('Task: reconstruct the roadmap this repository has been following. Group the work into a few milestones and list the items under them.');
  lines.push('');
  lines.push('Rules:');
  lines.push('- Describe only work that was actually done or started here. Never invent features nobody worked on.');
  lines.push(`- milestones: 2 to ${MAX_MILESTONES}, in the order the work happened, oldest first. Ids are m1, m2, m3 and so on. A title names a phase of the project in 1 to 4 words.`);
  lines.push(`- items: up to ${MAX_ITEMS}, each assigned to exactly one milestone by its id.`);
  lines.push('- An item id is stable kebab-case: lowercase letters, digits and hyphens only, for example auth-magic-link. No two items share an id.');
  lines.push('- An item title is one short line in sentence case, with no punctuation at the end.');
  lines.push(`- status is one of ${AGENT_STATUSES.join(', ')}. Work that is merged or released is done. Work with an open pull request or recent commits and no merge is active. Work that is only named somewhere is todo.`);
  lines.push('- At most one item is active.');
  lines.push('- note is optional: at most one sentence for the human reading the page. Leave it out when you have nothing to say.');
  lines.push(`- project is the name of the project as a human would say it. Fall back to ${JSON.stringify(sources.project)} when the sources do not name it.`);
  lines.push(`- Write generated text (titles, notes) in ${LANGUAGE_NAMES[lang] || lang}.`);
  lines.push('- Answer with exactly this JSON shape and nothing else:');
  lines.push(JSON.stringify(SCHEMA_EXAMPLE, null, 2));
  lines.push('');
  lines.push(`Directory name: ${sources.project}`);
  lines.push('');
  lines.push('README headings:');
  if (!sources.headings.length) lines.push('(none)');
  for (const h of sources.headings) lines.push(`- ${'#'.repeat(h.level)} ${trim(h.text, TITLE_MAX)}`);
  lines.push('');
  lines.push('Pull requests, newest first:');
  if (!sources.prs.length) lines.push('(none)');
  for (const pr of sources.prs) lines.push(`- #${pr.number} [${pr.merged ? 'merged' : pr.state}${pr.draft ? ', draft' : ''}] ${trim(pr.title, TITLE_MAX)}`);
  lines.push('');
  lines.push('Commit subjects, newest first:');
  if (!sources.commits.length) lines.push('(none)');
  for (const c of sources.commits) lines.push(`- ${c.date || 'unknown'} ${trim(c.subject, TITLE_MAX)}`);
  return lines.join('\n');
}

// ---- validation ---------------------------------------------------------

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // accents off, so "Über" becomes "uber", not "u-ber"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ID_MAX)
    .replace(/-+$/, '');
}

const kebab = (v) => isText(v) && ID_RE.test(v);

// Validates and normalizes a draft. Unusable entries are dropped rather than
// failing the whole answer; a wrong shape fails. Two rules are enforced here
// rather than trusted to the model: a status is one of the three the agent
// owns, because `blocked` belongs to sync alone, and at most one item is
// active, so the first page reads calmly (both in AGENTS.md).
function validateDraft(value, { project } = {}) {
  const errors = [];
  if (!isObject(value)) return { ok: false, errors: ['answer is not a JSON object'], value: null };

  const milestones = [];
  const milestoneIds = new Set();
  // A milestone id that is not kebab-case gets the next free m<n>, and the
  // items that named the old id follow it.
  const renamed = new Map();
  const rawMilestones = Array.isArray(value.milestones) ? value.milestones : null;
  if (!rawMilestones) errors.push('milestones must be an array');
  else for (const m of rawMilestones) {
    if (milestones.length >= MAX_MILESTONES) break;
    if (!isObject(m) || !isText(m.title)) continue;
    const id = kebab(m.id) ? m.id : `m${milestones.length + 1}`;
    if (milestoneIds.has(id)) continue;
    milestoneIds.add(id);
    if (isText(m.id) && m.id !== id) renamed.set(m.id, id);
    milestones.push({ id, title: trim(m.title, TITLE_MAX) });
  }
  if (rawMilestones && !milestones.length) errors.push('no usable milestone in the answer');

  const items = [];
  const itemIds = new Set();
  let active = 0;
  const rawItems = Array.isArray(value.items) ? value.items : null;
  if (!rawItems) errors.push('items must be an array');
  else for (const it of rawItems) {
    if (items.length >= MAX_ITEMS) break;
    if (!isObject(it) || !isText(it.title)) continue;
    const milestone = renamed.has(it.milestone) ? renamed.get(it.milestone) : it.milestone;
    if (!milestoneIds.has(milestone)) continue; // unknown milestone: dropped
    const id = kebab(it.id) ? it.id : slug(it.title);
    if (!id || itemIds.has(id)) continue;
    itemIds.add(id);
    let status = AGENT_STATUSES.includes(it.status) ? it.status : 'todo';
    if (status === 'active' && active++ > 0) status = 'todo';
    const item = { id, title: trim(it.title, TITLE_MAX), milestone, status };
    if (isText(it.note)) item.note = trim(it.note, NOTE_MAX);
    items.push(item);
  }
  if (rawItems && !items.length) errors.push('no usable item in the answer');

  if (errors.length) return { ok: false, errors, value: null };

  const roadmap = {
    project: isText(value.project) ? trim(value.project, TITLE_MAX) : project,
    milestones,
    items,
  };
  // The same gate every other writer passes. A draft that cannot satisfy it is
  // not written, however plausible it looked.
  const schemaErrors = validate(roadmap);
  if (schemaErrors.length) return { ok: false, errors: schemaErrors, value: null };
  return { ok: true, errors: [], value: roadmap };
}

// ---- the draft ----------------------------------------------------------

// One draft through a provider, retried once on malformed JSON.
// Returns { ok: true, value } or { ok: false, reason }.
async function draftRoadmap({ sources, provider, lang, env, log = () => {}, providerOpts = {} }) {
  const prompt = buildPrompt({ sources, lang });
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw;
    try {
      // classify() is the providers' single call: a prompt and a system line
      // in, text out. Nothing about it is specific to pull requests.
      raw = await provider.classify(prompt, { env, system: SYSTEM, ...providerOpts });
    } catch (e) {
      return { ok: false, reason: e.message, prompt };
    }
    const parsed = extractJson(raw);
    const checked = validateDraft(parsed, { project: sources.project });
    if (checked.ok) return { ok: true, value: checked.value, prompt, raw };
    lastError = parsed === null ? 'no JSON object in the answer' : checked.errors.join('; ');
    log(`${lastError}${attempt === 0 ? ', retrying' : ''}`);
  }
  return { ok: false, reason: lastError, prompt, malformed: true };
}

module.exports = {
  collectSources,
  gitHistory,
  readmeHeadings,
  hasSources,
  skeleton,
  buildPrompt,
  validateDraft,
  draftRoadmap,
  slug,
  SCHEMA_EXAMPLE,
  SYSTEM,
  MAX_PRS,
  MAX_ITEMS,
  MAX_MILESTONES,
};
