# Product-Marketing — Layout Grammar

## Slide Types

| slide-type | when | required slots | optional slots |
|---|---|---|---|
| `cover` | first slide | `product-name`, `positioning-line`, `launch-date` | `company-name` |
| `status-quo` | second slide | `headline`, `body` | `subhead` |
| `the-shift` | third slide | `headline`, `body`, `evidence` | `chart-caption` |
| `product-intro` | fourth slide | `product-name`, `benefit-headline`, `hero-caption` |  |
| `feature` | one per feature | `eyebrow`, `headline`, `body`, `image-caption` | `metric` |
| `customer-proof` | social proof | `quote`, `attribution-name`, `attribution-role`, `metric-value`, `metric-label` |  |
| `pricing` | tiers | `headline`, `tier-1-name`, `tier-1-price`, `tier-1-feature-1`, `tier-1-feature-2`, `tier-1-feature-3`, `tier-2-name`, `tier-2-price`, `tier-2-feature-1`, `tier-2-feature-2`, `tier-2-feature-3`, `tier-3-name`, `tier-3-price`, `tier-3-feature-1`, `tier-3-feature-2`, `tier-3-feature-3` |  |
| `availability` | when/where | `headline`, `launch-date`, `region-list`, `early-access-cta` |  |
| `cta` | last slide | `headline`, `action-label`, `action-url` | `secondary-action` |

## Composition Rules

- First slide is always `cover` with hero color full-bleed. Last is `cta` with hero color full-bleed.
- Body slides use white ground, hero color only as accent.
- Maximum 5 `feature` slides per deck. If you need more, group them into 2-feature comparison slides.
- `customer-proof` appears after the last `feature`, before `pricing`.
- `pricing` and `availability` may be combined when deck is short (≤ 10 slides).
- ONE hero color per deck. Never two. Never gradients between two colors.
