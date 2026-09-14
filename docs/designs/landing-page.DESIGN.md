---
name: roadmap-live landing page
description: A daylight storybook road through a meadow of system emojis; the visitor's chosen car drives it as you scroll, stopping at wooden signposts that explain the product.
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
  verge: "#e7f3cc"
  road-tar: "#6a7180"
  road-edge: "#565c69"
  road-line: "#fff6de"
  wood-board: "#875a37"
  wood-edge: "#6b4527"
  wood-post: "#8a6a4f"
  wood-text: "#fff7e6"
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
  emoji:
    fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
    fontWeight: 400
    lineHeight: 1
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
  car-picker-button:
    backgroundColor: "rgb(255 255 255 / 0.14)"
    typography: "{typography.emoji}"
    rounded: "{rounded.pill}"
    width: "46px"
    height: "46px"
  car-picker-button-hover:
    backgroundColor: "rgb(255 255 255 / 0.28)"
  car-picker-button-pressed:
    backgroundColor: "#ffffff"
  car-picker-button-narrow:
    width: "36px"
    height: "36px"
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

The roadmap is a real road through a sunny landscape. A small car, the one the visitor picked, waits at the start line under a deep blue sky, and as the visitor scrolls it drives down a winding slate road through meadow fields, pausing beside wooden signposts that each explain one step of the product. The origin is pinned by the user: happiness and harmony in the spirit of blume.codes, a literal road map, playful. On 2026-09-14 the user chose system emojis for every illustrated object that has one, accepting that they look different on each platform; the landscape stays its own layer so painted art can replace it later.

The world is daylight only. Sky blue melts to a warm cream ground; everything below the horizon is layered greens, each field a distinct soft tint. The ground (sky, hills, fields, road, verge, start line) is drawn in SVG; what stands on it (trees, houses, animals, flowers, clouds, sun, the car, the flag) is a color emoji, varied in kind and size, casting a soft green shadow. Content never sits in boxes: it hangs as paper notices pinned under wooden boards on posts. Shapes are rounded, shadows are diffuse and tinted by what they fall on. Density is low and paced by the road: one stop, one idea, a lot of meadow in between.

The page refuses the dark developer-tool look and the kanban screenshot hero. The product's real page appears once, in a paper window rising out of the meadow, quiet and gray, so the landscape carries the feeling and the window carries the proof.

**Key Characteristics:**
- Full-bleed illustrated hero: drawn sky gradient, hills and a road winding to the horizon, dressed with emoji sun, clouds, trees, houses, animals and flowers; the picked car at a checkered start line.
- A "Pick your car" row of round emoji toggles under the hero command; the choice drives the whole page and is remembered.
- One road down the page, generated from the layout, with the car mapped to scroll, facing its direction of travel and held beside each sign.
- Wooden signpost boards with numbered milestone stones, paper notices with two pin dots, a post into the grass.
- Young Serif for display and boards, Onest for sentences, system mono only for commands, the system emoji stack for everything illustrated.
- Sunflower yellow only where a human is needed; cherry red for the way forward.
- Grain texture multiplied over sky, meadow and wood.

## Colors

A daylight storybook palette: saturated sky and meadow, warm papers, one red for the way forward, one yellow that asks for you. The emoji props bring their own platform colors and are not tokens.

### Primary
- **Cherry Red** (car-deep, car-press): the command pill and a reached milestone stone (car-deep, with car-press on hover). Red is the way forward. It never signals an error, and text never turns red.

### Secondary
- **Sunflower** (sun) and **Sunflower Wash** (sun-soft): in the interface, only the attention tags (blocked, quiet, unplanned, question), the open agent question bubble, and text selection. The illustration grows sunflowers as emojis.

### Tertiary
- **Midday Sky** (sky-deep, sky, sky-haze): the hero ground. Sky-deep at the top and as `theme-color`, sky at 60 percent of the gradient, then #4c9ade, #b9e0f7 and sky-haze at the horizon.
- **Meadow** (meadow, meadow-mid, meadow-soft, verge): the proof section fades meadow to meadow-mid (240px) to meadow-soft (560px); meadow-soft is the road section's ground. Verge is the pale shoulder either side of the road. Generated fields rotate six greens (#cfe7a2, #b9dd88, #dcefb6, #aed47a, #c6e396, #d6ecae). Hero hills are #a6d3bd (far, with drawn #6fae8c pine silhouettes), #8fcb66 (near) and #7cc05a (foreground banks).
- **Road** (road-tar, road-edge, road-line): slate tar with a darker edge and a cream dashed center line.
- **Signpost Wood** (wood-board, wood-edge, wood-post, wood-text): the board is a vertical gradient #9a6a43 to #845735 with a 5px wood-edge band at the bottom, lettered in wood-text; posts are wood-post to #735539.

### Neutral
- **Cream** (cream): page and finish ground, the color below the landscape.
- **Paper** (paper): notices, speech bubbles, the demo window, answer pills.
- **Stone** (stone): an unreached milestone stone and tab hover. **Command Paper** (command-paper, #ece2cc on hover) fills copy rows; **Tag Gray** (tag-gray) fills calm tags.
- **Ink** (ink, ink-2, ink-3): headings and code in ink, sentences on paper in ink-2, notes, footer and speaker names in ink-3. Ink as a fill is used only for small pills: the selected tab, a copied command, your own bubble, the answer pill hover.

### Named Rules
**The Sunflower Rule.** In the interface layer, sunflower yellow fills only what needs a human: attention tags and the agent's open question. When the visitor answers, the bubble returns to paper and the question tag turns gray. The illustration may grow sunflower emojis; no button, board, link or heading may be yellow.

**The Way Forward Red Rule.** Cherry red belongs to what moves you forward: the primary command pill and a reached stone. It is never a warning and never a text color. The car's own color comes from the emoji the visitor picked, not from a token.

**The Daylight Rule.** No dark mode and no dark section. Light text appears only on the sky, on cherry red (pill, reached stone) and on wood boards; everywhere else text is ink on paper, cream or meadow.

## Typography

**Display Font:** Young Serif (with Iowan Old Style, Palatino Linotype, Georgia), self-hosted woff2, weight 400 only.
**Body Font:** Onest (with system-ui, -apple-system, Segoe UI, Roboto), self-hosted 400 and 600.
**Label/Mono Font:** the system mono stack (ui-monospace, SFMono-Regular, Menlo, Consolas), no web font.
**Illustration Font:** the system emoji stack (Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji), no bundled emoji font, upright, line-height 1.

**Character:** a soft, round, slightly chunky serif that reads like painted sign lettering, paired with a friendly geometric sans with open counters. Mono is a tool, not a style. Emoji is illustration, not text.

### Hierarchy
- **Display** (400, clamp(42px, 5.6vw, 78px), 1.04): the hero headline, centered, max 17ch, balanced, with a soft blue text shadow over the sky.
- **Display Finish** (400, clamp(44px, 6.8vw, 96px), 1.08): the finish headline, the largest type on the page.
- **Headline** (400, clamp(36px, 4.8vw, 64px), 1.08): section headings.
- **Title** (400, 27px, 1.15; 22px at 760px and below): the sign board heading. Stone numerals use the display face at 19px (17px narrow). The wordmark is the display face at 24px (22px narrow).
- **Lead** (400, 20px, 1.55; 18px narrow): the hero sentence, max 36em. Section intros are 19px, max 34em.
- **Body** (400, 18px, 1.6; 17px narrow): the page base. Notices use 17px/1.6; captions, bubbles, nav and links 16px.
- **Small** (400, 15px, 1.5): notes under a command and the attention list rows. The "Pick your car" label is 15px 600 over the sky.
- **Label** (600, 13px): tag text, speaker names in bubbles, the copy chip in command rows. Sentence case, never uppercase.
- **Command** (mono, 15px, 1.45; 13px narrow; 17px inside the primary pill): anything you can copy, and file names inline at 0.9em.
- **Emoji** (system emoji stack, sized in px per prop): 26px in picker buttons (20px narrow), 64px for the road car and flag (46px narrow), 34 to 120px for scenery props, 126px for the hero car.

### Named Rules
**The Signpost Voice Rule.** Young Serif speaks only at display sizes, on boards, on stones and in the wordmark. Every sentence is Onest; emphasis is 600, never italic, never a third weight.

**The Copyable Mono Rule.** Mono appears only for a command or a file name. If it is not something the visitor would type or open, it is not mono.

## Layout

The page is a vertical sequence of scenes: the full-bleed hero (min-height max(840px, 100svh); 960px narrow), the proof meadow with the demo window overlapping the hero by 72px (60px narrow), the road section, and the finish with a 28px checkered strip. Content width is 1200px with a 32px gutter (16px at 760px and below); the demo window caps at 1120px.

The hero copy stacks centered: headline, lead, the actions row (pill plus quiet link, gap 16px 28px, 36px above), then the car picker 26px below (22px narrow).

The road section is a list of six stops. On desktop each stop is a three-column grid, 5fr sign column, a center lane of minmax(128px, 2fr), 5fr scenery column, at least 500px tall; signs alternate left and right, and the scenery column opposite holds emoji props placed absolutely by percentage. The road is drawn through the lane centers, swinging up to 44px (30 percent of the lane) toward the side of each sign. Signs are 420 to 520px wide and sit at varied vertical positions so the road reads as a winding drive, not a zipper.

Section rhythm is generous: 72px above section heads, 96px above the stops and above the finish copy, 80 to 96px at the bottom of sections.

**Responsive rules.**
- **1080px and below:** the demo window takes the gutter as side margin; the flora beside it moves inward and shrinks (sunflower 72px, sprout-tulip-blossom row 40px).
- **960px and below:** the lane narrows to 96px and every sign stretches to its full column.
- **760px and below:** gutter 16px. The road moves to a 44px lane at the edge opposite each sign (left signs get the lane on the right and vice versa); the road runs straight past each sign and curves between them. Scenery drops below each sign into a 168px band showing only its first two props (52px and 48px, pinned to opposite sides); posts, window dots, flora beside the window, the finish scene, the first nav link and the GitHub text link in the hero hide. The picker label takes its own line and buttons shrink to 36px with a 4px gap. Road strokes thin (verge 60, edge 40, tar 32, center line 2 with 10/12 dashes); the road car and flag drop to 46px. The desktop sun at the top right hides; a rising sun sits low at the center above the road, and an extra tree and tulip appear beside the road, both mobile only.

**The Road Owns the Middle Rule.** On wide screens the road runs down the center lane and signs never cross it; on narrow screens the road takes the edge and signs take the rest. Generated fields and hedgerows keep 24px clear of every sign.

## Elevation & Depth

Depth is a storybook stack: sky, far hills, near hills, road, props, car. Surfaces lift with soft, tinted, diffuse shadows. Emoji props below the hero cast a green drop shadow straight down; drawn objects (fence, sign posts) and the hero car stand on flat contact ellipses. Emojis inside the hero art are flat, part of the painted layer. Grain (a 180px fractal-noise tile, multiply, 0.7 opacity; 0.5 over the hero) adds paper texture to sky, meadow and wood boards.

### Shadow Vocabulary
- **Pill lift** (`box-shadow: 0 10px 24px rgb(110 30 12 / 0.28), inset 0 -3px 0 rgb(0 0 0 / 0.14)`): the primary command. Hover deepens to 0 14px 30px at 0.32 and lifts 2px; active presses to 0 4px 10px and drops 1px.
- **Picked car** (`0 6px 14px rgb(10 40 90 / 0.28)`): the pressed picker button, a sky-tinted lift under the white circle.
- **Window float** (`0 32px 64px rgb(28 64 30 / 0.22), 0 4px 12px rgb(28 64 30 / 0.12)`): the demo window over the meadow.
- **Notice hang** (`0 14px 26px rgb(40 72 28 / 0.16), 0 2px 3px rgb(40 72 28 / 0.1)`): paper notices.
- **Board** (`0 8px 16px rgb(60 40 20 / 0.18)`): wooden boards.
- **Bubble** (`0 8px 18px rgb(40 72 28 / 0.14)`), **answer pill** (`0 6px 12px rgb(40 72 28 / 0.12)` plus a 2px inset ink ring).
- **Emoji prop** (`filter: drop-shadow(0 8px 5px rgb(40 64 20 / 0.22))`; 6px blur on the flora beside the window): every scenery and finish prop.
- **Road car** (`drop-shadow(0 7px 5px rgb(30 50 20 / 0.3))`), **flag** (`drop-shadow(0 6px 4px rgb(40 64 20 / 0.25))`), **hedgerow** (`drop-shadow(0 3px 2px rgb(40 64 20 / 0.28))` on the whole hedge group).
- **Road shade** (the road stroke repeated at 52px, offset 4px right and 6px down, rgb(46 72 28 / 0.2)).
- **Contact ellipse**: under the fence (#2f5a1f at 0.12), under each sign post (rgb(40 64 20 / 0.2)), under the hero car (#1f3a14 at 0.22, 72 by 10).

### Named Rules
**The Tinted Shadow Rule.** Shadows take the color of what lies beneath: green over meadow, brown under wood, deep red under the red pill, blue on the sky. No neutral gray outer shadows and no hard offset drop shadows; the only zero-blur edges are inset: the pill bevel (inset 0 -3px 0) and the answer pill ring.

**The Grounded Prop Rule.** Below the hero, nothing floats in the meadow: an emoji prop casts its green drop shadow downward, a drawn object stands on a flat ellipse.

## Shapes

Rounded and friendly throughout. Buttons, tags, tabs, answers and picker toggles are full pills or circles (999px, 50%). The demo window is 20px (16px narrow), bubbles 18px, boards and command rows 12px. A notice is square on top, where it tucks 3px under its board, and 14px at the bottom. Milestone stones are arches: 20px top corners, 8px bottom. Posts and bubble tails are 3px. Focus is a 3px ink outline offset 3px with 8px radius (white on the sky).

Drawn geometry follows the same law: smooth curves for hills, fields and the road; circles and ellipses for the pond; rounded rects (rx 3) for fence rails and posts. The only pointed drawn shapes are the far-hill pine silhouettes. Everything with an emoji brings the emoji's own silhouette; the page never outlines or redraws it.

**The No Hard Corner Rule.** The smallest interface corner is 3px. The only square interface edge is where paper meets wood.

## Components

### Buttons
Chunky, glossy and pressable, like a toy.
- **Shape:** full pill (999px).
- **Primary command pill:** car-deep fill, white text, Onest 600 17px, the command in mono 17px with a dimmed `$`, padding 8px 8px 8px 24px, gap 16px. A nested copy chip in white at 18 percent (10px 16px, 15px) sits at the right end. Used exactly twice: the hero (`npx roadmap-live`) and the finish (`npx roadmap-live init`).
- **Hover / Focus / Active:** lift 2px and darken to car-press over 220ms cubic-bezier(0.2, 0.8, 0.2, 1); press drops 1px. Copied state turns the chip white with car-deep text and reads "Copied" for 1.8s ("Press Cmd+C" when the clipboard is refused, with the command selected).
- **Quiet link:** the secondary action is a 600 underlined text link (4px offset, 1.5px thickness), never a second button.

### Car Picker
A garage row of toy cars on the sky. The choice is the visitor's car for the whole page.
- **Structure:** a labelled group "Pick your car" (15px 600 white, sky-tinted text shadow 0 1px 8px rgb(10 40 90 / 0.35)) followed by eight emoji toggles in this order: 🚗 🚕 🚙 🏎️ 🛻 🚐 🚜 🚲. Each has an English aria-label (Car, Taxi, SUV, Race car, Pickup truck, Van, Tractor, Bicycle) and aria-pressed. Gap 8px, centered, wraps.
- **Toggle:** 46px circle, emoji 26px, white at 14 percent on the sky. Hover lifts 2px and brightens to white at 28 percent (180ms ease-ui, 160ms color). Pressed is a solid white circle with the picked-car shadow. Focus is the white sky outline.
- **Behavior:** a click swaps the emoji in the hero car and the road car, updates aria-pressed on all eight, and stores the emoji in localStorage under `rl-car`; a stored choice is restored silently on load if it matches a button. The hero car hops 28px up and back over 440ms ease-ui on a click, skipped under reduced motion.
- **Narrow:** label on its own line, 36px circles, 20px emoji, 4px gap.

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
- **Style:** paper, 20px radius, window float shadow; a bar in #fbf5e8 with a #ece3cf hairline, three 11px dots in #e4d7bd, and the tabs. The viewport is 600px tall (560px narrow) and scales a 1180px-wide rendering of the real page to fit. Flanked by emoji flora growing from behind its lower corners: a 96px 🌻 on the left, a tight 50px 🌱🌷🌼 row (letter-spacing -10px) on the right.

### Illustration Layer
- **Emoji props:** every illustrated object that has an emoji is a system emoji, never a drawn symbol. In the hero they are SVG `<text>` on the art frame, centered with text-anchor middle and sized in frame units. Below the hero they are absolutely positioned spans (left/top in percent, font-size in px) with the emoji prop shadow. Emojis are used as the platform renders them: not outlined, not recolored, not filtered except for the drop shadow, and mirrored only for the car.
- **Vocabulary in use:** trees 🌳 🌲 🌴; houses 🏡 🏘️ 🏠 🛖 🏪; animals 🐑 🐄 🦆 🦋; flowers 🌸 🌼 🌷 🌹 🌺 🌻; ground 🌿 🌾 🍄 🪨 🌱; sky ☀️ ☁️; finish 🏁.
- **Drawn SVG:** only what has no fitting emoji: the sky gradient and sun glow, hills, fields, road, verge, the checkered start line, the fence and the pond. Fence and pond are shared symbols placed with `<use>` and a soft ink outline (stroke rgb(36 58 28 / 0.42), 1.6px, round joins; highlights and the fence's contact shadow opt out with `stroke="none"`).
- **Landscape art layer:** the hero landscape is a separate layer in a 1440 by 900 frame, `preserveAspectRatio="xMidYMax slice"`, so it anchors to the bottom edge. The road's checkered start line sits at x 650, y 812. The hero car lives in its own layer with the same frame and aspect rule, so a painted raster can replace the art without moving the car.
- **Clouds:** four ☁️ emojis (110 to 190 frame units) drift ±36px horizontally over 46 to 70s, alternating, with staggered delays. The sun is a ☀️ emoji over a radial #fff7dc glow.
- **Road generation:** the road below the hero is computed from the rendered stop positions: cubic curves with vertical handles through each lane point, stacked as verge (92px, verge), shade, edge (52px, road-edge), tar (42px, road-tar) and a 3px road-line center dashed 16/18. Fields are curved bands every 460px (340px narrow). Hedgerows follow two of every three field edges as clumps of 3 to 8 tree emojis drawn from 🌳 🌲 🌳 🌿 🌳 🌲 🌴 (broadleaf weighted highest), each sized 2.4 times a seeded radius of 8 to 16 (5 to 10 narrow), with seeded gaps of 70 to 290px (40 to 130px narrow) between clumps, all deterministic. The 🏁 flag stands at the road's end. Without JavaScript a straight 42px tar strip stands in and car and flag are hidden.

### Signature Motion: the Drive
- **Hero roll-in:** 300ms after load the hero car (a 126px emoji mirrored to face right, on its contact ellipse) rolls from y 1010 at 1.3 scale up to the start line (650, 812) at 1.0 over 1.9s, cubic ease-out, with a small settling bob.
- **Scroll-mapped car:** the probe point is 55 percent down the viewport. Scroll position maps piecewise to road position with a hold zone of ±130px (±70px narrow) around each stop, so the car parks beside a sign while the visitor reads, then drives on. The car follows the tar path and eases toward the target by 16 percent per frame. A stop counts as reached when the car is within 30px of it.
- **Car pose:** the emoji looks left by default, so the car is flipped with scaleX to face its direction of travel; it only turns around once the path's horizontal share passes 25 percent, so it does not flicker on the near-vertical road. The nose tilts along the slope, capped at 38 degrees, and the car bobs 1.2px with distance driven. It never rotates to point down the road like a top-down car.
- **Reduced motion:** clouds, bubble pops and the picker hop stop, as do the transitions on the pill, signs, stones and answer pills; signs do not sink; the hero car stays at the start line; the road car jumps and parks at the last stop within 60px of the probe, or at the flag.

**The Nothing Faster Than the Car Rule.** Motion is gentle ease-out (cubic-bezier(0.2, 0.8, 0.2, 1) for interface, 160 to 520ms). Clouds drift for tens of seconds; the car is the fastest thing on the page, and only moves when the visitor scrolls, picks a car, or first arrives.

**The Swappable Landscape Rule.** Art, grain, car and copy are separate layers sharing one frame. Replacing the landscape means replacing one layer and keeping the start line at x 650, y 812 of 1440 by 900.

**The System Emoji Rule.** If an object has an emoji, it is that emoji in the system emoji stack. Variety comes from choosing a different emoji, never from tinting, outlining or redrawing one. Draw in SVG only the ground and what no emoji fits.

**The Mixed Meadow Rule.** Every scene mixes kinds and sizes: one anchor of 88px or more (a house or a big tree), smaller trees, and ground-level flowers, animals or mushrooms of 34 to 60px. Houses and flowers vary in kind across the page; a repeated emoji in one scene is a deliberate cluster (the three sunflowers at the attention stop), not filler.

## Do's and Don'ts

### Do:
- **Do** hang content as a paper notice under a wooden board on a post, numbered with a milestone stone.
- **Do** use a system emoji for every tree, house, animal, flower, cloud, sun, car and flag, in the Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji stack.
- **Do** vary props within a scene: one 88px-plus anchor, mixed tree kinds, different house kinds, several flower kinds, a small animal or ground detail.
- **Do** give every emoji prop below the hero the drop shadow 0 8px 5px rgb(40 64 20 / 0.22), and stand drawn objects on a contact ellipse.
- **Do** tint shadows by what they fall on: green rgb(40 72 28) over meadow, rgb(60 40 20) under wood, rgb(110 30 12) under the red pill, rgb(10 40 90) on the sky.
- **Do** keep the hero art and car layers on the 1440 by 900 frame with xMidYMax slice and the start line at x 650, y 812.
- **Do** let the picked car follow the visitor everywhere a car appears, and mirror it with scaleX so it faces its direction of travel.
- **Do** keep sunflower yellow for attention tags and the agent's open question, and return them to calm once answered.
- **Do** park the car at each stop under reduced motion and draw a plain road without JavaScript.

### Don't:
- **Don't** use sunflower yellow on buttons, boards, links, headings or any interface element that does not need a human.
- **Don't** use red for errors, warnings or text; red is the way forward.
- **Don't** add a dark section or a dark mode, or put light text on anything but sky, cherry red or wood.
- **Don't** put content in bordered boxes or cards; use signs, notices, bubbles or the window.
- **Don't** set sentences in Young Serif or anything except commands and file names in mono.
- **Don't** draw an SVG symbol, bundle an emoji font, or recolor an emoji for an object that has one.
- **Don't** rotate the car to the road tangent or tilt it past 38 degrees; it drives side-on.
- **Don't** use corners below 3px, neutral gray shadows, or hard offset drop shadows.
- **Don't** let anything move faster than the car or move without the visitor's input, except the drifting clouds, the one-time hero roll-in and the picker hop.
