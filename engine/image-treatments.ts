// Deliberate stylistic abstractions a skill can apply to EVERY AI image, chosen
// to match the vibe instead of always rendering literal photography. A skill
// declares one via `Treatment: <name>` in image-style.md.
//
// IMPORTANT (learned the hard way): FLUX is photoreal-biased and IGNORES a style
// appended as a suffix ("a lighthouse, rendered as pixel art" → just a photo).
// The style must LEAD and the photographic framing must be removed, or the two
// fight and photorealism wins. So a treatment PREPENDS a strong medium lead and
// we strip photo-medium words ("photograph", "35mm film", …) from the rest.
//
// Two kinds of treatment, by what actually works:
//   kind: "prompt"      — PAINTING/PRINT mediums FLUX renders well. A strong
//                         medium lead dominates the prompt; photo words stripped.
//   kind: "postprocess" — DIGITAL-GRAPHIC styles FLUX is too photoreal-biased to
//                         render (pixel-art, halftone, ascii, blueprint). FLUX
//                         makes a clean photo; a deterministic PIL filter
//                         (scripts/image-filters.py) transforms it afterwards.
//                         The `filter` name maps to that script.
//
// All are render-verified. No treatment = default no-op (skill's photo framing +
// a light realism steer). The point is variety: pick the medium the world calls
// for, and do NOT reach for the same one every time — most decks stay photographic.

export interface ImageTreatment {
  kind: "prompt" | "postprocess";
  // prompt kind: strong medium framing, prepended so it dominates.
  lead?: string;
  // postprocess kind: filter name in scripts/image-filters.py.
  filter?: string;
  // Negative-prompt terms to remove when active (a painting treatment must not
  // ban "oil paint", a risograph must not ban "halftone pattern").
  allow: string[];
}

export const IMAGE_TREATMENTS: Record<string, ImageTreatment> = {
  // ── painting / print: rendered by FLUX via prompt ──────────────────────────
  "oil-painting": {
    kind: "prompt",
    lead:
      "an expressive textured oil painting, thick visible brushstrokes, rich impasto, canvas weave, painterly, of",
    allow: ["painterly", "oil paint", "watercolor", "cgi", "3d render", "illustration"],
  },
  renaissance: {
    kind: "prompt",
    lead:
      "a Renaissance old-master oil painting, dramatic chiaroscuro lighting, classical composition, aged varnish, painterly, of",
    allow: ["painterly", "oil paint", "watercolor", "illustration"],
  },
  watercolor: {
    kind: "prompt",
    lead:
      "a loose watercolor painting, soft bleeding washes of pigment, visible paper grain, gentle gradients, of",
    allow: ["painterly", "oil paint", "watercolor", "flat gradient", "illustration"],
  },
  risograph: {
    kind: "prompt",
    lead:
      "a two-colour risograph print, grainy overlapping ink layers, pink and blue, visible misregistration, matte paper, of",
    allow: ["halftone pattern", "jpeg artifacts", "low quality", "illustration"],
  },
  "line-engraving": {
    kind: "prompt",
    lead:
      "a fine hand-engraved illustration, dense cross-hatched linework, vintage etched plate, monochrome ink, of",
    allow: ["low quality", "jpeg artifacts", "illustration"],
  },
  cyanotype: {
    kind: "prompt",
    lead:
      "a cyanotype photographic print, prussian-blue monochrome, soft edges, antique textured paper, of",
    allow: ["jpeg artifacts", "low quality"],
  },

  // ── digital-graphic: clean FLUX photo, then a deterministic PIL filter ──────
  // allow:[] on purpose — we want the cleanest possible photo to feed the filter,
  // so NONE of the global negatives are lifted during generation.
  "pixel-art": { kind: "postprocess", filter: "pixel-art", allow: [] },
  halftone: { kind: "postprocess", filter: "halftone", allow: [] },
  ascii: { kind: "postprocess", filter: "ascii", allow: [] },
  blueprint: { kind: "postprocess", filter: "blueprint", allow: [] },
};

// The post-process filter name for a treatment, or null if it's a prompt
// treatment / unknown. Used by the render pipeline to run the PIL filter after
// the image is generated.
export function postProcessFilterFor(treatmentName?: string): string | null {
  const t = resolveTreatment(treatmentName);
  return t?.kind === "postprocess" ? t.filter ?? null : null;
}

// Light positive realism steer for the default (photographic) path. FLUX largely
// heeds but does not GUARANTEE negative prompts, so reinforcing realism in the
// positive prompt is what reliably kills the grid/wireframe weave.
const PHOTO_STEER =
  "realistic documentary photograph, natural surfaces and materials, no digital grid or wireframe overlay";

// Photographic-medium words stripped from the rest of the prompt when a non-photo
// treatment leads, so "pixel art … of … 35mm film photograph" doesn't fight itself.
const PHOTO_WORDS_RE =
  /\b(photograph(s|ic)?|photo|shot on \d*\s*mm( film)?|\d+mm film|film grain|dslr|bokeh|depth of field|documentary photograph)\b/gi;

export function resolveTreatment(name?: string): ImageTreatment | null {
  if (!name) return null;
  return IMAGE_TREATMENTS[name.toLowerCase().trim()] ?? null;
}

// Apply a treatment to an assembled prompt + negative list.
export function applyTreatment(
  prompt: string,
  negatives: string[],
  treatmentName?: string,
): { prompt: string; negatives: string[] } {
  const t = resolveTreatment(treatmentName);
  if (!t || t.kind === "postprocess") {
    // Default + post-process paths both GENERATE a clean photo (post-process
    // treatments transform it afterwards via a PIL filter). Keep the skill's
    // photo framing and add the realism steer; lift nothing.
    return { prompt: `${prompt}, ${PHOTO_STEER}`, negatives };
  }
  const lifted = new Set(t.allow.map((s) => s.toLowerCase()));
  const negativesOut = negatives.filter((n) => !lifted.has(n.toLowerCase()));
  const cleaned = prompt.replace(PHOTO_WORDS_RE, "").replace(/\s*,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
  return { prompt: `${t.lead} ${cleaned}`, negatives: negativesOut };
}
