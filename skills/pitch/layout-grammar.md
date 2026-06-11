# Pitch — Layout Grammar

## Slide Types

| slide-type | when | required slots | optional slots |
|---|---|---|---|
| `cover` | first slide | `company-name`, `tagline`, `date` | `round` |
| `problem` | second slide | `headline`, `persona` | `subhead` |
| `market` | TAM/SAM/SOM | `headline`, `tam-value`, `tam-label`, `sam-value`, `sam-label`, `som-value`, `som-label` | `source` |
| `solution` | hero product | `headline`, `body`, `feature-1`, `feature-2`, `feature-3` | `image-caption` |
| `why-now` | timing argument | `headline`, `body`, `trend-line` | `source` |
| `traction` | metrics + chart | `headline`, `metric-1-value`, `metric-1-label`, `metric-2-value`, `metric-2-label`, `metric-3-value`, `metric-3-label` | `chart-caption`, `source` |
| `business-model` | pricing | `headline`, `tier-1-name`, `tier-1-price`, `tier-1-blurb`, `tier-2-name`, `tier-2-price`, `tier-2-blurb`, `tier-3-name`, `tier-3-price`, `tier-3-blurb` |  |
| `gtm` | go-to-market | `headline`, `channel-1-name`, `channel-1-body`, `channel-2-name`, `channel-2-body`, `channel-3-name`, `channel-3-body` |  |
| `customers` | logo wall / social proof | `headline` | `customer-names`, `caption` |
| `team` | founders | `headline`, `founder-1-name`, `founder-1-role`, `founder-1-cred-1`, `founder-1-cred-2`, `founder-1-cred-3`, `founder-2-name`, `founder-2-role`, `founder-2-cred-1`, `founder-2-cred-2`, `founder-2-cred-3` | `founder-3-name`, `founder-3-role`, `founder-3-cred-1`, `founder-3-cred-2`, `founder-3-cred-3` |
| `competition` | 2x2 or matrix | `headline`, `x-axis-label`, `y-axis-label`, `us-label`, `competitor-1-label`, `competitor-2-label`, `competitor-3-label` |  |
| `ask` | the close | `headline`, `ask-amount`, `use-1`, `use-2`, `use-3`, `contact-name`, `contact-email` | `runway-months` |

## Composition Rules

- First slide is always `cover`. Last is always `ask`.
- Canonical arc: cover → problem → market → solution → why-now → traction → business-model → gtm → team → competition → ask.
- Skip slides if data is missing — never fake content. Common skips: `why-now`, `competition`.
- `solution` slide is the only slide that may use a full-bleed hero image.
- `cover` and `ask` carry the accent-color wordmark; no other slide does.
- No `data-callout`-style giant numbers except on `traction` and `market` slides.
