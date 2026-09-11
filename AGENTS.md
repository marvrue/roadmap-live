# Instructions for coding agents

`roadmap.json` in the project root is the project's roadmap. You, the coding agent, maintain the items. A human watches it live with `node roadmap-live.js` or on a rendered page, and can leave comments and answer your questions there; nothing else is edited in a UI. `roadmap-live sync` adds pull request activity from GitHub to the same file.

## When you work on an item

1. Before you start an item: set its `status` to `active` and `updated` to the current time (ISO 8601, UTC).
2. When the item is finished: set `status` to `done` and update `updated`.
3. Normally only one item is `active` at a time. Finish or hand back the current item before starting the next one.

## When you plan

- Add new items with a stable kebab-case `id` (for example `auth-magic-link`) and assign each one to exactly one milestone.
- Never delete items, never change an `id`. Finished items stay in the file with `status: "done"`.
- Change the order of milestones only after asking the human. The array order is the milestone order.
- `note` is one sentence for the human who is watching, not a log. Keep it short and replace it when it is outdated.

## Fields written by sync

`roadmap-live sync` writes these and you must not edit them: the status `blocked`, `prs`, `open_points`, `unplanned` and `sync`. You keep using `todo`, `active` and `done`. If an item is `blocked` and you finish it, set it to `done` as usual.

## Comments and questions

The human can write to you from the page. Each item may have `comments` (a conversation) and you may set a `question`.

- Before you start an item and after every change, read the `comments` of open items (`todo`, `active`, `blocked`). Reply to every `human` comment without a later `agent` reply: append `{ "from": "agent", "text": "one sentence", "at": "<now>" }`, then act on it.
- When you need a decision, set `"question": { "text": "...", "options": ["a", "b"], "asked": "<now>" }` (2 to 4 options when possible), and continue with another item. When a `human` comment answers it, remove `question` and act.
- When you set an item to `active`, set `"branch"` to the git branch you work on.
- Never edit or delete existing comments. Keep your replies to one sentence.

## If `.roadmap-live/inbox.json` exists

Sync could not classify pull requests itself and left them for you.

1. Read `.roadmap-live/inbox.json`. It holds `items`, a `schema` and one `prompt` per pull request in `prs`.
2. For every pull request, answer the prompt with one JSON object in the shape of `schema`: `matches` (item ids with a confidence between 0 and 1), `open_points` (requests from reviewers that are still open, in the reviewer's words, with the comment reference as `source`) and `unplanned` (work that matches no item). Use only ids from `items`.
3. Write `.roadmap-live/result.json` as an object keyed by pull request number, for example `{ "42": { "matches": [...], "open_points": [...], "unplanned": [...] } }`.
4. Delete `.roadmap-live/inbox.json`, then run `roadmap-live sync --apply` (or `node roadmap-live.js sync --apply`).

## After every change

Run:

```
node roadmap-live.js --check
```

Exit code 0 means the file is valid. Exit code 1 prints the problems; fix them before you continue.

## Format

```json
{
  "project": "Project name",
  "milestones": [
    { "id": "m1", "title": "MVP" }
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

- `status` is one of `todo`, `active`, `done` for you. `blocked` is set by sync only.
- `milestone` must reference an existing milestone `id`.
- `note` and `updated` are optional.
- `comments`, `question` and `branch` are optional, see above.
- `theme`, `language` and `stale_after_days` at the top level are optional settings for the page; leave them as they are.
