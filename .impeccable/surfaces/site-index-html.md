---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: ["site/demo.html"]
---

# Surface brief: the roadmap-live landing page

Scope: `site/index.html` with its fonts in `site/fonts/`, and the rendered demo page `site/demo.html`. The landscape is inline SVG; the objects on it are system emojis. Visitor mode: Persuade. A static file, no build, no dependencies; the roadmap page itself (`src/page/`) is untouched and keeps its own ledger world.

Audience and job: a person who steers coding agents (Claude Code, Codex, Gemini CLI) and meets the page from a Show HN post, a README badge or a chat link. They must understand that agents write `roadmap.json` and the page follows, believe that nobody maintains it and only what needs them stands out, and copy `npx roadmap-live`. Secondary action: the GitHub repository.

Proof on hand: the README, AGENTS.md, the real rendered demo page (`test/fixtures/demo-roadmap.json`, labeled sample), the product's own `roadmap.json`. No testimonials, no star or download counts, no invented customers.

Constraints: plain sentences, no exclamation marks, no marketing claims; English page; 380 px must work; reduced motion parks the car at each stop; product name lowercase `roadmap-live`.

User direction (pinned 2026-09-14, replaces the rolled Bauschild and the chosen arcade): happiness and harmony in the spirit of blume.codes, a literal road map, playful, an illustrated car driving along the road. Illustration now in SVG; the landscape is its own layer so a painted raster can replace it later. Same day, second pin: every illustrated object that has an emoji is a system emoji (varied houses, trees, flowers, a few animals), chosen over bundled Twemoji or Noto, and visitors pick their car at the start.

## Direction contract

THESIS: the roadmap as a real road through a sunny landscape. A small car drives it as the visitor scrolls, from the first command to the finish, stopping at milestone signposts that explain the product. Refuses the dark dev-tool page and the kanban screenshot hero.

OWN-WORLD: a daylight storybook landscape. Sky blue melting into a warm cream ground, layered meadow greens, a soft slate road with a cream center line, system emoji props (houses, trees, flowers, animals) standing on the drawn land with soft drop shadows, one emoji car the visitor picks, sunflower yellow reserved for what needs a human in the interface. Rounded, friendly shapes, no hard edges; signposts and milestone stones as the component language; cards are paper signs on posts, not boxes. A soft warm serif for display, a rounded sans for sentences, system mono only for commands.

STORY: the visitor sees the car at the start line, reads that agents keep `roadmap.json` and the page follows, copies the command, looks at the real page with its nine views in a window above the road, then scrolls the road: set up, the agent keeps the file, the page follows live, pull requests sync in, only four things stand out, answer from the page, and the finish flag with the command again.

FIRST VIEWPORT: full-bleed landscape, sky on top, hills and a road winding up from the bottom edge to the horizon, the emoji car waiting behind the checkered start line. Centered in the sky: the headline at display scale, one sentence, the primary pill holding `npx roadmap-live` with copy, GitHub as a quiet text link, and a "Pick your car" row of vehicle emojis under it. At the fold edge the real page in a window frame rises out of the meadow.

FORM: user-pinned direction (no seed; supersedes seed eaf57f64). Signature interaction: the scroll-driven car following the SVG road path, facing its direction of travel and tilting along the slope, pausing at each signpost. Second interaction: picking a car swaps the start-line car with a hop and the road car, remembered per browser. Motion grammar: gentle ease-out, drifting clouds, nothing faster than the car.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Open decisions left to the build

- A painted hero (image generation or supplied art) replaces the SVG landscape layer later; the layer stays swappable.
- Whether the hosted version gets a line near the finish (it exists only as "coming"; no waitlist).
- DESIGN.md for this surface lives beside the page's DESIGN.md without replacing it; the documenter decides the file name.
