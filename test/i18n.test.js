'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const i18n = require('../src/i18n');

test('language resolution order: roadmap, ROADMAP_LANG, LANG, default', () => {
  assert.deepStrictEqual(i18n.resolveLanguage({ roadmap: { language: 'de' }, env: { ROADMAP_LANG: 'en', LANG: 'en_US.UTF-8' } }), { lang: 'de', source: 'roadmap' });
  assert.deepStrictEqual(i18n.resolveLanguage({ roadmap: {}, env: { ROADMAP_LANG: 'de', LANG: 'en_US.UTF-8' } }), { lang: 'de', source: 'env' });
  assert.deepStrictEqual(i18n.resolveLanguage({ roadmap: {}, env: { LANG: 'de_DE.UTF-8' } }), { lang: 'de', source: 'system' });
  assert.deepStrictEqual(i18n.resolveLanguage({ roadmap: {}, env: { LC_ALL: 'de_AT.UTF-8', LANG: 'en_US.UTF-8' } }), { lang: 'de', source: 'system' });
  assert.deepStrictEqual(i18n.resolveLanguage({ roadmap: {}, env: { LANG: 'fr_FR.UTF-8' } }), { lang: 'en', source: 'default' });
  assert.deepStrictEqual(i18n.resolveLanguage({ roadmap: {}, env: { LANG: 'C.UTF-8' } }), { lang: 'en', source: 'default' });
  assert.deepStrictEqual(i18n.resolveLanguage({ roadmap: { language: 'xx' }, env: {} }), { lang: 'en', source: 'default' });
});

test('every key in en.json exists in de.json and vice versa', () => {
  const locales = i18n.loadLocales();
  const keys = (obj, prefix = '') => Object.keys(obj).flatMap((k) => (obj[k] && typeof obj[k] === 'object' && !('one' in obj[k]) ? keys(obj[k], `${prefix}${k}.`) : [`${prefix}${k}`]));
  const en = keys(locales.en).sort();
  const de = keys(locales.de).sort();
  assert.deepStrictEqual(de, en);
});

test('plurals and interpolation', () => {
  const t = i18n.translator('en');
  assert.strictEqual(t('page.openPoints', { n: 1 }), '1 open point');
  assert.strictEqual(t('page.openPoints', { n: 3 }), '3 open points');
  assert.strictEqual(t('page.pr', { number: 42 }), 'PR #42');
  const de = i18n.translator('de');
  assert.strictEqual(de('page.openPoints', { n: 3 }), '3 offene Punkte');
  assert.strictEqual(de('missing.key'), 'missing.key');
});

test('relative times use Intl and the given language', () => {
  const now = Date.parse('2026-09-10T12:00:00Z');
  assert.strictEqual(i18n.relativeTime('2026-09-10T11:46:00Z', now, 'en'), '14 minutes ago');
  assert.strictEqual(i18n.relativeTime('2026-09-10T11:46:00Z', now, 'de'), 'vor 14 Minuten');
  assert.strictEqual(i18n.relativeTime('2026-09-08T12:00:00Z', now, 'en'), '2 days ago');
  assert.strictEqual(i18n.relativeTime('not a date', now, 'en'), '');
});
