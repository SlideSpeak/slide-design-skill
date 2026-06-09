// Content density — the orthogonal axis to design-language.
//
// A skill defines a *presentation type's* visual language (consulting, editorial,
// pitch …). Density is independent of that: it is how much information a single
// slide carries, and it varies PER SLIDE within one deck.
//
// Density is a LAYOUT CHOICE, never a scale knob. It does NOT shrink type to fit
// more in. Type stays readable at all times. A denser slide uses a layout built
// to carry more (columns, a stat grid, a matrix, small-multiples) — each of which
// is designed to look good at readable sizes. If content exceeds what a layout
// holds well, the answer is a richer layout or another slide, never smaller text.
//
// This model is type-agnostic. Each skill translates a tier into its own register
// by offering layouts (slide-types) appropriate to that tier.

export type DensityTier = "editorial" | "balanced" | "data-dense";

export const DENSITY_TIERS: readonly DensityTier[] = [
  "editorial",
  "balanced",
  "data-dense",
] as const;

export const DEFAULT_DENSITY: DensityTier = "balanced";

export interface DensitySpec {
  tier: DensityTier;
  /** Human-facing intent, used in the LLM instruction. */
  intent: string;
  /** What kind of layout this tier calls for. */
  layout: string;
  /** Whether charts/tables/exhibits belong at this density. */
  exhibits: "avoid" | "one" | "encouraged";
}

export const DENSITY: Record<DensityTier, DensitySpec> = {
  editorial: {
    tier: "editorial",
    intent:
      "One governing idea carries the slide. Maximum air, large type, nothing competing.",
    layout:
      "a single-focus layout: a statement, one big number, a cover, or a section opener",
    exhibits: "avoid",
  },
  balanced: {
    tier: "balanced",
    intent:
      "The workhorse slide: a claim plus the one thing that supports it, with the so-what called out.",
    layout:
      "a claim + one primary element layout: one chart, one short body, or one compact list with an insight",
    exhibits: "one",
  },
  "data-dense": {
    tier: "data-dense",
    intent:
      "Maximum information, still readable. Multiple structured zones, organized — not a wall of shrunken text.",
    layout:
      "a multi-zone layout built for volume: multi-column body, a stat grid, a matrix/heatmap, small-multiples, or a comparison table — type stays readable",
    exhibits: "encouraged",
  },
};

/** Coerce any LLM-supplied value to a valid tier, or undefined if absent. */
export function normalizeDensity(v: unknown): DensityTier | undefined {
  if (typeof v !== "string") return undefined;
  const k = v.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (DENSITY_TIERS as readonly string[]).includes(k)
    ? (k as DensityTier)
    : undefined;
}

/** The DENSITY instruction block injected into the system prompt. */
export function densityPromptBlock(): string {
  const tiers = DENSITY_TIERS.map((t) => {
    const d = DENSITY[t];
    return `- ${t}: ${d.intent} Calls for ${d.layout}. Exhibits: ${d.exhibits}.`;
  }).join("\n");
  return `
CONTENT DENSITY (per slide — varies within the deck)
Every slide carries a "density" field (sibling to "type" and "slots") set to one of: ${DENSITY_TIERS.join(", ")}.
Density is HOW MUCH a slide carries, expressed by CHOOSING THE LAYOUT (slide-type) that fits — never by shrinking type. It MUST vary across the deck: a dense multi-zone slide next to a breathing statement is the point.
${tiers}
Pick the slide-type whose layout matches the density you want, then write content that fills that layout at a readable size without overflowing. If you have more than a layout holds well, use a richer layout or split across slides — do not cram. Choose density from the slide's job, and do not make every slide the same.
`;
}
