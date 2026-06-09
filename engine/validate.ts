import type { Skill, SlideTreeNode } from "./types.ts";
import { normalizeDensity } from "./density.ts";

export interface ValidationResult {
  ok: boolean;
  slides: SlideTreeNode[];
  errors: string[];
  warnings: string[];
}

const SLOT_KEY_RE = /^[a-z][a-z0-9_-]*$/;
const TYPE_RE = /^[a-z][a-z0-9-]*$/;
const IMAGE_CATEGORY_RE = /^[a-z][a-z0-9-]*$/;

const MAX_SLOT_VALUE_LEN = 4000;
const MAX_IMAGE_SUBJECT_LEN = 500;
const MAX_IMAGES_PER_SLIDE = 4;

/**
 * Validate an LLM-returned slide tree against the skill grammar.
 * Drops malformed slides/slots/images rather than crashing, so generation
 * can proceed with a degraded but safe deck.
 */
export function validateSlideTree(
  raw: unknown,
  skill: Skill,
  expectedSlideCount: number,
  options?: { strict?: boolean },
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slides: SlideTreeNode[] = [];
  const strict = options?.strict === true;

  if (!isObject(raw)) {
    return { ok: false, slides, errors: ["LLM output is not an object."], warnings };
  }
  const rawSlides = (raw as Record<string, unknown>).slides;
  if (!Array.isArray(rawSlides)) {
    return { ok: false, slides, errors: ["LLM output has no `slides` array."], warnings };
  }

  const knownTypes = new Set(skill.grammar.slideTypes.map((t) => t.name));
  const requiredBySlideType = new Map(
    skill.grammar.slideTypes.map((t) => [t.name, new Set(t.requiredSlots)] as const),
  );

  for (let i = 0; i < rawSlides.length; i++) {
    const v = validateSlide(rawSlides[i], i, knownTypes, requiredBySlideType, strict);
    if (v.slide) slides.push(v.slide);
    errors.push(...v.errors);
    warnings.push(...v.warnings);
  }

  if (slides.length === 0) {
    errors.push("After validation, no slides remained.");
    return { ok: false, slides, errors, warnings };
  }

  if (slides.length !== expectedSlideCount) {
    warnings.push(
      `Expected ${expectedSlideCount} slides, validated ${slides.length}. (LLM returned ${rawSlides.length}.)`,
    );
  }

  const variety = checkCompositionVariety(slides, skill, strict);
  errors.push(...variety.errors);
  warnings.push(...variety.warnings);

  return { ok: strict ? errors.length === 0 : true, slides, errors, warnings };
}

/**
 * Enforce composition variety on an authored deck: map each slide's type to its
 * grammar composition family, then flag over-use of a single family, three of a
 * kind in a row, and too few distinct families. These are the deck-level guards
 * against the "same labelled-column slide N times" monotony. No-ops when the
 * skill grammar carries no family annotations (back-compat).
 */
function checkCompositionVariety(
  slides: SlideTreeNode[],
  skill: Skill,
  strict: boolean,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const emit = (msg: string) => (strict ? errors : warnings).push(msg);

  const familyByType = new Map<string, string>();
  for (const t of skill.grammar.slideTypes) {
    if (t.family) familyByType.set(t.name, t.family);
  }
  if (familyByType.size === 0) return { errors, warnings };

  // Per-slide family sequence (skip slides whose type has no family).
  const seq: string[] = [];
  for (const s of slides) {
    const fam = familyByType.get(s.type);
    if (fam) seq.push(fam);
  }
  if (seq.length === 0) return { errors, warnings };

  // Exempt the structural bookends from the cap; they are meant to appear once.
  const EXEMPT = new Set(["cover", "closing"]);
  const distinctFamilies = new Set(
    skill.grammar.slideTypes.map((t) => t.family).filter(Boolean) as string[],
  );
  const cap = Math.max(2, Math.ceil(seq.length / Math.max(1, distinctFamilies.size)));

  const counts = new Map<string, number>();
  for (const fam of seq) counts.set(fam, (counts.get(fam) ?? 0) + 1);
  for (const [fam, n] of counts) {
    if (EXEMPT.has(fam)) continue;
    if (n > cap) {
      emit(
        `Composition monotony: family "${fam}" used ${n}× (cap ${cap} for a ${seq.length}-slide deck). Vary the composition instead of repeating the same layout.`,
      );
    }
  }

  // Three identical families in a row reads as one slide repeated.
  for (let i = 2; i < seq.length; i++) {
    if (seq[i] === seq[i - 1] && seq[i] === seq[i - 2] && !EXEMPT.has(seq[i])) {
      emit(`Composition monotony: three "${seq[i]}" slides in a row (positions ${i - 1}–${i + 1}).`);
      break;
    }
  }

  // Too few distinct families overall.
  const usedDistinct = new Set(seq).size;
  const floor = Math.min(6, distinctFamilies.size, seq.length);
  if (usedDistinct < floor) {
    emit(
      `Composition monotony: only ${usedDistinct} distinct families across ${seq.length} slides (expected ≥ ${floor}).`,
    );
  }

  return { errors, warnings };
}

interface SlideValidation {
  slide: SlideTreeNode | null;
  errors: string[];
  warnings: string[];
}

function validateSlide(
  raw: unknown,
  index: number,
  knownTypes: Set<string>,
  requiredBySlideType: Map<string, Set<string>>,
  strict: boolean,
): SlideValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(raw)) {
    return { slide: null, errors: [`Slide ${index} is not an object.`], warnings };
  }

  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== "string" || !TYPE_RE.test(type)) {
    return {
      slide: null,
      errors: [`Slide ${index} has invalid type: ${JSON.stringify(type)}.`],
      warnings,
    };
  }
  if (!knownTypes.has(type)) {
    warnings.push(`Slide ${index} type "${type}" not in skill grammar; will fall back.`);
  }

  const rawSlots = obj.slots;
  const slots: Record<string, string> = {};
  if (rawSlots != null) {
    if (!isObject(rawSlots)) {
      errors.push(`Slide ${index} slots is not an object.`);
    } else {
      for (const [k, v] of Object.entries(rawSlots as Record<string, unknown>)) {
        if (!SLOT_KEY_RE.test(k)) {
          warnings.push(`Slide ${index} slot key "${k}" is invalid, dropped.`);
          continue;
        }
        if (typeof v !== "string") {
          warnings.push(`Slide ${index} slot "${k}" is not a string, dropped.`);
          continue;
        }
        if (v.length > MAX_SLOT_VALUE_LEN) {
          warnings.push(`Slide ${index} slot "${k}" truncated from ${v.length} to ${MAX_SLOT_VALUE_LEN} chars.`);
          slots[k] = v.slice(0, MAX_SLOT_VALUE_LEN);
        } else {
          slots[k] = v;
        }
      }
    }
  }

  const required = requiredBySlideType.get(type);
  if (required) {
    for (const r of required) {
      if (!slots[r]) {
        const msg = `Slide ${index} (${type}) missing required slot "${r}".`;
        if (strict) errors.push(msg);
        else warnings.push(msg);
      }
    }
  }

  const rawImages = obj.images;
  let images: SlideTreeNode["images"];
  if (rawImages != null) {
    if (!Array.isArray(rawImages)) {
      warnings.push(`Slide ${index} images is not an array, dropped.`);
    } else {
      images = [];
      for (let ii = 0; ii < rawImages.length && images.length < MAX_IMAGES_PER_SLIDE; ii++) {
        const ir = rawImages[ii];
        if (!isObject(ir)) continue;
        const irObj = ir as Record<string, unknown>;
        if (typeof irObj.subject !== "string" || irObj.subject.length === 0) continue;
        if (irObj.subject.length > MAX_IMAGE_SUBJECT_LEN) continue;
        if (typeof irObj.category !== "string" || !IMAGE_CATEGORY_RE.test(irObj.category)) continue;
        const width = typeof irObj.width === "number" ? irObj.width : undefined;
        const height = typeof irObj.height === "number" ? irObj.height : undefined;
        if (width != null && (width < 32 || width > 8192)) continue;
        if (height != null && (height < 32 || height > 8192)) continue;
        images.push({
          subject: irObj.subject,
          category: irObj.category,
          width,
          height,
        });
      }
    }
  }

  // Pass through optional bgPrompt — used by the engine pre-resolution step
  // to call BackgroundGenerator before rendering. Length-bounded so a hostile
  // LLM can't blow up the FAL call.
  const bgPrompt =
    typeof (raw as Record<string, unknown>).bgPrompt === "string" &&
    ((raw as Record<string, unknown>).bgPrompt as string).length > 0 &&
    ((raw as Record<string, unknown>).bgPrompt as string).length <= 600
      ? ((raw as Record<string, unknown>).bgPrompt as string)
      : undefined;

  // Per-slide density tier — coerced to a valid tier, dropped if unrecognized.
  const density = normalizeDensity((raw as Record<string, unknown>).density);

  return {
    slide: { type, slots, images, bgPrompt, density },
    errors,
    warnings,
  };
}

function isObject(v: unknown): v is object {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
