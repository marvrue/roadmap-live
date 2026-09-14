---
name: roadmap-live landing page
description: A daylight storybook road through a meadow; a red car drives it as you scroll, stopping at wooden signposts that explain the product.
colors:
  sky-deep: "#1b5aa8"
  sky: "#2a73c2"
  sky-haze: "#e6f4fb"
  cream: "#fbf4e4"
  paper: "#fffbf2"
  stone: "#efe6d2"
  command-paper: "#f3ecdc"
  tag-gray: "#ece6d8"
  ink: "#1f2a33"
  ink-2: "#44515c"
  ink-3: "#5a6671"
  meadow: "#6cbb52"
  meadow-mid: "#a9d77f"
  meadow-soft: "#d3eaab"
  leaf: "#4f9d4c"
  verge: "#e7f3cc"
  road-tar: "#6a7180"
  road-edge: "#565c69"
  road-line: "#fff6de"
  wood-board: "#875a37"
  wood-edge: "#6b4527"
  wood-post: "#8a6a4f"
  wood-text: "#fff7e6"
  car: "#e8503a"
  car-deep: "#c23a26"
  car-press: "#b33421"
  sun: "#ffc53d"
  sun-soft: "#fff0c2"
typography:
  display:
    fontFamily: "Young Serif, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "clamp(42px, 5.6vw, 78px)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  display-finish:
    fontFamily: "Young Serif, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "clamp(44px, 6.8vw, 96px)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Young Serif, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "clamp(36px, 4.8vw, 64px)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Young Serif, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "27px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  wordmark:
    fontFamily: "Young Serif, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
  lead:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
  body-sign:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
  button:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.2
  command:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  post: "3px"
  focus: "8px"
  board: "12px"
  notice: "14px"
  bubble: "18px"
  window: "20px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  gutter: "32px"
  gutter-narrow: "16px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.car-deep}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "8px 8px 8px 24px"
  button-primary-hover:
    backgroundColor: "{colors.car-press}"
  copy-command:
    backgroundColor: "{colors.command-paper}"
    textColor: "{colors.ink}"
    typography: "{typography.command}"
    rounded: "{rounded.board}"
    padding: "10px 10px 10px 16px"
  sign-board:
    backgroundColor: "{colors.wood-board}"
    textColor: "{colors.wood-text}"
    typography: "{typography.title}"
    rounded: "{rounded.board}"
    padding: "14px 20px 14px 14px"
  sign-notice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sign}"
    padding: "24px 22px"
  milestone-stone:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink-2}"
    width: "40px"
    height: "44px"
  milestone-stone-reached:
    backgroundColor: "{colors.car-deep}"
    textColor: "#ffffff"
  tag-attention:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  tag-calm:
    backgroundColor: "{colors.tag-gray}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  bubble-agent-question:
    backgroundColor: "{colors.sun-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "12px 16px"
  bubble-agent:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "12px 16px"
  bubble-you:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.bubble}"
    padding: "12px 16px"
  answer-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 22px"
  answer-pill-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  tab:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  demo-window:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.window}"
---

# Design System: roadmap-live landing page

Scope: `site/index.html` only. The roadmap page itself (`src/page/`) keeps its own ledger world, recorded in the root `DESIGN.md`; nothing here applies to it, and the embedded `site/demo.html` is the product rendering itself, not part of this world.

## Overview

**Creative North Star: "The Sunday Drive"**

The roadmap is a real road through a sunny landscape. A small cherry-red car waits at the start line under a deep blue sky, and as the visitor scrolls it drives down a winding slate road through meadow fields, pausing beside wooden signposts that each explain one step of the product. The origin is pinned by the user: happiness and harmony in the spirit of blume.codes, a literal road map, playful, drawn now in SVG with the landscape kept as its own layer so painted art can replace it later.

The world is daylight only. Sky blue melts to a warm cream ground; everything below the horizon is layered greens, each field a distinct soft tint, hedgerows in round clumps. Content never sits in boxes: it hangs as paper notices pinned under wooden boards on posts. Shapes are rounded, strokes are soft ink at low opacity, shadows are diffuse and tinted by what they fall on. Density is low and paced by the road: one stop, one idea, a lot of meadow in between.

The page refuses the dark developer-tool look and the kanban screenshot hero. The product's real page appears once, in a paper window rising out of the meadow, quiet and gray, so the landscape carries the feeling and the window carries the proof.

**Key Characteristics:**
- Full-bleed illustrated hero: sky gradient, hills, a road winding to the horizon, the red car at a checkered start line.
- One road down the page, generated from the layout, with the car mapped to scroll and held beside each sign.
- Wooden signpost boards with numbered milestone stones, paper notices with two pin dots, a post into the grass.
- Young Serif for display and boards, Onest for sentences, system mono only for commands.
- Sunflower yellow only where a human is needed; cherry red for the car and the way forward.
- Grain texture multiplied over sky, meadow and wood.

## Colors

A daylight storybook palette: saturated sky and meadow, warm papers, one red car, one yellow that asks for you.

### Primary
- **Cherry Car Red** (car, car-deep, car-press): the car body (car), the command pill and a reached milestone stone (car-deep, with car-press on hover). Red is the way forward. It never signals an error, and text never turns red.

### Secondary
- **Sunflower** (sun) and **Sunflower Wash** (sun-soft): in the interface, only the attention tags (blocked, quiet, unplanned, question) and the open agent question bubble. The same yellow grows in the illustration as sunflowers and flower petals.

### Tertiary
- **Midday Sky** (sky-deep, sky, sky-haze): the hero ground. Sky-deep at the top and as `theme-color`, sky at 60 percent of the gradient, then #4c9ade, #b9e0f7 and sky-haze at the horizon.
- **Meadow** (meadow, meadow-mid, meadow-soft, leaf, verge): the proof section fades meadow to meadow-mid (240px) to meadow-soft (560px); meadow-soft is the road section's ground. Leaf is the base foliage color of every tree, bush and stem. Verge is the pale shoulder either side of the road. Generated fields rotate six greens (#cfe7a2, #b9dd88, #dcefb6, #aed47a, #c6e396, #d6ecae); hedgerows use #8cc567, #7db85c, #9bd076.
- **Road** (road-tar, road-edge, road-line): slate tar with a darker edge and a cream dashed center line.
- **Signpost Wood** (wood-board, wood-edge, wood-post, wood-text): the board is a vertical gradient #9a6a43 to #845735 with a 5px wood-edge band at the bottom, lettered in wood-text; posts are wood-post to #735539.

### Neutral
- **Cream** (cream): page and finish ground, the color below the landscape.
- **Paper** (paper): notices, speech bubbles, the demo window, answer pills.
- **Stone** (stone): an unreached milestone stone and tab hover. **Command Paper** (command-paper, #ece2cc on hover) fills copy rows; **Tag Gray** (tag-gray) fills calm tags.
- **Ink** (ink, ink-2, ink-3): headings and code in ink, sentences on paper in ink-2, notes, footer and speaker names in ink-3. Ink as a fill is used only for small pills: the selected tab, a copied command, your own bubble, the answer pill hover.

### Named Rules
**The Sunflower Rule.** In the interface layer, sunflower yellow fills only what needs a human: attention tags and the agent's open question. When the visitor answers, the bubble returns to paper and the question tag turns gray. The illustration may grow sunflowers and petals; no button, board, link or heading may be yellow.

**The One Red Car Rule.** Cherry red belongs to the car and to what moves you forward: the car, the primary command pill, a reached stone. It is never a warning and never a text color.

**The Daylight Rule.** No dark mode and no dark section. Light text appears only on the sky, on cherry red (pill, reached stone) and on wood boards; everywhere else text is ink on paper, cream or meadow.

## Typography

**Display Font:** Young Serif (with Iowan Old Style, Palatino Linotype, Georgia), self-hosted woff2, weight 400 only.
**Body Font:** Onest (with system-ui, -apple-system, Segoe UI, Roboto), self-hosted 400 and 600.
**Label/Mono Font:** the system mono stack (ui-monospace, SFMono-Regular, Menlo, Consolas), no web font.

**Character:** a soft, round, slightly chunky serif that reads like painted sign lettering, paired with a friendly geometric sans with open counters. Mono is a tool, not a style.

### Hierarchy
- **Display** (400, clamp(42px, 5.6vw, 78px), 1.04): the hero headline, centered, max 17ch, balanced, with a soft blue text shadow over the sky.
- **Display Finish** (400, clamp(44px, 6.8vw, 96px), 1.08): the finish headline, the largest type on the page.
- **Headline** (400, clamp(36px, 4.8vw, 64px), 1.08): section headings.
- **Title** (400, 27px, 1.15; 22px at 760px and below): the sign board heading. Stone numerals use the display face at 19px (17px narrow). The wordmark is the display face at 24px (22px narrow).
- **Lead** (400, 20px, 1.55; 18px narrow): the hero sentence, max 36em. Section intros are 19px, max 34em.
- **Body** (400, 18px, 1.6; 17px narrow): the page base. Notices use 17px/1.6; captions, bubbles, nav and links 16px.
- **Small** (400, 15px, 1.5): notes under a command and the attention list rows.
- **Label** (600, 13px): tag text, speaker names in bubbles, the copy chip in command rows. Sentence case, never uppercase.
- **Command** (mono, 15px, 1.45; 13px narrow; 17px inside the primary pill): anything you can copy, and file names inline at 0.9em.

### Named Rules
**The Signpost Voice Rule.** Young Serif speaks only at display sizes, on boards, on stones and in the wordmark. Every sentence is Onest; emphasis is 600, never italic, never a third weight.

**The Copyable Mono Rule.** Mono appears only for a command or a file name. If it is not something the visitor would type or open, it is not mono.

## Layout

The page is a vertical sequence of scenes: the full-bleed hero (min-height max(840px, 100svh); 880px narrow), the proof meadow with the demo window overlapping the hero by 72px (60px narrow), the road section, and the finish with a 28px checkered strip. Content width is 1200px with a 32px gutter (16px at 760px and below); the demo window caps at 1120px.

The road section is a list of six stops. On desktop each stop is a three-column grid, 5fr sign column, a center lane of minmax(128px, 2fr), 5fr scenery column, at least 500px tall; signs alternate left and right, and the scenery column opposite holds illustration. The road is drawn through the lane centers, swinging up to 44px (30 percent of the lane) toward the side of each sign. Signs are 420 to 520px wide and sit at varied vertical positions so the road reads as a winding drive, not a zipper.

Section rhythm is generous: 72px above section heads, 96px above the stops and above the finish copy, 80 to 96px at the bottom of sections.

**Responsive rules.**
- **1080px and below:** the demo window takes the gutter as side margin; the flora beside it moves inward and shrinks (sunflower 92px, grass-and-flowers 116px).
- **960px and below:** the lane narrows to 96px and every sign stretches to its full column.
- **760px and below:** gutter 16px. The road moves to a 44px lane at the edge opposite each sign (left signs get the lane on the right and vice versa); the road runs straight past each sign and curves between them. Scenery drops below each sign into a 168px band with two decorations; posts, window dots, hero flora, the finish scene, the first nav link and the GitHub text link in the hero hide. Road strokes thin (verge 60, edge 40, tar 32, center line 2 with 10/12 dashes), the car scales to 42 by 69px, the flag to 52 by 90px, the hero sun moves to the center above the road.

**The Road Owns the Middle Rule.** On wide screens the road runs down the center lane and signs never cross it; on narrow screens the road takes the edge and signs take the rest. Generated fields and hedgerows keep 24px clear of every sign.

## Elevation & Depth

Depth is a storybook stack: sky, far hills, near hills, road, objects, car. Surfaces lift with soft, tinted, diffuse shadows; every drawn object stands on a flat contact-shadow ellipse. Grain (a 180px fractal-noise tile, multiply, 0.7 opacity; 0.5 over the hero) adds paper texture to sky, meadow and wood boards.

### Shadow Vocabulary
- **Pill lift** (`box-shadow: 0 10px 24px rgb(110 30 12 / 0.28), inset 0 -3px 0 rgb(0 0 0 / 0.14)`): the primary command. Hover deepens to 0 14px 30px at 0.32 and lifts 2px; active presses to 0 4px 10px and drops 1px.
- **Window float** (`0 32px 64px rgb(28 64 30 / 0.22), 0 4px 12px rgb(28 64 30 / 0.12)`): the demo window over the meadow.
- **Notice hang** (`0 14px 26px rgb(40 72 28 / 0.16), 0 2px 3px rgb(40 72 28 / 0.1)`): paper notices.
- **Board** (`0 8px 16px rgb(60 40 20 / 0.18)`): wooden boards.
- **Bubble** (`0 8px 18px rgb(40 72 28 / 0.14)`), **answer pill** (`0 6px 12px rgb(40 72 28 / 0.12)` plus a 2px inset ink ring).
- **Car** (`drop-shadow(0 7px 6px rgb(30 50 20 / 0.3))`) and **road shade** (the road stroke repeated at 52px, offset 4px right and 6px down, rgb(46 72 28 / 0.2)).
- **Contact ellipse** (fill #2f5a1f at 0.12 to 0.22 opacity): under every tree, pine, bush, house, fence, rock, post and flag.

### Named Rules
**The Tinted Shadow Rule.** Shadows take the color of what lies beneath: green over meadow, brown under wood, deep red under the red pill. No neutral gray outer shadows and no hard offset drop shadows; the only zero-blur edges are inset: the pill bevel (inset 0 -3px 0) and the answer pill ring.

**The Contact Shadow Rule.** Every object drawn into the landscape stands on a flat ellipse shadow. Nothing floats in the meadow.

## Shapes

Rounded and friendly throughout. Buttons, tags, tabs and answers are full pills (999px). The demo window is 20px (16px narrow), bubbles 18px, boards and command rows 12px. A notice is square on top, where it tucks 3px under its board, and 14px at the bottom. Milestone stones are arches: 20px top corners, 8px bottom. Posts and bubble tails are 3px. Focus is a 3px ink outline offset 3px with 8px radius (white on the sky).

Illustration geometry follows the same law: circles and ellipses for foliage, clouds and ponds; rounded rects (rx 3 to 17) for trunks, fences, car parts; the only pointed shapes are pine silhouettes and grass blades. Strokes use round joins and caps.

**The No Hard Corner Rule.** The smallest interface corner is 3px. The only square interface edge is where paper meets wood.

## Components

### Buttons
Chunky, glossy and pressable, like a toy.
- **Shape:** full pill (999px).
- **Primary command pill:** car-deep fill, white text, Onest 600 17px, the command in mono 17px with a dimmed `$`, padding 8px 8px 8px 24px, gap 16px. A nested copy chip in white at 18 percent (10px 16px, 15px) sits at the right end. Used exactly twice: the hero (`npx roadmap-live`) and the finish (`npx roadmap-live init`).
- **Hover / Focus / Active:** lift 2px and darken to car-press over 220ms cubic-bezier(0.2, 0.8, 0.2, 1); press drops 1px. Copied state turns the chip white with car-deep text and reads "Copied" for 1.8s ("Press Cmd+C" when the clipboard is refused, with the command selected).
- **Quiet link:** the secondary action is a 600 underlined text link (4px offset, 1.5px thickness), never a second button.

### Copy Command Row
- **Style:** full-width row in command-paper, 12px radius, mono 15px command left, a paper copy chip (Onest 600 13px, ink-2) right; hover darkens to #ece2cc. Copied state inverts the chip to ink. Long commands wrap instead of scrolling.

### Chips (tags)
- **Style:** 13px 600 pill, 3px 10px, fixed 118px column (104px narrow) beside the row text.
- **State:** attention rows use sun with ink text and ink row text; calm rows use tag-gray with ink-2.

### Signpost (signature component)
A wooden board, a paper notice hanging under it, a post into the grass.
- **Board:** wood gradient with grain and a 5px darker bottom band, 12px radius, padding 14px 20px 14px 14px; a milestone stone left, the title in Young Serif 27px wood-text right.
- **Milestone stone:** 40 by 44px arch in stone with the numeral in ink-2; turns car-deep with white numeral when the car reaches the stop (400ms), and is red by default without JavaScript.
- **Notice:** paper, inset 14px from the board edges (8px narrow), two pin dots (#c7b598, 3.5px) at 16px from each top corner, padding 24px 22px, notice hang shadow.
- **Post:** 14px wide wood-post gradient, 3px radius, 44px in from the side nearer the road, running 72px below the sign onto a soft ground ellipse. Hidden at 760px and below.
- **Arrival:** unreached signs sit 10px low and rise into place over 520ms when the car arrives.

### Speech Bubbles and Answers
- **Bubble:** 18px radius, 12px 16px padding, 16px text, speaker name above in 13px 600 ink-3; a 14px rounded square rotated 45 degrees forms the tail at the top, 24px in from the speaker's side.
- **Variants:** the agent's open question in sun-soft (returns to paper once answered); the agent's reply in paper; your answer in ink with paper text, aligned right, tail on the right. New bubbles pop in over 380ms (8px rise, 0.98 scale).
- **Answer pill:** paper with a 2px inset ink ring, 600 16px, 8px 22px; hover fills ink and lifts 1px; disabled after choosing (0.5 opacity).

### Navigation
- **Top bar:** wordmark left, 600 16px white links right with underline on hover, over the sky.
- **Demo tabs:** a scrollable row of 600 14px pills in the window bar; ink-2 at rest, stone on hover, ink with paper text when selected.

### Demo Window
- **Style:** paper, 20px radius, window float shadow; a bar in #fbf5e8 with a #ece3cf hairline, three 11px dots in #e4d7bd, and the tabs. The viewport is 600px tall (560px narrow) and scales a 1180px-wide rendering of the real page to fit. Flanked by a sunflower and a grass-and-flowers cluster growing from behind its lower corners.

### Illustration Layer
- **Symbols:** one hidden sprite defines tree, pine, bush, flowers, house, pond, sunflower, fence, rock and grass (cloud lives inside the hero art). Each is placed with `<use>`, never redrawn.
- **Ink outlines:** a wrapper applies stroke rgb(36 58 28 / 0.42) at 1.6px with round joins; highlights and contact shadows opt out with `stroke="none"`. Grass and flower clusters used as texture go without ink.
- **Color variants through custom properties:** tree takes --c1 to --c4 (default greens; autumn #e0973a, #eaa94a, #cf7f2c, #f2c160; spring #6cb85a, #7cc466, #5aa84f, #94d27c); house takes --roof (default #d9624a, blue #5c8fc4) and --wall.
- **Landscape art layer:** the hero landscape is a separate layer in a 1440 by 900 frame, `preserveAspectRatio="xMidYMax slice"`, so it anchors to the bottom edge. The road's checkered start line sits at x 650, y 812. The hero car lives in its own layer with the same frame and aspect rule, so a painted raster can replace the art without moving the car.
- **Clouds:** four (five narrow) clouds drift ±36px horizontally over 46 to 70s, alternating, with staggered delays.
- **Road generation:** the road below the hero is computed from the rendered stop positions: cubic curves with vertical handles through each lane point, stacked as verge (92px, verge), shade, edge (52px, road-edge), tar (42px, road-tar) and a 3px road-line center dashed 16/18. Fields are curved bands every 460px (340px narrow); hedgerows are clumps of 3 to 8 circles with a shadow circle each, seeded deterministically. The checkered finish flag stands at the road's end. Without JavaScript a straight 42px tar strip stands in and car and flag are hidden.

### Signature Motion: the Drive
- **Hero roll-in:** 300ms after load the hero car rolls from y 1010 at 1.3 scale up to the start line (650, 812) at 1.0 over 1.9s, cubic ease-out, with a small settling bob.
- **Scroll-mapped car:** the probe point is 55 percent down the viewport. Scroll position maps piecewise to road position with a hold zone of ±130px (±70px narrow) around each stop, so the car parks beside a sign while the visitor reads, then drives on. The car follows the tar path, rotates to its tangent, and eases toward the target by 16 percent per frame. Treads on all four wheels roll in proportion to distance driven. A stop counts as reached when the car is within 30px of it.
- **Reduced motion:** clouds, bubble pops and all component transitions stop; signs do not sink; the hero car stays at the start line; the road car jumps and parks at the last stop within 60px of the probe, or at the flag.

**The Nothing Faster Than the Car Rule.** Motion is gentle ease-out (cubic-bezier(0.2, 0.8, 0.2, 1) for interface, 160 to 520ms). Clouds drift for tens of seconds; the car is the fastest thing on the page, and only moves when the visitor scrolls.

**The Swappable Landscape Rule.** Art, grain, car and copy are separate layers sharing one frame. Replacing the landscape means replacing one layer and keeping the start line at x 650, y 812 of 1440 by 900.

## Do's and Don'ts

### Do:
- **Do** hang content as a paper notice under a wooden board on a post, numbered with a milestone stone.
- **Do** place illustration with the shared symbols, the ink outline wrapper and the --c1 to --c4, --roof and --wall variants instead of drawing new one-off shapes.
- **Do** stand every landscape object on a contact-shadow ellipse (#2f5a1f, 0.12 to 0.22).
- **Do** tint shadows by what they fall on: green rgb(40 72 28) over meadow, rgb(60 40 20) under wood, rgb(110 30 12) under the red pill.
- **Do** keep the hero art and car layers on the 1440 by 900 frame with xMidYMax slice and the start line at x 650, y 812.
- **Do** keep sunflower yellow for attention tags and the agent's open question, and return them to calm once answered.
- **Do** park the car at each stop under reduced motion and draw a plain road without JavaScript.

### Don't:
- **Don't** use sunflower yellow on buttons, boards, links, headings or any interface element that does not need a human.
- **Don't** use red for errors, warnings or text; red is the car and the way forward.
- **Don't** add a dark section or a dark mode, or put light text on anything but sky, cherry red or wood.
- **Don't** put content in bordered boxes or cards; use signs, notices, bubbles or the window.
- **Don't** set sentences in Young Serif or anything except commands and file names in mono.
- **Don't** use corners below 3px, neutral gray shadows, or hard offset drop shadows.
- **Don't** let anything move faster than the car or move without the visitor's scroll, except the drifting clouds and the one-time hero roll-in.
