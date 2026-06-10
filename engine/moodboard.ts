// Moodboard step — the image-first style anchor.
//
// Lesson from the veta A/B experiment (2026-06): giving the generator a
// concrete image to translate produces visibly more coherent, art-directed
// styles than adjectives alone, BUT the image model carries the same
// genre-default bias as the LLM (a "premium chocolate" board comes back
// beige + espresso every time). So the palette rotation must happen UPSTREAM,
// in the moodboard prompt: each board is pushed onto a different
// less-expected colour axis before the image model ever runs.
//
// Pure module. The host renders the prompts through its image provider
// (FalProvider), shows the boards to the user, runs vision over the approved
// board, and feeds the extracted direction back into the generation brief via
// `moodboardDirectionBlock`. No I/O here; deterministic (no randomness, the
// axis walk is seeded by the subject text so the same brief offers the same
// boards on a re-run).

/** Colour axes deliberately OFF the genre defaults every model reaches for. */
export const ROTATION_AXES = [
  "cold luxury: silver, chrome, smoke grey, near-black",
  "deep forest green, bone white, amber",
  "true black and warm tan, high contrast, no beige midtones",
  "cobalt blue and cream",
  "oxide red, plaster white, graphite",
  "ink navy and citron yellow",
  "aubergine, oat, brushed brass",
  "slate blue, raw linen, vermillion accents",
] as const;

const FRAMINGS = [
  "art directed design moodboard flat lay, top-down studio photography, paper and fabric swatches, colour chip cards, material samples, typography specimen cards, restrained composition on a neutral table, soft directional light",
  "editorial brand mood collage pinned to a studio wall, printed ephemera, ink drawdowns, foil stamped paper samples, photographed straight on, gallery lighting",
] as const;

/** Subject-seeded but deterministic: same brief → same boards across runs. */
function seedFrom(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface MoodboardPrompt {
  axis: string;
  prompt: string;
}

/**
 * Compose N moodboard prompts for a brief subject, each rotated onto a
 * DIFFERENT unexpected colour axis. `subject` is the world the deck lives in
 * ("a specialty single-origin chocolate maker"), not the deck topic sentence.
 */
export function composeMoodboardPrompts(
  subject: string,
  count = 2,
): MoodboardPrompt[] {
  const seed = seedFrom(subject);
  const n = Math.max(1, Math.min(count, ROTATION_AXES.length));
  const out: MoodboardPrompt[] = [];
  for (let i = 0; i < n; i++) {
    const axis = ROTATION_AXES[(seed + i * 3) % ROTATION_AXES.length];
    const framing = FRAMINGS[(seed + i) % FRAMINGS.length];
    out.push({
      axis,
      prompt:
        `${framing}, for ${subject}, colour world strictly ${axis}, ` +
        `muted unexpected palette, no legible text, no logos, no people`,
    });
  }
  return out;
}

export interface MoodboardDirection {
  /** Approximate hexes read off the approved board, with roles if known. */
  palette: string[];
  /** Typography mood in words ("letterpress specimen cards, typewriter labels"). */
  typeMood: string;
  /** The material world the board depicts. */
  world: string;
  /** Layout instinct the board suggests ("pinned specimen grids, calm ground"). */
  layoutInstinct?: string;
}

/**
 * Format an approved board's extracted direction as brief text for the
 * skill generator. A brief that names colours is followed (it outranks the
 * banned-default-palette rule), so this block makes the approval binding.
 */
export function moodboardDirectionBlock(d: MoodboardDirection): string {
  const lines = [
    "THE CLIENT APPROVED A MOODBOARD. Its extracted style direction is the brief's look; honor it concretely:",
    `- Palette: ${d.palette.join(", ")}`,
    `- Typography mood: ${d.typeMood}`,
    `- World: ${d.world}`,
  ];
  if (d.layoutInstinct) lines.push(`- Layout instinct: ${d.layoutInstinct}`);
  return lines.join("\n");
}
