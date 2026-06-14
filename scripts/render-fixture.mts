// Render a fixture deck to standalone HTML with NO image providers (deterministic,
// no FAL). Usage: npx tsx scripts/render-fixture.mts <skillName> <fixtureRelPath> <outRelPath>
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDeck, loadSkill, wrapAsStandaloneHtml, type LLMClient, type ImageResolver } from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const [skillName, fixtureArg, outArg, skillsRootArg] = process.argv.slice(2);
if (!skillName || !fixtureArg || !outArg) { console.error("Usage: tsx render-fixture.mts <skill> <fixture> <out> [skillsRoot]"); process.exit(2); }

const skillsRoot = resolve(repoRoot, skillsRootArg ?? "skills");
const payload = JSON.parse(await readFile(resolve(repoRoot, fixtureArg), "utf8"));
const llm: LLMClient = { async generateSlideTree() { return payload; } };
const noImg: ImageResolver = { async resolve() { throw new Error("none"); } };
const result = await generateDeck(
  { skillName, userPrompt: `${skillName} fixture`, slideCount: payload.slides.length, imageBudget: 0, illustrative: true },
  { skillsRoot, llm, images: noImg },
);
const skill = await loadSkill(resolve(skillsRoot, skillName));
let html = wrapAsStandaloneHtml(skill, result.slides);
html = html.replace("body { margin: 0; background: #1a1a1a; padding: 40px; }",
  "body { margin: 0; background: #d6d6d6; padding: 0; } .slide { margin: 0 0 24px; box-shadow: none; }");
await writeFile(resolve(repoRoot, outArg), html);
for (const w of result.warnings) console.log("warning:", w);
const emptyCharts = [...html.matchAll(/<!--chart-empty:([a-z0-9-]*)-->/gi)].map((m) => m[1] || "none");
console.log("wrote", outArg, "slides:", result.slides.length);
if (emptyCharts.length) {
  console.error(`ERROR: ${emptyCharts.length} {{@chart}} directive(s) rendered EMPTY [${emptyCharts.join(", ")}]. Usually a bad data slot (numbers must be comma/space/pipe separated) or an unknown chart type. A blank chart must never ship.`);
  process.exit(1);
}

// Wire the DOM gate (occupancy + legibility + richness) into the render step so a
// deck cannot reach the next stage ungated. Set GATE=0 to skip during iteration.
if (process.env.GATE !== "0") {
  const g = spawnSync("npx", ["tsx", resolve(__dirname, "measure-occupancy.mts"), outArg], { stdio: "inherit" });
  if (g.status !== 0) {
    console.error("GATE FAILED — occupancy/legibility/richness flagged the deck (output above). Fix the slides and re-render, or set GATE=0 to render anyway during iteration.");
    process.exit(1);
  }
}
