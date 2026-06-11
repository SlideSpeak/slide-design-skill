---
name: academic
version: 0.1.0
description: "University-tier research and lecture decks. Citation-heavy, evidence-led, restrained. Use when the user asks for 'academic deck', 'research presentation', 'lecture slides', 'conference talk', 'thesis defense', 'paper presentation'."
inspiration: "Edward Tufte's slide rule, Princeton/MIT lecture notes, Nature/Science paper figures, Reuters Institute reports"
typography_kit: "serif throughout (Source Serif / Tiempos / Computer Modern when LaTeX-feel needed), sparse use of sans for captions"
color_kit: "near-black on cream, single muted accent (deep teal or oxblood), figures in 2-3 tones max"
image_style: "scientific figures, diagrams, charts. NO stock photography. NO illustrations. Photos only when the photo IS the evidence (microscopy, fieldwork, archival)."
forbidden: "gradient anything, drop shadows, decorative icons, emoji, clipart, stock people, fake 3d effects, busy backgrounds, font sizes below 18px on body, more than 3 colors on a chart"
---

# Academic Style — Authoring Guide

You write decks as if you are a researcher presenting to peers at a top conference. The audience is expert. They will read your figures, not your prose.

## Voice

- Past tense for methods and findings ("We sampled", "Subjects reported").
- Hedge precisely ("suggests", "is consistent with", "does not support"), don't oversell.
- Every claim has an inline citation (Author, Year) or footnote number.
- Never use "obviously", "clearly", "simply" — they patronize an expert audience.
- Equations are first-class content, not decoration. Render with proper notation.

## Structure (canonical academic arc)

1. Title — paper title, authors, affiliation, conference/journal, date
2. Motivation — the problem in 1 slide, 2-3 references max
3. Research question — single line, possibly with sub-questions
4. Prior work — bibliography-style list with positioning
5. Method — diagram + 3-4 step list
6. Data — tables, sample sizes, sources
7. Results (3-6 slides) — one finding per slide, with supporting figure
8. Discussion — implications, limitations, future work
9. Conclusion — 3 takeaways
10. References — full bibliography
11. Q&A holding slide — contact, paper link, code/data link

## Visual System

- Cream ground (#F5F1E8), ink (#1A1A1A).
- Accent: deep teal (#0F4C5C) — used sparingly for headlines and key data callouts.
- Figures: 2-3 tones max. Default palette: ink, teal, muted-rust (#A8554E).
- Tables: 1px hairlines, no fills, no zebra striping. Tufte minimalism.
- Equations centered with extra vertical space. Use proper math typography.
- Footnote-style citations in muted gray at the bottom margin.

## Graphic system

- Signature mark: the citation bracket. The [n] apparatus that runs through the deck becomes the visual identity; the title slide sets a giant pale serif bracket, cropped by the left canvas edge, behind the paper title.
- Structural device: the double hairline (.ax-rule), two 1px ink rules set under every section headline. Tufte separator, never a thick bar.
- Evidence plate (.ax-plate): a 1px ink frame with a small teal tab on its top edge wraps anything evidentiary: result figures, result tables. The tab marks "exhibit", never status.
- Surface: title and Q&A carry a faint parchment grain. Working slides stay flat.
- The system never does: icons, color beyond the one teal, brackets as repeated decoration (the giant bracket exists once, on the title).

## Density

- Lecture mode: 1 idea per slide, large text (28-32px body).
- Conference talk: dense but legible (22-24px body), one figure per slide.
- Thesis defense: medium density, more text than conference, citations everywhere.

## Style Anchors

- Nature/Science paper figure design
- Edward Tufte's "Visual Display of Quantitative Information"
- Princeton lecture slides (Kahneman, etc.)
- MIT OpenCourseWare deck design
- Modern preprint figures from arXiv

If a slide looks like a corporate presentation, it's wrong. If it has clipart, it's wrong.
