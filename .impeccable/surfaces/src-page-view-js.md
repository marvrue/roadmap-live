---
version: 1
slug: "src-page-view-js"
primary_target: "src/page/view.js"
related_targets: ["src/page/page.css","src/page/page.js"]
---

# Surface brief: the views of the roadmap page

Scope: `src/page/view.js` (markup), `src/page/page.css` (layout), `src/page/page.js` (browser state). Visitor mode: Operate. One page, nine views that swap the `<main>` block; header, progress bar, feed and footer stay on every view. Three views absorb a constant block so nothing is said twice on one screen (decision recorded in DECISIONS.md): Focus absorbs "In progress" (and the live history beside it), Conversations absorb "Waiting for you" (the question sits in its thread), Signals absorb the "Unplanned" block below the view.

Audience and job: a person who steers coding agents and does not code. Live beside the session, later from a phone link, or shared read-only. The job per view is one question: where are we (Milestones), what is in flight (Board), what is being worked on right now (Focus), what happened when (Timeline), what does the agent want from me (Conversations), what do reviewers still want (Open points), what hangs on which PR (Pull requests), what needs me at all (Signals), everything at once (List).

Constraints: established world, no DESIGN.md yet. Theme variables are a contract (15 custom properties). No dependencies, no build, static page readable without JavaScript. One attention color, hairlines, weights 400 and 500 only. 380 px must work. All strings in `en.json` and `de.json`.

## Direction contract

THESIS: One page, many questions, one grammar. Every view is the same row vocabulary (mono label column, text, mono time on the right, hairline between rows) arranged for a different question; it refuses the dashboard default of tiles, counters and colored badges per view.

OWN-WORLD: Inherited. Body sans or serif from the theme, mono for labels, counts and times; text, text-2, text-3 as the only hierarchy; one attention color for blocked, stale, unplanned and open questions; hairlines `--line` and `--line-strong` as the only structure; no boxes, no fills except the attention wash on a flash.

STORY: The reader picks the question from a plain row of names above the content, the active one underlined. The view answers it in the first screen with real item titles, reviewer sentences and the agent's own words. Nothing invented, nothing decorated; when a view has nothing to say, it says so in one calm sentence.

FIRST VIEWPORT: Unchanged above the fold (header, progress, feed). Directly above the content: the views row, mono 12 px, names separated by 18 px, active in text color with a 1 px underline, hairline below. Then the view. Focus opens with the item title at 32 px in the heading face and the timer at 28 px mono on the same baseline. Signals, when empty, opens with one sentence in the heading face at 22 px: "Nothing needs you." followed by the counts in text-2.

FORM: Extension of an established surface; no concept roll, no seed key. Position: the only structure on the ordered list, chosen with the user in shape.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Open decisions left to the build

- Timeline row cap (40) and day grouping by the viewer's local day.
- List: sort persists only for the page load, not in storage.
- Data-dependent views (Pull requests, Open points) hide their name when the roadmap has none of that data; a remembered hidden view falls back to Milestones.
