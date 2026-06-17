// Generic per-deck FAL render. Usage:
//   FAL_KEY=... npx tsx scripts/render-fal-runtime.mts <skillName> <jsonName> [skillsRoot]
//
// Each slide with a bgPrompt gets a fresh FAL-rendered image inlined as data-URI.
// Output: scripts/<skillName>-fal-deck.html

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeck,
  loadSkill,
  renderDeckShell,
  FalProvider,
  FalBackgroundProvider,
  CachedBackgroundProvider,
  FederatedImageResolver,
  inspectImageBytes,
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
const baseBg = refImage
  ? {
      generate: (prompt: string, w: number, h: number, opts?: { negative?: string }) =>
        falBg.generate(prompt, w, h, { ...opts, referenceImages: [refImage] }),
    }
  : falBg;
// Content-hash disk cache: an identical background across re-renders is paid for
// once. Bypass with SLIDESPEAK_FAL_CACHE=0.
const bg = new CachedBackgroundProvider(baseBg);

// Load the skill up front so inline images resolve through FAL using the skill's
// own image-style (prompt template, negatives, treatment). This is a FAL-only
// render (no stock keys), so force every category to "ai"; {{@placeholder}} slots
// are not images[] and stay placeholder regardless.
const skill = await loadSkill(resolve(skillsRoot, skillName));
const aiImageStyle = {
  ...skill.imageStyle,
  decisionRules: Object.fromEntries(
    Object.keys(skill.imageStyle.decisionRules ?? {}).map((k) => [k, "ai" as const]),
  ),
};
const falImages = new FederatedImageResolver({
  imageStyle: aiImageStyle,
  providers: { fal },
  decide: async () => "ai" as const,
});

// Inline images come back as remote fal.run URLs. Fetch + pixel-validate + inline
// them as data-URIs so the exported HTML is durable/offline AND a blank/degenerate
// inline frame is rejected (the same gate backgrounds get). A rejected inline image
// throws → generateDeck records a warning and the slide renders without it.
// ponytail: inline images are not reference-anchored to FAL_REF_IMAGE like
// backgrounds are (would need FederatedImageResolver to thread referenceImages);
// backgrounds carry the anchor, which is the primary consistency lever.
const inlineResolver: ImageResolver = {
  async resolve(req) {
    const r = await falImages.resolve(req);
    if (!r || typeof r.url !== "string" || r.url.startsWith("data:")) return r;
    const resp = await fetch(r.url);
    if (!resp.ok) throw new Error(`inline image fetch failed: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const chk = await inspectImageBytes(buf);
    if (chk.blank) throw new Error(`inline image rejected: ${chk.reason}`);
    return { ...r, url: `data:image/jpeg;base64,${buf.toString("base64")}` };
  },
};

console.log(`rendering ${skillName} with per-slide FAL backgrounds${refImage ? " (reference-anchored, nano-banana)" : ""}…`);
const bleedCount = payload.slides.filter((s: { bgPrompt?: string }) => typeof s.bgPrompt === "string").length;
// Inline image slots (subject+category) also need real photos — specimen
// plates, editorial photo cells, split-visual image halves. The background
// provider only fills bgPrompt bleeds, so without this they render as empty
// frames. {{@placeholder}} slots are NOT images[] and stay placeholder.
const inlineImgCount = payload.slides.reduce(
  (n: number, s: { images?: unknown[] }) => n + (Array.isArray(s.images) ? s.images.length : 0),
  0,
);
const perImage = refImage ? 0.039 : 0.025;
console.log(`  ${bleedCount} bleed-slides + ${inlineImgCount} inline images will hit FAL (~$${((bleedCount + inlineImgCount) * perImage).toFixed(3)} est.)`);

const t0 = Date.now();
const result = await generateDeck(
  {
    skillName,
    userPrompt: `${skillName} deck`,
    slideCount: payload.slides.length,
    imageBudget: inlineImgCount,
  },
  { skillsRoot, llm, images: inlineImgCount > 0 ? inlineResolver : noImg, backgroundGenerator: bg },
);
console.log(`generated ${result.slides.length} slides in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const w of result.warnings) console.log("  warning:", w);

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

// Wire the DOM gate (occupancy + legibility + richness + chart-empty) into the
// FAL render so a deck cannot reach PDF export ungated. GATE=0 to skip.
if (process.env.GATE !== "0") {
  const rel = `scripts/${skillName}-fal-deck${refImage ? "-ref" : ""}.html`;
  const g = spawnSync("npx", ["tsx", resolve(__dirname, "measure-occupancy.mts"), rel], { stdio: "inherit" });
  if (g.status !== 0) {
    console.error("GATE FAILED — occupancy/legibility/richness flagged the deck (output above). Fix and re-render, or set GATE=0 during iteration.");
    process.exit(1);
  }
}
