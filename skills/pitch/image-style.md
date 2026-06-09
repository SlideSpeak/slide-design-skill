# Pitch — Image Style

## AI-Generated (FAL.ai)

Prompt template: `{subject}, bold composition, single subject, high contrast, off-white background, no text, no logos, modern minimal aesthetic, 16:9`

Style modifiers:
- Solution-hero: `abstract product-as-hero, geometric forms, single accent color (electric blue) on neutral ground`
- Background: rarely needed — pitches prefer flat color or product screenshot

Negative prompt: `corporate clipart, stock business photography, smiling diverse team, handshake, lightbulb, gear, rocket, target, magnifying glass, illustration with bright colors, cartoonish, low contrast`

## Stock Photography (Unsplash + Pexels federated)

Search-query template: `{subject} minimal modern bold`

Style modifiers:
- Prefer single-subject, high-contrast, modern compositions
- Avoid: stock-business clichés (handshakes, diverse teams, generic office scenes), oversaturated tones, fake-spontaneous laughter

License filter: CC0 / Unsplash-license / Pexels-license only.

## Decision Rules (engine reads these)

- `gradient | background | abstract` → AI default
- `product-hero | hero-illustration` → AI default
- `person | founder-portrait | building | location | object` → ask user
- `chart | data-viz` → AI default (abstract data art, not real chart)

## Brand-Asset-Constraint (engine-enforced)

The pitch skill is HIGH-RISK for accidental brand-asset use because founders want to "look like Stripe" or "feel like Linear". The engine MUST reject:
- Any company-name reference in image prompts
- "Looks like X", "inspired by Y" with named brands
- Product mockups that resemble named SaaS UIs

Use abstract product-shapes, not lookalike interfaces.
