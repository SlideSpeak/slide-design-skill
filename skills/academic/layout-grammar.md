# Academic — Layout Grammar

## Slide Types

| slide-type | when | required slots | optional slots |
|---|---|---|---|
| `title` | first slide | `paper-title`, `authors`, `affiliation`, `venue`, `date` | `doi` |
| `motivation` | second slide | `headline`, `body`, `citation-1` | `citation-2`, `citation-3` |
| `research-question` | third slide | `headline`, `question`, `sub-question-1`, `sub-question-2` | `sub-question-3` |
| `prior-work` | literature review | `headline`, `entry-1-citation`, `entry-1-blurb`, `entry-2-citation`, `entry-2-blurb`, `entry-3-citation`, `entry-3-blurb` | `entry-4-citation`, `entry-4-blurb` |
| `method` | methodology | `headline`, `diagram-caption`, `step-1`, `step-2`, `step-3`, `step-4` | `step-5` |
| `data` | sample/dataset description | `headline`, `dataset-name`, `n-value`, `n-label`, `source`, `period` | `notes` |
| `result-figure` | one finding with figure | `headline`, `finding`, `figure-caption`, `source` | `n-note` |
| `result-table` | one finding with table | `headline`, `finding`, `table-headers`, `table-rows`, `source` |  |
| `discussion` | implications | `headline`, `implication-1`, `implication-2`, `limitation-1`, `limitation-2` | `future-work` |
| `conclusion` | 3 takeaways | `headline`, `takeaway-1`, `takeaway-2`, `takeaway-3` |  |
| `references` | full bibliography | `headline`, `ref-list` |  |
| `qa` | closing/contact | `headline`, `contact-name`, `contact-email` | `paper-url`, `code-url` |

## Composition Rules

- First slide is always `title`. Last is always `qa`.
- `references` slide appears between `conclusion` and `qa`.
- Every `result-figure` and `result-table` must have a `source` slot filled.
- Conference talks (slideCount ≤ 12) skip `prior-work` and merge `discussion`+`conclusion` into one slide.
- Thesis defenses (slideCount ≥ 25) duplicate `prior-work` and `result-figure` types.
- No `result-figure` or `result-table` slide may use the `signal` color in its figure beyond the highlighted-finding element.
