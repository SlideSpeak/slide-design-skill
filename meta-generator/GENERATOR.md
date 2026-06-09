# SlideSpeak Skill Generator

Use this guide to build a new slide-skill. Anyone on the SlideSpeak team (engineer, designer, or a coding assistant) can follow these steps.

A skill is a deterministic style+layout specification that converts user prompts into branded slides. Two generations from the same skill on the same prompt must produce visually indistinguishable output.

## When You Need a New Skill

Build a new skill when:
- A customer segment has a recognizable visual identity not covered by `consulting | pitch | academic | training | product-marketing` (e.g. `editorial | data-journalism | sales-enablement | enterprise-rfp`)
- A vertical has unique slide-types that don't fit existing grammars (e.g. legal briefs, scientific posters, real-estate tear-sheets)
- A brand wants a fully-bespoke skill for their own decks (white-label)

Do NOT build a new skill when:
- An existing skill just needs token tweaks → fork tokens.json, change values, keep the same skill
- The user wants different content → that's a prompt-engineering job, not a new skill

## Input You Need

Before you start, gather one of these:
- **Brand reference**: 2-3 URLs of decks you want to emulate (PDFs, image galleries, public reports)
- **Brand identity**: a brand guidelines doc (PDF or Figma)
- **Description**: written brief ("conference talks for biotech researchers, formal but warm")
- **Existing skill to fork**: name of skill to start from + the 3 changes you want

## The Six Files Every Skill Needs

```
skills/{your-skill-name}/
  SKILL.md              # frontmatter + authoring guide
  tokens.json           # color / type / spacing / radius / page
  layout-grammar.md     # slide-types table + composition rules
  image-style.md        # AI prompt template + stock query template + decision rules
  components.html       # one <template id="slide-{type}"> per slide-type
  examples/             # 2-3 rendered example slides as reference
```

## Step 1 — Pick the Skill Name and Run the Bootstrap

```bash
npx tsx scripts/new-skill.ts <skill-name>
# example: npx tsx scripts/new-skill.ts editorial
```

This creates `skills/<skill-name>/` from `meta-generator/templates/`. All files are placeholders — you'll fill them in.

## Step 2 — Write SKILL.md

The frontmatter is the most-loaded part of your skill. Be specific.

```yaml
---
name: <skill-name>            # MUST match folder name
version: 0.1.0
description: "1-2 sentences. Include trigger keywords: 'Use when the user asks for X, Y, Z'."
inspiration: "3-5 specific references (publications, decks, designers, eras)"
typography_kit: "name the font families. Include 1-2 fallbacks."
color_kit: "describe the palette in 1 line"
image_style: "what kind of imagery this skill prefers"
forbidden: "comma-separated list of visual choices that are wrong"
---
```

The body is the authoring guide. Cover:
- **Voice** — how copy should sound
- **Structure** — the canonical slide arc
- **Visual System** — concrete CSS-level direction (px, hex, font-weight)
- **Density** — bullets per slide, body copy size, whitespace rules
- **Style Anchors** — 4-6 named references the LLM can pattern-match

Keep it 100-200 lines. More is noise; less is too vague.

## Step 3 — Fill tokens.json

This is the variable-system every component references. Always include these keys:

```json
{
  "color": {
    "ground": { "page": "#...", "card": "#...", "ink": "#..." },
    "signal": { "primary": "#...", "subtle": "#..." },
    "support": { "muted": "#...", "rule": "#..." }
  },
  "type": {
    "header": { "family": "...", "weight": 600, "scale": [64, 44, 32, 24] },
    "body":   { "family": "...", "weight": 400, "scale": [22, 18, 16, 14] },
    "data":   { "family": "...", "weight": 500 }
  },
  "spacing": { "unit": 4, "scale": [4, 8, 12, 16, 24, 32, 48, 64, 96] },
  "radius": { "card": 2, "button": 2, "input": 2 },
  "elevation": { "card": "0 1px 0 rgba(0,0,0,0.06)" },
  "page": { "ratio": "16:9", "width": 1920, "height": 1080, "safe": 96 }
}
```

Rules:
- Page is always 1920×1080 (16:9). PowerPoint and Keynote both export this natively.
- Safe-area is the inner margin where content lives. Typical: 96px (dense) to 128px (spacious).
- Scales are typically 4 values for headers, 4 for body. Don't add more without reason.
- Signal-primary is the one color that defines the skill's "feel". Pick deliberately.

## Step 4 — Write layout-grammar.md

The grammar is what the LLM uses to compose a deck. Two parts:

**Slide types table** — markdown table with columns `slide-type | when | required slots | optional slots`. At least 5 slide-types; rarely more than 12. Each slide-type maps to one `<template>` in `components.html`.

**Composition rules** — `## Composition Rules` heading followed by bullet rules. Each rule is a hard constraint the deck-generator must obey. Examples:
- "First slide is always `cover`. Last is always `closing`."
- "Decks > 12 slides must contain at least one structural slide."
- "ONE accent color per deck."

The grammar parser is markdown-driven — keep the table format exact (first column is the slide-type name in backticks).

## Step 5 — Write image-style.md

Two image streams every skill must define:

**AI-generated** — for backgrounds, gradients, abstract visuals.
- `Prompt template:` one-line template with `{subject}` placeholder.
- `Negative prompt:` comma-separated list of what to avoid.

**Stock photography** — for real-world subjects.
- `Search-query template:` one-line template with `{subject}` placeholder.

**Decision rules** — list lines like:
```
- `gradient | background | abstract` → AI default
- `person | product | location` → ask user
- `microscopy | specimen` → stock
```

The parser recognizes `category | category` → verdict. Verdicts: `AI default`, `stock`, `ask`.

## Step 6 — Write components.html

For every slide-type in your grammar, write a `<template id="slide-{type}">` block. Use `{{slot-name}}` placeholders for content. Use `var(--color-signal)`, `var(--font-header)`, etc. for tokens.

Keep components inline-styled when in doubt. CSS-classes are allowed but the renderer doesn't load external stylesheets — tokens-CSS is injected by the engine.

The renderer matches `<template id="slide-{type}">` exactly. If your grammar has slide-type `data-callout`, the template id is `slide-data-callout`.

## Step 7 — Validate and Render

```bash
npx tsx scripts/validate-skill.ts
```

Validation checks: frontmatter required fields, tokens schema, at least 5 slide-types and 3 composition rules, image-style decision rules present, and that every slide-type has a matching component.

Then run the end-to-end spike with your skill:

```bash
SKILL=<skill-name> npx tsx scripts/spike.ts
```

This renders a hand-crafted slide tree to `examples/<skill-name>-spike.html`. Open in a browser and review.

## Step 8 — Build 2-3 Example Decks

Put fully-rendered example HTML files in `skills/<skill-name>/examples/`. Each example demonstrates the skill at its best. These get loaded into the system-prompt as reference.

## Common Pitfalls

- **Generic frontmatter** → LLM can't tell when to use your skill. Be specific in `description` and `forbidden`.
- **Token drift** → if `tokens.json` defines colors that components don't reference, components will drift. Use `var(--*)` for everything.
- **Slide-type without component** → renderer falls back to a generic layout that ignores your style. Every slide-type in the grammar MUST have a matching `<template>`.
- **Brand-name in image prompts** → engine rejects. Use abstract subjects.
- **Mixing slide-type vocabulary** across skills (`hero` in one, `cover` in another) → grammar parser handles it, but the LLM gets confused. Stick to consistent names within a skill.

## Engine Constants (Don't Touch From a Skill)

The following are engine-level, never per-skill:
- Page dimensions (1920×1080)
- Brand-asset blocklist (logo, trademark, named-brand list)
- Image budget enforcement
- PPTX export pipeline (when added)
- LLM prompt composition

If you need to change one of these, file an issue against the engine, not your skill.
