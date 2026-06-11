# Handover

What is in this repository, how to verify it works, and what is deliberately not built yet.

## What you got

An engine that turns a brief (topic plus a look described in any form) into branded, deterministic HTML slide decks:

- **Style intake** (`engine/style-intake.ts`): routes free text, "like X" references, mixes and brand URLs to a style brief; asks short clarifying questions only when the brief carries zero style signal.
- **Skill generator** (`engine/skill-generator.ts`): derives a complete bespoke skill package (tokens, templates, chrome, grammar, image direction) from a style brief. This is the default product path; styles are generated per brief, not picked from a list.
- **Deck planner** (`engine/deck-plan.ts`): reads the brief into presentation type, audience, register, a per-slide density rhythm and a variance posture, so two decks differ in their marching orders, not just their colors.
- **Renderer + directives** (`engine/renderer.ts`): fills the skill's templates; draws charts (10 types), icons (4 baked kits), tables, lists, scrims, image placeholders and logo walls deterministically. The model never authors SVG or coordinates; geographic and icon data are baked from real sources (`engine/fidelity-data.ts`, `engine/dotmap-data.ts`).
- **Image subsystem** (`engine/image-providers.ts`, `engine/image-treatments.ts`): FAL for AI imagery, Unsplash and Pexels federated for stock, per-category decision rules, 10 deliberate image treatments, model-aware inference steps, and an engine-level brand guard that skills cannot bypass.
- **Moodboard intake** (`engine/moodboard.ts`): optional image-first style anchoring; two boards on rotated palette axes, the approved board feeds the generation brief.
- **Quality gates**: skill validation, slide-tree validation, content lint, occupancy measurement, security smoke. See the gate table in `README.md`; the design rules they enforce are in `docs/SKILL-FORMAT.md`.
- **8 reference packages** (`skills/`): academic, consulting, kanagi, neue-klasse, opex, pitch, product-marketing, training. kanagi is the worked example of the full bespoke path: moodboard-anchored, generated per brief, then curated. Curated seeds and few-shot material for the generator, also useful as direct styles when a brief names them literally. Not a user-facing menu.
- **Meta-generator** (`meta-generator/`): a guided path for the team to author packages by hand.

## Repository layout

```
engine/
  index.ts               generateDeck() entry point, exports
  types.ts               public types
  skill-loader.ts        reads a skill folder, strips uppercase typography defensively
  token-compiler.ts      tokens.json -> CSS variables + neutral base CSS + layout utilities
  style-intake.ts        brief -> StyleBrief routing
  skill-generator.ts     StyleBrief -> bespoke 6-file skill package
  deck-plan.ts           brief -> design read + density rhythm
  prompt-composer.ts     skill + plan -> system prompt (density, fill-frame, content contract)
  validate.ts            slide-tree validation + composition variety
  quality-lint.ts        content lint rules
  occupancy.ts           underfill scoring (page voids + hollow cells)
  renderer.ts            slide tree -> HTML, all directives
  composition-families.ts taxonomy used by the variety gates
  brand-guard.ts         image-prompt + slot guarding, fidelity flags
  image-providers.ts     FAL / Unsplash / Pexels + federated resolver
  image-treatments.ts    10 treatments (prompt-led and post-process)
  image-postprocess.ts   deterministic PIL filters for digital-graphic treatments
  icon-kits.ts           4 icon kits baked from real packages
  fidelity-data.ts       city gazetteer + vetted icon subset (baked)
  dotmap-data.ts         land-mask grid for dot maps (baked)
  moodboard.ts           rotated moodboard prompts + direction block
skills/                  8 reference packages
meta-generator/          GENERATOR.md + templates
scripts/                 render-fixture, validate-skill, measure-occupancy, smoke tests,
                         bake scripts, shoot-review (screenshots)
docs/                    SKILL-FORMAT.md, INTEGRATION.md, this file, specs/, plans/
examples/                rendered end-to-end decks
```

## How to verify

```bash
npm install
npm test
```

`npm test` runs skill validation (8/8 packages) plus smoke suites for images, security (25 checks), content lint, deck planning, occupancy, moodboards and the logo wall. All green on handover.

Render and inspect a deck without any API keys:

```bash
npx tsx scripts/render-fixture.mts opex scripts/opex-deck.json /tmp/opex.html
npm run measure:occupancy /tmp/opex.html     # expect: 18/18 slides fill the frame
```

With a FAL key, the same fixture path renders real backgrounds via `scripts/render-fal-runtime.mts`.

## Deliberately not built (with reasoning)

- **PPTX export.** This package stops at HTML by design; SlideSpeak's pipeline owns HTML to PPTX. Pending answers to the open question below, component conventions can be tuned to the converter.
- **A live LLM binding.** The engine is provider-agnostic; you wire your model once via `LLMClient` (`docs/INTEGRATION.md`).
- **Vision-based logo detection on stock results.** Alt-text filtering only. Add a moderation provider if stock images are served publicly.
- **Per-call brand-blocklist extension.** The list lives in `engine/brand-guard.ts`; making it a `generateDeck` parameter is a small known TODO.
- **Skill versioning tooling.** Each package carries a version; there is no migration tooling until the format actually changes.
- **Brand-URL scraping.** The `brand-url` intake path expects the host to supply a scraped description (`describeReference` hook); the routing works without it.

## Security posture

- All slot values, slide types and image URLs are escaped; image URLs restricted to `https:` and `data:image/*`.
- `skillName` is slug-validated and containment-checked against the skills root; no path traversal.
- LLM output is runtime-validated; malformed slides are dropped with warnings, never rendered raw.
- The brand guard runs on the raw subject and on the final assembled prompt, so templates cannot inject blocked terms.
- No keys in the repo; all providers read from env. 25-check security smoke in CI (`npm run test:security`).

## Open questions for SlideSpeak

1. **HTML to PPTX specifics.** Which converter, and what are its font/layout quirks? File findings in `docs/PPTX-NOTES.md` and the component conventions get adjusted to match.
2. **Image budget default.** What per-deck image cost ceiling should `imageBudget` default to in production?

## Contact

Dominik Martin, dominikmartn@gmail.com. Engine bugs, skill questions, blocklist additions: issue or PR on this repo.
