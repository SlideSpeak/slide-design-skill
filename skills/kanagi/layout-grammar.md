# Kanagi layout grammar

| slide-type | family | when | required slots | optional slots |
|---|---|---|---|---|
| `cover` | cover | first slide | eyebrow, title, sub, date | |
| `heritage` | statement | the lineage claim, early | statement, support, y1, y1-note, y2, y2-note, y3, y3-note, source | |
| `craft` | flow-diagram | the making, one slide | action-title, s1-name, s1-desc, s2-name, s2-desc, s3-name, s3-desc, s4-name, s4-desc, source | |
| `range` | split-visual | the product line | action-title, intro, r1-name, r1-spec, r2-name, r2-spec, r3-name, r3-spec, photo-caption, source | |
| `steel` | metric-hero | the material proof | action-title, hero-value, hero-label, body, m1-value, m1-label, m2-value, m2-label, source | |
| `market` | split-visual | the demand read | action-title, chart-data, chart-labels, chart-note, body, source | |
| `voice` | quote | one buyer speaks | quote, attribution, role | |
| `partnership` | cards-grid | the offer | action-title, p1-name, p1-body, p2-name, p2-body, p3-name, p3-body, source | |
| `roadmap` | timeline | the path | action-title, ph1-name, ph1-title, ph1-body, ph2-name, ph2-title, ph2-body, ph3-name, ph3-title, ph3-body, source | |
| `closing` | closing | last slide | statement, ask, contact-name, contact-detail | |

## Composition rules

- First slide is always `cover`, last is always `closing`.
- `heritage` follows `cover` directly; the lineage is the second beat.
- The offer slide is the only one whose title moves into the stage; everything else keeps the masthead title block.
- `voice` sits between evidence and offer, never first, never last.
- Bleed slides (`cover`, `voice`, `closing`) carry a bgPrompt; structured slides never do.
- One oxide-red deployment per structured slide: the seal, a step numeral, or one rule terminal.
