import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeck,
  loadSkill,
  renderDeckShell,
  type LLMClient,
  type ImageResolver,
} from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const productionSkills = resolve(repoRoot, "skills");
const generatedExamples = resolve(repoRoot, "examples", "generated");

const noImg: ImageResolver = { async resolve() { throw new Error("none"); } };

async function buildDeck(skillName: string, jsonName: string, skillsRoot: string) {
  const payload = JSON.parse(
    await readFile(resolve(repoRoot, `scripts/${jsonName}`), "utf-8"),
  );
  const llm: LLMClient = { async generateSlideTree() { return payload; } };
  const skill = await loadSkill(resolve(skillsRoot, skillName));
  const result = await generateDeck(
    { skillName, userPrompt: "x", slideCount: payload.slides.length, imageBudget: 0 },
    { skillsRoot, llm, images: noImg },
  );
  const shell = renderDeckShell(skill);
  const html =
    shell.head.replace(
      "body { margin: 0; background: #1a1a1a; padding: 40px; }",
      "body { margin: 0; background: #d6d6d6; padding: 0; } .slide { margin: 0 0 24px; box-shadow: none; }",
    ) +
    result.slides.map((s) => s.html).join("\n\n") +
    "\n" +
    shell.foot;
  const out = resolve(repoRoot, `scripts/${skillName}-deck.html`);
  await writeFile(out, html);
  console.log(skillName, "→", out, "(", result.slides.length, "slides,", result.warnings.length, "warnings)");
  for (const w of result.warnings) console.log("  -", w);
}

// Production preset skills
await buildDeck("mckinsey", "mckinsey-deck.json", productionSkills);
await buildDeck("launch-warm", "launch-warm-deck.json", productionSkills);

// Generator-output examples — these are NOT production presets, they're
// validation artifacts proving the skill-generator can emit working skills
// from free-form briefs. The Meta-skill (engine/skill-generator.ts) is what's
// shipped; these are just "what its output looks like" for 4 sample briefs.
await buildDeck("lovable", "lovable-deck.json", generatedExamples);
await buildDeck("stripe-feel", "stripe-feel-deck.json", generatedExamples);
await buildDeck("apple-headspace", "apple-headspace-deck.json", generatedExamples);
await buildDeck("linear-feel", "linear-feel-deck.json", generatedExamples);
