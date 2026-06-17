import type { DensityTier } from "./density.ts";
import type { CompositionFamily, VisualRole } from "./composition-families.ts";

export type Hex = `#${string}`;

export interface SkillFrontmatter {
  name: string;
  version: string;
  description: string;
  inspiration: string;
  typography_kit: string;
  color_kit: string;
  image_style: string;
  forbidden: string;
}

export interface Tokens {
  color: {
    ground: { page: Hex; card: Hex; ink: Hex };
    signal: { primary: Hex; subtle: Hex };
    support: { muted: Hex; rule: Hex };
  };
  type: {
    header: { family: string; weight: number; scale: number[] };
    body: { family: string; weight: number; scale: number[] };
    data: { family: string; weight: number };
  };
  spacing: { unit: number; scale: number[] };
  radius: { card: number; button: number; input: number };
  elevation: { card: string };
  page: { ratio: string; width: number; height: number; safe: number };
  // Optional icon kit selection. The {{@icon}} directive renders from this kit
  // (lucide | tabler | heroicons | phosphor); names a kit lacks fall back to
  // lucide. Defaults to lucide when omitted. Chosen per brief to match the vibe.
  icon?: { kit?: string };
}

export interface SlideTypeSpec {
  name: string;
  when: string;
  requiredSlots: string[];
  optionalSlots: string[];
  /**
   * Composition family — the visual archetype this type renders as (see
   * engine/composition-families.ts). Optional for back-compat with grammars
   * authored before the family column; undefined when the grammar omits it.
   */
  family?: CompositionFamily;
  /**
   * Visual roles this type's template is expected to realize (see VISUAL_ROLES in
   * composition-families.ts). Optional; parsed from a `visual roles` grammar
   * column. Steers the planner toward realizing visuals; absent on legacy grammars.
   */
  visualRoles?: VisualRole[];
}

export interface LayoutGrammar {
  slideTypes: SlideTypeSpec[];
  rules: string[];
}

export interface ImageStyle {
  aiPromptTemplate: string;
  aiStyleModifiers: string[];
  aiNegativePrompt: string[];
  stockQueryTemplate: string;
  stockStyleModifiers: string[];
  decisionRules: Record<string, "ai" | "stock" | "ask">;
  // Optional deliberate stylistic abstraction applied to every AI image
  // (pixel-art, oil-painting, halftone, blueprint, …). Empty/"photographic" =
  // literal photography. See engine/image-treatments.ts.
  treatment?: string;
}

export interface Skill {
  frontmatter: SkillFrontmatter;
  systemPromptBody: string;
  tokens: Tokens;
  grammar: LayoutGrammar;
  imageStyle: ImageStyle;
  components: string;
  // Optional per-skill chrome CSS, emitted after the neutral baseSlideCss so it
  // owns the *look* (eyebrow, source footer, signal bar, table styling, flow
  // rhythm, heading line-height). Empty string when the skill ships no chrome.css.
  chrome: string;
  examples: { name: string; html: string }[];
  rootDir: string;
  // preset name → data-URI of a baked gradient image. When set, the
  // {{@gradient-bg preset=…}} directive renders an <img> instead of the
  // procedural SVG fallback.
  cachedGradients: Record<string, string>;
}

export interface ImageRequest {
  subject: string;
  category: keyof ImageStyle["decisionRules"] | string;
  width?: number;
  height?: number;
}

export interface ResolvedImage {
  url: string;
  source: "fal" | "unsplash" | "pexels";
  attribution?: string;
  width: number;
  height: number;
  // True when this result was served from the disk cache (no provider/API call
  // was made). Lets the spend counter exclude cache hits from the FAL tally.
  cached?: boolean;
}

export interface SlideTreeNode {
  type: string;
  slots: Record<string, string>;
  images?: ImageRequest[];
  // Per-slide AI background prompt. When set, the engine generates a unique
  // gradient/atmosphere image at render-time via BackgroundGenerator and
  // injects the resulting data-URI into slots["bg-image"] before rendering.
  bgPrompt?: string;
  // Per-slide content density. Orthogonal to the skill's visual language —
  // steers how much the slide carries and, via a data-density attribute on the
  // slide root, how the layout breathes. Varies within a single deck.
  density?: DensityTier;
}

// Pluggable background generator. Implementations: FalBackgroundProvider, or
// pre-baked filesystem provider. Returns a data-URI ready for inlining.
export interface BackgroundGenerator {
  generate(
    prompt: string,
    width: number,
    height: number,
    opts?: { negative?: string; referenceImages?: string[] },
  ): Promise<string>;
}

export interface GenerateDeckArgs {
  skillName: string;
  userPrompt: string;
  slideCount: number;
  imageBudget?: number;
  /**
   * Hard ceiling on total FAL image-generation calls for this deck (backgrounds +
   * FAL-resolved inline images combined). Bounds credit spend. Resolution order:
   * arg > env SLIDESPEAK_MAX_FAL_CALLS > 30 (generous: covers any normal deck).
   * When reached, further AI imagery is skipped with a warning and slides fall
   * back to their procedural background / no inline image.
   */
  maxFalCalls?: number;
  language?: string;
  /** Deck is explicitly sample/illustrative content — skips the fake-precise-number lint. */
  illustrative?: boolean;
  /** Strict production mode: validation warnings (lint errors, missing slots, composition) become fatal. */
  strict?: boolean;
}

export interface GenerateDeckResult {
  slides: { type: string; html: string }[];
  imagesUsed: number;
  /** Total FAL image-generation calls made (backgrounds + FAL-sourced inline). Always <= maxFalCalls. */
  falCallsUsed: number;
  warnings: string[];
  /** The design read the engine derived for this brief (presentation type, audience, register, …). */
  read?: import("./deck-plan.ts").DesignRead;
  /** Human-readable rationale for the derived plan. */
  planRationale?: string;
  /**
   * Whether the DOM-level legibility/occupancy/richness gates ran inside this call.
   * Always false: those gates operate on rendered HTML and live in the render/export
   * scripts (render-fixture / render-fal-runtime via measure-occupancy). A caller that
   * only sees `validation ok` must NOT assume the deck is legible/full — wire the
   * render+measure step (or use the export scripts) for that guarantee.
   */
  domGatesRun: boolean;
}
