# Product-Marketing — Image Style

## AI-Generated (FAL.ai)

Prompt template: `{subject}, abstract product moment, single subject, bold composition, brand color accent, premium aesthetic, no text, no logos, 16:9`

Style modifiers:
- `product-hero`: `abstract UI-as-form, geometric shapes referencing the product category, brand color hero`
- `feature-visual`: `abstract single-feature moment, isolated subject, soft shadow on neutral ground`
- `section-divider-background`: `full-bleed brand color, subtle gradient or noise texture, no objects`

Negative prompt: `stock business photography, smiling diverse team, handshake, generic dashboard, busy collage, illustration with rainbow palette, cartoon, photorealistic people`

## Stock Photography (Unsplash + Pexels federated)

Used sparingly. Product marketing prefers AI-generated or real product mockups.

Search-query template: `{subject} premium minimal modern`

License filter: CC0 / Unsplash-license / Pexels-license only.

## Decision Rules

- `gradient | background | abstract | hero-ground` → AI default
- `product-hero | feature-visual | category-illustration` → AI default
- `person | customer-photo | environment` → ask user (real customer photo preferred when available)
- `device | hardware | physical-product` → ask user

## Brand-Asset-Constraint (engine-enforced)

HIGHEST risk skill for brand-asset misuse. Reject:
- Any company-name reference in image prompts
- "Looks like Apple keynote slide", "inspired by Linear UI" — REJECT (engineer the visual, don't reference)
- Customer logos in image prompts (logo region rendered as blank placeholder)
- Competitor product mockups
- App-store-style icon designs that mimic known apps
