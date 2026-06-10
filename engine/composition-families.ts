/**
 * Composition families — the visual ARCHETYPE of a slide, independent of its
 * slide-type NAME. Two differently-named slide types ("market", "team") can share
 * one family (both "cards-grid"). Monotony is a family problem, not a type problem:
 * a deck of 14 distinctly-named types that are all `cards-grid` looks like one slide
 * repeated. The engine reasons about variety and float at the FAMILY level.
 *
 * Kept deliberately small so it constrains without strangling bespoke design.
 */

export const COMPOSITION_FAMILIES = [
  "cover", // the opening slide — its own distinct hero anchor
  "statement", // one big idea / full-bleed sentence, little else
  "metric-hero", // a single dominant number or stat carries the slide
  "quote", // an attributed quotation as the primary object
  "flow-diagram", // a process / sequence with directional connection (steps, loop)
  "comparison", // two sides held against each other (this vs that, before/after)
  "timeline", // events along an axis of time
  "matrix", // a 2-axis grid / quadrant / framework
  "image-spread", // a photograph or visual is the protagonist
  "split-visual", // imagery and structured content share the slide (photo column, inset figure, stat over image)
  "cards-grid", // N peer items in a grid or column list (the default trap)
  "table", // a dense tabular dataset
  "closing", // the close / CTA / ask
] as const;

export type CompositionFamily = (typeof COMPOSITION_FAMILIES)[number];

const FAMILY_SET = new Set<string>(COMPOSITION_FAMILIES);

/** One-line intent per family, used in generator + authoring prompts. */
export const FAMILY_INTENT: Record<CompositionFamily, string> = {
  cover: "opening slide with a distinct hero anchor",
  statement: "a single big idea, full-bleed, almost nothing else",
  "metric-hero": "one dominant number or stat as the whole slide",
  quote: "an attributed quotation as the primary object",
  "flow-diagram": "a process or sequence with directional connection",
  comparison: "two sides held against each other",
  timeline: "events arranged along an axis of time",
  matrix: "a two-axis grid, quadrant, or framework",
  "image-spread": "a photograph or visual is the protagonist",
  "split-visual": "imagery integrated INTO a structured layout: a photo column beside the argument, an inset figure, a stat set over an image",
  "cards-grid": "N peer items in a grid or list (use sparingly)",
  table: "a dense tabular dataset",
  closing: "the close, CTA, or ask",
};

/** The family every new generation over-uses; capped hardest downstream. */
export const DEFAULT_TRAP_FAMILY: CompositionFamily = "cards-grid";

/**
 * Perceptual registers — the axis the eye actually reads. A deck whose content
 * slides are all BOXED surfaces (cards, tables, frameworks) reads as one
 * texture regardless of how diversely the families are named; unboxed
 * typographic slides and integrated visuals are what break the texture.
 */
export const BOXED_FAMILIES: readonly CompositionFamily[] = ["cards-grid", "table", "matrix"];
export const UNBOXED_FAMILIES: readonly CompositionFamily[] = ["statement", "metric-hero", "quote"];
export const VISUAL_FAMILIES: readonly CompositionFamily[] = ["image-spread", "split-visual"];

export function isCompositionFamily(v: unknown): v is CompositionFamily {
  return typeof v === "string" && FAMILY_SET.has(v);
}

/** Coerce a free-text family cell to a known family, or undefined if unknown. */
export function normalizeFamily(v: unknown): CompositionFamily | undefined {
  if (typeof v !== "string") return undefined;
  const k = v.trim().toLowerCase().replace(/`/g, "").replace(/\s+/g, "-");
  return isCompositionFamily(k) ? k : undefined;
}
