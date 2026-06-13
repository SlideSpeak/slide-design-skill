# Skill package format

A skill is a deterministic style and layout specification. The deck LLM fills its templates slot by slot; it never invents layout or CSS. Two generations from the same skill and the same prompt produce visually indistinguishable output.

Skills are usually produced by the generator (`engine/skill-generator.ts`) from a style brief. They can also be authored by hand; `meta-generator/GENERATOR.md` is the guided path. Either way the format below is the contract, and `npm run validate` enforces it.

## Folder layout

```
skills/<name>/
  SKILL.md            frontmatter metadata + system-prompt overlay
  tokens.json         color / type / spacing / radius / page primitives
  chrome.css          the LOOK: eyebrow, footer, tables, rhythm, graphic devices
  layout-grammar.md   slide types + required/optional slots + composition rules
  image-style.md      AI prompt template, stock query template, decision rules
  components.html     one <template id="slide-TYPE"> per slide type
```

`chrome.css` is where a skill earns the right to look unlike the others. The shared base CSS (`baseSlideCss` in `engine/token-compiler.ts`) is deliberately neutral: page box, heading sizes, layout mechanics. Everything visible (label treatment, rules, table look, vertical rhythm, surface textures) lives per skill in `chrome.css`, emitted after the base.

## SKILL.md frontmatter

```yaml
---
name: <folder-name>            # must match the folder
version: 0.1.0
description: "What this style is and when it fits."
inspiration: "..."
typography_kit: "..."
color_kit: "..."
image_style: "..."
forbidden: "what this style never does"
---
```

The body carries the system-prompt overlay (voice, composition stance, content register) and a `## Graphic system` section documenting the skill's signature mark, surface treatment, structural devices and depth moment.

## tokens.json

```json
{
  "color": {
    "ground": { "page": "#F7F5F2", "card": "#FFFFFF", "ink": "#1A1A1A" },
    "signal": { "primary": "#C8102E", "subtle": "#8C0E27" },
    "support": { "muted": "#6B6B6B", "rule": "#D4D0CB" }
  },
  "type": {
    "header": { "family": "...", "weight": 600, "scale": [56, 40, 32, 24] },
    "body":   { "family": "...", "weight": 400, "scale": [18, 16, 14, 12] },
    "data":   { "family": "...", "weight": 500 }
  },
  "spacing": { "unit": 4, "scale": [4, 8, 12, 16, 24, 32, 48, 64, 96] },
  "radius": { "card": 2, "button": 2, "input": 2 },
  "elevation": { "card": "0 1px 0 rgba(0,0,0,0.06)" },
  "icon": { "kit": "lucide" },
  "page": { "ratio": "16:9", "width": 1920, "height": 1080, "safe": 96 }
}
```

The compiler emits these as CSS variables (`--color-*`, `--font-*`, `--size-h1..4`, `--space-*`, `--page-*`). Pages are always 1920x1080. `icon.kit` selects the icon set for `{{@icon}}`: `lucide`, `tabler`, `phosphor` or `heroicons`.

## layout-grammar.md

A table of slide types plus composition rules. Each slide type maps 1:1 to a `<template id="slide-TYPE">` in components.html; the validator fails on drift in either direction.

| slide-type | when | required slots | optional slots |
|---|---|---|---|
| `cover` | first slide | title, subtitle, date | kicker |
| ... | | | |

Composition rules are prose bullets ("first slide is always cover", "max 2 consecutive data slides"). Each slide type should be annotated with its composition family (statement, metric-hero, cards-grid, table, split-visual, ...). The validator caps how much of a skill may sit in one family and requires unboxed typographic types alongside boxed grids. An optional `visual roles` column declares which visual constructs a type is expected to realize (`item-marker`, `chartlet`, `meter`, `signature-mark`, `oversized-number`, `visual-plate`); it steers the deck planner and documents intent. Data-bearing family templates that render no visual element at all draw a (non-fatal) validator warning; the hard enforcement is the rendered-deck richness gate above.

## components.html

One `<template id="slide-TYPE">` per slide type, inline-styled, consuming the token variables. Templates declare `{{slot}}` placeholders and directives; the LLM provides slot text only.

Structural conventions (enforced by the occupancy gate, see `CLAUDE.md`):

- The page skeleton is `slide-flow`: a header (`flow-head`), a stage (`flow-stage`), a footer (`flow-foot`).
- Exhibits that should fill the stage use the island utilities (`flow-grid-fill`, `flow-fill`, `flow-fill-body`, `flow-rows`/`flow-row`).
- Thin content is never stretched to fill. Size it to content, set the type large enough to carry the slide (17 to 21px), and center the band. Stretching a one-line card to 600px is the underfill tell the gate flags.
- A slide can set `data-density="editorial|balanced|data-dense"` on its root; editorial slides may breathe, the others must fill the frame.

### Directives

Deterministic primitives the renderer draws; the model never authors SVG.

| Directive | Renders |
|---|---|
| `{{@chart type=bar\|hbar\|waterfall\|line\|dots-2x2\|stacked-bar\|stacked-cols\|stacked-area\|radar\|dot-map\|glyph\|heatmap data=<slot> labels=<slot> ...}}` | data viz from slot values; `note=<slot>` puts a so-what annotation on the chart; `callouts=<slot>` ("idx:text\|idx:text", line charts) draws white annotation boxes with leader lines pointing at data points; stacked-bar takes `palette=#hex\|#hex\|...` and `valueSize=` (inside values auto-fit per segment). Bar + line also take: `yAxis=1` (full tick scale + gridlines), `refLine=<slot>`/`refLabel=<slot>` (dashed threshold, right-edge marker + value), `divider=<slot>`/`dividerLabels=<slot>` (actual/forecast split at a 0-based index, labels "Actual\|Forecast"), `fontScale=` (0.8–2, scales chart type for multi-up panels), `height=` (360–760 viewBox height). Line only: `primaryNote=<slot>`/`compareNote=<slot>` (growth notes ON the trace; they replace the detached legend), `fill=solid` (saturated area under the trace; forces 0 into the domain). `stacked-area` takes the stacked-cols data format plus yAxis/height/fontScale |
| `{{@table slot=...}}` | a `.dir-table` from pipe/newline-separated slot data |
| `{{@list slot=...}}` | item `<div>`s inside a `display:contents` wrapper. There is no `ul`/`li`; style items as `.your-scope .dir-list > div`. Item text rides in an inner `<span>`, so an item styled `display:grid` keeps one content cell |
| `{{@icon name=<slot>}}` | an icon from the skill's kit, baked from real icon packages |
| `{{@gradient-bg}}` | background art: per-slide FAL render, baked cache, or procedural SVG fallback |
| `{{@scrim variant=bottom\|top\|left\|...}}` | a gradient overlay for text-on-image legibility |
| `{{@placeholder ratio=... slot=...}}` | a neutral drop zone for product UI / people / mockups; these are never faked as HTML or AI images |
| `{{@logo-wall}}` / `{{@logo-wall names=<slot>}}` | obviously-replaceable dummy wordmarks, or the user's real customer names as type-only wordmarks |

Directive arguments cannot contain spaces; multi-word values come through a slot reference. An argument that looks like a kebab-case slot name but is not authored in the tree resolves to empty (never leaks the slot name into chart text).

Chart slot formats: a chart `data` slot accepts numbers separated by comma, space, OR pipe (`55, 27, 8` or `55|27|8`); `labels` are pipe-separated (`A|B|C`); `highlight=` accepts either a 0-based bar index (`4`) or a label string matched against the labels. A `{{@chart}}` fed bad or empty data renders nothing and emits an invisible `<!--chart-empty:TYPE-->` marker that the render step and the occupancy gate fail on, so a blank chart can never ship silently.

Visual events and the richness gate: every directive stamps its rendered output with `data-visual-event="chart|table|icon|placeholder|logo-wall|surface"`, and each slide root carries `data-family`. The richness gate (`engine/richness.ts`, run from `measure-occupancy`) reads these from the rendered DOM and checks that each slide REALIZES visual weight — not just that the skill is capable of it. It measures visual-EVENT density, never colour saturation, so an austere near-monochrome skill stays valid as long as its slides carry real visual events (a soft palette warning fires separately and never fails the gate). Floors are per family: typographic families (statement/quote/cover/closing/metric-hero) pass on one event (oversized display type counts); data-bearing families (comparison/timeline/matrix/cards-grid/table/flow-diagram) need a substantial system (chart/table/grid) or ≥2 events, and a `data-density="data-dense"` slide needs a system or ≥3 events. A deck fails if a data-bearing non-editorial slide has zero events, or if more than ~30% of content slides fall below their floor. A skill element that is visual but not directive-drawn (a meter bar, a giant numeral, a marked figure) opts in by carrying its own `data-visual-event="meter|oversized-number|signature-mark|item-marker|visual-plate"` attribute; the gate counts visible, non-trivial elements only.

Inline emphasis: `**text**` in any slot value renders as `<strong>` (applied after escaping — slot authors still cannot inject HTML). Skills define what emphasis looks like by styling `.slide strong`; skills that want none simply never prompt for it.

### Hard rules

These render as machine-made and fail validation:

- No `text-transform: uppercase` and no tracked-out caps labels. Sentence case at normal tracking.
- No CSS font-size below 14px anywhere. Body and description text runs 16 to 21px. If content does not fit, change the layout or split the slide, never the type. (SVG font-size attributes scale with their viewBox and are exempt.)
- No accent-colored border pinned to a card edge. Accent goes into a number, icon, chip or filled surface.
- No em-dashes in any rendered copy.
- No invented logos, no real brand names, no fake product UI (use `{{@placeholder}}`).
- Every skill needs a graphic system: at least three drawn constructs (inline SVG mark, painting pseudo-elements, texture data-URIs or gradient surfaces) across templates and chrome. Banned as filler: blobs, squiggles, Memphis confetti, corner swooshes, generic network meshes.

## image-style.md

Per-skill image direction:

- `Prompt template:` a fragment containing `{subject}` for AI generation
- `Search-query template:` the stock-photo counterpart
- Decision rules per category: `gradient | product | person | chart | building` mapped to `AI default | stock | ask`
- Optional `Treatment:` one of `oil-painting, renaissance, watercolor, risograph, line-engraving, cyanotype` (style leads the FLUX prompt) or `pixel-art, halftone, ascii, blueprint` (clean photo plus deterministic post-process). Most skills stay photographic and omit the line.

The brand guard sits at engine level on top of all of this: image prompts and stock queries are checked against a logo/trademark regex and a brand-name list, on the raw subject and on the final assembled prompt. Skills cannot bypass it.

## What changes per skill, what stays constant

| Per skill | Engine constant |
|---|---|
| tokens.json values | token schema and compiler |
| chrome.css look | neutral base CSS and layout utilities |
| slide types and templates | renderer, directive implementations |
| layout grammar and composition rules | grammar parser, validators |
| image direction and treatment | image providers, brand guard, fidelity data |
| SKILL.md voice | prompt composition, deck planner |
