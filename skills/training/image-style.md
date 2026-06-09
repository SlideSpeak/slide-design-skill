# Training — Image Style

## AI-Generated (FAL.ai)

Prompt template: `{subject}, hand-sketched illustration style, warm friendly tone, two-tone teal-and-warm-white, no text labels, instructional diagram aesthetic, 16:9`

Style modifiers:
- `concept-diagram`: `flat illustration, sketch-like, no shadows, minimal color palette, didactic clarity`
- `exercise-visual`: `friendly icon-style, clear action visualization, single subject, accent color allowed`

Negative prompt: `corporate stock photography, generic business imagery, smiling stock people, complex 3d render, photorealistic, dark moody, oversaturated`

## Stock Photography (Unsplash + Pexels federated)

Search-query template: `{subject} natural warm friendly`

Style modifiers:
- Prefer real moments, natural light, diverse but unforced
- Avoid: corporate stock clichés, formal business attire, fluorescent lighting

License filter: CC0 / Unsplash-license / Pexels-license only.

## Decision Rules

- `gradient | background | abstract` → AI default
- `concept-diagram | flow | process | mechanism` → AI default
- `person | classroom | workshop-scene | hands-on` → ask user (real photo preferred for trust-building)
- `tool | device | object` → ask user

## Brand-Asset-Constraint (engine-enforced)

Reject:
- Logos of training platforms (LMS, Notion, Coursera, etc.) in image prompts
- Tool-brand mockups that mimic specific products
- Workshop-organizer logos (use plain wordmark in text instead)
