---
name: pitch
version: 0.1.0
description: "High-stakes startup pitch decks. Bold, confident, one-claim-per-slide, founder-voice. Use when the user asks for 'pitch deck', 'investor deck', 'fundraising deck', 'demo day deck', 'YC-style', 'seed pitch', 'series A deck'."
inspiration: "YC demo day, Sequoia memo style, Linear, Stripe, Lattice, modern SaaS pitch decks 2020-2026"
typography_kit: "geometric grotesque headlines (Söhne / Inter / GT America), same family throughout, weight pulls the hierarchy"
color_kit: "near-black ink, off-white ground, one bold accent (electric blue or fluorescent), minimal else"
image_style: "bold product screenshots, abstract product-as-hero, NO stock business photography, NO illustrations"
forbidden: "serif fonts, gradient text on cover, drop shadows above 8px, more than 3 colors per slide, decorative icons, clipart, jumping-people stock photography, gradient backgrounds on data slides"
---

# Pitch Style — Authoring Guide

You write decks as if you are the founder pitching to top-tier investors. The reader has 8 minutes. They will remember three things at most.

## Voice

- First-person plural. "We", not "the company".
- Headlines are decisions, not descriptions. "We are building the operating system for legal teams" not "About our product".
- Numbers come before words. "$12M ARR, +18% MoM" before any paragraph.
- No buzzwords. "Disrupt", "synergy", "ecosystem play" — banned. Use plain English.
- If a slide has more than 25 words of body copy, cut to 15.

## Structure (canonical pitch arc)

1. Cover — company name, single line of what you do
2. Problem — one sentence, named persona
3. Market size — TAM/SAM/SOM as three numbers, no spreadsheet
4. Solution — product screenshot or live demo placeholder, single claim
5. Why now — single trend, single chart
6. Traction — three metrics, one chart
7. Business model — pricing tiers, one number per tier
8. GTM — three channels, owner of each
9. Team — founders only, three bullets each max
10. Competition — 2x2 framework or feature matrix
11. Ask — single number, single use of funds split (3 bullets)

## Visual System

- Off-white ground (#FAFAF8), ink (#0A0A0A).
- ONE accent color per deck (default: electric blue #2563EB). Used for: cover wordmark, big numbers, the underline beneath the ask.
- Typography is one family in 3 weights (regular, semibold, bold). No serifs. No italics except for sourcing.
- 8-column grid, 32px gutter. Numbers and headlines align to this grid hard.
- Generous whitespace. A pitch slide that looks full looks amateur.

## Graphic system

- Signature mark: the conviction stroke, a single rising stroke with a square terminal (a chart reduced to its claim), drawn as inline SVG. It appears small and exact at the cover masthead, beside the why-now trend line, and above the ask. Always the same geometry, never redrawn per slide.
- Depth moment: the cover carries the stroke at roughly 25x scale, pale blue, cropped by the bottom-right canvas edge, behind the wordmark.
- Surface: cover and ask sit on a faint chart-paper grid (hairlines at 120px). All other slides stay flat off-white.
- Structural device: metric and feature rules are an ink hairline carrying a short 56px signal dash at the left end (.px-rule), never a full-width colored border.
- The system never does: shapes unrelated to the rising stroke, decoration on the problem slide (the claim stands alone), more than one stroke instance per slide.

## Density

- Cover: company name + 1 sentence + date. Nothing else.
- Problem: 1 sentence. No bullets.
- Solution: hero image + 1 sentence + 3 short feature bullets max.
- Traction: 1 chart + 3 supporting metrics.
- Team: founder photo region (blank if not provided) + name + role + 3-bullet creds.

## Style Anchors

Write to match the level of:

- Sequoia's "writing a business plan" template
- Linear's 2020 seed deck (published)
- Stripe's early-stage pitch materials
- Notion's Series A leak
- Modern YC demo day batches (W23, S24)

If a slide looks like a B2B sales deck, it's wrong. If it looks like a consulting deck, it's wrong (use the consulting skill for that).
