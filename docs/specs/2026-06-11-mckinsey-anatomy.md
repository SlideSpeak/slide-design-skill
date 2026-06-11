# McKinsey page anatomy, from primary sources

Derived from three real engagement decks (not marketing material, not memory):

- USPS, "Future business model" (2010, 39pp, navy era) — usps.com
- DECC UK, "Capturing the full electricity efficiency potential of the UK" (2012, 129pp, the density reference) — gov.uk
- Polish Insurance Association keynote (2014, 25pp, bright-blue era) — piu.org.pl

This is the definition of done for flagship direction 1 (dense data / consulting).
Checklist items marked [gate] are mechanically checkable; the rest is review.

## 1. Page architecture (every content page)

```
kicker (gray, small, top left: current section name)
ACTION TITLE (navy/blue, bold, 1-2 lines, full-sentence claim)
[exhibit zone: 60-100% width, boxed]      [side panel: drivers/implications]
numbered footnotes (small, above source bar)
SOURCE: ... (full-width gray band)            McKinsey & Company | page-no
```

- [gate] The kicker names the CURRENT section and matches the tracker. It is
  typography only: small, gray, sentence case, no counter dressing.
- [gate] Action title is a full sentence with a verb, max 2 lines. Reading all
  titles in sequence must reproduce the storyline without opening a single
  exhibit (the USPS deck passes this test page by page).
- Titles may continue across consecutive pages: "... with similar savings from
  a private sector perspective" (UK deck). The ellipsis is literal.
- [gate] Every content page carries a SOURCE line; assumptions move into a
  "Note:" line above it. Footnotes are numbered, with superscript markers in
  the exhibit ("2009²").

## 2. Exhibit conventions

- Exhibits are BOXED: a light-blue header band carrying the exhibit title
  (bold, blue) plus a unit line in gray ("$ billions", "Billions of pieces").
  The chart never floats naked on the page.
- The default content page is TWO-PANEL: exhibit left (about 60-65%), boxed
  side panel right ("Key drivers", "PAEA implications", "Comments") with the
  same header-band treatment and square bullets.
- Chart annotation is a first-class device: white callout boxes with a leader
  triangle pointing at the data ("No rate increase 2003-2006", "Postal Act
  2006 signed into law"). Annotations explain causes ON the chart.
- Values sit on the data: above bars, inside stacked segments (white on dark),
  at line endpoints. Axes carry years/categories only; no gridline forests.
- Legends are compact swatch rows, top of exhibit or top right of the page.
- Corner context chip (UK deck): a small framed tag top right ("2030, PRIVATE
  SECTOR") when a page belongs to a scenario or cut.
- Secondary numeric strips: pill-shaped value chips under the chart for a
  second measure (USPS RHB row).

## 3. Structure furniture

- Contents/tracker page: vertical color band left, square-bullet section list,
  the CURRENT section highlighted with a light-blue band. The page repeats at
  each section break with the highlight moved.
- The kicker on every content page is the running version of that tracker.
- Closing pages state requirements/decisions, not "thank you".

## 4. Ledger pages (the Poland pattern)

For qualitative content: a two-column ledger ("Trends | Description") with
underlined blue column headers, numbered circle badges per row, a small
functional image or chip per row, dashed row separators, and body bullets that
use INLINE BLUE EMPHASIS on the load-bearing phrase while the rest stays ink.
This is how a consulting page carries prose without becoming a text wall.

## 5. Color and type discipline

- White page. One blue family does everything: navy ink for titles, mid blue
  for emphasis and data, light blue for surfaces (header bands, highlights).
  The 2010 deck is navy+powder; 2012 adds cyan; 2014 runs brighter blue.
  Pick ONE register per deck and never decorate outside it.
- [gate] No decoration: no gradients, no rounded corners, no shadows, no icon
  parades, no stock-photo moods. The Poland thumbnails are functional row
  anchors, not decoration.
- Square bullets, en-dash sub-bullets, sentence case everywhere.
- Density lives in the EXHIBIT, not the type: the UK abatement page carries
  about 60 labels at readable size inside one chart while the page skeleton
  (title, source, page number) stays calm.

## 6. Evidence posture

- Forecast vs actual shown together (USPS volume page); scenarios labelled.
- "Illustrative" / "Preliminary" stamps where data is not hard.
- Comments/assumption boxes carry the caveats next to the data they qualify.

## Gap audit against our seeds (2026-06-11)

| Convention | mckinsey (dev) | consulting (ship) | opex (ship) |
|---|---|---|---|
| Kicker + tracker pair | kicker only, no tracker page | section label in foot, no tracker | section label in foot, no tracker |
| Action-title contract | yes (enforced) | yes | yes |
| Boxed exhibit w/ header band + unit line | no, charts float in cards | no | partial (chart card, no band/unit) |
| Two-panel chart+drivers default | partial (split-exhibit type) | no | partial |
| Chart annotation callouts w/ leaders | no (note= only, top-right) | no | no |
| Values inside stacked segments | n/a (no stacked bar in seed) | no | no |
| Numbered footnotes + SOURCE bar | source line only, no footnotes | source line only | source line only |
| Inline blue emphasis in body | no | no | no |
| Ledger w/ badges + dashed separators | no | partial (ledger, no badges) | yes (different register) |
| Corner context chip | no | no | no |
| Contents/tracker slide type | no | no | no |

**Spine decision: rebuild on `mckinsey` (dev seed) as direction-1 flagship.**
It already carries the action-title contract, the density repertoire (15
types) and the navy register; the gaps are furniture (tracker, exhibit bands,
footnotes, callouts, inline emphasis), not architecture. `consulting` stays a
distinct lighter style; `opex` stays the steering-deck register.

## Canonical test case (fixture)

One honest strategy case, clearly marked illustrative, that forces the full
repertoire: "Nordwind Appliances: should we enter the EU heat-pump market?"

- exec summary (the answer first), context (market line chart, forecast vs
  actual), problem quantified (waterfall), options (2x2), comparison table,
  deep-dive with annotation callouts, ledger page (qualitative trends),
  economics (stacked bar with inside values), risks, roadmap, recommendation
  with decisions/asks, tracker pages between sections.

The fixture must pass titles-only storyline reading, the occupancy gate, and
every [gate] item above.
