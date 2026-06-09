# Academic — Image Style

## AI-Generated (FAL.ai)

Used very sparingly. Academic decks prefer real figures over generated ones.

Prompt template: `{subject}, scientific diagram, restrained palette, two-tone ink-and-teal, line art, no text labels, white background, publication-quality`

Style modifiers (only when explicitly requested by user):
- `data-viz-background`: `abstract grid of data points, monochrome, low contrast, behind-text aesthetic`
- `concept-diagram`: `simple line diagram, no fills, no shadows, mechanical-drawing style`

Negative prompt: `photograph, photorealistic, glossy, colorful, decorative, infographic-style, 3d render, illustration with bright colors`

## Stock Photography (Unsplash + Pexels federated)

Used only when the photo IS the evidence (microscopy, fieldwork, archival, artifact).

Search-query template: `{subject}`

Style modifiers: NONE — academic context demands neutrality. Don't bias retrieval.

License filter: CC0 only (CC-BY-only papers risk attribution issues in PowerPoint export).

## Decision Rules (engine reads these)

- `gradient | background` → AI default (rarely used)
- `diagram | concept | mechanism` → AI default
- `microscopy | specimen | artifact | field-photo` → stock (search) default
- `person | location` → ask user (usually NOT included in academic decks)

## Brand-Asset-Constraint (engine-enforced)

Academic decks are mostly safe here, but reject:
- University logos in image prompts (use plain affiliation text instead)
- Journal/publisher logos
- Lab logos
- Anything that competes with the cite-by-text convention
