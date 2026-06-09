# Handover — slide-design-skill v0.1

## What you got

A drop-in skill engine for SlideSpeak's HTML slide generation. Seven reference skill packages + a skill generator (derives a bespoke skill from a free-form brief) + a meta-generator for your team to build more. The shipped packages are reference seeds, not a fixed menu users pick from.

## Repo Layout

```
slide-design-skill/
├── engine/                       # Core: skill loader, prompt composer, renderer, image subsystem
│   ├── index.ts                  # generateDeck() entry point
│   ├── types.ts                  # All public types
│   ├── skill-loader.ts           # Reads skill folders, parses frontmatter + grammar
│   ├── token-compiler.ts         # tokens.json → CSS variables
│   ├── prompt-composer.ts        # Builds the LLM system prompt
│   ├── brand-guard.ts            # Validates image prompts + slot content against blocklist
│   ├── renderer.ts               # slide-tree → HTML via components.html
│   └── image-providers.ts        # FAL.ai + Unsplash + Pexels + FederatedImageResolver
├── skills/                       # Reference skill packages (worked examples, not a fixed menu)
│   ├── consulting/               # strategy decks
│   ├── pitch/                    # investor decks
│   ├── academic/                 # university/conference decks
│   ├── training/                 # workshop/onboarding decks
│   ├── product-marketing/        # launch/marketing decks
│   ├── neue-klasse/              # data/diagram-led product narrative
│   └── opex/                     # operational-excellence steering deck
├── meta-generator/
│   ├── GENERATOR.md              # Step-by-step guide for building new skills
│   └── templates/                # Skeleton files for new-skill bootstrap
├── scripts/
│   ├── render-fixture.mts        # Deterministic render of a deck (no image API)
│   ├── validate-skill.ts         # Validates all skills parse + meet spec
│   ├── new-skill.ts              # Bootstraps a new skill folder
│   ├── image-smoke.ts            # Tests image subsystem + brand guard
│   └── security-smoke.ts         # Output-escaping + path-containment checks
├── docs/
│   ├── SKILL-FORMAT.md           # Authoritative format spec
│   ├── INTEGRATION.md            # How to wire into SlideSpeak's pipeline
│   └── HANDOVER.md               # This file
├── examples/                     # End-to-end rendered decks
└── README.md
```

## What Works

- ✅ Skill loader parses SKILL.md frontmatter + tokens.json + grammar table + image-style decision rules + components.html
- ✅ Token compiler emits CSS variables consumed by every component
- ✅ Prompt composer builds a self-contained system prompt with slide-types, slot schema, and composition rules
- ✅ Brand-asset guard rejects image prompts with blocked brands/keywords; warns on slot content with brand names (doesn't drop, since sources/citations are valid)
- ✅ Image subsystem: FAL.ai for AI generation, Unsplash + Pexels federated for stock, decision-logic per category, engine-level brand-asset validation
- ✅ Renderer matches slide-types to `<template id="slide-X">` in components.html, interpolates slot values, falls back to a generic layout if a slide-type has no template
- ✅ All shipped reference skills parse and validate (run `npx tsx scripts/validate-skill.ts`)
- ✅ Meta-generator bootstrap creates a working skill skeleton from templates
- ✅ End-to-end spike: hand-crafted 8-slide consulting deck renders to standalone HTML

## What Doesn't Work Yet

- ❌ PPTX export — Phase 1 is HTML-only. SlideSpeak's existing pipeline handles HTML→PPTX downstream.
- ❌ Live LLM call in spike script — uses a mock. Wire your OpenAI/Anthropic/Gemini client per `docs/INTEGRATION.md`.
- ❌ Live image generation — `image-smoke.ts` uses mocks; provide real API keys to test against FAL/Unsplash/Pexels.
- ❌ Interactive `decide` callback for image-resolver — currently defaults to "stock" for ask-the-user cases in non-interactive runs.
- ❌ Skill versioning / migration tooling — each skill has its own version, no engine-wide compatibility matrix yet.
- ❌ Per-call brand-blocklist extension — currently hard-coded in `engine/brand-guard.ts`. Acceptable for v0.1; would be one parameter on `generateDeck` deps.
- ❌ Vision-API logo detection on stock results — only alt-text filtering today. Plug in a moderation provider before serving public images.
- ❌ Per-skill CSS-class allowlist for tokens — token values are emitted into a CSS block; a future hostile skill author could inject URL/keyword payloads. Acceptable while skill source is trusted internal authoring.
- ❌ Post-LLM composition-rule enforcement — the prompt asks the LLM to follow rules ("first slide must be cover") but we don't re-verify after generation. v0.2.

## Security Posture (v0.1)

- HTML output is escaped: slot values, slide types, and image URLs all flow through `escapeHtml` / `escapeHtmlAttr` / `safeImageUrl`.
- Image URLs are restricted to `https:` and `data:image/*`. `javascript:`, `http:`, and control-character URLs are rejected.
- `skillName` is validated with a strict slug regex AND containment-checked against the resolved `skillsRoot` — no path traversal.
- LLM output is runtime-validated: malformed slides/slots/images are dropped with warnings rather than crashing the renderer.
- Brand-asset guard runs twice: once on the raw subject (caller-supplied), once on the final assembled AI prompt / stock query (template-applied). Negative-prompt phrasing in templates is stripped before checking.
- Smoke-tested via `scripts/security-smoke.ts` (25 checks).

## Smoke Tests

```bash
# Validate all skills parse and meet spec
npx tsx scripts/validate-skill.ts

# Deterministically render a deck from a fixture (no LLM, no images)
npx tsx scripts/render-fixture.mts opex scripts/opex-deck.json /tmp/opex.html

# Test image-resolver routing + brand-guard (mock providers)
npx tsx scripts/image-smoke.ts

# Bootstrap a new skill
npx tsx scripts/new-skill.ts my-new-skill
```

## Wiring Into SlideSpeak — Concrete Next Steps

1. **Vendor or publish the package** — drop `slide-design-skill/` into your monorepo or publish as `slide-design-skill` to a private registry.
2. **Implement your `LLMClient`** wrapping your LLM provider (template in `docs/INTEGRATION.md`).
3. **Set up env vars**: `FAL_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`.
4. **Wire `generateDeck` into your HTML pipeline** at the point where user-prompt becomes slide-tree.
5. **Test with real LLM** — start with `skillName: "consulting"`, `slideCount: 8`. Compare output to `examples/consulting-northwind.html` for quality.
6. **PPTX validation** — run a generated HTML deck through your existing HTML→PPTX converter, check layout fidelity, fonts, image embedding. If issues, log specifics in a new `docs/PPTX-NOTES.md` and we'll adjust component templates.
7. **Brand-blocklist extension** — review `engine/brand-guard.ts BRAND_BLOCKLIST`. Add any company-specific terms.

## Iteration Cadence (Suggested)

- **Week 1 post-handover**: SlideSpeak wires the package, ships first `consulting` decks behind a flag. Logs PPTX issues.
- **Week 2**: Round 1 of skill polish — Dominik fixes any visual gaps observed in real PPTX exports, tunes prompts based on LLM output quality.
- **Week 3**: SlideSpeak's design team uses `meta-generator/GENERATOR.md` to draft a 6th skill (suggest: `editorial` or `sales-enablement`). Dominik reviews the draft.
- **Week 4**: Skill versioning + per-call blocklist extension shipped.

## Open Questions for SlideSpeak

1. **HTML→PPTX pipeline specifics** — what's the converter? Are there font/layout quirks we should know about so components render reliably in .pptx?
2. **Image budget defaults** — what's the per-deck token-cost ceiling you want enforced as default?
3. **Style intake UX** — the intended model is bespoke-per-brief: the user describes the look in free text (or a brand URL / reference) and the engine derives a skill, rather than picking from a fixed list. The shipped packages are reference seeds. Confirm this matches how you want intake to feel in-product.
4. **Customer-deck branding** — do customers want to inject their own brand tokens (color, font) over a skill's defaults? If yes, we add a `brandOverrides` argument to `generateDeck` next.

## Contact

- Engine bugs / new features: Dominik Martin, dominikmartn@gmail.com
- Skill design + new skills: same. Pricing per skill TBD (engagement scope).
- Brand-asset blocklist additions: open a PR against `engine/brand-guard.ts` or DM.

Phase 1 sign-off: when 1 real deck (any skill) goes from prompt → HTML → PPTX → customer-readable end-to-end inside SlideSpeak's product.
