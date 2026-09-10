'use strict';

// Language resolution and string lookup. The lookup part (makeT) is shared
// with the browser through src/page/view.js, so it stays dependency free.

const fs = require('fs');
const path = require('path');

const LOCALE_DIR = path.join(__dirname, 'locales');
const DEFAULT_LANG = 'en';

let cache = null;

function loadLocales() {
  if (cache) return cache;
  cache = {};
  for (const f of fs.readdirSync(LOCALE_DIR)) {
    if (!f.endsWith('.json')) continue;
    cache[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, f), 'utf8'));
  }
  return cache;
}

function availableLanguages() {
  return Object.keys(loadLocales()).sort();
}

// "de_DE.UTF-8", "de-AT", "de" -> "de". Anything unknown -> null.
function normalizeLang(value, available) {
  if (typeof value !== 'string' || !value) return null;
  const base = value.trim().split(/[._@]/)[0].split('-')[0].toLowerCase();
  if (!base || base === 'c' || base === 'posix') return null;
  return available.includes(base) ? base : null;
}

// Order: roadmap.json "language", ROADMAP_LANG, LC_ALL / LANG, default.
function resolveLanguage({ roadmap, env = process.env } = {}) {
  const available = availableLanguages();
  const fromRoadmap = normalizeLang(roadmap && roadmap.language, available);
  if (fromRoadmap) return { lang: fromRoadmap, source: 'roadmap' };
  const fromEnv = normalizeLang(env.ROADMAP_LANG, available);
  if (fromEnv) return { lang: fromEnv, source: 'env' };
  const fromSystem = normalizeLang(env.LC_ALL, available) || normalizeLang(env.LC_MESSAGES, available) || normalizeLang(env.LANG, available);
  if (fromSystem) return { lang: fromSystem, source: 'system' };
  return { lang: DEFAULT_LANG, source: 'default' };
}

function get(obj, key) {
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function interpolate(str, params) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? String(params[k]) : m));
}

// Returns t(key, params). Plural entries are objects with "one" / "other"
// and are chosen with Intl.PluralRules on params.n. Missing keys fall back to
// English, then to the key itself.
function makeT(dict, fallback, lang) {
  let rules = null;
  try { rules = new Intl.PluralRules(lang || 'en'); } catch { rules = null; }
  const t = (key, params) => {
    let value = get(dict, key);
    if (value === undefined && fallback) value = get(fallback, key);
    if (value === undefined) return key;
    if (value && typeof value === 'object') {
      const n = params && typeof params.n === 'number' ? params.n : 0;
      const cat = rules ? rules.select(n) : n === 1 ? 'one' : 'other';
      value = value[cat] !== undefined ? value[cat] : value.other;
    }
    return interpolate(value, params);
  };
  t.lang = lang || 'en';
  t.has = (key) => get(dict, key) !== undefined || (fallback && get(fallback, key) !== undefined);
  return t;
}

function translator(lang) {
  const locales = loadLocales();
  const dict = locales[lang] || locales[DEFAULT_LANG];
  return makeT(dict, locales[DEFAULT_LANG], locales[lang] ? lang : DEFAULT_LANG);
}

// Convenience for the CLI: language from env (and optionally the roadmap).
function cliT(roadmap, env) {
  return translator(resolveLanguage({ roadmap, env }).lang);
}

function relativeTime(iso, now, lang) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  let rtf;
  try { rtf = new Intl.RelativeTimeFormat(lang || 'en', { numeric: 'auto' }); } catch { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }); }
  if (abs < 45) return rtf.format(0, 'second').replace(/^in 0 seconds$|^0 seconds ago$/, 'now');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month');
  return rtf.format(Math.round(diff / (86400 * 365)), 'year');
}

function formatDate(iso, lang, opts) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang || 'en', opts || { dateStyle: 'medium' }).format(d);
}

module.exports = {
  DEFAULT_LANG,
  loadLocales,
  availableLanguages,
  normalizeLang,
  resolveLanguage,
  makeT,
  translator,
  cliT,
  relativeTime,
  formatDate,
  interpolate,
};
