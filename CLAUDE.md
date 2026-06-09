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

## Engine notes (internal only — never recited to the user)

- Style intake: `resolveStyleInput` (engine/style-intake.ts) → StyleBrief. Default
  path is `inspiration` / `mix` / `brand-url` → generate a bespoke skill via
  `skill-generator.ts`. The `preset` path only fires if the user literally types a
  seed folder name — and even then you never call it that to the user.
- Look lives in per-skill `chrome.css` (emitted after the neutral `baseSlideCss`).
  A generated style MUST author its own `chrome.css` so it looks unlike anything else.
- Render deterministically (no images): `npx tsx scripts/render-fixture.mts <slug> <deck.json> <out.html>`.
