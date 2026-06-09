# Consulting — Image Style

## AI-Generated (FAL.ai)

Prompt template: `{subject}, muted documentary photography, neutral palette, soft natural light, slight film grain, editorial composition, no text, no logos, no recognizable products, 3:2 aspect`

Style modifiers to layer in by context:
- Backgrounds: `abstract gradient on warm gray, subtle paper texture, no objects`
- Cover hero: `architectural interior, neutral materials, long exposure, no people`
- Data backgrounds: `monochrome data visualization texture, abstract grid, low contrast`

Negative prompt: `bright saturated colors, cartoon, illustration, vector, 3d render, glossy plastic, stock-photo aesthetic, smiling people, hands shaking, magnifying glass, lightbulb, gear icon, business cliche`

## Stock Photography (Unsplash + Pexels federated)

Search-query template: `{subject} editorial muted documentary`

Style modifiers:
- Prefer landscape orientation, neutral light
- Avoid: stock-business clichés (handshakes, headsets, jumping people, charts on laptop screens), oversaturated tones, anything with visible brand-marks

License filter: CC0 / Unsplash-license / Pexels-license only.

## Decision Rules (engine reads these)

- `gradient | background | abstract | texture` → AI default (no user prompt)
- `architecture | interior | landscape | nature` → AI default
- `person | product | building | location | object` → ask user "AI-generated or stock photo?"
- `concept | scene | situation` → ask user

## Brand-Asset-Constraint (reminder, engine-enforced)

Never include in any image prompt or stock query:
- Company names, brand names, product names
- Words: logo, trademark, brand-mark, wordmark
- Visible buildings of named companies (Apple Park, Googleplex)
- Identifiable products (iPhone, Tesla, etc.)
