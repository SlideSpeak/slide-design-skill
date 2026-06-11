// Generic per-deck FAL render. Usage:
//   FAL_KEY=... npx tsx scripts/render-fal-runtime.mts <skillName> <jsonName> [skillsRoot]
//
// Each slide with a bgPrompt gets a fresh FAL-rendered image inlined as data-URI.
// Output: scripts/<skillName>-fal-deck.html

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeck,
  loadSkill,
  renderDeckShell,
  FalProvider,
  FalBackgroundProvider,
  type LLMClient,
  type ImageResolver,
} from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const [skillName, jsonName, skillsRootArg] = process.argv.slice(2);
if (!skillName || !jsonName) {
  console.error("Usage: tsx render-fal-runtime.mts <skillName> <jsonName> [skillsRoot]");
  console.error("  example: tsx render-fal-runtime.mts telescope telescope-deck.json examples/generated");
  process.exit(2);
}

const apiKey = process.env.FAL_KEY;
if (!apiKey) {
  console.error("Set FAL_KEY env var first.");
  process.exit(1);
}

const skillsRoot = resolve(repoRoot, skillsRootArg ?? "skills");

const payload = JSON.parse(
  await readFile(resolve(repoRoot, `scripts/${jsonName}`), "utf-8"),
);
const llm: LLMClient = { async generateSlideTree() { return payload; } };
const noImg: ImageResolver = { async resolve() { throw new Error("none"); } };

const fal = new FalProvider({ apiKey, model: "fal-ai/flux/dev" });
const falBg = new FalBackgroundProvider(fal);

// FAL_REF_IMAGE=<url|data-uri>: anchor every background on a reference image
// (approved moodboard, brand shot). Routes to the nano-banana edit endpoint.
const refImage = process.env.FAL_REF_IMAGE;
const bg = refImage
  ? {
      generate: (prompt: string, w: number, h: number, opts?: { negative?: string }) =>
        falBg.generate(prompt, w, h, { ...opts, referenceImages: [refImage] }),
    }
  : falBg;

console.log(`rendering ${skillName} with per-slide FAL backgrounds${refImage ? " (reference-anchored, nano-banana)" : ""}…`);
const bleedCount = payload.slides.filter((s: { bgPrompt?: string }) => typeof s.bgPrompt === "string").length;
const perImage = refImage ? 0.039 : 0.025;
console.log(`  ${bleedCount} bleed-slides will hit FAL (~$${(bleedCount * perImage).toFixed(3)} est.)`);

const t0 = Date.now();
const result = await generateDeck(
  {
    skillName,
    userPrompt: `${skillName} deck`,
    slideCount: payload.slides.length,
    imageBudget: 0,
  },
  { skillsRoot, llm, images: noImg, backgroundGenerator: bg },
);
console.log(`generated ${result.slides.length} slides in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const w of result.warnings) console.log("  warning:", w);

const skill = await loadSkill(resolve(skillsRoot, skillName));
const shell = renderDeckShell(skill);
const html =
  shell.head.replace(
    "body { margin: 0; background: #1a1a1a; padding: 40px; }",
    "body { margin: 0; background: #d6d6d6; padding: 0; } .slide { margin: 0 0 24px; box-shadow: none; }",
  ) +
  result.slides.map((s) => s.html).join("\n\n") +
  "\n" +
  shell.foot;
const out = resolve(repoRoot, `scripts/${skillName}-fal-deck${refImage ? "-ref" : ""}.html`);
await writeFile(out, html);
console.log("wrote", out);
