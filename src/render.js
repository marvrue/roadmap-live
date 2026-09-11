'use strict';

// Builds the page HTML from state: the same template for the static file and
// the live server. Node renders the body once so the static page reads
// without JavaScript; the browser re-renders with the same view code.

const fs = require('fs');
const path = require('path');
const view = require('./page/view');
const i18n = require('./i18n');
const { loadRoadmap, displayName } = require('./validate');

const PAGE_DIR = path.join(__dirname, 'page');
const THEME_DIR = path.join(PAGE_DIR, 'themes');
const BUILTIN_THEMES = ['neutral', 'paper', 'mono'];
const DEFAULT_THEME = 'neutral';
const DEFAULT_OUT = path.join('roadmap', 'index.html');
const CHANGELOG_LINES = 10;

let assets = null;
function loadAssets() {
  if (assets) return assets;
  assets = {
    template: fs.readFileSync(path.join(PAGE_DIR, 'template.html'), 'utf8'),
    pageCss: fs.readFileSync(path.join(PAGE_DIR, 'page.css'), 'utf8'),
    viewJs: fs.readFileSync(path.join(PAGE_DIR, 'view.js'), 'utf8'),
    pageJs: fs.readFileSync(path.join(PAGE_DIR, 'page.js'), 'utf8'),
    liveJs: fs.readFileSync(path.join(PAGE_DIR, 'live.js'), 'utf8'),
  };
  return assets;
}

// Custom themes in roadmap-themes/<name>.css (next to roadmap.json or in the
// working directory) win over built-in names so users can override them.
function resolveTheme(name, baseDir) {
  const theme = name || DEFAULT_THEME;
  const candidates = [];
  if (baseDir) candidates.push(path.join(baseDir, 'roadmap-themes', `${theme}.css`));
  candidates.push(path.join(process.cwd(), 'roadmap-themes', `${theme}.css`));
  if (BUILTIN_THEMES.includes(theme)) candidates.push(path.join(THEME_DIR, `${theme}.css`));
  for (const file of candidates) {
    if (fs.existsSync(file)) return { name: theme, file, css: fs.readFileSync(file, 'utf8') };
  }
  return null;
}

// All themes the page can switch between: the built-in ones plus the
// requested custom theme. The active one comes first.
function collectThemes(name, baseDir) {
  const active = resolveTheme(name, baseDir);
  if (!active) return null;
  const list = [active];
  for (const n of BUILTIN_THEMES) {
    if (n === active.name) continue;
    const t = resolveTheme(n, baseDir);
    if (t) list.push(t);
  }
  return list;
}

function themeStyles(themes) {
  return themes.map((t, i) => `<style data-theme="${view.esc(t.name)}" media="${i === 0 ? 'all' : 'not all'}">\n${t.css.trim()}\n</style>`).join('\n');
}

function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function inlineScript(js) {
  return js.replace(/<\/script/gi, '<\\/script');
}

function readChangelog(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l));
    return lines.slice(-CHANGELOG_LINES).reverse();
  } catch {
    return [];
  }
}

function repoUrl(repo) {
  return repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}` : null;
}

// The path the page's own routes (data, events, comment) hang off. A host
// that serves the page at /p/<id>/ passes that; the live server uses /.
// Must be an absolute path without host, and is normalized to end in "/".
function normalizeBasePath(value) {
  if (value === undefined || value === null || value === '') return '/';
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[?#\s]/.test(value)) {
    throw new Error(`basePath must be an absolute path like /p/abc/, got: ${value}`);
  }
  return value.endsWith('/') ? value : `${value}/`;
}

// Renders a complete HTML document.
// opts: { theme, lang, langFixed, mode ('light'|'dark'|null), live, now, title, basePath }
function renderPage(state, opts = {}) {
  const a = loadAssets();
  const locales = i18n.loadLocales();
  const lang = opts.lang && locales[opts.lang] ? opts.lang : i18n.DEFAULT_LANG;
  const t = view.makeT(locales[lang], locales[i18n.DEFAULT_LANG], lang);
  const themes = collectThemes(opts.theme, opts.baseDir);
  if (!themes) throw new Error(`unknown theme: ${opts.theme}`);
  const now = opts.now || Date.now();
  const fullState = { ...state, fixedLang: opts.langFixed || null, theme: themes[0].name, themes: themes.map((x) => x.name), base: normalizeBasePath(opts.basePath) };
  const body = view.renderApp(fullState, { t, lang, now, filter: null, colorMode: opts.mode || 'system', theme: themes[0].name, showAllDone: false, changed: null });
  const title = opts.title || (state.data ? `${view.progressPercent(state.data)} % · ${state.data.project}` : 'roadmap-live');
  const vars = {
    lang,
    mode_attr: opts.mode ? ` data-mode="${opts.mode}" data-mode-fixed="1"` : '',
    title: view.esc(title),
    theme_styles: themeStyles(themes),
    page_css: a.pageCss.trim(),
    body,
    state_json: jsonForHtml(fullState),
    locales_json: jsonForHtml(locales),
    view_js: inlineScript(a.viewJs),
    page_js: inlineScript(a.pageJs),
    live_script: opts.live ? `<script>${inlineScript(a.liveJs)}</script>` : '',
  };
  return a.template.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

// State for the static page from a roadmap file.
function staticState(file, data, extra = {}) {
  const dir = path.dirname(file);
  const repo = data && data.sync && data.sync.repo;
  const url = repoUrl(repo);
  return {
    mode: 'static',
    ok: !!data,
    data,
    error: extra.error || null,
    file: displayName(file),
    changelog: readChangelog(path.join(dir, 'CHANGELOG.md')),
    generatedAt: new Date(extra.now || Date.now()).toISOString(),
    repoUrl: url,
    roadmapUrl: url ? `${url}/blob/HEAD/${path.basename(file)}` : extra.roadmapUrl || null,
  };
}

// CLI entry: render [file] [--out path] [--theme name] [--mode light|dark]
function runRender(opts, env = process.env) {
  const result = loadRoadmap(opts.file);
  const t = i18n.cliT(result.data, env);
  if (!result.ok) {
    console.error(t('cli.invalidFile', { file: displayName(opts.file) }));
    for (const err of result.errors) console.error(`  - ${err}`);
    return 1;
  }
  const data = result.data;
  const { lang, source } = i18n.resolveLanguage({ roadmap: data, env });
  const themeName = opts.theme || data.theme || DEFAULT_THEME;
  const baseDir = path.dirname(opts.file);
  if (!resolveTheme(themeName, baseDir)) {
    console.error(t('cli.render.unknownTheme', { theme: themeName, list: BUILTIN_THEMES.join(', ') }));
    return 1;
  }
  const outFile = path.resolve(opts.out || DEFAULT_OUT);
  const rel = path.relative(path.dirname(outFile), opts.file).split(path.sep).join('/');
  const state = staticState(opts.file, data, { roadmapUrl: rel });
  const html = renderPage(state, {
    theme: themeName,
    baseDir,
    lang,
    langFixed: source === 'roadmap' || source === 'env' ? lang : null,
    mode: opts.mode || null,
    live: false,
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  console.log(t('cli.render.wrote', { file: displayName(outFile), theme: themeName, lang }));
  return 0;
}

module.exports = { renderPage, staticState, resolveTheme, collectThemes, readChangelog, repoUrl, normalizeBasePath, runRender, BUILTIN_THEMES, DEFAULT_THEME, DEFAULT_OUT };
