# Instructions for coding agents

`roadmap.json` in the project root is the project's roadmap. It is maintained only by you, the coding agent. A human watches it live with `node roadmap-live.js`; nobody edits it in a UI.

## When you work on an item

1. Before you start an item: set its `status` to `active` and `updated` to the current time (ISO 8601, UTC).
2. When the item is finished: set `status` to `done` and update `updated`.
3. Normally only one item is `active` at a time. Finish or hand back the current item before starting the next one.

## When you plan

- Add new items with a stable kebab-case `id` (for example `auth-magic-link`) and assign each one to exactly one milestone.
- Never delete items, never change an `id`. Finished items stay in the file with `status: "done"`.
- Change the order of milestones only after asking the human. The array order is the milestone order.
- `note` is one sentence for the human who is watching, not a log. Keep it short and replace it when it is outdated.

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

- `status` is exactly one of `todo`, `active`, `done`.
- `milestone` must reference an existing milestone `id`.
- `note` and `updated` are optional.
