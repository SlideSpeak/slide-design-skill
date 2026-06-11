# slide-design-skill

Skill engine for SlideSpeak's HTML slide generation. The user describes what the deck is about and, in any form, how it should look. The engine derives a bespoke visual style from that brief, plans the deck, has the host LLM fill fixed templates, and renders deterministic 1920x1080 HTML slides.

The core idea: **style is discovered, not chosen.** There is no theme menu. A style ("skill") is a self-contained package of tokens, slide templates and look CSS that is generated per brief. The packages under `skills/` are curated reference seeds: they anchor quality, serve as few-shot material for the generator, and double as worked examples. They are not a catalog users pick from.

## How a deck gets made

```
brief ("topic + look in any form")
  └─ resolveStyleInput()        style intake: free text, "like X", "A meets B", brand URL
       ├─ generateSkill()       default path: a bespoke skill package, generated per brief
       └─ loadSkill()           direct path: a reference package, when named literally
  └─ planDeck()                 reads the brief: presentation type, audience, register,
                                density rhythm, variance posture
  └─ composeSystemPrompt()      skill + plan + content contract -> system prompt
  └─ LLM (host-provided)        returns a slide tree: type + slot values per slide
  └─ validateSlideTree()        schema, composition variety, content lint, fidelity flags
  └─ image subsystem            FAL (AI) + Unsplash/Pexels (stock), brand guard, treatments
  └─ renderSlide()              fills <template id="slide-TYPE"> from the skill, resolves
                                directives (charts, icons, tables, scrims, placeholders)
```

Consistency comes from the split: the skill (templates, tokens, chrome) is generated once and frozen; the deck LLM only fills slots. Variety comes from the generator, which must produce distinct compositional primitives per skill, and from the deck planner, which varies density and composition inside a deck.

## Folder layout

```
engine/           loader, token compiler, renderer, prompt composer, deck planner,
                  style intake, skill generator, moodboard intake, image subsystem,
                  brand guard, validators (slide tree, quality lint, occupancy)
skills/           7 reference packages: academic, consulting, neue-klasse, opex,
                  pitch, product-marketing, training
meta-generator/   guided checklist + templates for authoring a package by hand
scripts/          render, validate, measure, smoke tests, bake scripts
docs/             SKILL-FORMAT.md, INTEGRATION.md, HANDOVER.md, specs/, plans/
examples/         rendered end-to-end decks
```

## Quality gates

Design rules here are enforced by code, not by prompt wording alone. Prompts carry the rules; gates make them stick.

| Gate | Catches | Where |
|---|---|---|
| Skill validation | format errors, grammar/template drift, uppercase typography, type below 14px, card-edge accent lines, em-dashes, missing graphic system, composition-family monotony | `npm run validate` |
| Slide-tree validation | malformed LLM output, composition monotony per deck, boxed-texture overuse | `validateSlideTree`, runs inside `generateDeck` |
| Content lint | AI-phrase filler, fake precise numbers, topic-label headlines, uniform bullets, eyebrow overuse | part of slide-tree validation |
| Occupancy | slides with large empty bands, hollow card interiors, sparse oversized cells | `npm run measure:occupancy <rendered.html>` |
| Brand guard | logos, trademarks, brand names in image prompts and stock queries; model-invented figures flagged | engine level, skills cannot bypass it |
| Security smoke | XSS via slots/URLs, path traversal, malformed trees | `npm run test:security` |

## Quick start

```bash
npm install

# all gates: skill validation + 7 smoke suites
npm test

# render a deck deterministically (no LLM, no image APIs)
npx tsx scripts/render-fixture.mts opex scripts/opex-deck.json /tmp/opex.html

# check the render for underfilled slides
npm run measure:occupancy /tmp/opex.html
```

Integration into the SlideSpeak pipeline: `docs/INTEGRATION.md`. Package format: `docs/SKILL-FORMAT.md`. State of the build and open questions: `docs/HANDOVER.md`.
