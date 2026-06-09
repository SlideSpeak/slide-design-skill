# SlideSpeak Integration Guide

How to drop `slide-design-skill` into the existing SlideSpeak HTML-generation pipeline.

## What This Package Is

A skill-engine that turns user prompts ("make me a strategy deck about X in this look") into branded HTML slide decks. A style is derived bespoke from the brief; the engine also ships reference skill packages as worked examples (`academic`, `consulting`, `neue-klasse`, `opex`, `pitch`, `product-marketing`, `training`) that double as seeds, not a fixed menu users pick from.

The package is provider-agnostic. It does NOT call your LLM directly. You provide an `LLMClient` interface; the engine composes the system prompt and you handle the model call.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ SlideSpeak pipeline (your code)                             │
│   • user prompt                                             │
│   • language                                                │
│   • slide count                                             │
└──────────────────┬──────────────────────────────────────────┘
                   │ generateDeck({skillName, userPrompt, ...})
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ slide-design-skill engine                                       │
│   1. loadSkill(skillName)                                   │
│   2. composeSystemPrompt(skill, args)                       │
│   3. llm.generateSlideTree(systemPrompt) ← YOU PROVIDE      │
│   4. guard each slot for brand-asset violations             │
│   5. resolve each image via Image-Resolver ← YOU PROVIDE    │
│   6. render slide-tree → HTML via skill's components.html   │
└──────────────────┬──────────────────────────────────────────┘
                   │ { slides: [{type, html}], imagesUsed, warnings }
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ SlideSpeak pipeline (your code)                             │
│   • HTML preview                                            │
│   • HTML → PPTX conversion                                  │
│   • storage, delivery, etc.                                 │
└─────────────────────────────────────────────────────────────┘
```

## Drop-In Integration

### 1. Add the package

Vendor the `slide-design-skill` folder into your repo at `vendor/slide-design-skill` or publish to a private npm registry as `slide-design-skill`. The package is ESM, Node 20+, TypeScript-sourced.

```ts
import {
  generateDeck,
  wrapAsStandaloneHtml,
  type LLMClient,
  type ImageResolver,
} from "slide-design-skill";
```

### 2. Implement the LLMClient interface

The engine hands you a fully-composed system prompt. Your job: send it to your LLM and parse the response as a slide tree.

```ts
import type { LLMClient, SlideTreeNode } from "slide-design-skill";

export class OpenAILLM implements LLMClient {
  constructor(private apiKey: string) {}

  async generateSlideTree(systemPrompt: string): Promise<{ slides: SlideTreeNode[] }> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Return the slide-tree JSON now." },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });
    const json = await response.json();
    const content = json.choices[0].message.content;
    return JSON.parse(content);
  }
}
```

Compatibility notes:
- The engine asks for strict JSON. If your model returns markdown-fenced JSON, strip fences before `JSON.parse`.
- The engine asks for an exact slide count. If the model under-delivers, treat it as an error and retry once.
- Use `response_format: { type: "json_object" }` (OpenAI) or your provider's equivalent for reliable JSON.

### 3. Implement the ImageResolver interface

Two stock approaches:

**A. Use the included `FederatedImageResolver`** (recommended):

```ts
import {
  FederatedImageResolver,
  FalProvider,
  UnsplashProvider,
  PexelsProvider,
  loadSkill,
} from "slide-design-skill";

const skill = await loadSkill("./skills/consulting");
const resolver = new FederatedImageResolver({
  imageStyle: skill.imageStyle,
  providers: {
    fal: new FalProvider({ apiKey: process.env.FAL_API_KEY!, model: "fal-ai/flux/schnell" }),
    unsplash: new UnsplashProvider({ accessKey: process.env.UNSPLASH_ACCESS_KEY! }),
    pexels: new PexelsProvider({ apiKey: process.env.PEXELS_API_KEY! }),
  },
  decide: async (req) => {
    // For non-interactive runs (background jobs), default to "stock".
    // For UI-driven runs, surface the request to the user and await their choice.
    return "stock";
  },
});
```

**B. Roll your own** — implement the `ImageResolver` interface directly:

```ts
import type { ImageResolver, ResolvedImage } from "slide-design-skill";

export class CustomResolver implements ImageResolver {
  async resolve(req): Promise<ResolvedImage> {
    // your provider logic
  }
}
```

### 4. Call generateDeck

```ts
const result = await generateDeck(
  {
    skillName: "consulting",
    userPrompt: "Strategy deck for a CPG company entering DTC over 36 months",
    slideCount: 12,
    imageBudget: 20,
    language: "en",
  },
  {
    skillsRoot: "./skills",
    llm: new OpenAILLM(process.env.OPENAI_API_KEY!),
    images: resolver,
  },
);

// result.slides: [{type, html}, ...]
// result.imagesUsed: number
// result.warnings: string[]
```

### 5. Render or convert

For HTML preview/web:

```ts
const skill = await loadSkill(`./skills/${args.skillName}`);
const standaloneHtml = wrapAsStandaloneHtml(skill, result.slides);
// serve `standaloneHtml` to the user
```

For PPTX export — use your existing HTML→PPTX pipeline. Each `result.slides[i].html` is a complete `<section class="slide">` with inline styles + token CSS variables already resolved.

## API Keys & Budget Monitoring

| Provider | Env var | Cost order |
|---|---|---|
| FAL.ai (Flux Schnell) | `FAL_API_KEY` | ~$0.003 per image |
| Unsplash | `UNSPLASH_ACCESS_KEY` | Free, 50 req/h dev, 5000 req/h production |
| Pexels | `PEXELS_API_KEY` | Free, 200 req/h |

The engine enforces `imageBudget` per `generateDeck` call. Set conservatively — a 12-slide deck rarely needs more than 8 images.

For server-side cost tracking, the warnings array surfaces "Image budget exceeded" lines you can count.

## Brand-Asset-Constraint Customization

The engine ships with a default blocklist of brand names (McKinsey, Apple, etc.) and a regex for "logo|trademark|wordmark". To extend:

```ts
// Currently: edit engine/brand-guard.ts BRAND_BLOCKLIST array.
// Future: pass extra blocklist entries via deps.brandBlocklist (TODO).
```

If your team needs to add company-specific terms (e.g. competitor names you don't want in customer-facing decks), fork the blocklist or open a PR.

## Adding New Skills

```bash
npx tsx scripts/new-skill.ts <your-skill-name>
```

This bootstraps a skill from `meta-generator/templates/`. Follow `meta-generator/GENERATOR.md` for the full step-by-step. Internal designers without coding experience can edit the markdown/JSON files directly — the engine reloads on every `generateDeck` call (no build step).

## Versioning

- Engine version is `package.json#version`.
- Each skill carries its own version in `SKILL.md` frontmatter.
- Breaking changes to the skill format bump the engine MAJOR version. Skills will need a small migration each time.

## PPTX Export — Open Question

Phase 1 is HTML-only. SlideSpeak's existing pipeline converts HTML→PPTX downstream. If that pipeline has limitations (font fallbacks, layout drift, embedded image handling), file specifics in `docs/PPTX-NOTES.md` so we can adjust component templates to match.

If a new dedicated HTML→PPTX engine is needed in Phase 2, candidates: `PptxGenJS` (JS, structured-DSL) or `python-pptx` with a semantic-tree adapter.

## Support & Iteration

- New skills: use `meta-generator/GENERATOR.md`
- Skill bugs: edit the skill folder, validate, ship
- Engine bugs: open issue against the engine, don't patch in skills
- Brand-asset blocklist: PR against `engine/brand-guard.ts`
