# Operational Excellence — Layout Grammar

## Slide Types

| slide-type | when | family | required slots | optional slots |
|---|---|---|---|---|
| `cover` | first slide | cover | `title`, `subtitle`, `kicker` | `doc-label`, `confidentiality`, `date` |
| `summary` | governing line + six numbered points + core message | cards-grid | `eyebrow`, `action-title`, `p1-title`, `p1-body`, `p2-title`, `p2-body`, `p3-title`, `p3-body`, `p4-title`, `p4-body`, `p5-title`, `p5-body`, `p6-title`, `p6-body`, `takeaway` | `source`, `section` |
| `landscape` | short intro + corporate visual + six headline figures | metric-hero | `eyebrow`, `action-title`, `intro`, `s1-n`, `s1-l`, `s2-n`, `s2-l`, `s3-n`, `s3-l`, `s4-n`, `s4-l`, `s5-n`, `s5-l`, `s6-n`, `s6-l` | `caption`, `source`, `section` |
| `challenges` | five challenge areas, each a band with a short explanation | statement | `eyebrow`, `action-title`, `c1-title`, `c1-body`, `c2-title`, `c2-body`, `c3-title`, `c3-body`, `c4-title`, `c4-body`, `c5-title`, `c5-body` | `source`, `section` |
| `objectives` | eight objectives as a checked grid | cards-grid | `eyebrow`, `action-title`, `o1`, `o1d`, `o2`, `o2d`, `o3`, `o3d`, `o4`, `o4d`, `o5`, `o5d`, `o6`, `o6d`, `o7`, `o7d`, `o8`, `o8d` | `source`, `section` |
| `scope` | five connected workstream pillars on a rail | flow-diagram | `eyebrow`, `action-title`, `w1-no`, `w1-name`, `w1-desc`, `w2-no`, `w2-name`, `w2-desc`, `w3-no`, `w3-name`, `w3-desc`, `w4-no`, `w4-name`, `w4-desc`, `w5-no`, `w5-name`, `w5-desc` | `source`, `section` |
| `workstream` | one workstream: an activity list beside a placeholder visual | image-spread | `eyebrow`, `action-title`, `items`, `caption` | `source`, `section` |
| `performance` | KPI tiles + a bar chart beside an activity list | metric-hero | `eyebrow`, `action-title`, `items`, `k1-v`, `k1-l`, `k2-v`, `k2-l`, `k3-v`, `k3-l`, `chart-title`, `chart-data`, `chart-labels` | `chart-unit`, `chart-highlight`, `source`, `section` |
| `comparison` | current issues vs target state, side by side | comparison | `eyebrow`, `action-title`, `bad-title`, `bad-1`, `bad-2`, `bad-3`, `bad-4`, `bad-5`, `good-title`, `good-1`, `good-2`, `good-3`, `good-4`, `good-5` | `source`, `section` |
| `maturity` | three-column capability table: lever, today, target | table | `eyebrow`, `action-title`, `col-1`, `col-2`, `col-3`, `r1-k`, `r1-a`, `r1-b`, `r2-k`, `r2-a`, `r2-b`, `r3-k`, `r3-a`, `r3-b`, `r4-k`, `r4-a`, `r4-b`, `r5-k`, `r5-a`, `r5-b`, `r6-k`, `r6-a`, `r6-b`, `r7-k`, `r7-a`, `r7-b` | `source`, `section` |
| `architecture` | governance rail + three layered tiers of components | matrix | `eyebrow`, `action-title`, `gov-label`, `gov-value`, `t1-label`, `t1-sub`, `t1-a`, `t1-b`, `t1-c`, `t2-label`, `t2-sub`, `t2-a`, `t2-b`, `t2-c`, `t3-label`, `t3-sub`, `t3-a`, `t3-b`, `t3-c` | `source`, `section` |
| `governance` | six-level hierarchy beside a meeting cadence panel | matrix | `eyebrow`, `action-title`, `l1-name`, `l1-role`, `l2-name`, `l2-role`, `l3-name`, `l3-role`, `l4-name`, `l4-role`, `l5-name`, `l5-role`, `l6-name`, `l6-role`, `cadence-label`, `c1-freq`, `c1-what`, `c2-freq`, `c2-what`, `c3-freq`, `c3-what`, `c4-freq`, `c4-what` | `source`, `section` |
| `roadmap` | three phased columns on a timeline | timeline | `eyebrow`, `action-title`, `p1-no`, `p1-title`, `p1-a`, `p1-b`, `p1-c`, `p1-d`, `p2-no`, `p2-title`, `p2-a`, `p2-b`, `p2-c`, `p2-d`, `p3-no`, `p3-title`, `p3-a`, `p3-b`, `p3-c`, `p3-d` | `source`, `section` |
| `scoring` | candidate sites scored against weighted criteria | table | `eyebrow`, `action-title`, `crit-label`, `site-1`, `site-2`, `site-3`, `site-4`, `r1-c`, `r1-a`, `r1-b`, `r1-c2`, `r1-d`, `r2-c`, `r2-a`, `r2-b`, `r2-c2`, `r2-d`, `r3-c`, `r3-a`, `r3-b`, `r3-c2`, `r3-d`, `r4-c`, `r4-a`, `r4-b`, `r4-c2`, `r4-d`, `r5-c`, `r5-a`, `r5-b`, `r5-c2`, `r5-d`, `r6-c`, `r6-a`, `r6-b`, `r6-c2`, `r6-d`, `r7-c`, `r7-a`, `r7-b`, `r7-c2`, `r7-d`, `total-label`, `t-a`, `t-b`, `t-c`, `t-d` | `source`, `section` |
| `benefits` | three benefit categories, each a card with a list | cards-grid | `eyebrow`, `action-title`, `cat1-title`, `cat1-items`, `cat2-title`, `cat2-items`, `cat3-title`, `cat3-items`, `takeaway` | `source`, `section` |
| `risk` | six risks with likelihood, impact and mitigation | table | `eyebrow`, `action-title`, `col-1`, `col-2`, `col-3`, `col-4`, `r1-risk`, `r1-lk`, `r1-lk-lv`, `r1-im`, `r1-im-lv`, `r1-mit`, `r2-risk`, `r2-lk`, `r2-lk-lv`, `r2-im`, `r2-im-lv`, `r2-mit`, `r3-risk`, `r3-lk`, `r3-lk-lv`, `r3-im`, `r3-im-lv`, `r3-mit`, `r4-risk`, `r4-lk`, `r4-lk-lv`, `r4-im`, `r4-im-lv`, `r4-mit`, `r5-risk`, `r5-lk`, `r5-lk-lv`, `r5-im`, `r5-im-lv`, `r5-mit`, `r6-risk`, `r6-lk`, `r6-lk-lv`, `r6-im`, `r6-im-lv`, `r6-mit` | `source`, `section` |
| `decisions` | seven decisions required, as a checklist | cards-grid | `eyebrow`, `action-title`, `d1-text`, `d1-who`, `d2-text`, `d2-who`, `d3-text`, `d3-who`, `d4-text`, `d4-who`, `d5-text`, `d5-who`, `d6-text`, `d6-who`, `d7-text`, `d7-who`, `forum` | `source`, `section` |
| `closing` | dark closing statement | closing | `closing-line` | `kicker`, `sub`, `doc-label`, `contact`, `date` |

## Composition Rules

- First slide is always `cover`; last is always `closing`.
- Every content title is an action title: a complete-sentence claim, never a topic label. Read in sequence, the titles carry the whole argument.
- The masthead (company square + name + program) rides on every content slide; the cover and closing carry the dark brand band instead.
- Density is a layout choice, never a type size. Vary the register across the deck; type stays readable everywhere.
- One corporate blue accent (`--color-signal`). Severity reds/ambers/greens appear only inside the risk matrix chips. Never a second decorative accent.
- Photography only ever appears as a labelled placeholder frame; the deck never fabricates real factories, products or people.
