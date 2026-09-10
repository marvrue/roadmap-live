# Feedback channel: human → agent through the page

Date: 2026-09-10. Status: approved in conversation, pending written review.

## Goal

Today the page only shows what the agent does. The human who steers the agent cannot say anything back without opening a terminal or a chat window. This step adds a return channel: a comment field per item on the live page, and a way for the agent to park a question that needs the human's decision. Both live in `roadmap.json`, so the agent reads them with the file it already maintains.

This is the first of three planned steps (feedback channel, hosted version, daily digest). It must work locally now and later inside the hosted version without changing the concept.

## Non-goals

- No item creation, no reordering on the page. The human says "add an item for vouchers" as a comment and the agent edits the file.
- No writing from the static (shared) page. It shows comments and questions read-only with a hint that answering happens on the live page.
- No new status. `todo | active | done` stay with the agent, `blocked` stays with sync.
- No change to sync's classification prompt. Comments are never sent to the model.

## Data model (additive, optional)

```json
{
  "id": "checkout",
  "title": "Checkout with reserved copies",
  "status": "active",
  "branch": "feat/checkout",
  "comments": [
    { "from": "human", "text": "Finish the cart first", "at": "2026-09-11T08:10:00Z" },
    { "from": "agent", "text": "Ok, cart first, checkout after.", "at": "2026-09-11T08:32:00Z" }
  ],
  "question": {
    "text": "Hold copies for 15 or 30 minutes?",
    "options": ["15", "30"],
    "asked": "2026-09-11T08:32:00Z"
  }
}
```

- `comments`: array, oldest first. Each entry has `from` (`human` | `agent`), non-empty `text`, `at` (ISO 8601). Entries are never deleted or edited.
- `question`: object with non-empty `text`, optional `options` (array of 1 to 4 non-empty strings), `asked` (ISO 8601). Set only by the agent, removed by the agent once the human's answer is read. Absent means no open question.
- `branch`: optional string, the git branch the item is worked on. Written by the agent when it sets `active`, and by sync from the pull request's head branch.
- Ownership: the live server appends `human` comments only. The agent appends `agent` comments, sets and clears `question`, sets `branch`. Sync sets `branch` and touches nothing else here.
- Validation in `src/validate.js` accepts files without these fields and rejects wrong shapes: unknown `from`, empty text, invalid dates, `options` outside 1 to 4 entries.
- `--check` prints a warning (not an error) when `roadmap.json` exceeds 200 KB, as a guard against unbounded growth.

## Page

Everything stays on hairlines, no new boxes, the one attention color only.

**"Waiting for you" block.** Below "Since you last looked", rendered only when at least one item has a `question`. One row per item: item title, the question text, then the `options` as small text buttons and a text field. Rows use the attention color like blocked and stale. Pressing an option or Enter in the field sends the answer as a `human` comment on that item. On the static page the block has no buttons or field; instead one line: "Answering works on the live page".

**Comments on items.** Each board item can be expanded. Expanded, it shows the conversation (human entries in the text color, agent entries in text-2 with the mono label `agent`) and below it a text field with the placeholder "Tell the agent something…". Collapsed, the mono subline shows "2 comments". Done items show the count but the page does not render their conversation, to keep the board and the file's visible surface small. The static page shows the conversation without the field.

**After sending.** The comment appears in the conversation immediately with a mono "sent" marker until the server's next snapshot confirms it. Agent replies arrive over the existing SSE connection without a reload. "Since you last looked" gets a row per agent comment: label `agent`, sentence "Checkout: Ok, cart first, checkout after." Ordered with the other rows by time.

**Git in the header (live only).** Next to "live · updated now": `feat/checkout · 3 ahead of main · 2 changed`. On a clean tree only the branch name. When the repository has no `main`, the "ahead" part is omitted. Items with a `branch` show it in the subline: `PR #44 · feat/checkout`.

**Mobile.** Text fields span the full width, option buttons wrap.

**Strings.** All new labels come from `src/locales/en.json` and `de.json`.

## Server (live page)

- New route `POST /comment` with JSON body `{ "id": "<item id>", "text": "<text>" }`. The server re-reads `roadmap.json`, validates it, appends `{ from: "human", text, at: now }` to the item's `comments`, writes the file atomically (temp file plus rename, two-space indentation, key order preserved, `comments` added at the end of the item when missing), and broadcasts the new snapshot. Responses: 204 on success, 400 for empty or non-string text or unknown id, 409 when the file is currently invalid, 413 above 2000 characters.
- The route is only reachable on localhost, as the server is today. The hosted version will put authentication in front of it.
- Git state: every 5 seconds (or when the file changes) the server runs `git branch --show-current`, `git rev-list --count main..HEAD` and `git status --porcelain` in the roadmap's directory, with a 2 second timeout each, and adds `git: { branch, ahead, changed }` to the snapshot. Outside a git repository, or when git is missing, `git` is `null` and the header shows nothing.
- The page's write path goes through one function `RoadmapPage.sendComment(id, text)` so the hosted version can swap the transport without touching the view.

## Agent rules (AGENTS.md addition, kept to one screen)

- Before starting an item and after every change, read its `comments`. Reply to every `human` comment that has no later `agent` comment: one sentence, then act on it.
- When you need a decision, set `question` with a `text` and, when possible, 2 to 4 `options`, and continue with another item. When a `human` comment answers it, remove `question` and act.
- When you set an item to `active`, set `branch` to the branch you work on.
- Only open items (`todo`, `active`, `blocked`) need their comments read.

## Sync

- Stores the pull request's head branch in the item's `branch` field when linking a PR and the item has no `branch` yet. Never touches `comments` or `question`.

## Render (static page)

- Same view code, `mode: 'static'`: questions and conversations rendered read-only, no fields, no git header.

## Testing

- `test/validate.test.js`: files with and without the fields are valid; wrong `from`, empty text, bad dates, `options` with 0 or 5 entries are rejected; the 200 KB warning fires.
- `test/server.test.js` (new): start the server on a random port with a temp roadmap; `POST /comment` appends, preserves key order and indentation, rejects empty text, unknown ids, oversized text, and an invalid file; the SSE stream receives the new snapshot; concurrent posts do not lose comments.
- `test/render.test.js`: demo roadmap gains a question and comments; snapshots for all six theme and mode combinations updated; the static page contains no `<input>` or `<textarea>`; the "waiting for you" block appears only with a question.
- `test/git-state.test.js` (new): git state from a temp repository with commits ahead of main and a dirty file; `null` outside a repository.
- `test/apply.test.js`: linking a PR sets `branch` when the item has none; a `branch` the agent already set is not overwritten.
- By hand: live page, write a comment, let an agent answer per AGENTS.md, watch the reply appear without reload; 380 px width; all themes.

## Files touched

`src/validate.js`, `src/server.js`, `src/git-state.js` (new), `src/page/view.js`, `src/page/page.js`, `src/page/page.css`, `src/locales/en.json`, `src/locales/de.json`, `src/apply.js`, `src/github.js` (branch already parsed), `AGENTS.md`, `README.md`, `DECISIONS.md`, `test/fixtures/demo-roadmap.json`, tests above.

## Decisions recorded here

- Comments live in `roadmap.json`, not in a second file: one source of truth, the shared page needs nothing extra, and the write conflict between server and agent is handled by re-reading before an atomic write.
- Answers to questions are ordinary comments: no second data path, and the history of what was asked and answered stays in one place.
- No new status for "needs decision": the `question` field carries it, so the agent's status rules and sync's `blocked` stay untouched.
- Done items' conversations are not rendered: keeps the board quiet and the agent's reading rule bounded to open items.
