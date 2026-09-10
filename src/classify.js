'use strict';

// Classification of one pull request against the roadmap items. Builds the
// prompt, runs the provider, validates the returned JSON. The provider is
// never trusted: anything that does not match the schema is rejected, and a
// malformed answer is retried once.

const SCHEMA_EXAMPLE = {
  matches: [{ item_id: 'menu-editor', confidence: 0.92, status_hint: 'done' }],
  open_points: [{ item_id: 'menu-editor', text: 'Reviewer asked for image size validation', source: 'pr:42#comment:1893', resolved: false }],
  unplanned: [{ title: 'Customer loyalty', reason: 'no matching item' }],
};

const STATUS_HINTS = ['todo', 'active', 'blocked', 'done'];
const LANGUAGE_NAMES = { en: 'English', de: 'German' };

const SYSTEM = 'You classify GitHub pull request activity against a product roadmap. You answer with one JSON object and nothing else: no prose, no Markdown, no code fences.';

function commentSource(pr, c) {
  return c.type === 'review_comment' ? `pr:${pr.number}#review_comment:${c.id}` : `pr:${pr.number}#comment:${c.id}`;
}

function reviewSource(pr, r) {
  return `pr:${pr.number}#review:${r.id}`;
}

function trim(text, max) {
  const s = String(text || '').replace(/\r\n/g, '\n').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Everything the classifier sees for one PR, in a stable text form.
function buildPrompt({ roadmap, pr, lang = 'en' }) {
  const titles = {};
  roadmap.milestones.forEach((m) => { titles[m.id] = m.title; });
  const items = roadmap.items.map((it) => `- id: ${it.id} | title: ${it.title} | milestone: ${titles[it.milestone] || it.milestone} | status: ${it.status}`);
  const lines = [];
  lines.push('Task: decide which roadmap items this pull request belongs to, list reviewer requests that are still open as open points, and report work that matches no item as unplanned.');
  lines.push('');
  lines.push('Rules:');
  lines.push('- item_id must be one of the ids below. Never invent ids.');
  lines.push('- confidence is a number between 0 and 1. Use above 0.75 only when the pull request clearly implements the item.');
  lines.push(`- status_hint is one of ${STATUS_HINTS.join(', ')} or null.`);
  lines.push('- open_points: one entry per concrete request from a reviewer that the author still has to act on. Write the text as one sentence in the reviewer\'s words. Set resolved to true when a later comment, commit or the merge shows it was addressed. Quote the reviewer in their original language; do not translate quotes.');
  lines.push('- source is the comment or review reference given in brackets after each comment.');
  lines.push('- unplanned: work in this pull request that matches no item with confidence above 0.5. One short title, sentence case, no punctuation at the end.');
  lines.push(`- Write generated text (open point texts, unplanned titles, reasons) in ${LANGUAGE_NAMES[lang] || lang}.`);
  lines.push('- Answer with exactly this JSON shape and nothing else:');
  lines.push(JSON.stringify(SCHEMA_EXAMPLE, null, 2));
  lines.push('');
  lines.push('Roadmap items:');
  lines.push(...items);
  lines.push('');
  lines.push(`Pull request #${pr.number}: ${pr.title}`);
  lines.push(`State: ${pr.merged ? 'merged' : pr.state}${pr.draft ? ' (draft)' : ''}; review state: ${pr.review_state}; author: ${pr.author || 'unknown'}; updated: ${pr.updated_at}`);
  lines.push('Body:');
  lines.push(trim(pr.body, 4000) || '(empty)');
  lines.push('');
  lines.push('Reviews:');
  if (!pr.reviews.length) lines.push('(none)');
  for (const r of pr.reviews) lines.push(`- [${reviewSource(pr, r)}] ${r.author || 'unknown'} ${r.state} at ${r.submitted_at}${r.body ? `: ${trim(r.body, 1500)}` : ''}`);
  lines.push('');
  lines.push('Comments:');
  if (!pr.comments.length) lines.push('(none)');
  for (const c of pr.comments) lines.push(`- [${commentSource(pr, c)}] ${c.author || 'unknown'} at ${c.created_at}${c.path ? ` on ${c.path}` : ''}: ${trim(c.body, 1500)}`);
  return lines.join('\n');
}

// Pulls the first JSON object out of a provider answer.
function extractJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

// Validates and normalizes. Unknown item ids and out-of-range values are
// dropped rather than failing the whole answer; a wrong shape fails.
function validateClassification(value, itemIds) {
  const errors = [];
  if (!isObj(value)) return { ok: false, errors: ['answer is not a JSON object'], value: null };
  const known = new Set(itemIds);
  const out = { matches: [], open_points: [], unplanned: [] };

  const matches = value.matches === undefined ? [] : value.matches;
  if (!Array.isArray(matches)) errors.push('matches must be an array');
  else matches.forEach((m, i) => {
    if (!isObj(m) || !isText(m.item_id)) return errors.push(`matches[${i}] needs item_id`);
    if (!known.has(m.item_id)) return; // unknown id: dropped
    const c = Number(m.confidence);
    if (!Number.isFinite(c)) return errors.push(`matches[${i}].confidence must be a number`);
    const hint = STATUS_HINTS.includes(m.status_hint) ? m.status_hint : null;
    out.matches.push({ item_id: m.item_id, confidence: Math.max(0, Math.min(1, c)), status_hint: hint });
  });

  const points = value.open_points === undefined ? [] : value.open_points;
  if (!Array.isArray(points)) errors.push('open_points must be an array');
  else points.forEach((p, i) => {
    if (!isObj(p) || !isText(p.item_id) || !isText(p.text)) return errors.push(`open_points[${i}] needs item_id and text`);
    if (!known.has(p.item_id)) return;
    out.open_points.push({ item_id: p.item_id, text: p.text.trim(), source: isText(p.source) ? p.source.trim() : null, resolved: p.resolved === true });
  });

  const unplanned = value.unplanned === undefined ? [] : value.unplanned;
  if (!Array.isArray(unplanned)) errors.push('unplanned must be an array');
  else unplanned.forEach((u, i) => {
    if (!isObj(u) || !isText(u.title)) return errors.push(`unplanned[${i}] needs title`);
    out.unplanned.push({ title: u.title.trim(), reason: isText(u.reason) ? u.reason.trim() : '' });
  });

  return { ok: errors.length === 0, errors, value: errors.length ? null : out };
}

// One classification through a provider, retried once on malformed JSON.
// Returns { ok: true, value } or { ok: false, reason }.
async function classifyPr({ roadmap, pr, provider, lang, env, log = () => {}, providerOpts = {} }) {
  const prompt = buildPrompt({ roadmap, pr, lang });
  const itemIds = roadmap.items.map((it) => it.id);
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw;
    try {
      raw = await provider.classify(prompt, { env, system: SYSTEM, ...providerOpts });
    } catch (e) {
      return { ok: false, reason: e.message, prompt };
    }
    const parsed = extractJson(raw);
    const checked = validateClassification(parsed, itemIds);
    if (checked.ok) return { ok: true, value: checked.value, prompt, raw };
    lastError = parsed === null ? 'no JSON object in the answer' : checked.errors.join('; ');
    log(`#${pr.number}: ${lastError}${attempt === 0 ? ', retrying' : ''}`);
  }
  return { ok: false, reason: lastError, prompt, malformed: true };
}

module.exports = { buildPrompt, extractJson, validateClassification, classifyPr, commentSource, reviewSource, SCHEMA_EXAMPLE, SYSTEM, STATUS_HINTS };
