# slide-design-skill

Standalone skill engine for SlideSpeak's HTML-based slide generation. Turns user prompts ("make me a McKinsey-style strategy deck about X") into branded, deterministic slide decks.

## Phase 1 Scope

- Skill engine: skill-loader + token-system + HTML-renderer + system-prompt composer
- Image subsystem: FAL.ai (AI) + Unsplash + Pexels (stock) + decision-logic + brand-asset-constraint
- Reference skill packages shipped as worked examples: `academic`, `consulting`, `neue-klasse`, `opex`, `pitch`, `product-marketing`, `training`
- Skill generator: derives a bespoke skill (its own tokens + layout grammar + chrome) from a free-form style brief; the shipped packages are reference seeds, not a fixed menu
- Meta-generator: a guided generator so SlideSpeak's team can build new skills
- Handover-doku for SlideSpeak engineering team

## Folder Layout

```
engine/         Skill-loader, token compiler, HTML renderer, image subsystem, skill generator
skills/         Reference skill packages (academic, consulting, neue-klasse, opex, pitch, product-marketing, training)
examples/       End-to-end rendered example decks
scripts/        CLI utilities (render-fixture, validate-skill, new-skill, security-smoke)
docs/           Integration guide, skill-format spec, handover
```

## Skill Format

See `docs/SKILL-FORMAT.md` (mirror of `/Users/dominikmartin/Documents/claude/slidespeak/SKILL-FORMAT.md`).

Each skill is a folder:
- `SKILL.md` — system-prompt overlay + frontmatter metadata
- `tokens.json` — color / type / spacing / motion primitives
- `layout-grammar.md` — slide-types this skill supports + composition rules
- `image-style.md` — AI-image prompts + stock-photo direction
- `components.html` — reusable HTML/CSS partials
- `examples/` — 2-3 rendered example slides as reference

## Engine Contract

```ts
generateDeck({
  skillName: string,
  userPrompt: string,
  slideCount: number,
  imageBudget: number,
  language: "en" | "de" | ...
}) → Promise<{
  slides: { type: SlideType, html: string }[],
  imagesUsed: number,
  warnings: string[]
}>
```

## Brand-Asset-Constraint (Hard Rule)

The engine validates ALL image prompts (both the raw subject AND the final assembled prompt after template substitution) and stock-photo queries against:
- Blocklist regex: `(logo|trademark|brand-mark|wordmark|™|®|©)`
- Curated brand-name list with word-boundary matching (McKinsey, BCG, Apple, Tesla, etc.)
- Stock alt-text screen for `logo|wordmark|brand-mark|trademark|signage|storefront`

Skills CANNOT bypass these checks. They sit in the engine, not in the skill prompt.

**Known limitation (v0.1):** no Vision-API logo detection on returned stock images — only alt-text filtering. If you need post-fetch image moderation, plug in your own provider before storing/serving the URL.
