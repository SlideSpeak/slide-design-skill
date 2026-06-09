# Neue Klasse — Layout Grammar

## Slide Types

| slide-type | when | family | required slots | optional slots |
|---|---|---|---|---|
| `cover` | first slide | cover | `title`, `subtitle`, `kicker` | `doc-label`, `confidentiality`, `date` |
| `executive-summary` | governing line + four numbered points + recommendation | cards-grid | `eyebrow`, `action-title`, `p1-title`, `p1-body`, `p2-title`, `p2-body`, `p3-title`, `p3-body`, `p4-title`, `p4-body`, `conclusion` | `source`, `section` |
| `market-shift` | five before→after contrasts | comparison | `eyebrow`, `action-title`, `from-label`, `to-label`, `r1-from`, `r1-to`, `r2-from`, `r2-to`, `r3-from`, `r3-to`, `r4-from`, `r4-to`, `r5-from`, `r5-to` | `source`, `section` |
| `expectations` | five dimensions, each a column of items | cards-grid | `eyebrow`, `action-title`, `d1-title`, `d1-items`, `d2-title`, `d2-items`, `d3-title`, `d3-items`, `d4-title`, `d4-items`, `d5-title`, `d5-items` | `source`, `section` |
| `fragmentation` | a single journey strip with visible seams | flow-diagram | `eyebrow`, `action-title`, `intro`, `s1`, `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`, `s10`, `s11`, `note` | `source`, `section` |
| `principles` | six numbered operating principles | cards-grid | `eyebrow`, `action-title`, `p1-title`, `p1-body`, `p2-title`, `p2-body`, `p3-title`, `p3-body`, `p4-title`, `p4-body`, `p5-title`, `p5-body`, `p6-title`, `p6-body` | `source`, `section` |
| `architecture` | customer hub with nine coordinated layers | matrix | `eyebrow`, `action-title`, `hub-label`, `hub-value`, `l1`, `l2`, `l3`, `l4`, `l5`, `l6`, `l7`, `l8`, `l9`, `note` | `source`, `section` |
| `journey-map` | phased journey table: stage, touchpoint, customer question | table | `eyebrow`, `action-title`, `intro`, `col-1`, `col-2`, `col-3`, `col-4`, `r1-day`, `r1-stage`, `r1-touch`, `r1-q`, `r2-day`, `r2-stage`, `r2-touch`, `r2-q`, `r3-day`, `r3-stage`, `r3-touch`, `r3-q`, `r4-day`, `r4-stage`, `r4-touch`, `r4-q`, `r5-day`, `r5-stage`, `r5-touch`, `r5-q`, `r6-day`, `r6-stage`, `r6-touch`, `r6-q` | `source`, `section` |
| `comparison` | fragmented vs integrated, side by side | comparison | `eyebrow`, `action-title`, `bad-title`, `bad-1`, `bad-2`, `bad-3`, `bad-4`, `bad-5`, `good-title`, `good-1`, `good-2`, `good-3`, `good-4`, `good-5` | `source`, `section` |
| `spectrum` | personalization levels + useful vs overload | flow-diagram | `eyebrow`, `action-title`, `levels-label`, `lv1`, `lv2`, `lv3`, `lv4`, `lv5`, `lv6`, `lv7`, `lv8`, `useful-title`, `useful-body`, `over-title`, `over-body` | `source`, `section` |
| `benefit-table` | lever × customer benefit × business benefit | table | `eyebrow`, `action-title`, `col-1`, `col-2`, `col-3`, `r1-lever`, `r1-cust`, `r1-biz`, `r2-lever`, `r2-cust`, `r2-biz`, `r3-lever`, `r3-cust`, `r3-biz`, `r4-lever`, `r4-cust`, `r4-biz`, `r5-lever`, `r5-cust`, `r5-biz`, `r6-lever`, `r6-cust`, `r6-biz` | `source`, `section` |
| `matrix` | 2×2 prioritization plot with criteria legend | matrix | `eyebrow`, `action-title`, `points`, `highlight`, `x-axis`, `y-axis`, `c1-title`, `c1-1`, `c1-2`, `c1-3`, `c2-title`, `c2-1`, `c2-2`, `c3-title`, `c3-body` | `source`, `section` |
| `focus` | three connected priority initiatives | cards-grid | `eyebrow`, `action-title`, `i1-name`, `i1-role`, `i1-body`, `i2-name`, `i2-role`, `i2-body`, `i3-name`, `i3-role`, `i3-body`, `reinforce` | `source`, `section` |
| `operating-model` | contributor grid + numbered recommendations | cards-grid | `eyebrow`, `action-title`, `contrib-label`, `f1`, `f2`, `f3`, `f4`, `f5`, `f6`, `f7`, `f8`, `recos-label`, `rec1`, `rec2`, `rec3`, `rec4`, `rec5` | `source`, `section` |
| `roadmap` | four phased columns on a timeline | timeline | `eyebrow`, `action-title`, `p1-no`, `p1-title`, `p1-a`, `p1-b`, `p1-c`, `p1-d`, `p2-no`, `p2-title`, `p2-a`, `p2-b`, `p2-c`, `p2-d`, `p3-no`, `p3-title`, `p3-a`, `p3-b`, `p3-c`, `p3-d`, `p4-no`, `p4-title`, `p4-a`, `p4-b`, `p4-c`, `p4-d` | `source`, `section` |
| `closing` | dark closing statement | closing | `closing-line` | `kicker`, `sub`, `doc-label`, `contact` |

## Composition Rules

- First slide is always `cover`; last is always `closing`.
- Every content title is an action title: a full-sentence conclusion, never a topic label. Read in sequence, the titles carry the whole argument.
- The motorsport tricolour mark rides in every masthead and marks section numerals, key data points and timeline nodes. It never becomes decoration.
- Density is a layout choice, never a type size. Vary the register across the deck; type stays readable everywhere.
- The single BMW blue accent marks the highlighted matrix point, numerals and key markers. Red appears only inside the tricolour mark and on the seam markers of the fragmentation strip.
- `cover` and `closing` carry no footer band or page number; every content slide carries a source line.
