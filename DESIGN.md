---
name: roadmap-live
description: One page that answers "where are we" from a roadmap.json agents maintain; hairlines, gray, and one attention color.
colors:
  bg: "#fafafa"
  surface: "#ffffff"
  text: "#1a1a1c"
  text-2: "#55555b"
  text-3: "#6f6f75"
  line: "#e4e4e6"
  line-strong: "#c6c6ca"
  attention: "#b1381f"
  attention-bg: "rgba(177, 56, 31, 0.08)"
  done: "#3a3a3e"
typography:
  display:
    fontFamily: "var(--font-heading)"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "var(--font-heading)"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "var(--font-heading)"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  subtitle:
    fontFamily: "var(--font-heading)"
    fontSize: "18px"
    fontWeight: 500
  body:
    fontFamily: "var(--font-body)"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  row:
    fontFamily: "var(--font-body)"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-mono)"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.01em"
  timer:
    fontFamily: "var(--font-mono)"
    fontSize: "28px"
    fontWeight: 400
rounded:
  theme: "var(--radius)"
  none: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  row:
    textColor: "{colors.text}"
    typography: "{typography.row}"
    padding: "8px 0"
  row-label:
    textColor: "{colors.text-3}"
    typography: "{typography.label}"
  row-label-attention:
    textColor: "{colors.attention}"
    typography: "{typography.label}"
  row-time:
    textColor: "{colors.text-3}"
    typography: "{typography.label}"
  section-heading:
    textColor: "{colors.text-3}"
    typography: "{typography.label}"
  section-heading-attention:
    textColor: "{colors.attention}"
    typography: "{typography.label}"
  view-link:
    textColor: "{colors.text-3}"
    typography: "{typography.label}"
    padding: "0 0 2px"
  view-link-hover:
    textColor: "{colors.text}"
  view-link-current:
    textColor: "{colors.text}"
  text-button:
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    padding: "0"
  text-button-hover:
    textColor: "{colors.text}"
  comment-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "6px 0"
  progress-track:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.theme}"
    height: "5px"
  progress-fill:
    backgroundColor: "{colors.done}"
    height: "100%"
  progress-fill-done:
    backgroundColor: "{colors.text-3}"
  banner:
    backgroundColor: "{colors.attention-bg}"
    textColor: "{colors.attention}"
    padding: "10px 28px"
---

# Design System: roadmap-live

## Overview

**Creative North Star: "The Ledger Beside the Terminal"**

The page is a ledger, not a dashboard. Everything on it is a row: a mono label in a fixed left column, the text in the reader's or agent's own words, a mono time on the right, a hairline underneath. Milestones, Board, Focus, Timeline, Conversations, Open points, Pull requests, Signals and List are the same row vocabulary arranged for a different question. There are no tiles, no counters in colored badges, no cards, no icons; the only graphic marks are a 6 px dot for connection state and the same dot breathing next to "in progress".

Color is almost entirely tone. Three text tones (`text`, `text-2`, `text-3`) carry all hierarchy, two hairline strengths carry all structure, and one attention color says what needs a human: blocked, unplanned, gone quiet, an open question. Completion is gray, never green. The palette is not fixed; it is a contract of fifteen custom properties that a theme fills, once for light and once for dark, and three built-in themes (neutral, paper, mono) prove the same layout holds with system sans, a serif heading face, or monospace everywhere.

Density is the density of a good terminal: 13 px rows on 8 px vertical padding, a 64ch measure on prose, 28 px page gutters that fall to 16 px on a phone. When a view has nothing to say, it says so in one calm sentence in the heading face and stops.

**Key Characteristics:**
- One row grammar in every view: mono label column, text, mono time, hairline
- Hierarchy by tone (`text` / `text-2` / `text-3`) and two weights (400, 500), never by size alone
- One attention color for the four things that need a person; everything else recedes
- Hairlines as the only structure; no boxes, no fills, no shadows, no icons
- Theme variables are the whole palette: 15 properties, light and dark, swappable at runtime
- Tabular numerals everywhere; mono for labels, counts, times and timers

## Colors

A gray ledger on a near-white or near-black sheet, with one warm rust or apricot for attention; every hue below is the neutral theme in light mode, the default the page ships with, and every other theme and mode replaces the same ten keys.

### Primary
- **Attention** (`attention`): the one signal color. Used for blocked status labels, "stale"/"quiet" feed labels, unplanned-work labels, the "Waiting for you" and Signals section headings, the question label, the connection-lost dot, and the invalid-file banner text. Its rarity is what makes it legible.
- **Attention Wash** (`attention-bg`): a translucent tint of the same hue at 8 % (light) or 12 % (dark). Appears only as the banner background, the text selection color, and the 1.6 s flash on a row that just changed. It never sits on a resting element.

### Neutral
- **Sheet** (`bg`): the page background. There is exactly one sheet; nothing is layered on it except the comment field.
- **Surface** (`surface`): one shade off the sheet. Its only use is the background of the comment input, so the field reads as a place to type without a border box.
- **Ink** (`text`): titles, item names, body text, the timer digits, the active view name, the "on" connection dot, the breathing dot, focus outlines and the active underline.
- **Ink 2** (`text-2`): secondary text: sublines, notes, done item titles, header meta, the agent's own replies in a thread, the counts under the Signals calm sentence.
- **Ink 3** (`text-3`): tertiary text: every mono label, every time, section headings, column headers, done milestone headings, the empty-state sentences, and the fill of a completed progress segment.
- **Hairline** (`line`): the rule between rows, the progress track, the rule under the progress block.
- **Hairline Strong** (`line-strong`): the rule under section and column headers, the border of the view row, the underline of every text button and link at rest, the comment field's bottom edge, the thin scrollbar of the history list.
- **Done** (`done`): the progress fill for the current and open milestones. A dark gray in light mode, a light gray in dark mode. Deliberately not green.

### Named Rules
**The One Attention Color Rule.** Blocked, unplanned, quiet and open questions share `attention`; nothing else may be colored. A second highlight would dilute all four (DECISIONS.md: completion is shown by tone, not hue).

**The Theme Contract Rule.** A theme is exactly these fifteen custom properties, once for light and once for dark: `--bg`, `--surface`, `--text`, `--text-2`, `--text-3`, `--line`, `--line-strong`, `--attention`, `--attention-bg`, `--done`, `--font-heading`, `--font-body`, `--font-mono`, `--radius`, `--measure`. Layout CSS may use no other color or font; `test/render.test.js` fails on any hex, `rgb()`, or font name in `page.css`. Custom themes ship as `roadmap-themes/<name>.css`. Every text tone stays at WCAG AA against both `bg` and `surface`.

**The Wash Is A Moment Rule.** `attention-bg` appears only on the banner, on selection, and on a flash that fades to transparent in 1.6 s. No resting element carries a fill.

## Typography

**Display Font:** `--font-heading` (neutral: system sans stack; paper: Charter / Iowan Old Style / Georgia serif; mono: system monospace)
**Body Font:** `--font-body` (neutral and paper: system sans stack; mono: system monospace)
**Label/Mono Font:** `--font-mono` (ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono)

**Character:** Body and headings are whatever the theme says; the mono is constant. Labels, counts, times, timers, section headings, column headers, the view names and every text button are mono at 12 px, so the "machine" layer of the page reads the same in all three themes while the "words" layer changes voice. No web fonts, no icon font, system stacks only.

### Hierarchy
- **Display** (500, 32px, 1.15, -0.015em): the Focus view item title, one per in-progress item, capped at `--measure`. 24px at ≤760px. Its timer sits on the same baseline in mono at 28px (20px at ≤760px) with a 12px `text-3` "since" prefix.
- **Headline** (500, 24px, 1.2, -0.01em): the project name in the page header. The only h1.
- **Title** (500, 22px, 1.25, -0.01em): the "Now" block item title and the Signals calm sentence ("Nothing needs you."). Its timer is mono 20px; both drop to 18px at ≤760px.
- **Subtitle** (500, 18px): milestone headings in the Milestones view; a done milestone drops to 400 and `text-3`.
- **Column / group heading** (500, 14px): Board column names and Open points / Pull requests group names; a done group drops to 400 and `text-2`.
- **Body** (400, 14px, 1.5): the base size; item titles in the board, notes in Now, the comment input. Focus note is 16px; the idle sentence is 16px. Prose is capped at `--measure` (62–72ch by theme).
- **Row** (400, 13px, 1.5): every list row, table cell, sublines, banner text, empty-state sentences.
- **Label** (400, 12px, +0.01em, mono, no uppercase): labels, times, counts, section headings (h2.section at +0.02em), column headers, view names, text buttons, the eyebrow. Status labels inside a board title drop to 11px.

### Named Rules
**The Two Weights Rule.** Only 400 and 500 exist. Emphasis is 500 or a darker tone, never bold, never italic (the `em` in history rows is explicitly `font-style: normal`).

**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on `body`; every count, time and timer aligns because of it. Times are `white-space: nowrap`.

**The No Caps Rule.** Nothing is uppercase. Section headings are mono 12px in `text-3`, lowercase or sentence case, `text-transform: none`.

## Layout

One column, 1180px max, centered, 28px side gutters and 56px bottom padding (16px and 40px at ≤760px). The order on every view is fixed: banner (only when something is wrong), header, segmented progress bar, "Since you last looked", "Waiting for you" (only with an open question), "Now" with the live history beside it, the row of view names, the view, "Not on the roadmap" (static and live), changelog (static only), footer. Three views absorb a constant block instead of repeating it: Focus absorbs Now and history, Conversations absorbs Waiting for you, Signals absorbs Unplanned.

**The row grid.** Every list row is `grid-template-columns: 105px minmax(0, 1fr) auto` with a 16px column gap, baseline-aligned, 8px vertical padding, a `line` hairline above and a closing hairline under the last row. The Timeline adds a 52px clock column in front (`52px 105px 1fr`); the Milestones view uses a `6.5em` status column; thread rows use the same 105px grid at 6px padding. At ≤760px every row grid collapses to `77px minmax(0, 1fr)` and the time moves under the text in column 2, so the left edge of the text is the same on every block of the phone.

**Vertical rhythm.** Blocks are separated by 26–36px (progress 26, since 32, waiting 32, live 36, milestone 34, group 30, signal 30); within a block, rows are 8px, board items 10px, thread rows 6px. Header padding is 30px top, 18px bottom. Section headings sit 4–6px above their first rule.

**Grids.** Live: `minmax(0, 3fr) minmax(240px, 2fr)` with a 32px gap, single column at ≤900px. Board: three equal columns at 32px, one column at ≤760px. Progress segments: flex, 4px apart, each at least 64px, wrapping to 40% minimum on a phone.

**Breakpoints.** 900px: the live grid stacks and the history list cap tightens. 760px: gutters, board, row grids, timer sizes, the List's milestone / PR / points columns hide, the Focus display drops to 24/20. The page must hold at 380px.

## Elevation & Depth

Flat, with no shadows anywhere. Depth is conveyed by the two hairline strengths (a `line-strong` rule opens a section, a `line` rule separates its rows), by tone (`text` in front, `text-3` behind), and by one surface step: the comment input sits on `surface`, one shade off `bg`, with no border but a `line-strong` bottom edge. The attention wash on a flashing row is the only moment a fill appears, and it is gone in 1.6 s.

### Named Rules
**The Hairline Rule.** Structure is drawn with 1px rules in `line` and `line-strong` and nothing else. No boxes, no card backgrounds, no borders around groups, no shadows.

**The Underline Is The Button Rule.** Every interactive text element (links, view names, "show all", "Send", "and 2 more", answer options, the theme and mode toggles) is inline text with a 1px bottom border in `line-strong` that becomes `text` on hover or when current. There are no filled buttons.

## Shapes

The form language is the straight rule. Corners exist in one place, the progress track, at the theme's `--radius` (neutral 3px, paper 2px, mono 0px); the same value rounds the focus outline. The comment input is explicitly `border-radius: 0`. The only circles are the 6px dots (connection state, breathing "in progress" mark). Links underline with a 3px offset. Text is allowed to wrap anywhere (`overflow-wrap: anywhere`) rather than truncate, except history rows, which ellipsize on one line.

## Components

### Row (signature)
The unit every view is built from.
- **Shape:** 105px mono label column, text, mono time on the right; 16px gaps; hairline above, closing hairline below the last row; 8px vertical padding; 13px text.
- **Label:** mono 12px in `text-3`; `attention` when the row is blocked, stale, unplanned or a question. Labels wrap (`white-space: normal`) so "Checkout with pickup time" can be a label on a phone.
- **Text:** `text`; a `.note` beneath in `text-2`; an inline `.tag` in mono 12px `attention` ("Not on the roadmap"), or `text-3` when quiet.
- **Time:** mono 12px `text-3`, nowrap. Below the text at ≤760px.
- **Resolved rows** (folded away) drop the text to `text-3`.

### Section heading
- Mono 12px, weight 400, `text-3`, +0.02em, no uppercase, 4–6px above its first rule. `attention` for "Waiting for you" and every Signals heading.

### View row (navigation)
- Mono 12px names in `text-3` separated by 18px (16px on a phone), wrapping; 10px padding under, 24px margin below, `line-strong` rule beneath.
- **Hover:** `text`. **Current:** `text` with a 1px underline in `text`; `aria-current="page"`.
- Data-dependent views (Pull requests, Open points) do not appear until the roadmap has that data.

### Text button and link
- **Shape:** inherited font, no background, no padding, 1px bottom border in `line-strong` (a `line` hairline for the thread toggle, transparent for List sort headers).
- **Hover:** border and/or text to `text`. **Focus:** 2px outline in `text`, 2px offset, theme radius.
- **Variants:** mono 12px `text-2` for "show all", "and N more", "Send", answer options; `text-3` for the thread toggle and fold summaries (`+ ` / `– ` prefix, no marker).

### Comment input
- **Style:** full width, inherits body font, `text` on `surface`, no border, `line-strong` bottom edge, 6px vertical padding, radius 0, placeholder in `text-3`, caret in `text`.
- **Focus:** no outline; the bottom edge turns `text`.
- **Layout:** flex with the mono "Send" button 10px to the right, baseline aligned; hidden for done items.

### Progress bar (signature)
- Segments 4px apart, each a 5px track in `line` with the theme radius, filled in `done` (`text-3` once the milestone is complete). Fill width transitions 0.5s on a `cubic-bezier(0.2, 0.7, 0.2, 1)` ease.
- Under each: milestone name 13px in `text-2` (`text` 500 when current, `text-3` when done) and a mono count. Hover underlines the name in `line-strong`; the active filter underlines it in `text`.
- Right: the total, mono 12px `text-2`, with the big fraction at 15px 500 in `text` and "today" beneath in `text-3`.

### Now / Focus head (signature)
- Title in the heading face on the same baseline as the mono timer, `justify-content: space-between`, 16–20px gap, wrapping on a phone. Now: 22 / 20px; Focus: 32 / 28px (24 / 20 at ≤760px). The timer's "since" prefix is 12px `text-3`.
- Above the Now titles, `.now .eyebrow`: mono 12px `text-3`, "N items in progress", preceded by a 6px `text` dot that breathes (opacity 1 → 0.3 → 1 over 2.2s) while something is active. **This is the one deliberate kicker-shaped line in the system.** It stays because it carries the live count and the pulse; do not add eyebrows above other titles.
- Subline: mono 12px `text-2`, milestone, PR, branch, time, 12–14px apart.

### Board item
- 10px vertical padding, `line` hairline below, title 14px (500 in the "In progress" column), status label 11px mono inline, subline mono 12px `text-3` with a 13px body-face note in `text-2`. Done column: 7px padding, `text-2` title, note hidden.
- **Motion:** transform 0.4s and opacity 0.3s on the same curve for FLIP moves; `enter` fades up 4px over 0.35s; `flash` fades the attention wash out over 1.6s.

### List table
- `border-collapse`, 13px cells, 7px vertical padding, `line` rule under each row, `line-strong` under the header. Headers mono 12px 400 `text-3`, sortable via a text button whose underline and color become `text` when sorted, with a ↓ / ↑ suffix. Mono cells in `text-3`; blocked in `attention`; done rows in `text-2`. Last column right-aligned.

### Banner
- `attention` text on `attention-bg`, `attention` 1px bottom border, full bleed (negative gutters), 10px vertical padding, 13px, pre-line. Only for an invalid file or a lost connection.

### Empty state
- One sentence, 13px `text-3`, 12px padding. Signals when calm: the sentence in the heading face at 22px 500, then the counts mono 12px in `text-2`.

## Do's and Don'ts

### Do:
- **Do** build every new list from the row grid (105px mono label, text, mono time, hairlines; 77px at ≤760px) and put the time in column 2 under the text on a phone.
- **Do** use only the fifteen theme properties in layout CSS; the test rejects any literal color or font name in `page.css`.
- **Do** carry hierarchy with `text` / `text-2` / `text-3` and weights 400 / 500; make done things gray, not smaller.
- **Do** reserve `attention` for blocked, unplanned, quiet and open questions, and `attention-bg` for the banner, selection and a fading flash.
- **Do** set every count, time and timer in `--font-mono` at 12px (timers larger) with tabular numerals and `white-space: nowrap`.
- **Do** make interactive text an underlined inline element with a `line-strong` bottom border that turns `text` on hover, and keep the 2px `text` focus outline.
- **Do** cap prose at `--measure` and wrap long words anywhere rather than truncating.
- **Do** disable the fill transition, item transitions, `enter`, `flash` and the breathing dot under `prefers-reduced-motion: reduce`.
- **Do** say "nothing" in one calm sentence when a view is empty, and let Signals say it in the heading face at 22px.

### Don't:
- **Don't** add a second highlight color, a green for done, or colored status badges; the progress fill is `done`, a gray.
- **Don't** draw boxes, cards, filled buttons, group borders or shadows; the only fill at rest is the comment input's `surface`.
- **Don't** add a new custom property to the theme contract without a fallback and a DECISIONS.md entry; it breaks every custom theme in `roadmap-themes/`.
- **Don't** use uppercase, letter-spaced eyebrows, or a kicker above a title; `.now .eyebrow` is the single named exception and exists for the live count and pulse.
- **Don't** add icons, an icon font, web fonts or a logo; the 6px dots are the only marks, and the product name appears only in the footer.
- **Don't** use weights other than 400 and 500, or italics; `em` in this system is normal style in `text-2`.
- **Don't** invent sizes: the ramp is 11 / 12 / 13 / 14 / 15 / 16 / 18 / 20 / 22 / 24 / 28 / 32px as listed above.
