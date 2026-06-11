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

Composition rules are prose bullets ("first slide is always cover", "max 2 consecutive data slides"). Each slide type should be annotated with its composition family (statement, metric-hero, cards-grid, table, split-visual, ...). The validator caps how much of a skill may sit in one family and requires unboxed typographic types alongside boxed grids.

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
| `{{@chart type=bar\|hbar\|waterfall\|line\|dots-2x2\|stacked-bar\|radar\|dot-map\|glyph\|heatmap data=<slot> labels=<slot> ...}}` | data viz from slot values; `note=<slot>` puts a so-what annotation on the chart |
| `{{@table slot=...}}` | a `.dir-table` from pipe/newline-separated slot data |
| `{{@list slot=...}}` | item `<div>`s inside a `display:contents` wrapper. There is no `ul`/`li`; style items as `.your-scope .dir-list > div` |
| `{{@icon name=<slot>}}` | an icon from the skill's kit, baked from real icon packages |
| `{{@gradient-bg}}` | background art: per-slide FAL render, baked cache, or procedural SVG fallback |
| `{{@scrim variant=bottom\|top\|left\|...}}` | a gradient overlay for text-on-image legibility |
| `{{@placeholder ratio=... slot=...}}` | a neutral drop zone for product UI / people / mockups; these are never faked as HTML or AI images |
| `{{@logo-wall}}` / `{{@logo-wall names=<slot>}}` | obviously-replaceable dummy wordmarks, or the user's real customer names as type-only wordmarks |

Directive arguments cannot contain spaces; multi-word values come through a slot reference.

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
