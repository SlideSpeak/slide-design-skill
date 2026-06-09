# Consulting — Layout Grammar

## Slide Types

| slide-type | when | required slots | optional slots |
|---|---|---|---|
| `cover` | first slide | `title`, `subtitle`, `client-name`, `date` | `engagement-type` |
| `executive-summary` | second slide | `headline`, `bullet-1`, `bullet-2`, `bullet-3` | `bullet-4`, `bullet-5`, `source` |
| `section-divider` | between major sections | `section-number`, `section-title`, `section-blurb` |  |
| `content-3col` | most content | `headline`, `col-title-1`, `col-body-1`, `col-title-2`, `col-body-2`, `col-title-3`, `col-body-3` | `source` |
| `content-2col-image` | content with single visual anchor | `headline`, `body`, `image-caption` | `source` |
| `data-callout` | numeric insights | `headline`, `big-number`, `number-label`, `context-1`, `context-2` | `context-3`, `source` |
| `framework-2x2` | strategic frameworks | `headline`, `x-axis-label`, `y-axis-label`, `q1-label`, `q1-body`, `q2-label`, `q2-body`, `q3-label`, `q3-body`, `q4-label`, `q4-body` | `source` |
| `process-flow` | step sequences | `headline`, `step-title-1`, `step-body-1`, `step-title-2`, `step-body-2`, `step-title-3`, `step-body-3` | `step-title-4`, `step-body-4`, `step-title-5`, `step-body-5`, `source` |
| `comparison-table` | structured comparisons | `headline`, `row-headers`, `col-headers`, `cells` | `source` |
| `closing` | last slide | `call-to-action`, `contact-name`, `contact-email` | `next-steps` |

## Composition Rules

- First slide is always `cover`. Last is always `closing`.
- Second slide (when deck > 3 slides) must be `executive-summary`.
- `data-callout` allowed max 2× consecutive.
- Decks > 8 slides must contain at least one structural slide (`framework-2x2` or `process-flow` or `comparison-table`).
- `section-divider` only appears in decks > 12 slides, separating runs of 4-6 content slides.
- Each `cover` and `section-divider` carries the top signal-bar; no other slide does.
- `closing` carries no signal-bar and uses card ground (white), not page ground.
