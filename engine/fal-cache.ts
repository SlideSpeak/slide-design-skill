import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BackgroundGenerator, ImageRequest, ResolvedImage } from "./types.ts";

const __dir = dirname(fileURLToPath(import.meta.url));

// NUL is the field separator: a byte that cannot occur in prompts/URLs/data-URIs,
// so no field value can bleed across a boundary and collide with a different
// tuple. Built via fromCharCode (not a literal) to keep this SOURCE file
// pure-ASCII -- an embedded NUL byte makes grep treat the file as binary and
// breaks string-match edits.
const FIELD_SEP = String.fromCharCode(0);

export function defaultFalCacheDir(): string {
  return process.env.SLIDESPEAK_FAL_CACHE_DIR ?? resolve(__dir, "..", ".cache", "fal");
}

export function falCacheKey(parts: {
  prompt: string;
  width: number;
  height: number;
  negative?: string;
  referenceImages?: string[];
}): string {
  const raw = [
    parts.prompt,
    `${parts.width}x${parts.height}`,
    parts.negative ?? "",
    (parts.referenceImages ?? []).join(FIELD_SEP),
  ].join(FIELD_SEP);
  return createHash("sha256").update(raw).digest("hex");
}

// Tiny disk KV for FAL image data-URIs. Persists across separate render processes
// so an identical (prompt+size+negative+reference) background is paid for once.
export class FalImageCache {
  constructor(private dir: string = defaultFalCacheDir()) {}
  private file(key: string): string {
    return join(this.dir, `${key}.txt`);
  }
  async get(key: string): Promise<string | undefined> {
    try {
      return await readFile(this.file(key), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }
  async set(key: string, dataUri: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(key), dataUri);
  }
}

// Decorator: wraps any BackgroundGenerator with a content-hash disk cache.
// Default-on; SLIDESPEAK_FAL_CACHE=0 bypasses (always calls the inner generator).
// Never caches a failure: if inner.generate throws, nothing is written.
export class CachedBackgroundProvider implements BackgroundGenerator {
  constructor(
    private inner: BackgroundGenerator,
    private cache: FalImageCache = new FalImageCache(),
  ) {}
  async generate(
    prompt: string,
    width: number,
    height: number,
    opts?: { negative?: string; referenceImages?: string[] },
  ): Promise<string> {
    if (process.env.SLIDESPEAK_FAL_CACHE === "0") {
      return this.inner.generate(prompt, width, height, opts);
    }
    const key = falCacheKey({
      prompt,
      width,
      height,
      negative: opts?.negative,
      referenceImages: opts?.referenceImages,
    });
    // ponytail: no in-flight dedup; parallel misses for the same key each pay one
    // FAL call (last write wins, identical value). Add a pending-promise map if
    // render parallelism grows.
    const hit = await this.cache.get(key);
    if (hit !== undefined) return hit;
    const dataUri = await this.inner.generate(prompt, width, height, opts);
    await this.cache.set(key, dataUri);
    return dataUri;
  }
}

// Structural shape of an inline-image resolver (matches engine/index.ts
// ImageResolver). Declared here to avoid a fal-cache -> index circular import.
interface ImageResolverLike {
  resolve(req: ImageRequest): Promise<ResolvedImage>;
}

// Decorator: wraps any inline-image resolver with a content-hash disk cache, so
// an identical (subject+category+size) inline illustration is paid for once
// across re-renders. Inline-only decks (e.g. the teaching registers) re-pay the
// full FAL cost on every re-render WITHOUT this; the background cache above does
// not cover images[]. Default-on; SLIDESPEAK_FAL_CACHE=0 bypasses. A hit is
// stamped { cached: true } so the spend counter excludes it. Never caches a
// failure: if inner.resolve throws, nothing is written.
export class CachedImageResolver implements ImageResolverLike {
  constructor(
    // Namespace (e.g. the skill name) keeps the SAME subject under two skills,
    // which assemble different prompts, on separate cache keys.
    private inner: ImageResolverLike,
    private namespace: string,
    private cache: FalImageCache = new FalImageCache(),
  ) {}
  async resolve(req: ImageRequest): Promise<ResolvedImage> {
    if (process.env.SLIDESPEAK_FAL_CACHE === "0") return this.inner.resolve(req);
    const key = falCacheKey({
      // "inline" tag keeps these keys disjoint from background keys (which hash
      // the raw bgPrompt as prompt); falCacheKey NUL-joins the fields.
      prompt: ["inline", this.namespace, req.subject, req.category].join(FIELD_SEP),
      width: req.width ?? 0,
      height: req.height ?? 0,
    });
    const hit = await this.cache.get(key);
    if (hit !== undefined) {
      try {
        return { ...(JSON.parse(hit) as ResolvedImage), cached: true };
      } catch {
        // Corrupt entry: fall through and regenerate (overwrites it).
      }
    }
    const resolved = await this.inner.resolve(req);
    await this.cache.set(key, JSON.stringify(resolved));
    return resolved;
  }
}
