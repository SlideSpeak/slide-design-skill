// Print the exact deck-authoring system prompt the engine hands the LLM, so an
// open-loop test can drive a fresh author with the real contract.
// Usage: npx tsx scripts/compose-prompt.mts <skill> <slideCount> "<brief>" [skillsRoot]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkill, composeSystemPrompt } from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const [skill, countArg, brief, skillsRootArg] = process.argv.slice(2);
if (!skill || !countArg || !brief) {
  console.error('Usage: tsx compose-prompt.mts <skill> <slideCount> "<brief>" [skillsRoot]');
  process.exit(2);
}
const skillsRoot = resolve(repoRoot, skillsRootArg ?? "skills");
const s = await loadSkill(resolve(skillsRoot, skill));
process.stdout.write(
  composeSystemPrompt(s, { userPrompt: brief, slideCount: Number(countArg), language: "de" }),
);
