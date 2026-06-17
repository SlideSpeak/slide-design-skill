// Smoke-test the FAL background image cache (key stability, disk KV, decorator, persistence, kill-switch).
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  FalImageCache,
  CachedBackgroundProvider,
  CachedImageResolver,
  falCacheKey,
} from "../engine/fal-cache.ts";
import type { BackgroundGenerator, ImageRequest, ResolvedImage } from "../engine/types.ts";

let pass = 0,
  fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`OK  ${label}`);
    pass++;
  } else {
    console.log(`FAIL ${label}${detail ? " — " + detail : ""}`);
    fail++;
  }
}
function countingGen(): { gen: BackgroundGenerator; calls: () => number } {
  let calls = 0;
  return {
    gen: {
      async generate(prompt: string) {
        calls += 1;
        return `data:image/jpeg;base64,${Buffer.from(prompt).toString("base64")}`;
      },
    },
    calls: () => calls,
  };
}
function countingResolver(): {
  res: { resolve(req: ImageRequest): Promise<ResolvedImage> };
  calls: () => number;
} {
  let calls = 0;
  return {
    res: {
      async resolve(req: ImageRequest): Promise<ResolvedImage> {
        calls += 1;
        return {
          url: `data:image/jpeg;base64,${Buffer.from(req.subject).toString("base64")}`,
          source: "fal",
          width: req.width ?? 0,
          height: req.height ?? 0,
        };
      },
    },
    calls: () => calls,
  };
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "fal-cache-"));
  try {
    const k1 = falCacheKey({ prompt: "a", width: 1920, height: 1080 });
    const k2 = falCacheKey({ prompt: "a", width: 1920, height: 1080 });
    const k3 = falCacheKey({ prompt: "b", width: 1920, height: 1080 });
    check("same inputs → same key", k1 === k2);
    check("different prompt → different key", k1 !== k3);
    check(
      "different size → different key",
      falCacheKey({ prompt: "a", width: 1920, height: 1080 }) !==
        falCacheKey({ prompt: "a", width: 1280, height: 720 }),
    );
    check(
      "different negative → different key",
      falCacheKey({ prompt: "a", width: 1, height: 1, negative: "x" }) !==
        falCacheKey({ prompt: "a", width: 1, height: 1, negative: "y" }),
    );
    check(
      "field-boundary collision avoided (separator)",
      falCacheKey({ prompt: "a 1x1", width: 1, height: 1 }) !==
        falCacheKey({ prompt: "a", width: 1, height: 1, negative: "1x1" }),
    );

    const cache = new FalImageCache(dir);
    check("miss returns undefined", (await cache.get(k1)) === undefined);
    await cache.set(k1, "data:image/jpeg;base64,ZZ");
    check("get after set returns value", (await cache.get(k1)) === "data:image/jpeg;base64,ZZ");

    delete process.env.SLIDESPEAK_FAL_CACHE;
    const c = countingGen();
    const dec = new CachedBackgroundProvider(c.gen, new FalImageCache(dir));
    const a1 = await dec.generate("hero sunrise", 1920, 1080);
    const a2 = await dec.generate("hero sunrise", 1920, 1080);
    check("identical generate calls inner once", c.calls() === 1, `calls=${c.calls()}`);
    check("cached value matches", a1 === a2);
    await dec.generate("hero sunset", 1920, 1080);
    check("different prompt calls inner again", c.calls() === 2, `calls=${c.calls()}`);

    const c2 = countingGen();
    const dec2 = new CachedBackgroundProvider(c2.gen, new FalImageCache(dir));
    await dec2.generate("hero sunrise", 1920, 1080);
    check("persisted hit across instances → inner not called", c2.calls() === 0, `calls=${c2.calls()}`);

    process.env.SLIDESPEAK_FAL_CACHE = "0";
    const c3 = countingGen();
    const dec3 = new CachedBackgroundProvider(c3.gen, new FalImageCache(dir));
    await dec3.generate("hero sunrise", 1920, 1080);
    await dec3.generate("hero sunrise", 1920, 1080);
    check("kill-switch bypasses cache (inner each call)", c3.calls() === 2, `calls=${c3.calls()}`);
    delete process.env.SLIDESPEAK_FAL_CACHE;

    // --- CachedImageResolver (inline images[]) ---
    const ir = countingResolver();
    const ires = new CachedImageResolver(ir.res, "schoolbook", new FalImageCache(dir));
    const req = { subject: "saturn", category: "illustration", width: 800, height: 800 };
    const r1 = await ires.resolve(req);
    const r2 = await ires.resolve(req);
    check("inline: identical resolve calls inner once", ir.calls() === 1, `calls=${ir.calls()}`);
    check("inline: cached url matches", r1.url === r2.url);
    check("inline: cache hit stamped cached:true", r2.cached === true);
    check("inline: first (miss) result not stamped cached", r1.cached !== true);
    await ires.resolve({ subject: "mars", category: "illustration", width: 800, height: 800 });
    check("inline: different subject calls inner again", ir.calls() === 2, `calls=${ir.calls()}`);

    const ir2 = countingResolver();
    const ires2 = new CachedImageResolver(ir2.res, "storytime", new FalImageCache(dir));
    await ires2.resolve(req);
    check("inline: namespace isolates identical subject", ir2.calls() === 1, `calls=${ir2.calls()}`);

    const ir3 = countingResolver();
    const ires3 = new CachedImageResolver(ir3.res, "schoolbook", new FalImageCache(dir));
    const p = await ires3.resolve(req);
    check("inline: persisted hit across instances (inner not called)", ir3.calls() === 0, `calls=${ir3.calls()}`);
    check("inline: persisted hit stamped cached:true", p.cached === true);

    process.env.SLIDESPEAK_FAL_CACHE = "0";
    const ir4 = countingResolver();
    const ires4 = new CachedImageResolver(ir4.res, "schoolbook", new FalImageCache(dir));
    await ires4.resolve(req);
    await ires4.resolve(req);
    check("inline: kill-switch bypasses cache", ir4.calls() === 2, `calls=${ir4.calls()}`);
    delete process.env.SLIDESPEAK_FAL_CACHE;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`\n${pass}/${pass + fail} fal-cache checks passed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
