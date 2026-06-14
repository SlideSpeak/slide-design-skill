import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { guardImagePrompt, guardAssembledImagePrompt } from "./brand-guard.ts";
import { applyTreatment } from "./image-treatments.ts";
import type { ImageRequest, ImageStyle, ResolvedImage } from "./types.ts";

const execFileP = promisify(execFile);
const __imgDir = dirname(fileURLToPath(import.meta.url));
const BLANK_STATS_SCRIPT = resolve(__imgDir, "..", "scripts", "image-blank-stats.py");

// A generated image whose channel stddev is this low is near-uniform — the
// flux/dev degenerate-frame failure (a near-solid, usually black frame returned
// for some close-up-on-body bgPrompts). Both gates are conservative to avoid
// rejecting a legitimately dark-but-detailed photo.
const BLANK_STDDEV = 8;
const BLANK_MIN_BYTES = 15_000;

/**
 * Inspect generated image bytes and decide whether the frame is blank/degenerate.
 * Decodes via PIL (already a proven repo dependency) for the stddev signal, with a
 * raw byte-size floor as a no-decode fallback. The check is best-effort: if PIL is
 * unavailable it falls back to size only and never blocks on its own failure (an
 * image is an enhancement, not a hard requirement).
 */
export async function inspectImageBytes(
  buf: Buffer,
): Promise<{ blank: boolean; reason: string }> {
  // Prefer the real signal (decode + channel stddev): a valid image with variance
  // is fine at ANY size, a near-uniform one is blank regardless of size.
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "ds-imgstat-"));
    const f = join(dir, "img");
    await writeFile(f, buf);
    const { stdout } = await execFileP("python3", [BLANK_STATS_SCRIPT, f], { timeout: 15_000 });
    const stat = JSON.parse(stdout.trim());
    if (stat.ok === false) {
      // Distinguish "PIL not installed" (cannot decode — fall through to the size
      // floor, do NOT reject) from a real decode failure (corrupt/empty → blank).
      if (stat.reason === "no-pil") {
        // fall through to byte-size floor below
      } else {
        return { blank: true, reason: `image failed to decode (${stat.error}) — corrupt/empty bytes` };
      }
    } else if (stat.ok && typeof stat.std === "number") {
      if (stat.std < BLANK_STDDEV) {
        return { blank: true, reason: `near-uniform frame (channel stddev ${stat.std}) — flux degenerate-frame failure` };
      }
      return { blank: false, reason: "" };
    }
  } catch {
    // PIL/python unavailable or timed out — fall back to a raw byte-size floor.
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  // Fallback only when the decoder could not run.
  if (buf.length < BLANK_MIN_BYTES) {
    return { blank: true, reason: `frame is only ${buf.length}B and could not be decoded — degenerate/blank` };
  }
  return { blank: false, reason: "" };
}

// Quality/realism floor applied to EVERY AI image, on top of each skill's own
// negatives. FAL (flux/schnell) reliably drifts into wireframe / perspective-grid
// / blueprint "tech" textures and other AI tells whenever a prompt mentions
// architecture or abstract space — these showed up uninvited even on briefs that
// explicitly asked to avoid AI artifacts. Banning them globally keeps generated
// imagery photographic instead of accidentally rendering a grid over everything.
export const GLOBAL_IMAGE_NEGATIVES = [
  "grid",
  "grid overlay",
  "wireframe",
  "mesh",
  "blueprint",
  "perspective grid",
  "technical drawing",
  "scanlines",
  "screen-door effect",
  "halftone pattern",
  "3d render",
  "cgi",
  "video game",
  "watermark",
  "text",
  "caption",
  "distorted",
  "deformed",
  "low quality",
  "jpeg artifacts",
];

export interface ProviderConfig {
  fal?: {
    apiKey: string;
    model?: string;
    steps?: number;
    // Model used when a generate() call carries referenceImages. Gemini-image
    // family (nano-banana) natively conditions on input images; FLUX does not.
    referenceModel?: string;
  };
  unsplash?: { accessKey: string };
  pexels?: { apiKey: string };
}

// nano-banana/edit takes an aspect_ratio enum instead of pixel dimensions.
const FAL_ASPECT_RATIOS: [string, number][] = [
  ["21:9", 21 / 9], ["16:9", 16 / 9], ["3:2", 3 / 2], ["4:3", 4 / 3],
  ["5:4", 5 / 4], ["1:1", 1], ["4:5", 4 / 5], ["3:4", 3 / 4],
  ["2:3", 2 / 3], ["9:16", 9 / 16],
];
function aspectRatioFor(width: number, height: number): string {
  const target = width / height;
  let best = "auto";
  let bestDiff = 0.04; // tolerance; otherwise let the model decide
  for (const [name, ratio] of FAL_ASPECT_RATIOS) {
    const diff = Math.abs(ratio - target) / target;
    if (diff < bestDiff) { best = name; bestDiff = diff; }
  }
  return best;
}

export class FalProvider {
  constructor(private cfg: NonNullable<ProviderConfig["fal"]>) {}

  // Inference steps MUST match the model. flux/schnell is distilled for ~4 steps;
  // flux/dev (and pro) need ~28+ — running dev at 4 steps under-denoises and bakes
  // a fine grid/screen-door weave into smooth dark areas (the "grid artifact").
  private steps(): number {
    if (this.cfg.steps) return this.cfg.steps;
    const m = (this.cfg.model ?? "fal-ai/flux/schnell").toLowerCase();
    return m.includes("schnell") ? 4 : 28;
  }

  async generate(opts: {
    prompt: string;
    negative?: string;
    width: number;
    height: number;
    // Style-anchor images (e.g. an approved moodboard, a brand reference).
    // When set, the call routes to the reference model instead of FLUX.
    referenceImages?: string[];
  }): Promise<ResolvedImage> {
    const useReference = (opts.referenceImages?.length ?? 0) > 0;
    const model = useReference
      ? (this.cfg.referenceModel ?? "fal-ai/nano-banana/edit")
      : (this.cfg.model ?? "fal-ai/flux/schnell");
    // The gemini-image family has no negative_prompt parameter; fold the
    // negatives into the prompt instead.
    const body = useReference
      ? {
          prompt: opts.negative
            ? `${opts.prompt}. Avoid: ${opts.negative}`
            : opts.prompt,
          image_urls: opts.referenceImages,
          aspect_ratio: aspectRatioFor(opts.width, opts.height),
          output_format: "jpeg",
          num_images: 1,
        }
      : {
          prompt: opts.prompt,
          negative_prompt: opts.negative,
          image_size: { width: opts.width, height: opts.height },
          num_inference_steps: this.steps(),
          num_images: 1,
          enable_safety_checker: true,
        };
    const res = await fetch(`https://fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FAL ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      images: { url: string }[];
      has_nsfw_concepts?: boolean[];
    };
    if (!json.images?.length) throw new Error("FAL returned no images");
    // FAL blacks out frames it flags as NSFW — surfacing it explains an otherwise
    // mysterious solid-dark hero. Treat a flagged frame as unusable.
    if (json.has_nsfw_concepts?.[0]) {
      throw new Error(
        "FAL flagged the prompt (has_nsfw_concepts) and returns a blacked-out frame — rephrase the bgPrompt to a wider, less close-up scene.",
      );
    }

    return {
      url: json.images[0].url,
      source: "fal",
      width: opts.width,
      height: opts.height,
    };
  }
}

// Background generator backed by FAL. Wraps FalProvider, fetches the resulting
// image, and returns a base64 data-URI ready to inline in the rendered HTML.
// Decoupled from the broader image-resolver pipeline because backgrounds bypass
// brand-guard / decision-rules (they're authored by deck-level prompts, not
// LLM-emitted image categories).
export class FalBackgroundProvider {
  constructor(private fal: FalProvider) {}

  async generate(
    prompt: string,
    width: number,
    height: number,
    opts?: { negative?: string; referenceImages?: string[] },
  ): Promise<string> {
    const img = await this.fal.generate({
      prompt,
      negative: opts?.negative,
      width,
      height,
      referenceImages: opts?.referenceImages,
    });
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`Failed to fetch FAL image: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Pixel-validate before inlining: a near-uniform/blank frame must not ship as
    // a "filled" hero. Throwing here lets generateDeck record a warning and fall
    // back to the procedural gradient instead of a solid-black panel.
    const check = await inspectImageBytes(buf);
    if (check.blank) {
      throw new Error(`FAL background rejected: ${check.reason}`);
    }
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  }
}

export class UnsplashProvider {
  constructor(private cfg: NonNullable<ProviderConfig["unsplash"]>) {}

  async search(opts: {
    query: string;
    width: number;
    height: number;
  }): Promise<ResolvedImage | null> {
    const params = new URLSearchParams({
      query: opts.query,
      per_page: "10",
      orientation:
        opts.width > opts.height
          ? "landscape"
          : opts.width < opts.height
          ? "portrait"
          : "squarish",
      content_filter: "high",
    });

    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${this.cfg.accessKey}` },
    });

    if (!res.ok) throw new Error(`Unsplash ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as {
      results: {
        urls: { regular: string; full: string };
        user: { name: string; links: { html: string } };
        links: { html: string };
        description?: string;
      }[];
    };

    const first = json.results.find((r) => !looksLikeLogo(r.description ?? ""));
    if (!first) return null;

    return {
      url: first.urls.regular,
      source: "unsplash",
      attribution: `Photo by ${first.user.name} on Unsplash (${first.user.links.html})`,
      width: opts.width,
      height: opts.height,
    };
  }
}

export class PexelsProvider {
  constructor(private cfg: NonNullable<ProviderConfig["pexels"]>) {}

  async search(opts: {
    query: string;
    width: number;
    height: number;
  }): Promise<ResolvedImage | null> {
    const params = new URLSearchParams({
      query: opts.query,
      per_page: "10",
      orientation:
        opts.width > opts.height
          ? "landscape"
          : opts.width < opts.height
          ? "portrait"
          : "square",
    });

    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: this.cfg.apiKey },
    });

    if (!res.ok) throw new Error(`Pexels ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as {
      photos: {
        src: { large2x: string; large: string };
        photographer: string;
        photographer_url: string;
        url: string;
        alt?: string;
      }[];
    };

    const first = json.photos.find((p) => !looksLikeLogo(p.alt ?? ""));
    if (!first) return null;

    return {
      url: first.src.large2x,
      source: "pexels",
      attribution: `Photo by ${first.photographer} on Pexels (${first.photographer_url})`,
      width: opts.width,
      height: opts.height,
    };
  }
}

const LOGO_HINTS = /\b(logo|wordmark|brand-?mark|trademark|signage|storefront)\b/i;
function looksLikeLogo(alt: string): boolean {
  return LOGO_HINTS.test(alt);
}

export interface FederatedImageResolverDeps {
  imageStyle: ImageStyle;
  providers: {
    fal?: FalProvider;
    unsplash?: UnsplashProvider;
    pexels?: PexelsProvider;
  };
  /**
   * Called when the image style says "ask" for a category.
   * Returns "ai" or "stock". For non-interactive runs, default to "stock"
   * (safer for real-world subjects).
   */
  decide?: (req: ImageRequest) => Promise<"ai" | "stock">;
}

export class FederatedImageResolver {
  constructor(private deps: FederatedImageResolverDeps) {}

  async resolve(req: ImageRequest): Promise<ResolvedImage> {
    const guarded = guardImagePrompt(req.subject);
    if (!guarded.allowed) {
      throw new Error(guarded.reason);
    }

    const verdict = this.deps.imageStyle.decisionRules[req.category] ?? "ask";
    let mode: "ai" | "stock";
    if (verdict === "ai") mode = "ai";
    else if (verdict === "stock") mode = "stock";
    else mode = this.deps.decide ? await this.deps.decide(req) : "stock";

    const width = req.width ?? 1920;
    const height = req.height ?? 1080;

    if (mode === "ai") {
      if (!this.deps.providers.fal) throw new Error("No FAL provider configured");
      const basePrompt = this.deps.imageStyle.aiPromptTemplate.replace(
        "{subject}",
        req.subject,
      );
      const finalGuard = guardAssembledImagePrompt(basePrompt);
      if (!finalGuard.allowed) {
        throw new Error(`Assembled AI prompt rejected: ${finalGuard.reason}`);
      }
      // Stylistic treatment (if any) appends its aesthetic to the prompt and
      // lifts the global/skill negatives that would fight it (e.g. a blueprint
      // treatment re-allows the normally-banned grid).
      const { prompt, negatives } = applyTreatment(
        basePrompt,
        [...this.deps.imageStyle.aiNegativePrompt, ...GLOBAL_IMAGE_NEGATIVES],
        this.deps.imageStyle.treatment,
      );
      return await this.deps.providers.fal.generate({
        prompt,
        negative: negatives.join(", "),
        width,
        height,
      });
    }

    const query = this.deps.imageStyle.stockQueryTemplate.replace(
      "{subject}",
      req.subject,
    );
    const queryGuard = guardAssembledImagePrompt(query);
    if (!queryGuard.allowed) {
      throw new Error(`Assembled stock query rejected: ${queryGuard.reason}`);
    }

    const errors: string[] = [];
    if (this.deps.providers.unsplash) {
      try {
        const u = await this.deps.providers.unsplash.search({
          query,
          width,
          height,
        });
        if (u) return u;
      } catch (e) {
        errors.push(`unsplash: ${e}`);
      }
    }
    if (this.deps.providers.pexels) {
      try {
        const p = await this.deps.providers.pexels.search({
          query,
          width,
          height,
        });
        if (p) return p;
      } catch (e) {
        errors.push(`pexels: ${e}`);
      }
    }

    throw new Error(
      `No stock match for "${req.subject}" (query: "${query}"). ${errors.join("; ")}`,
    );
  }
}
