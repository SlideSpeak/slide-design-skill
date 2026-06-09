# Neue Klasse — Image Style

Diagram- and data-led. Every exhibit is engine-rendered; content slides carry no photography. A single atmospheric hero may bleed behind the **cover** and **closing** only, supplied per-slide via `bgPrompt`.

## Decision rules

- `gradient` → AI default
- `diagram` → never (engine-rendered)
- `chart` → never (engine-rendered)
- `product` → ask (drop into a placeholder; never AI-fabricate a vehicle)
- `person` → ask
- `building` → ask

## Prompt template

Prompt template: `cinematic architectural photograph, precise and premium, cool neutral palette of graphite, silver and deep blue, a confident automotive form implied by light and reflection rather than shown literally, low key studio lighting, generous negative space, no badges no logos: {subject}`

Negative prompt: warm tones, orange, cluttered, busy, neon, cartoon, illustration, text, logos, badges, brand marks, watermark, people

Search-query template: `{subject} premium automotive graphite blue minimal architectural`

## Rationale

The reference language is graphite-and-blue, engineered and quiet. A hero image bleeds from one edge behind the title without competing with it; everything else is structured data drawn in the system's own hairlines and tricolour accent.
