import { guardImagePrompt, guardAssembledImagePrompt } from "./brand-guard.ts";
import { applyTreatment } from "./image-treatments.ts";
import type { ImageRequest, ImageStyle, ResolvedImage } from "./types.ts";

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
  fal?: { apiKey: string; model?: string; steps?: number };
  unsplash?: { accessKey: string };
  pexels?: { apiKey: string };
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
  }): Promise<ResolvedImage> {
    const model = this.cfg.model ?? "fal-ai/flux/schnell";
    const res = await fetch(`https://fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        negative_prompt: opts.negative,
        image_size: { width: opts.width, height: opts.height },
        num_inference_steps: this.steps(),
        num_images: 1,
        enable_safety_checker: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FAL ${res.status}: ${text}`);
    }

    const json = (await res.json()) as { images: { url: string }[] };
    if (!json.images?.length) throw new Error("FAL returned no images");

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
    opts?: { negative?: string },
  ): Promise<string> {
    const img = await this.fal.generate({
      prompt,
      negative: opts?.negative,
      width,
      height,
    });
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`Failed to fetch FAL image: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
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
