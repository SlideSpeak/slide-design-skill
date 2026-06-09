import { resolve, relative, isAbsolute } from "node:path";
import { loadSkill, listSkills } from "./skill-loader.ts";
import { composeSystemPrompt } from "./prompt-composer.ts";
import { renderDeckShell, renderSlide } from "./renderer.ts";
import { guardImagePrompt, guardSlotContent, flagModelGeneratedClaims } from "./brand-guard.ts";
import { GLOBAL_IMAGE_NEGATIVES } from "./image-providers.ts";
import { applyTreatment, postProcessFilterFor } from "./image-treatments.ts";
import { postProcessDataUri } from "./image-postprocess.ts";
import { validateSlideTree } from "./validate.ts";
import type {
  GenerateDeckArgs,
  GenerateDeckResult,
  Skill,
  SlideTreeNode,
  ResolvedImage,
  BackgroundGenerator,
} from "./types.ts";

export { loadSkill, listSkills, composeSystemPrompt, renderDeckShell, renderSlide };
export { guardImagePrompt, guardSlotContent, flagModelGeneratedClaims };
export { validateSlideTree } from "./validate.ts";
export * from "./types.ts";
export {
  composeGeneratorPrompt,
  parseGeneratedSkill,
  materializeSkill,
  generateSkill,
  buildReferenceLibrary,
  slugForBrief,
  describeBrief,
} from "./skill-generator.ts";
export type {
  StyleBrief,
  GeneratedSkillFiles,
  SkillReference,
  GeneratorLLM,
} from "./skill-generator.ts";
export {
  resolveStyleInput,
  matchPreset,
  extractStyleCue,
  splitMix,
} from "./style-intake.ts";
export type {
  StyleInput,
  StyleReference,
  StyleResolution,
  StyleIntakeDeps,
} from "./style-intake.ts";
export {
  FalProvider,
  FalBackgroundProvider,
  UnsplashProvider,
  PexelsProvider,
  FederatedImageResolver,
} from "./image-providers.ts";
export type { ProviderConfig, FederatedImageResolverDeps } from "./image-providers.ts";

export interface LLMClient {
  generateSlideTree(systemPrompt: string): Promise<unknown>;
}

export interface ImageResolver {
  resolve(req: {
    subject: string;
    category: string;
    width?: number;
    height?: number;
  }): Promise<ResolvedImage>;
}

const SKILL_NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;

export async function resolveSkillDir(
  skillsRoot: string,
  skillName: string,
): Promise<string> {
  if (typeof skillName !== "string" || !SKILL_NAME_RE.test(skillName)) {
    throw new Error(
      `Invalid skillName: must match ${SKILL_NAME_RE}. Got: ${JSON.stringify(skillName)}.`,
    );
  }
  const available = await listSkills(skillsRoot);
  if (!available.includes(skillName)) {
    throw new Error(
      `Unknown skill "${skillName}". Available: ${available.join(", ") || "(none)"}.`,
    );
  }
  const rootResolved = resolve(skillsRoot);
  const skillResolved = resolve(rootResolved, skillName);
  // Belt-and-braces containment check.
  const rel = relative(rootResolved, skillResolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Skill path escaped skillsRoot.`);
  }
  return skillResolved;
}

export async function generateDeck(
  args: GenerateDeckArgs,
  deps: {
    skillsRoot: string;
    llm: LLMClient;
    images: ImageResolver;
    backgroundGenerator?: BackgroundGenerator;
  },
): Promise<GenerateDeckResult> {
  const warnings: string[] = [];
  const skillDir = await resolveSkillDir(deps.skillsRoot, args.skillName);
  const skill = await loadSkill(skillDir);

  const systemPrompt = composeSystemPrompt(skill, {
    userPrompt: args.userPrompt,
    slideCount: args.slideCount,
    language: args.language ?? "en",
  });

  const raw = await deps.llm.generateSlideTree(systemPrompt);
  const validation = validateSlideTree(raw, skill, args.slideCount, {
    userPrompt: args.userPrompt,
  });
  warnings.push(...validation.warnings);

  if (!validation.ok) {
    throw new Error(
      `LLM output validation failed: ${validation.errors.join(" | ")}`,
    );
  }

  const validatedSlides = validation.slides;

  for (const slide of validatedSlides) {
    for (const [k, v] of Object.entries(slide.slots)) {
      const g = guardSlotContent(k, v);
      if (!g.allowed) {
        warnings.push(`Slot dropped: ${g.reason}`);
        slide.slots[k] = "";
      } else if (g.warning) {
        warnings.push(g.warning);
      }
    }
  }

  // Per-slide background generation. Each slide whose tree-node carries a
  // bgPrompt gets a fresh AI-rendered gradient inlined as data-URI into
  // slots["bg-image"]. Templates with {{@gradient-bg bgSlot=bg-image}}
  // pick this up at render-time; fallback chain is per-slide → baked cache → SVG.
  if (deps.backgroundGenerator) {
    for (const [si, slide] of validatedSlides.entries()) {
      if (!slide.bgPrompt) continue;
      const guard = guardImagePrompt(slide.bgPrompt);
      if (!guard.allowed) {
        warnings.push(`Slide ${si} bgPrompt rejected: ${guard.reason}`);
        continue;
      }
      try {
        // Full-bleed backgrounds get the SAME artifact guard + stylistic
        // treatment as resolver-path images: the global negatives (no grid/
        // wireframe/cgi…), the skill's own negatives, and any declared
        // Treatment (which also lifts the negatives it needs).
        const { prompt: bgPrompt, negatives } = applyTreatment(
          slide.bgPrompt,
          [...skill.imageStyle.aiNegativePrompt, ...GLOBAL_IMAGE_NEGATIVES],
          skill.imageStyle.treatment,
        );
        const dataUri = await deps.backgroundGenerator.generate(
          bgPrompt,
          1920,
          1080,
          { negative: negatives.join(", ") },
        );
        // Digital-graphic treatments (pixel-art / halftone / ascii / blueprint)
        // can't be rendered by FLUX — transform the clean photo deterministically.
        const filter = postProcessFilterFor(skill.imageStyle.treatment);
        slide.slots["bg-image"] = filter
          ? await postProcessDataUri(dataUri, filter)
          : dataUri;
      } catch (e) {
        warnings.push(`Slide ${si} bg generation failed: ${String(e)}`);
      }
    }
  }

  const resolvedImages = new Map<string, ResolvedImage>();
  const budget = args.imageBudget ?? 20;
  let imagesUsed = 0;

  for (const [si, slide] of validatedSlides.entries()) {
    if (!slide.images) continue;
    for (const [ii, imgReq] of slide.images.entries()) {
      if (imagesUsed >= budget) {
        warnings.push(
          `Image budget (${budget}) exceeded at slide ${si} image ${ii}.`,
        );
        break;
      }
      const guard = guardImagePrompt(imgReq.subject);
      if (!guard.allowed) {
        warnings.push(`Image rejected: ${guard.reason}`);
        continue;
      }
      try {
        const resolved = await deps.images.resolve(imgReq);
        const safe = isResolvedImage(resolved);
        if (!safe) {
          warnings.push(
            `Image resolver returned invalid result for "${imgReq.subject}".`,
          );
          continue;
        }
        resolvedImages.set(`${si}-${ii}`, resolved);
        imagesUsed += 1;
      } catch (e) {
        warnings.push(`Image resolve failed for "${imgReq.subject}": ${String(e)}`);
      }
    }
  }

  // Ground-truth fidelity: surface figures/citations the model invented (not in
  // the user's request) as one consolidated warning. Non-fatal — illustrative
  // decks are allowed, but the caller must be able to catch fabricated real data.
  for (const slide of validatedSlides) {
    const flag = flagModelGeneratedClaims(slide.slots, args.userPrompt);
    if (flag) {
      warnings.push(`${slide.type}: ${flag}`);
    }
  }

  const ctx = { skill, resolvedImages };
  const total = validatedSlides.length;
  const slides = validatedSlides.map((slide, index) => ({
    type: slide.type,
    html: renderSlide(slide, ctx, { index, total }),
  }));

  return { slides, imagesUsed, warnings };
}

function isResolvedImage(v: unknown): v is ResolvedImage {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.url === "string" &&
    (o.source === "fal" || o.source === "unsplash" || o.source === "pexels") &&
    typeof o.width === "number" &&
    typeof o.height === "number"
  );
}

export function wrapAsStandaloneHtml(
  skill: Skill,
  slides: { type: string; html: string }[],
): string {
  const { head, foot } = renderDeckShell(skill);
  return head + slides.map((s) => s.html).join("\n\n") + "\n" + foot;
}

// Re-export SlideTreeNode for callers that build mock LLM clients
export type { SlideTreeNode };
