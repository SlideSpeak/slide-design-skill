// Bake FAL-generated gradient backgrounds into a skill's cached-gradients dir.
// Run once per skill, optionally per visual-language revision.
// Cache is read at skill-load time and inlined as data-URI by the engine.

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FalProvider } from "../engine/image-providers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const cacheDir = resolve(repoRoot, "skills/launch-warm/cached-gradients");

const apiKey = process.env.FAL_KEY;
if (!apiKey) {
  console.error("Set FAL_KEY env var first.");
  process.exit(1);
}

const fal = new FalProvider({ apiKey, model: "fal-ai/flux/dev" });

// Asymmetric, off-center, multi-blob prompts. Lesson from the symmetric flux/dev
// runs: explicit positional language ("upper-right", "lower-left", "diagonal")
// forces the model to break the default horizontal-band cliché.
const PROMPTS: { name: string; prompt: string }[] = [
  {
    name: "warm",
    prompt:
      "asymmetric painterly gradient, large soft coral and burnt-orange blob occupying the upper-right corner and bleeding diagonally, smaller warm apricot blob lower-left, cream-peach base in between, painterly watercolor edges, deliberately off-center composition, magazine cover energy, golden hour mood, no symmetric horizontal band",
  },
  {
    name: "coral",
    prompt:
      "asymmetric painterly gradient, bold dusty pink and salmon blob in upper-left, terracotta accent blob lower-right, soft coral diffusion between them on a warm cream base, painterly washes with feathered edges, deliberately off-center, fashion editorial composition, romantic restrained palette",
  },
  {
    name: "ember",
    prompt:
      "asymmetric atmospheric gradient, deep cocoa-black covering upper half, a single glowing amber-orange bloom rising from the lower-right, painterly soft falloff with subtle ember-red spread along the bottom, cinematic dusk-by-fire mood, off-center composition, no horizon line",
  },
  {
    name: "dawn",
    prompt:
      "asymmetric painterly sunrise gradient, soft peach-pink dominant in upper-left flowing diagonally toward a single touch of dusty lavender in lower-right, painterly watercolor blobs, editorial calm, deliberately off-center, no centered horizontal band, no sky, no horizon",
  },
];

console.log("Baking", PROMPTS.length, "gradients to", cacheDir, "…");
const manifest: Record<string, { prompt: string; ts: string; bytes: number }> = {};
for (const { name, prompt } of PROMPTS) {
  const t0 = Date.now();
  console.log(`  → ${name}…`);
  const result = await fal.generate({
    prompt,
    width: 1920,
    height: 1080,
  });
  const imgRes = await fetch(result.url);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const out = resolve(cacheDir, `${name}.jpg`);
  await writeFile(out, buf);
  manifest[name] = {
    prompt,
    ts: new Date().toISOString(),
    bytes: buf.length,
  };
  console.log(`     ${Date.now() - t0}ms · ${buf.length} bytes · ${out}`);
}

await writeFile(
  resolve(cacheDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log("wrote manifest.json");
