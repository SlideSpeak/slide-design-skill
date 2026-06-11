# Integration guide

How to wire `slide-design-skill` into the SlideSpeak HTML pipeline.

The package is provider-agnostic. It does not call your LLM or image APIs directly: you implement two small interfaces (`LLMClient`, `ImageResolver`), the engine does intake, prompt composition, validation, brand guarding and rendering.

## The flow

```
user brief (topic + look in any form)
        │
        ▼
resolveStyleInput(input)                      engine/style-intake.ts
        │  routes to a StyleBrief:
        │   "...like Lovable"            -> { kind: "inspiration" }
        │   "Apple meets Headspace"      -> { kind: "mix" }
        │   a URL / uploaded reference   -> { kind: "brand-url" }
        │   zero style signal            -> { status: "needs-input", questions }  ask 2-3 short questions
        ▼
generateSkill(brief, { llm, references })     bespoke skill package for this brief
        │                                     (or loadSkill() when a reference package is named literally)
        ▼
generateDeck(args, deps)                      compose prompt -> your LLM -> validate -> images -> HTML
        │
        ▼
{ slides: [{ type, html }], imagesUsed, warnings }
        │
        ▼
your pipeline: HTML preview, HTML -> PPTX, storage
```

The default product path is bespoke: every brief gets its own generated skill. The packages under `skills/` are reference seeds and few-shot material for the generator; do not surface them to users as a style menu.

## 1. Add the package

Vendor the folder or publish it to a private registry. ESM, Node 20+, TypeScript-sourced.

```ts
import {
  resolveStyleInput,
  generateSkill,
  loadSkill,
  generateDeck,
  wrapAsStandaloneHtml,
  type LLMClient,
  type ImageResolver,
} from "slide-design-skill";
```

## 2. Implement LLMClient

The engine hands you a fully composed system prompt; you return the parsed slide tree.

```ts
import type { LLMClient, SlideTreeNode } from "slide-design-skill";

export class MyLLM implements LLMClient {
  async generateSlideTree(systemPrompt: string): Promise<{ slides: SlideTreeNode[] }> {
    const content = await callYourModel(systemPrompt); // strict-JSON mode recommended
    return JSON.parse(stripCodeFences(content));
  }
}
```

Notes:

- Request strict JSON from your provider; strip markdown fences before parsing.
- The engine validates the result (`validateSlideTree`) and drops malformed slides with warnings instead of crashing. Treat an under-delivered slide count as a retry-once error.
- The same `LLMClient` powers skill generation (`generateSkill`); that call returns six files as one JSON object and is parsed and materialized by the engine.

## 3. Implement the image side

Use the included federated resolver:

```ts
import {
  FederatedImageResolver, FalProvider, UnsplashProvider, PexelsProvider,
} from "slide-design-skill";

const resolver = new FederatedImageResolver({
  imageStyle: skill.imageStyle,
  providers: {
    fal: new FalProvider({ apiKey: process.env.FAL_API_KEY!, model: "fal-ai/flux/dev" }),
    unsplash: new UnsplashProvider({ accessKey: process.env.UNSPLASH_ACCESS_KEY! }),
    pexels: new PexelsProvider({ apiKey: process.env.PEXELS_API_KEY! }),
  },
  decide: async (req) => "stock", // non-interactive default; surface to the user in UI-driven runs
});
```

Model guidance: `flux/dev` is the quality tier for backgrounds and moodboards (about $0.025 per image); `flux/schnell` is the cheap tier (about $0.003) and visibly weaker. The provider picks the right inference-step count per model automatically; running dev at schnell's step count bakes a grid artifact into flat surfaces, so do not override `steps` unless you know why.

Reference-anchored generation: when a `generate()` call carries `referenceImages` (an approved moodboard, a brand shot, a customer-supplied look), the provider routes to the gemini-image family instead of FLUX (`fal-ai/nano-banana/edit` by default, about $0.039 per image; override via `referenceModel`, e.g. `fal-ai/gemini-3-pro-image-preview/edit` for the pro tier at about $0.15). FLUX cannot condition on input images; this path produces backgrounds that follow a concrete reference instead of a text description of one. The same option flows through `BackgroundGenerator` and `FalBackgroundProvider`.

Bring your own keys. The repo never ships keys; everything reads from env.

| Provider | Env var | Cost order |
|---|---|---|
| FAL.ai | `FAL_API_KEY` | flux/dev ~$0.025, flux/schnell ~$0.003 per image |
| Unsplash | `UNSPLASH_ACCESS_KEY` | free tier, rate-limited |
| Pexels | `PEXELS_API_KEY` | free tier, rate-limited |

The engine enforces `imageBudget` per call. A 12-slide deck rarely needs more than 8 images; bleed-heavy editorial styles run 1 FAL image per bleed slide.

## 4. Generate a deck

```ts
const result = await generateDeck(
  {
    skillName,            // the generated skill's slug, or a reference package name
    userPrompt: "Strategy deck for a CPG company entering DTC over 36 months",
    slideCount: 12,
    imageBudget: 8,
    language: "en",
  },
  {
    skillsRoot,           // where the skill package lives
    llm: new MyLLM(),
    images: resolver,
  },
);
// result.slides: [{ type, html }]   result.warnings: validation + lint + fidelity flags
```

`result.warnings` is worth surfacing in logs: it carries composition-monotony notices, content-lint findings (AI-phrase filler, fake precise numbers, uniform bullets) and fidelity flags (figures the model introduced that were not in the user prompt).

For preview, wrap the slides:

```ts
const html = wrapAsStandaloneHtml(skill, result.slides);
```

For PPTX, feed each `slides[i].html` (a complete `<section class="slide">` with resolved CSS variables) into your existing HTML-to-PPTX conversion.

## 5. Optional: moodboard step before generation

When the brief's look is open, generate two style anchors first:

```ts
import { composeMoodboardPrompts, moodboardDirectionBlock } from "slide-design-skill";

const boards = composeMoodboardPrompts(subject);   // each board rotated onto a different palette axis
// render via FalProvider (flux/dev), show both, let the user pick
// feed the approved board into the generation brief via moodboardDirectionBlock(...)
```

The rotation matters: image models share the LLM's genre-default bias (premium chocolate comes back beige and espresso every time); the prompts counter it. A picked board outranks the default-palette rules, because the user chose it.

## Quality gates in your pipeline

Run these in CI and after any skill edit:

```bash
npm test                                       # skill validation + 7 smoke suites
npx tsx scripts/render-fixture.mts <skill> <deck.json> /tmp/out.html
npm run measure:occupancy /tmp/out.html        # flags underfilled slides and hollow cards
```

A deck with occupancy flags is not done; fix the flagged slides (re-template or re-author, never stretch thin content) and re-measure.

## Brand-asset constraint

Engine-level, not skill-level: image prompts and stock queries are validated against a logo/trademark regex and a curated brand-name list, both on the raw subject and on the final assembled prompt, so skill templates cannot smuggle blocked terms in. Stock results are additionally filtered by alt-text. To extend the list with company-specific terms, edit `BRAND_BLOCKLIST` in `engine/brand-guard.ts` (a per-call parameter is a known TODO).

Known limit: no vision-based logo detection on returned stock images, only alt-text filtering. If your deployment serves these images publicly, add a moderation provider before storage.

## Adding reference packages by hand

```bash
npm run new-skill <name>     # bootstraps from meta-generator/templates/
```

`meta-generator/GENERATOR.md` is the step-by-step guide. Validate after every edit; the format contract lives in `docs/SKILL-FORMAT.md`.

## Versioning

- Engine version: `package.json#version`.
- Each skill carries its own version in SKILL.md frontmatter.
- Breaking format changes bump the engine major version and need a small per-skill migration.

## PPTX export, open question

This package is HTML-only; SlideSpeak's existing pipeline converts HTML to PPTX downstream. If that converter has quirks (font fallbacks, layout drift, image embedding), file specifics in `docs/PPTX-NOTES.md` so component conventions can be adjusted to match.
