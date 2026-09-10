# Contributing

roadmap-live has no runtime dependencies and no build step. Node 18 or newer, `npm test` runs the tests with Node's built-in test runner.

## Layout

```
roadmap-live.js        thin CLI entry
src/cli.js             argument parsing and command dispatch
src/validate.js        schema validation, loadRoadmap
src/store.js           file watching and the live state
src/server.js          HTTP server, /data, /events (SSE)
src/render.js          static page: template + state -> HTML
src/page/              template.html, page.css, view.js (shared renderer),
                       page.js (browser bootstrap), live.js (SSE client), themes/
src/i18n.js            language resolution, locales/<lang>.json
src/auth.js            GitHub credential chain and device flow
src/github.js          GitHub REST client, PR normalization
src/providers/         classification providers
src/classify.js        prompt, schema validation, retry
src/apply.js           apply rules (pure)
src/sync.js            the sync command
src/action.js          GitHub Action entry
test/                  node:test files and fixtures
```

## Adding a classification provider

One file in `src/providers/` with three exports, then one line in `src/providers/index.js`:

```js
'use strict';
const { detectBinary, runBinary } = require('./cli-base');

module.exports = {
  name: 'my-cli',
  detect({ exec, t }) {
    // "installed" means: on PATH and answers --version within two seconds
    const ok = detectBinary('my-cli', exec);
    return { ok, reason: t(ok ? 'cli.why.onPath' : 'cli.why.notOnPath', { name: 'my-cli' }) };
  },
  async classify(prompt, { env, system, spawnFn }) {
    // Return the model's answer as text. classify.js extracts and validates
    // the JSON; the provider is never trusted.
    return runBinary('my-cli', ['--some-flag'], `${system}\n\n${prompt}`, { env, spawnFn });
  },
};
```

Add `require('./my-cli')` to `PROVIDERS` in `src/providers/index.js` in the position where it should be tried, and a display name under `cli.provider.my-cli` in every locale file. Every provider receives the identical prompt and must return the schema described in `src/classify.js`.

## Adding a language

Copy `src/locales/en.json` to `src/locales/<lang>.json` and translate every value. Keys stay as they are. Plural entries are objects with `one` and `other`; `Intl.PluralRules` picks the form. Placeholders in braces are filled at runtime. Missing keys fall back to English, so a partial file works but is not complete.

The language is picked from `"language"` in roadmap.json, then `ROADMAP_LANG`, then `LC_ALL` / `LANG` for the CLI and the browser language for the page. `?lang=<lang>` on the page overrides all of that.

## Adding a theme

Copy `src/page/themes/neutral.css`. A theme defines only custom properties: `--bg`, `--surface`, `--text`, `--text-2`, `--text-3`, `--line`, `--line-strong`, `--attention`, `--attention-bg`, `--done`, `--font-heading`, `--font-body`, `--font-mono`, `--radius`, `--measure`, once for light and once for dark (under `prefers-color-scheme: dark` and `[data-mode="dark"]`). Keep every text color at WCAG AA against `--bg` and `--surface`. Users can also ship a theme as `roadmap-themes/<name>.css` in their own repository without touching this one.

## Tests

```
npm test                      # everything
node --test test/apply.test.js
UPDATE_SNAPSHOTS=1 npm test   # rewrite test/snapshots/*.html after a deliberate page change
ROADMAP_LIVE_TEST=1 npm test  # also run the real classification test (needs a provider)
```
