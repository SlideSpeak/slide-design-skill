# Generator Composition + Anti-Float Fix — Plan (2026-06-08)

Status: **DONE — all 6 phases shipped + verified on real output (2026-06-08).**

## Outcome
- Phase 1: `engine/composition-families.ts` (12-family taxonomy + helpers); `family?` on SlideTypeSpec; header-aware grammar parser (optional `family` column, back-compat). mind annotated.
- Phase 2: neutral bounded-island utilities in `baseSlideCss` (`flow-head/foot/stage`, `flow-stage.flow-center`, `flow-grid-fill`, `flow-fill`, `flow-fill-body`). Strictly structural, verified neutral.
- Phase 3: generator prompt hardened — requires `family` column + ≥6 families + ≤35% per family; `cards-grid` named as the default trap; mandates island utilities; HARD RULES (no uppercase, no card-edge accent, no em-dash, no fake UI).
- Phase 4: `prompt-composer.ts` exposes `[family]` per type + COMPOSITION VARIETY section (adaptive cap, alternate, no 3-in-a-row).
- Phase 5: `validate.ts` deck-level family cap / 3-in-a-row / distinct-floor (warn, strict→error). `validate-skill.ts` family contract (hard, opt-in), card-edge tell + em-dash hard checks, morphology backstop (non-fatal). Fixed 3 legacy seeds' em-dashes.
- Phase 6: **ROOT CAUSE found + proven.** The generated `neue-klasse` floated because its custom `.nk` wrapper never opted into the base layout utilities and its hand-rolled flex/`height:100%` chain (+ `justify-content:center` stage) didn't resolve to a filled grid. Fix = add `slide-flow` to the wrapper + drive every exhibit with the Phase-2 utilities + remove 5 card-edge accent tells. Before: every content slide floated (empty bottom third/half). After: all 16 slides fill top-to-bottom. 12/12 skills validate.

## Tooling gotcha discovered
`scripts/shoot-review.py` assumes a 24px inter-slide gap (stride 1104), but render-fixture appends a deck-preview rule `.slide{margin:0 auto 40px; box-shadow:…}`. With full (non-floating) slides this drifts per-slide crops. For accurate crops, neutralize before screenshot: replace `</style>` with `.slide{margin:0!important;box-shadow:none!important}</style>`, window = n×1080, stride 1080.

## Original plan below (for reference)
Status: **Decided, ready to execute.** Root cause validated with Codex (planner role). Execute after context compaction.

## Why
A freshly *generated* skill (`scripts/neue-klasse-deck.html`, a BMW-EV consulting deck) reproduces the exact two failures we hand-fixed on `mind` + `afterlight`:
1. **Monotony** — ~14 of 16 slides are the SAME composition (headline + N labelled columns of bullet lists). Many distinct slide *types*, one visual *archetype*.
2. **Float** — content clusters at the TOP of its container; bottom third/quarter empty, even INSIDE cards (slide 10: 5 bullets top, lower half of the card empty).

**The real root cause:** the per-skill fixes (mind/afterlight `components.html`/`chrome.css`) never touched the **generator** (`engine/skill-generator.ts`) — the actual product. Every new generation reproduces both failures. We patched symptoms on individual decks, not the machine that builds decks.

## Codex root-cause check (validated, with corrections)
Codex agreed the fix is at the right layer (generator, structural not prompt-only) but corrected/sharpened:
- **Cap on slide TYPE is NOT enough** — distinct types can share the same column-list morphology (exactly neue-klasse). Must operate on **composition FAMILY**, validated by family not type name. ← the key blind spot.
- **Cap-at-~2 belongs primarily in DECK AUTHORING + VALIDATION**, not (only) skill generation. A diverse skill can still be authored monotonously.
- **Anti-float layer = neutral structural utilities in `baseSlideCss`** (pure flex/grid/min-height mechanics, NO look) + generator must use them + validator checks. **Renderer stays declarative — it renders, it does not repair design.**
- **Prompt alone won't hold** (caps-strip lesson): prompt + schema + validation enforcement.
- Deeper cause acknowledged: LLM-emitted inline-HTML templates + slot grammars naturally drift to top-aligned enumerations. Short-term: taxonomy + utilities + validators + visual regression. Long-term: typed component skeletons.
- Risk flagged: don't over-constrain bespoke design — small taxonomy, escape hatches, deck-kind-specific caps, warnings before hard rejection.

## The plan (6 phases)

### Phase 1 — Composition-family contract
- Add a **composition family** concept to `layout-grammar.md` (new column or parseable block). Each slide type declares ONE family + a layout intent.
- Taxonomy (compact): `cover, statement, metric-hero, quote, flow-diagram, comparison, timeline, matrix, image-spread, cards-grid, table, closing`.
- Parse it in `skill-loader.ts` grammar parsing (or a structured comment block first, migrate parser later).
- Gate: generated skill fails if any type lacks a family OR >~35–40% of types share one family.

### Phase 2 — Neutral layout utilities in baseSlideCss
- Extend `engine/token-compiler.ts` `baseSlideCss` with structural-only utilities: bounded shell, growable stage, stretch-grid, center-stage, fill-card, card-body-fill. (This is the mind bounded-island pattern, generalized + neutral.)
- STRICTLY neutral: only `display`, `flex/grid`, `min-height`, `height`, `box-sizing`, `align-*`/`justify-*`. NO color/border/shadow/typography/brand-spacing. (Keeps the "baseSlideCss carries no look" contract — see [[slidespeak-engine-architecture]].)
- Gate: generated components use a growable stage for normal slides + fill behavior inside repeated cards.

### Phase 3 — Harden the generator
- `engine/skill-generator.ts` `composeGeneratorPrompt`: require a **repertoire of distinct composition families** (not just ≥5 types); require non-bleed templates to use the Phase-2 island utilities; explicitly name "labelled columns / bullet grids as the default" as a FAILURE MODE to avoid.
- Carry hard rules as validator-backed checks: no uppercase labels, no card-edge accent lines, em-dash-free. (see [[feedback-ai-tell-card-edge-accent]], [[feedback-no-uppercase-anywhere]])
- Gate: regenerated neue-klasse skill exposes visibly different templates BEFORE any deck is authored.

### Phase 4 — Deck authoring
- `engine/prompt-composer.ts`: expose composition-family per slide type in the authoring prompt; instruct deck planning to ALTERNATE families and cap any family at ~2 uses unless slide count forces more; satisfy narrative with different families, not list/card/grid variants.
- Optional stronger: split authoring into outline/plan call → slot-fill call (more expensive).

### Phase 5 — Enforcement (validation)
- `engine/validate.ts`: after mapping slide type → family, COUNT family usage; warn/reject decks over cap (strict mode toggle).
- Add generated-skill structural heuristic: detect repeated column-list morphology across templates (repeated `repeat(N,1fr)`, repeated labelled columns, repeated top-headline + N cards). A deck of 14 list-column variants must fail/blocking-warn even if all types differ.

### Phase 6 — Verify (real output, not "tests green")
- Regenerate neue-klasse with the fixed generator (me-as-LLM is the established path; live-LLM still unwired).
- Render contact sheet + representative full slides via `scripts/shoot-review.py`.
- Check: vertical occupancy (no top-floating stages/cards), composition-family distribution (≥6 materially distinct compositions in a 16-slide deck, none over cap). Compare to mind/afterlight bar.

## Tooling notes (post-compaction quick-start)
- Repo: `~/Documents/claude/slidespeak/slidespeak-hue/`
- `node` has no tsx → use `npx --yes tsx <script>`.
- Render no-FAL (free, deterministic): `npx tsx scripts/render-fixture.mts <skill> scripts/<deck>.json <out>.html`
- Render with FAL bgs ($, changes images): `FAL_KEY set; npx tsx scripts/render-fal-runtime.mts <skill> <deck>.json [skillsRoot]`
- Screenshot review: `python3 scripts/shoot-review.py <html-basename> <n>` → /tmp/ss-review/<name>/ + contact sheet.
- Desktop PDF export (flat, sanitized): `python3 scripts/export-pdf.py <html-basename> <n> <OutName>`.
- Gates each skill edit: `npx tsx scripts/validate-skill.ts` + `npx tsx scripts/security-smoke.ts`.
- Codex continuation_id for this analysis: `bc4a6c2c-55ba-485a-b976-9f6c7d96bda5` (pal clink codex).

## Guardrails
- NEVER present skills/ as a selectable menu (see CLAUDE.md in repo + [[slidespeak-no-style-menu]]).
- Verify REAL rendered output before claiming done ([[slidespeak-verify-real-output]]).
- Don't over-constrain: small taxonomy, escape hatches, warnings before hard rejection.
