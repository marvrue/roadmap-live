# roadmap-live

A live browser view of a project's roadmap while coding agents (Claude Code, Codex, etc.) work on it. The agent maintains a `roadmap.json`; a small Node script watches the file and serves a page that updates without reloading.

No dependencies, no build step, one script file. Requires Node 18 or newer.

<!-- screenshot placeholder: docs/screenshot.png -->
*Screenshot: `docs/screenshot.png` (to be added)*

## Installation in an existing project

Copy three files into the project root:

1. `roadmap-live.js` from this repository
2. `AGENTS.md` from this repository (or merge its content into your existing `AGENTS.md`)
3. A new `roadmap.json` with this content:

```json
{
  "project": "My Project",
  "milestones": [
    { "id": "m1", "title": "MVP" }
  ],
  "items": []
}
```

If you use Claude Code, add a line to your `CLAUDE.md` that points to `AGENTS.md`:

```
Read AGENTS.md and follow its rules for maintaining roadmap.json.
```

## Start

```
node roadmap-live.js
```

Open http://localhost:4242. Options:

```
node roadmap-live.js path/to/roadmap.json   # another file
node roadmap-live.js --port 5000            # another port
node roadmap-live.js --check                # validate only, exit code 0 or 1
```

The server serves three routes: `/` is the page, `/data` returns the current state as JSON, `/events` is a Server-Sent Events stream that sends an event on every change.

The file is watched with `fs.watch` (debounced) plus mtime polling every two seconds as a fallback. Editors that replace the file by rename are handled. An invalid file never stops the server: the page keeps showing the last valid state and displays a red banner with the error until the file is valid again.

## Data format

```json
{
  "project": "Project name",
  "milestones": [
    { "id": "m1", "title": "MVP" },
    { "id": "m2", "title": "Launch" }
  ],
  "items": [
    {
      "id": "auth-login",
      "title": "Login with magic link",
      "milestone": "m1",
      "status": "todo",
      "note": "optional, one short sentence",
      "updated": "2026-09-08T10:00:00Z"
    }
  ]
}
```

- `status` is exactly one of `todo`, `active`, `done`.
- The order of milestones is the order in the array.
- Every item belongs to exactly one milestone. A milestone is complete when all of its items are `done`.
- The current milestone is the first one in order that is not complete.
- Normally exactly one item is `active`. Several are allowed (parallel agents), the page shows a small hint. Zero is allowed as well.
- `id` is stable and never changes. `done` items are not deleted.
- `note` is optional, one sentence for the human watching.
- `updated` is optional, ISO 8601.

## Rules for agents

The full rules are in `AGENTS.md`. In short:

- Before starting an item, set `status` to `active` and `updated` to now. After finishing, set `done` and `updated`.
- Normally only one item is active at a time.
- New items get a stable kebab-case `id` and a milestone. Items are never deleted, ids never change, milestone order changes only after asking.
- After every change, run `node roadmap-live.js --check`.

## License

MIT, see `LICENSE`.
