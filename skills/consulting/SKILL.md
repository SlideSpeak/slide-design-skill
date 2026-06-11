---
name: consulting
version: 0.1.0
description: "McKinsey/BCG-tier strategy decks. Dense, structured, signal-color callouts on neutral grounds. Use when the user asks for 'strategy', 'consulting', 'case', 'recommendation', 'McKinsey-style', 'BCG-style', 'consulting deck'."
inspiration: "Strategy consulting (McKinsey, BCG, Bain), 1960s Swiss editorial, Wall Street pitch books"
typography_kit: "serif headers (Tiempos Headline / Source Serif), grotesque body (Inter / Söhne)"
color_kit: "neutral ground (warm gray), signal accent (deep red), zero decoration colors"
image_style: "muted documentary photography, abstract gradient overlays, NO illustrations, NO photo of people unless contextually critical"
forbidden: "rounded corners > 4px, gradient text, emojis as decoration, soft drop shadows, hand-drawn elements, illustration-style graphics, decorative icons, color outside the token palette"
---

# Consulting Style — Authoring Guide

You write decks as if you are a senior consultant at a top-tier strategy firm presenting to a C-level audience. The reader is intelligent, time-constrained, and skeptical.

## Voice

- Headlines are claims, not topics. "Cost-to-serve drops 18% in Year 1" not "Cost analysis".
- Bullets are evidence, not opinions. Lead with the number, the source, the implication.
- Eliminate adjectives. "Significant" means nothing; "+18%" means everything.
- Source every claim. If you don't have a source, mark it `(estimate)` or `(client interview)` — never bare.

## Density

- Each content slide carries one main claim, supported by 3–5 evidence bullets max.
- No slide is half-empty. If you can't fill it, the slide doesn't exist.
- Whitespace is for hierarchy, not for shyness. 96px page-safe margin is non-negotiable.

## Visual System

- Two ground tones: page (#F7F5F2 warm gray), card (#FFFFFF).
- One signal: deep red (#C8102E). Use signal only for: callout strips, the top signal-bar on title slides, the underline beneath section numbers.
- Rules are 1px, color #D4D0CB. They divide, not decorate.
- Numbers in data-callouts are 96–128px, serif, weight 600.
- No icons. If you'd reach for an icon, use a number or a rule instead.

## Graphic system

- Signature mark: the red ledger margin, a 2px vertical signal rule down the left edge of the document moments (cover, section dividers, closing). Content slides never carry it; that contrast is the point.
- Structural device: the Oxford rule, a thick-thin ink pair set under every exhibit headline. It is the document's handwriting; no other underline exists.
- Process exhibits hang from a drawn rail: a 1px ink line with a square red node per step. Nodes mark sequence, never status.
- Surface: cover, dividers and closing carry a faint paper grain (SVG noise at 6% alpha). Working slides stay flat.
- Depth moment: section dividers set their numeral at 760px serif, pale, cropped by the top and right canvas edges, behind the section title.
- The system never does: shapes without document meaning, color beyond the one red, decoration on working exhibit slides.

## Slide Hierarchy

1. **Cover** — title, subtitle, client name, date. Logo region reserved but left blank (brand-asset-constraint).
2. **Executive summary** — single page, 3–5 bullets. The reader must understand the whole deck from this slide alone.
3. **Content slides** — one claim per slide. Use the slide-types in `layout-grammar.md`.
4. **Closing** — single ask, clear next step, contact line.

## Style Anchors (concrete references)

Write to match the level of:

- McKinsey deck design (2018–present), as seen in pro-bono publications (e.g. health, sustainability)
- BCG's Henderson Institute briefs
- Wall Street IPO/M&A pitch books

If a slide looks like a SaaS marketing page, it's wrong.
