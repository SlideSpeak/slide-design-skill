# SlideSpeak Skill Format — v0.1

A SlideSpeak skill is a deterministic style+layout specification that turns a free-form user prompt ("make me a McKinsey-style strategy deck about X") into branded HTML slides via SlideSpeak's LLM pipeline.

Two sessions using the same skill on the same prompt must produce visually indistinguishable output.

## Folder Layout

```
skills/
  consulting/
    SKILL.md              # System-prompt overlay + slide-generation instructions
    tokens.json           # Color / type / spacing / motion / radius primitives
    layout-grammar.md     # Which slide types this skill supports + composition rules
    image-style.md        # AI-image prompts + stock-photo direction
    components.html       # Reusable HTML/CSS partials (header, callout, table, chart)
    examples/
      cover.html
      content-3col.html
      data-callout.html
```

## SKILL.md Frontmatter

```yaml
---
name: consulting
version: 0.1.0
description: "McKinsey/BCG-tier strategy decks. Dense, structured, signal-color callouts on neutral grounds. Use when the user asks for 'strategy', 'consulting', 'case', 'recommendation', 'McKinsey-style', 'BCG-style', 'consulting deck'."
inspiration: "Strategy consulting (McKinsey, BCG, Bain), 1960s Swiss editorial, Wall Street pitch books"
typography_kit: "serif headers (Tiempos Headline / Source Serif), grotesque body (Inter / Söhne)"
color_kit: "neutral ground (warm gray), signal accent (red/blue), zero decoration colors"
image_style: "muted documentary photography, abstract gradient overlays, NO illustrations"
forbidden: "rounded corners > 4px, gradient text, emojis as decoration, soft drop shadows, hand-drawn elements"
---
```

## tokens.json Schema

```json
{
  "color": {
    "ground": { "page": "#F7F5F2", "card": "#FFFFFF", "ink": "#1A1A1A" },
    "signal": { "primary": "#C8102E", "subtle": "#8C0E27" },
    "support": { "muted": "#6B6B6B", "rule": "#D4D0CB" }
  },
  "type": {
    "header": { "family": "Tiempos Headline, Source Serif Pro, serif", "weight": 600, "scale": [56, 40, 32, 24] },
    "body":   { "family": "Inter, Söhne, system-ui, sans-serif", "weight": 400, "scale": [18, 16, 14, 12] },
    "data":   { "family": "Söhne Mono, JetBrains Mono, monospace", "weight": 500 }
  },
  "spacing": { "unit": 4, "scale": [4, 8, 12, 16, 24, 32, 48, 64, 96] },
  "radius": { "card": 2, "button": 2, "input": 2 },
  "elevation": { "card": "0 1px 0 rgba(0,0,0,0.06)" },
  "page": { "ratio": "16:9", "width": 1920, "height": 1080, "safe": 96 }
}
```

## layout-grammar.md

Defines slide-types the skill knows. Each slide-type is a stable HTML scaffold the LLM fills in. Examples for `consulting`:

| slide-type | when | required slots | optional slots |
|---|---|---|---|
| `cover` | first slide | title, subtitle, client-name, date | logo-region (left blank, brand-asset-constraint) |
| `executive-summary` | second slide | headline, 3-5 bullets | source-line |
| `content-3col` | most content | column-title × 3, body × 3 | callout-band |
| `data-callout` | numeric insights | big-number, label, context-bullets × 2-3 | source |
| `framework-2x2` | strategic frameworks | quadrant-label × 4, quadrant-body × 4 | axis-labels |
| `process-flow` | step sequences | step-title × 3-7, step-body × 3-7 | arrow-style |
| `closing` | last slide | call-to-action, contact | next-steps |

Composition rules:
- First slide is always `cover`. Last is always `closing`.
- `data-callout` allowed max 2× consecutive (avoids monotony).
- `framework-2x2` and `process-flow` count as "structural", at least one per deck > 8 slides.

## image-style.md

Per-skill image direction. Two streams:

**AI-generated (FAL.ai)** — default for backgrounds, gradients, abstract visuals.
- Prompt template: `"{subject}, {style-modifier}, {color-direction}, {composition}"`
- For `consulting`: muted, editorial, slight grain, neutral palette, no people
- Negative prompt: no logos, no brand-marks, no recognizable products, no text overlays

**Stock photography (Unsplash + Pexels federated)** — for real-world objects, people, places.
- Search-query template: `"{subject} {style-modifier}"`
- License filter: only CC0 / Unsplash-license / Pexels-license
- Reject results with watermarks, identifiable people without releases, recognizable trademarks

Decision rule (engine-level):
- `gradient | background | abstract | texture` → AI default, no user prompt
- `person | product | building | location | object` → ask user "AI-generated or stock photo?"
- Ambiguous (`scene | concept`) → ask user

## Brand-Asset-Constraint (engine-enforced)

The engine validates AI-image prompts and stock-photo queries against a blocklist:
- Any string matching `(logo|trademark|brand-mark|wordmark|™|®|©)` → reject prompt
- Any known brand-name from a curated list (McKinsey, BCG, Apple, Tesla, etc.) with word-boundary matching → reject
- Both the raw subject AND the final assembled prompt (post-template substitution) are checked, so a skill template cannot inject blocked terms around the subject
- Negative-prompt phrasing ("no logos", "without brand-marks") in skill templates is stripped before checking, so legitimate templates still work
- Stock results are filtered by alt-text for `logo|wordmark|brand-mark|trademark|signage|storefront`

This sits at engine-level, not in the skill's prompt — skills can't bypass it.

**Known limitation (v0.1):** stock images are NOT post-fetched and analyzed by a Vision API for in-image logos. Alt-text filtering catches obvious cases but is not a substitute for image-content moderation. If your deployment serves these images publicly, plug in a Vision/moderation provider before storage.

## Component Library (components.html)

HTML/CSS partials the LLM can `{{include}}` into slides. Per-skill so each skill controls its component vocabulary. Examples:

```html
<!-- components.html for consulting -->
<template id="callout-strip">
  <div class="callout-strip" style="border-left: 3px solid var(--signal); padding: 12px 24px;">
    <div class="callout-eyebrow">{{eyebrow}}</div>
    <div class="callout-body">{{body}}</div>
  </div>
</template>

<template id="data-tile">
  <div class="data-tile">
    <div class="data-number">{{number}}</div>
    <div class="data-label">{{label}}</div>
    <div class="data-context">{{context}}</div>
  </div>
</template>
```

CSS is generated from `tokens.json` at render-time, not hand-written per skill.

## Engine Contract

The engine exposes one function to SlideSpeak's HTML-generation pipeline:

```ts
generateDeck({
  skillName: "consulting",
  userPrompt: "Strategy deck for a CPG company entering DTC",
  slideCount: 12,
  imageBudget: 20,  // max FAL.ai calls
  language: "en"
}) → Promise<{
  slides: { type: SlideType, html: string }[],
  imagesUsed: number,
  warnings: string[]
}>
```

How it works internally:
1. Load skill folder, parse SKILL.md + tokens.json + grammar
2. Compose system-prompt: skill's instructions + tokens-as-CSS + grammar-as-schema
3. Call SlideSpeak's LLM with the system-prompt + user prompt + slide-count
4. LLM returns slide-tree (JSON: slide-type + slot-values + image-requests)
5. For each image-request: resolve via Image-Subsystem (FAL or stock)
6. Render slide-tree → HTML using components.html + tokens-CSS

## What changes per-skill, what stays constant

| Per-skill | Engine-constant |
|---|---|
| tokens.json values | tokens.json schema |
| layout-grammar.md slide-types | grammar parser |
| image-style.md direction | FAL.ai client + Stock APIs |
| components.html partials | render pipeline |
| SKILL.md instructions | system-prompt composition |
| | Brand-asset-constraint validation |
| | PPTX-export (when added) |
