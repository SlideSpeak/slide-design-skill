---
name: slide-design-skill
description: Design and generate polished, on-brand presentation decks as clean 1920×1080 HTML — with real charts, tables, and AI or stock imagery. Use whenever someone wants to create, design, or improve a presentation, slide deck, pitch deck, investor or sales deck, keynote, training or teaching deck, PowerPoint (PPTX), Google Slides, or a data-heavy report, and cares about design quality. The visual style is derived from the brief, never picked from a theme or template menu.
---

# Slide Design Skill

A presentation-design engine. Give it a brief — what the deck is about, plus how it
should look in any form (a few words, "like stripe.com", a brand URL, or a moodboard) —
and it derives a bespoke visual style for that deck, plans the slide sequence, has the
host LLM fill fixed slide templates, and renders deterministic 1920×1080 HTML slides
with real data-viz, tables, and imagery.

**Style is discovered, not chosen.** There is no theme menu and no preset to pick: every
deck gets its own tokens, slide templates, and look, generated from the brief.

## When to use

Use when the user wants to create, design, or improve any presentation: a pitch or
investor deck, a sales or strategy deck, a keynote, a training or teaching deck, a data
or report deck, or generally "make me some slides / a PowerPoint / a deck" — and they
care about it looking designed and on-brand.

## How to use

1. `npm install`
2. Capture the brief: the topic and content, plus any signal about the look (free text,
   "in the style of <x>", a brand URL, reference images). If there is zero style signal,
   ask one short question about the desired look.
3. Generate and render a deck through the engine, then review the rendered HTML and
   iterate on the user's feedback.

See `README.md` for the pipeline and quality gates, `docs/INTEGRATION.md` for the engine
API, and `docs/SKILL-FORMAT.md` for the package format.

Design rules — readable type, no empty bands, no logos or trademarks, no invented
numbers — are enforced by code gates, not by prompt wording alone.
