# slide-design-skill — Session Rules (READ FIRST, applies to EVERY session in this repo)

## The product has NO selectable styles. None. Ever.

There are no themes, no templates, no presets, no "flagship skills" the user picks
from. The user describes what they want; a style is **generated/derived from that
brief, every single time.** "Choosing a style" is not a concept that exists here.

## NEVER surface internal machinery to the user

The folders under `skills/` are **internal generator seed/reference material only.**
The user must not know they exist. When talking to the user, you are FORBIDDEN from
saying (or implying) any of:

- "flagship skill(s)", "preset(s)", "template(s)", "theme(s)"
- the name of any folder under `skills/` (consulting, pitch, stripe, …)
- "bespoke X **(not chosen from the presets/flagship skills)**" ← this exact leak just happened, never do it
- "I matched the built-in …", "deriving from stripe.com as the brief says", or any
  narration of how the style got resolved

If you catch yourself explaining the approach or the architecture, stop. The user
does not want a status report on the plumbing.

## What to actually do

1. Take the brief (topic + content + look-in-any-form).
2. **Silently** derive the look and generate a fully bespoke style for this deck
   (its own tokens, slide types, and `chrome.css`).
3. Author the deck, render it, show the user the result (screenshots / the HTML).
4. Iterate on the user's feedback.

Minimal narration. No menus. No meta-talk. If the brief carries zero signal about
the look, ask ONE short question about the desired look — otherwise never ask, just
build.

### Moodboard step (image-first style anchor, optional but preferred)

When the look is open (inspiration-style briefs, weak signal) and `FAL_KEY` is
available: generate 2 moodboards via `composeMoodboardPrompts(subject)`
(engine/moodboard.ts) rendered through `FalProvider` (flux/dev), show them to
the user, let them pick. The prompts already rotate each board onto a different
unexpected colour axis — NEVER write moodboard prompts by hand without an axis;
the image model carries the same genre-default bias as the LLM and will return
the cliché palette (verified: "premium chocolate" → beige+espresso every time).
View the approved board yourself, extract palette hexes / type mood / material
world, and feed it into the generation brief via `moodboardDirectionBlock(...)`.
An approved board outranks the banned-default-palette rule (the client chose it).
A concrete image to translate produces visibly more coherent styles than
adjectives (veta A/B, 2026-06).

**The moodboard conditions PALETTE / material / lighting only, it is NOT an
object to clone onto every slide.** Hero / background images are generated fresh
PER SLIDE as DISTINCT subjects (one visual language, a different figure each
time, tied to that slide's content). Reserve single-reference nano-banana
anchoring (`FAL_REF_IMAGE`) for reproducing an actual brand/product reference
image, NOT for a deck's varied hero imagery: feeding one reference image as the
anchor collapses every generated image to that one object (the "all the images
look the same" failure). The `image-subject-monotony` quality-lint rule
(engine/quality-lint.ts) is the mechanical backstop that catches a deck whose
bgPrompts redraw one motif.

## Rendered decks go to two Desktop homes — versioned, never scattered

Do NOT create new date-named or one-off folders on the Desktop. Every render lands in
one of two homes, by what it is:

- **`~/Desktop/Main Templates/<Direction>/`** — anything tied to one of the 5 flagship
  directions (`1 Dense Data`, `2 Editorial`, `3 Pitch`, `4 Teaching`, `5 Keynote`).
  ALL of a direction's work lives inside its own folder: every deck AND every
  reference. NEVER split a direction's decks or references out into Test Output.
- **`~/Desktop/Test Output/`** — ONLY decks that belong to no direction: genuine
  one-off experiments and proofs (Kanagi, Graphic-Layer, Niels-Wave, …).

A direction can hold MORE THAN ONE deck (Pitch holds Kelvin and Vitala), so decks are
named subfolders, not loose `Vn/`. Shape:

    <Direction>/
      _reference/          shared direction research: measurements/, the spec,
                           anchor-pick/, moodboards/<deck-or-set>/, decks/ (JSON records)
      <DeckName>/          one folder per deck (Kelvin, Vitala, …)
        V1/  V2/  V3.1/    each iteration a new Vn/, rendered output only

- **Each iteration is a new `Vn/` folder**: `V1`, `V2`, `V3` for full passes,
  `V3.1`/`V3.2` for small patches. Never overwrite an old version.
- A second look for a direction is a NEW deck subfolder (`<Direction>/<NewDeck>/V1/`),
  never a Test Output dump. Two decks in one direction MUST diverge in STRUCTURE
  (spine family + slide-type set + a signature structural move), not just skin — a
  re-skin of the same skeleton is the failure this convention exists to prevent.
- Inputs (briefs, moodboards, source PDFs, deck JSON) go under the direction's
  `_reference/`, never loose in a `Vn/`.
- Before rendering, check existing `Vn/` and write the next number.

## Engine notes (internal only — never recited to the user)

- Style intake: `resolveStyleInput` (engine/style-intake.ts) → StyleBrief. Default
  path is `inspiration` / `mix` / `brand-url` → generate a bespoke skill via
  `skill-generator.ts`. The `preset` path only fires if the user literally types a
  seed folder name — and even then you never call it that to the user.
- Look lives in per-skill `chrome.css` (emitted after the neutral `baseSlideCss`).
  A generated style MUST author its own `chrome.css` so it looks unlike anything else.
- Render deterministically (no images): `npx tsx scripts/render-fixture.mts <slug> <deck.json> <out.html>` (optional 4th arg = skills root, e.g. `_dev-skills`).
- MANDATORY occupancy gate after generating ANY deck: `npx tsx scripts/measure-occupancy.mts <rendered.html>` flags slides that leave a large empty band (the underfill tell) AND cells whose own interior is hollow (`CELL-UNDERFILL`: content pinned to a card's edges with a void between, or a big card carrying only a word). FIX every flagged slide (re-template/re-author, never just stretch thin content) and re-measure until all pass. Prose guidance alone does not hold — a deck is not done with any flagged slide. The worst offender is `flow-fill`+`flow-between` on a thin number/title/one-line card.
