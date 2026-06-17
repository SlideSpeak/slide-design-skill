import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BackgroundGenerator } from "./types.ts";

const __dir = dirname(fileURLToPath(import.meta.url));

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
  // Join with NUL — a byte that cannot occur in prompts/URLs/data-URIs — so no
  // field value can bleed across a boundary and collide with a different tuple.
  const raw = [
    parts.prompt,
    `${parts.width}x${parts.height}`,
    parts.negative ?? "",
    (parts.referenceImages ?? []).join("\u0000"),
  ].join("\u0000");
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
    // ponytail: no in-flight dedup — parallel misses for the same key each pay one
    // FAL call (last write wins, identical value); add a pending-promise map if
    // render parallelism grows.
    const hit = await this.cache.get(key);
    if (hit !== undefined) return hit;
    const dataUri = await this.inner.generate(prompt, width, height, opts);
    await this.cache.set(key, dataUri);
    return dataUri;
  }
}
