# Authoring a skill package by hand

Use this guide to build a skill package manually. Anyone on the team (engineer, designer, or a coding assistant) can follow it. The format contract lives in `docs/SKILL-FORMAT.md`; this is the step-by-step path.

Context: the product's default path generates a bespoke package per brief (`engine/skill-generator.ts`). Hand-authoring is for curated reference packages: quality anchors, few-shot material for the generator, house styles you want under version control.

A skill is a deterministic style and layout specification. Two generations from the same skill on the same prompt must produce visually indistinguishable output.

## Input you need

Gather one of these before starting:

- **Brand reference**: 2 or 3 decks or sites you want to emulate
- **Brand identity**: a guidelines doc (PDF or Figma)
- **Description**: a written brief ("conference talks for biotech researchers, formal but warm")
- **Existing package to fork**: name plus the three changes you want

## The six files

```
skills/<name>/
  SKILL.md            frontmatter + authoring guide + "## Graphic system" section
  tokens.json         color / type / spacing / radius / page
  chrome.css          the look: labels, footer, tables, rhythm, graphic devices
  layout-grammar.md   slide-types table + composition rules
  image-style.md      AI prompt template + stock query template + decision rules
  components.html     one <template id="slide-{type}"> per slide type
```

## Step 1: bootstrap

```bash
npm run new-skill <name>
```

Creates `skills/<name>/` from `meta-generator/templates/` with placeholder files.

## Step 2: SKILL.md

Frontmatter must be specific; it is how the engine routes briefs to the package.

```yaml
---
name: <name>            # must match the folder
version: 0.1.0
description: "1-2 sentences. Include trigger keywords."
inspiration: "3-5 specific references"
typography_kit: "font families plus fallbacks"
color_kit: "the palette in one line"
image_style: "the imagery this style prefers"
forbidden: "visual choices that are wrong for this style"
---
```

The body is the authoring guide: voice, canonical slide arc, concrete visual direction (px, hex, weights), density stance, 4 to 6 named style anchors. Add a `## Graphic system` section documenting the signature mark, the surface treatment, the structural devices and the one depth moment (what they are, where they appear, what they never do). Keep the whole file 100 to 200 lines.

Avoid the cliche identities the validator warns about: Inter as the header face of an all-Inter package, and the worn AI-display serifs (Fraunces, Instrument Serif, Playfair, DM Serif, Space Grotesk).

## Step 3: tokens.json

Schema and rules in `docs/SKILL-FORMAT.md`. Page is always 1920x1080; safe area typically 80 to 128px; `icon.kit` picks one of `lucide | tabler | phosphor | heroicons`. Signal-primary is the one color that defines the feel; deploy it like the brand would, not as a timid sprinkle.

## Step 4: chrome.css

The look layer, emitted after the neutral base. Define at least:

- `.slide .eyebrow`: how labels read in this brand. Sentence case, normal tracking.
- `.slide .source`: the footer treatment (or none, if the brand would not use one).
- `.dir-table ...`: the full table look, if any slide type uses `{{@table}}`.
- `.slide-flow { gap; padding-bottom; }`: the vertical rhythm.
- The graphic devices: painting `::before`/`::after` rules, texture data-URIs, surfaces.

A warm consumer brand, a brutalist editorial brand and a dense data brand must produce visibly different chrome. If your chrome is interchangeable with another package's, it is not done.

## Step 5: layout-grammar.md

A slide-types table (`slide-type | when | required slots | optional slots`, first column in backticks; the parser is markdown-driven) plus a `## Composition rules` section of hard constraints. At least 5 slide types, rarely more than 12. Annotate each type with its composition family; the validator caps single-family share and requires unboxed typographic types next to boxed grids.

## Step 6: image-style.md

`Prompt template:` and `Search-query template:` lines with `{subject}`, decision-rule bullets (`category -> AI default | stock | ask`), optionally one `Treatment:` line when a deliberate stylistic abstraction genuinely fits the brand. See `docs/SKILL-FORMAT.md` for the treatment list.

## Step 7: components.html

One `<template id="slide-{type}">` per slide type, inline-styled, consuming token variables. Content arrives through `{{slot}}` placeholders and directives (`{{@chart}}`, `{{@table}}`, `{{@list}}`, `{{@icon}}`, `{{@scrim}}`, `{{@placeholder}}`, `{{@logo-wall}}`, `{{@gradient-bg}}`).

Structural rules that keep slides filling the frame:

- Page skeleton is `slide-flow` with `flow-head` / `flow-stage` / `flow-foot`.
- Exhibits that should fill use the island utilities (`flow-grid-fill`, `flow-fill`, `flow-rows` + `flow-row`).
- Never stretch thin content to fill. Size it to content, set type large enough to carry the slide (17 to 21px), center the band. Lists that should span a full card become equal-height tracks with centered rows, not `space-between`.
- `{{@list}}` renders bare item divs inside a `display:contents` wrapper. Style items as `.your-scope .dir-list > div`; a `ul`/`li` selector matches nothing.
- Sparse slides may declare `data-density="editorial"` on the slide root.

Hard rules (validation fails): no uppercase labels, no font-size below 14px, no accent border on a card edge, no em-dashes, no invented logos or fake product UI, at least three drawn graphic constructs across the package.

## Step 8: validate, render, measure

```bash
npm run validate
```

Checks format, grammar/template parity, slot usage, the typography and graphic-layer gates, and composition-family limits.

Then render a fixture deck and measure it:

```bash
npx tsx scripts/render-fixture.mts <name> <your-deck.json> /tmp/<name>.html
npm run measure:occupancy /tmp/<name>.html
```

Fix every flagged slide (re-template or re-author, never stretch thin content) and re-measure until all pass. Then look at every slide with your eyes; the gates catch geometry, not taste.

## Common pitfalls

- **Generic frontmatter**: the engine cannot tell when to use the package. Be specific in `description` and `forbidden`.
- **Token drift**: components hard-coding values that tokens define. Use `var(--*)` everywhere.
- **Slide type without template**: the renderer falls back to a generic layout that ignores your style.
- **Default chrome**: a chrome.css that matches the stock look has no identity; the validator warns.
- **Paint-swap templates**: same composition, different colors, across slide types. Each type needs its own compositional primitive.
- **Brand names in image prompts**: the engine rejects them. Use abstract subjects.

## Engine constants (never per skill)

Page dimensions, the brand-asset blocklist, image-budget enforcement, prompt composition and all validation gates are engine-level. If one of these needs to change, file an issue against the engine, not your package.
