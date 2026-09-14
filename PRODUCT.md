# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person steers coding agents (Claude Code, Codex, Gemini CLI) on a software project and does not write code themselves. They meet the page in three situations that carry equal weight:

- **Live, beside the agent session.** The page is open next to the terminal while agents work. It must show what is being worked on right now, how long, and whether the agent is waiting for a decision.
- **Later, from a link.** Hours or days after the last look, often on a phone from a chat link. The question is "what happened since I last looked, and what does the agent want from me?"
- **Shared with others.** Customers, team members or stakeholders open the static page without context and without write access. It has to explain itself and show nothing that only makes sense to the author.

Secondary reader: the coding agent, which reads and writes `roadmap.json` and never sees the page.

## Product Purpose

roadmap-live turns a `roadmap.json` that coding agents maintain into a page a human can look at: progress per milestone, the item in progress with a timer, what reviewers still want, what happened that nobody planned, and what the agent is asking. It runs live on the local machine while agents work and, synced from GitHub pull requests, as a static page that stays current without anyone editing it.

Success means the human knows where the project stands and what needs their decision within a few seconds, on any of the three situations above, without opening a terminal, a pull request, or a chat window.

## Positioning

Three properties together; none carries alone. A kanban tool or a GitHub Projects board cannot truthfully claim the combination:

1. **Nobody maintains the page.** The agent and the pull request sync write `roadmap.json`. No human moves cards. The page is always current at zero upkeep.
2. **A return channel to the agent.** Comments and parked questions live in the same file. The human steers the agent from the page, and the agent answers there on its next run.
3. **Calm by design.** Only three things stand out: blocked, unplanned, and gone quiet. Everything else is gray. One look is enough.

## Operating Context

- **Live page:** `node roadmap-live.js` (or `npx roadmap-live`) serves the page on port 4242 by default; `--port 4343` for a second instance. Updates arrive over Server-Sent Events without reload. Writing needs a key that the terminal prints once as a `?key=` address.
- **Static page:** `node roadmap-live.js render --theme paper --mode dark --out /tmp/x.html` writes one HTML file. GitHub Pages serves `roadmap/index.html`, committed by the included GitHub Action on pull request events.
- **Sync:** `node roadmap-live.js sync` reads pull request comments, reviews and merges, matches them to items with a language model (API key, Claude Code, Codex or Gemini CLI, or a hand-off to the agent), and updates the same file.
- **Rituals:** the agent follows `AGENTS.md`: sets `active` and `done`, answers every human comment in one sentence, parks questions with 2 to 4 options, runs `--check` after every change.
- **Verification after page changes:** `UPDATE_SNAPSHOTS=1 node --test test/render.test.js`, then `npm test`. Snapshots cover all six theme and mode combinations. Mobile is checked by hand at 380 px.
- **Languages:** English and German, chosen by system, `roadmap.json`, or `?lang=`. Item titles and notes are never translated.

## Capabilities and Constraints

- **Nine views**, switched by a row of names above the content (links with `?view=`, so the static page switches without JavaScript): Milestones (default), Board, Focus, Timeline, Conversations, Open points, Pull requests, Signals, List. The README section "Views" describes each. Pull requests and Open points join the row once the roadmap has synced data. Clicking a milestone in the progress bar narrows every view. The browser remembers the choice; `?view=` and `"view"` in `roadmap.json` override.
- **Page blocks:** banner (invalid file, connection lost), header with project name, git state and toggles, segmented milestone progress bar, "Since you last looked" (four rows, eight on request), "Waiting for you" (only with an open question), "Now" with the elapsed timer and a history list (live only), the views row, the view, "Not on the roadmap", changelog (static only), footer. Three views absorb a block instead of repeating it: Focus absorbs "Now", Conversations absorb "Waiting for you", Signals absorb "Not on the roadmap".
- **Rendering:** one shared renderer, `src/page/view.js`, runs in Node for the static page and in the browser for live updates. The browser rebuilds the DOM with `innerHTML`; every user string passes through one escape function. The static page reads without JavaScript.
- **No dependencies, no build step.** No external web fonts, no icon library, no framework. Everything is inlined into one HTML file. System font stacks only. Node 18 or newer.
- **Theme variables are a contract.** A theme is exactly the list of custom properties in `src/page/themes/neutral.css` (`--bg`, `--surface`, `--text`, `--text-2`, `--text-3`, `--line`, `--line-strong`, `--attention`, `--attention-bg`, `--done`, `--font-heading`, `--font-body`, `--font-mono`, `--radius`, `--measure`), once for light and once for dark. Users ship their own as `roadmap-themes/<name>.css`. Layout CSS in `src/page/page.css` may use only these variables; a new variable breaks existing custom themes and needs a fallback or a documented decision. Every text color stays at WCAG AA against `--bg` and `--surface`.
- **Three built-in themes:** neutral (system sans, mono labels, default), paper (warm, serif headings), mono (everything monospace, tighter). Each with light and dark mode; the page follows the system and a header toggle overrides.
- **Hosted version is coming.** The same page will run under a base path inside a paid service with many customers (separate private repo, depends on the npm package). The design must hold there unchanged, with no landing-page borrowings; the page's own routes are joined to an embedded `base` path.
- **Incumbent design rules,** recorded in `DECISIONS.md` and `docs/superpowers/specs/2026-09-10-feedback-channel-design.md`: one attention color, hairlines instead of boxes, two font weights (400 and 500), completion shown by tone rather than hue. The user deliberately did not lock these as binding for future work; they are the current system, not a constraint on redesign. Any change to them is a decision to record in `DECISIONS.md`.
- **Mobile:** the page must work at 380 px width; the rules at the end of `src/page/page.css` handle it. Text fields span the full width, option buttons wrap.
- **Data the page must never invent:** statuses are `todo`, `active`, `done` (agent) and `blocked` (sync only). Items and milestones are never deleted. Done items' conversations are not rendered.
- **Undecided:** the daily digest (third planned step) and any hosted-only page elements (login, repository picker) are not designed yet.

## Brand Commitments

- Name: `roadmap-live`, lowercase, hyphenated. The page shows the project's own name as its title, not the product's; the product name appears only in the footer ("Built with roadmap-live").
- Voice: plain sentences, no marketing, no exclamation marks. Labels in the reviewer's or agent's own words. German and English on equal footing.
- No logo, no icon set. The only graphic marks are a 6 px dot for connection state and the "in progress" pulse.
- License MIT, open source; the repository link and `roadmap.json` link stay in the footer.

## Evidence on Hand

- `docs/screenshot.png`: the paper theme, light mode, static page, before the two views existed. The README embeds it.
- `test/fixtures/demo-roadmap.json`: the demo project "storefront" with stale, blocked, unplanned, questions and comments; the source for every snapshot.
- `test/snapshots/*.html`: rendered pages for all six theme and mode combinations, the visual truth for the current page.
- `roadmap.json` in this repository: the product's own roadmap, four milestones, real history.
- No customer testimonials, no usage numbers, no press. Future work must not fabricate any.

## Product Principles

1. **Answer "where are we" before anything else.** Progress per milestone and the item in progress are the first things on the page in every situation.
2. **Only what needs a human stands out.** Blocked, unplanned, quiet and open questions share the one attention color; the rest recedes. Adding a second highlight dilutes all of them.
3. **One page, three situations.** Live beside the session, later from a phone, shared without context. Nothing may depend on which one the reader is in; live-only parts disappear cleanly.
4. **The file is the product.** Every visible element maps to a field in `roadmap.json` that the agent or sync writes. The page never shows state it made up or keeps only in the browser, except view, theme and language choice.
5. **Zero upkeep, zero setup.** No dependencies, no build, no accounts for the local page. A custom theme is one CSS file; a new language is one JSON file.

## Accessibility & Inclusion

- Every theme keeps text at WCAG AA against its backgrounds, in light and dark mode.
- Reduced motion: transitions and the pulse are disabled under `prefers-reduced-motion`.
- The static page is fully readable without JavaScript.
- Focus is visible on every interactive element (2 px outline in the text color).
