# Decisions

Judgment calls made while adding pull request sync, render, themes and languages. One sentence of reasoning each.

## Structure

- **Page rendering runs in one shared module, `src/page/view.js`, in Node and in the browser.** The static page is pre-rendered so it reads without JavaScript, and the browser re-renders with the same code for live updates, language and filters, so both views cannot drift apart.
- **The browser page rebuilds the DOM with `innerHTML` from the shared renderer.** Every user-provided string goes through one escape function in the renderer, which is simpler to audit than a second DOM-building code path.
- **`src/i18n.js` reuses `makeT` and `relativeTime` from `view.js`.** One implementation of string lookup and relative times serves both the CLI and the page instead of two that could disagree.
- **Validator error messages stay English.** They are read by the coding agent, which works in English, and translating them would make the agent's job harder for no gain to the human.
- **`roadmap-live.js` keeps exporting `validate`, `loadRoadmap`, `parseArgs`, `diffChanges`.** Anyone who required the old single file keeps working.
- **Sync is split into a core without file access (`syncRoadmap`) and the CLI that reads and writes the files around it.** The hosted service keeps roadmaps in a database and must run the same rules without a working copy; one code path for both keeps them from drifting.
- **The library entry exports the building blocks, not a second API.** `renderPage`, `syncRoadmap`, `addComment` and the pieces they are made of are the functions the CLI already uses, so a service and the CLI cannot disagree.

## Data model and rules

- **Stale means: active or blocked, or linked to pull requests while not done, with no activity for `stale_after_days`.** Done items are finished and can never be "quiet", even though they have pull requests.
- **Activity for stale detection is the latest of `updated`, open point `opened` and `resolved`.** Reviewer activity counts as movement on an item even when the status did not change.
- **An open follow-up pull request does not reopen a done item.** Merged work is finished from the human's point of view; the follow-up shows up through `prs` without flipping the board.
- **A pull request closed without merge leaves the status alone.** Nothing was delivered and nothing is in review, so the agent's own status is the best information.
- **`done` needs confidence above 0.75 and a merge; `active` and `blocked` need confidence above 0.5 and an open pull request; linking the PR number needs 0.5 as well.** The spec fixes the first two thresholds and the third follows from "anything below 0.5 is unplanned".
- **Unplanned entries are keyed by pull request number and leave the list when a later run matches the pull request to an item.** Items and milestones are never deleted, but an unplanned entry is a pointer, not a roadmap item, so removing it once it is explained is the honest state.
- **Sync stores `sync.last_run` only when a run processed pull requests.** A run that finds nothing must not modify the file, or "running sync twice changes nothing" would be false.
- **When a pull request fails classification twice, `last_run` moves back to just before that pull request's `updated_at`.** The next run fetches it again while the successfully classified ones are simply re-applied, which is a no-op.
- **CHANGELOG lines carry raw status keys (`active → done`), not translated words.** The file is data that should read the same regardless of who ran sync in which language; the line template itself still comes from the locale.
- **Existing key order is preserved by mutating objects in place; new keys land at the end.** `JSON.stringify` keeps insertion order, so no key-ordering code is needed.
- **Comments live in `roadmap.json`, next to the item, not in a second file.** One source of truth; the shared page needs nothing extra, and the write conflict between server and agent is handled by re-reading before an atomic temp-and-rename write.
- **Answers to the agent's questions are ordinary human comments.** One data path, and the record of what was asked and answered stays in one place.
- **No new status for "needs a decision".** The `question` field carries it, so the agent's `todo | active | done` and sync's `blocked` stay untouched.
- **Done items' conversations are not rendered and not covered by the agent rule.** Keeps the board quiet and bounds what the agent has to read.
- **`--check` warns above 200 KB instead of failing.** Growth is a smell, not an error; the number is far above any roadmap seen so far.
- **Goals live on items only, never on milestones.** A milestone with every item done and a goal at 34/100 would say finished and unfinished at once; a milestone-wide goal is an item.
- **A goal's `changed` is the time `current` last got a different value, written by whoever wrote `current`.** A pulse that changes nothing writes nothing, so "last measured" cannot be stored without a daily commit; the feed needs only the change.
- **Goal and tagline problems are `--check` notes, not errors.** A done item under target, an open item over target, or a tagline over 140 characters are judgment calls for the human; a red banner for them would punish an honest file. The done-under-target note is skipped for goals with a `source`, because a windowed number such as monthly downloads may fall after the item was finished.
- **Validation of the argument after `kind:` in a goal's `source` only covers the kinds this package fetches.** Hosted sources must pass `--check` unchanged, so an unknown kind is accepted as long as it looks like `kind:argument`.
- **The live page is read-only at its plain address and writes only with a key that arrives once in `?key=` and then lives in the browser's storage for that page.** A page from another site that reaches the server through DNS rebinding sees a key-free page and has no access to our origin's storage, so the gap is closed without a login; the same two addresses are the read link and the write link of the hosted page.
- **The key is a header on the write request, never a cookie and never part of a response.** A cookie would be sent by the browser for a rebinding attacker too, and a key in the page or the data would leak to anyone who can read.
- **A new key on every start, unless `--key` or `ROADMAP_KEY` fixes it.** Nothing to store and nothing to rotate; the terminal line is the one place the key appears, and a fixed key is an explicit choice.
- **The server renders without the write fields; the browser adds them once it holds the key.** One HTML for everyone keeps the key out of the page, and a 401 on a write drops the stored key so the page falls back to read-only instead of failing silently.
- **The git header uses `main` as the base and hides "ahead" when there is no `main`.** Guessing the default branch would need a remote query; `main` covers the common case silently.
- **`init` drafts the first `roadmap.json` from the repository and never writes the file again.** `AGENTS.md` gives the file to the agent and to sync; a one-time seed from commit subjects, README headings and pull request titles fills the empty first page without adding a fourth writer.
- **A draft keeps only `todo`, `active` and `done`, and at most one item `active`.** `blocked` belongs to sync, and a first page with several running timers would contradict the calm the page is built for.
- **A draft that fails the validator is not written; `init` writes the empty skeleton and says why.** The seed is a convenience, and a plausible but invalid file would hand the agent a broken start.

- **The share button asks GitHub whether Pages is on, and turns it on from the live page.** Enabling Pages is a one-time setting the human would otherwise have to find in the repository settings; the server already holds a GitHub credential, so one click is enough. `page_url` in roadmap.json overrides the address for pages hosted elsewhere.
- **The Pages address is the site URL plus `roadmap/`.** That is the Action's default output path; a different `output_path` needs `page_url`.

- **Views are a row of names above the content, links with `?view=`, not a cycling button.** Nine views make cycling a guessing game; a link gives every view an address, the live server renders the named view before any script runs, and a modifier click still opens a new tab.
- **The remembered view is stored per page path, like the write key.** A host serving many roadmaps must not carry one roadmap's choice into another.
- **The timeline folds rows beyond forty into a native `<details>` instead of a button.** The static page then shows everything without JavaScript, and the fold remembers being open like the other folded lists.
- **Milestones is the default view.** It answers "where are we" per milestone without clicking; every other view answers one other question and is one click away.
- **Pull requests and Open points keep their names out of the row until the roadmap has such data.** An empty view with a hint is a dead end for a roadmap that was never synced.
- **Focus replaces the "In progress" block, Conversations replace "Waiting for you", Signals replace the unplanned block.** Each view is that block at full size; showing both would say the same thing twice on one screen.
- **The timeline shows the file's times and not the live session's history.** The session history already sits beside "In progress", and its detection times would double the agent's own `updated` times.
- **Every view shares one row grammar: mono label column, text, mono time on the right, hairlines between.** A new view should read as the same page; a long label wraps instead of running into the text.
- **The list sorts in memory only, never in the browser's storage.** A sort is a question for now; the view choice is a habit worth remembering.
- **The page claims no pull request state.** `roadmap.json` stores numbers, not whether a pull request is open or merged, so the Pull requests view shows the items' statuses and nothing it cannot know.
- **The feed shows four rows by default and eight on request.** Eight rows of "done" pushed the items below the fold; the block should announce, not dominate.
- **A goal shows as `current/target` in the label column for open and done items; active and blocked items keep their status word and carry the goal in the subline.** The label column is where the eye reads state, and "blocked" must keep its attention color; the subline always names the goal (`34/100 GitHub stars`) so the number has a meaning.
- **Goal numbers are formatted by hand: plain up to 9,999, then `12.3k`, `1.5M`.** `Intl.NumberFormat` with compact notation prints `12.000` in German, which does not fit the label column and reads as a different number.
- **An unmeasured goal shows `–/100` with a "not measured yet" title, never `0/100`.** Zero is a measurement; a dash is the honest absence of one.
- **The feed carries at most one goal row, the latest change, and the timeline none.** A daily pulse would otherwise make numbers the newest rows every day and push status changes out of the four visible rows; the timeline has only the last value, so a moving point is not a timeline.
- **The progress bar measures items, never goals.** Two kinds of progress in one bar cannot be read; the goal has its own place next to the item.
- **A goal's `changed` is not activity.** Stale detection and the header's "updated" time ignore it; an item that is only measured is still quiet.
- **The current milestone is the first in order that is not complete, and a milestone without items is not started rather than finished.** A fresh project with an empty first milestone and a seeded Launch milestone would otherwise open with "Launch: current".
- **The tagline sits under the project name in the header, one tone lighter, wrapping at the measure.** It is the one sentence a stranger needs; links to site, install and repository belong in the footer, not in a header menu.

## Providers and credentials

- **The Anthropic provider is a plain `fetch` to the Messages API, no SDK.** The spec asks for zero runtime dependencies.
- **Default model is `claude-sonnet-5`, overridable with `ROADMAP_MODEL`.** The spec asks for a current Sonnet, and classification is a small task.
- **The provider answer is parsed leniently (fences, prose around the object) but validated strictly.** CLIs wrap answers in different ways; the schema check, not the parsing, is the trust boundary.
- **Unknown item ids in a provider answer are dropped rather than failing the answer.** A hallucinated id should not throw away an otherwise correct classification.
- **The `claude-cli` adapter removes `CLAUDECODE` from the child environment.** Claude Code refuses to run nested inside itself, and sync is often started from inside a Claude Code session.
- **The agent provider writes `.roadmap-live/pending.json` next to the inbox.** The agent deletes the inbox after answering, so `--apply` needs its own copy of the pull request facts.
- **`.roadmap-live/` is in `.gitignore`.** The inbox is a local hand-off, not project state.
- **The OAuth client id is empty in this build and can be set with `ROADMAP_GITHUB_CLIENT_ID`.** Registering a GitHub OAuth app needs a human account; the code path is complete and tested with a mocked GitHub, and the README states the limit.
- **Without a client id the credential chain ends with the one-sentence explanation from the spec instead of a broken device flow.** A clear message beats a request that cannot succeed.
- **Detection of CLIs uses `spawnSync` with a two-second timeout on `--version`.** It is the spec's definition of "installed" and needs no PATH parsing.
- **`init` reuses the providers' `classify()` call for the draft instead of adding a method to every provider.** The call is a prompt and a system line in and text out, so a second method would change five adapters for the same thing.
- **`init` reads pull request titles and states only, not reviews and comments.** The draft needs what was worked on, not who said what, and one request per hundred pull requests keeps an anonymous read far below the rate limit.
- **`init` reads pull requests without a token when it finds none, and a rate limit ends the read instead of waiting.** Public repositories answer anonymously, and a best-effort draft is not worth minutes of waiting in a setup command.
- **`init` takes the repository from `--repo` or the git remote, never from `GITHUB_REPOSITORY`.** `init` does not run in the Action, and a variable left in a shell would name another project; the GTM design settled the same for the launch milestone.
- **The agent provider gets no draft hand-off in `init`.** `init` writes `AGENTS.md` in the same run, which already tells the agent to plan items, so a second inbox protocol would repeat it.

## Render and design

- **Custom themes in `roadmap-themes/` win over built-in names.** A user who wants their own `paper` should get it without renaming.
- **`--mode light|dark` exists on `render` in addition to the spec's flags.** The snapshot tests need both modes as files, and a fixed-mode page is useful for screenshots.
- **The done fill of the progress bar uses `--done`, a gray, not a green.** The design rules allow one attention color only, so completion is shown by tone, not hue.
- **Stale rows sort first in "Since you last looked", the rest newest first.** A stale item is a current signal; sorting it by its last activity would push it out of the top eight.
- **Status rows without a pull request show the status word as their mono label.** The label column must not be empty for roadmaps that were never synced.
- **The elapsed timer switches to `21d 4h` after 48 hours.** `508:17:53` is not a number anyone reads.
- **The static view shows unplanned work as its own block below the board as well as in the feed.** The feed is capped at eight rows, and unplanned work must stay visible when the feed is full.
- **The page embeds every built-in theme plus the configured custom one, and a toggle switches between them.** Switching without a rebuild means a viewer can pick their look; the theme from `roadmap.json` or `--theme` stays the default for first-time viewers.
- **The page's own routes are joined to a `base` path embedded in the state, default `/`.** A host serves the page under `/p/<id>/` and cannot rewrite the inlined scripts; relative names would break the moment the address lacks a trailing slash, so the base is explicit and normalized to end with one.
- **The static page embeds all locales and the state JSON.** The spec asks for language selection at load time and `?lang=`; embedding avoids any request after load.

## GitHub Action and workflows

- **The Action tolerates an empty `anthropic_api_key`: it warns, skips sync and still renders and commits.** The self-hosted workflow must run green on a fork or a pull request where the secret is not available.
- **Write permission is probed with `git push --dry-run` and read permission with one pull request request.** GitHub does not expose the token's permissions directly; a failing early probe is still a readable message before any work.
- **The self-hosted workflow passes `commit: false` on pull request events and checks out the head branch there.** Pushing to `main` from a pull request run would be surprising; the run still proves that sync and render work.
- **The example workflow checks out the default branch, not the merge ref.** The Action commits, and a commit on a detached merge ref goes nowhere.
- **CI runs on Node 18, 20 and 22.** Node 18 is the minimum in `package.json`, and the built-in test runner behaves slightly differently per major version.

## Tests

- **Snapshots are plain files compared with `assert.strictEqual` and rewritten with `UPDATE_SNAPSHOTS=1`.** Node's built-in snapshot assertion only exists from Node 22.

## Out of scope

- **`init` does not touch `CLAUDE.md` or other rules files.** The spec lists three files; the README explains the one line for each agent.
- **No hosted version, no issue or commit tracking.** Both are named in the README as limits and plans.
- **No watching of agent sessions, token budgets or rules files.** Tools such as blume.codes read agent transcripts for that; roadmap-live stays with a file the user owns and a page that leaves the machine.
