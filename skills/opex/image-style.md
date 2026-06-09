# Operational Excellence — Image Style

Diagram- and data-led. Every exhibit (chart, table, matrix, hierarchy, timeline, stat grid) is engine-rendered in the deck's own hairlines and navy accent. Content slides carry no photography as a rendered image; business imagery is shown as a labelled placeholder frame, never fabricated.

## Decision rules

- `diagram` → ask (engine-rendered; never AI-fabricate)
- `chart` → ask (engine-rendered)
- `table` → ask (engine-rendered)
- `product` → ask (drop into a labelled placeholder; never fabricate)
- `person` → ask
- `building` → ask
- `factory` | `logistics` | `office` | `production line` → ask

## Prompt template

Prompt template: `do not generate; insert approved corporate photography into a labelled placeholder frame for: {subject}`

Negative prompt: invented factories, invented products, invented people, fabricated logos, watermark

Search-query template: `{subject} industrial operations corporate documentary navy neutral`

## Placeholder, not generation

Business imagery the brief asks for (a factory, a production line, a logistics yard, an office, a workshop, a meeting, a dashboard photo) is shown as a labelled placeholder frame in the deck's own colours, captioned with what belongs there (e.g. "Process mapping workshop"). This is deliberate: a real internal deck slots in approved corporate photography, and the system must never invent a plant, a product or a person. Every decision verdict resolves to `ask` so a human supplies the real asset.

## Rationale

The reference language is the internal steering-committee template: structured, ruled, navy-and-grey, full of tables and diagrams. Photography is supporting and supplied by the organisation, so it is represented as an explicit empty frame and the verdict is always to ask rather than to generate.
