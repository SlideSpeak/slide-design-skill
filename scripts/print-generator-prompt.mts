// Print the exact skill-generator system prompt the engine composes for a brief,
// so an open-loop test can drive a fresh generator-LLM with the real contract
// (register-specific SKILL REQUIREMENTS blocks included).
// Usage: npx tsx scripts/print-generator-prompt.mts <slug> "<brief value>" [skillsRoot] [deckRequest]
//   deckRequest (optional): the actual deck topic/request. When given, the register
//   is inferred from IT (the deck intent), not the style cue — pass the same text
//   the deck author will receive so skill-gen and deck-time agree on the register.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeGeneratorPrompt, buildReferenceLibrary, type StyleBrief } from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const [slug, value, skillsRootArg, deckRequest] = process.argv.slice(2);
if (!slug || !value) {
  console.error('Usage: tsx print-generator-prompt.mts <slug> "<brief value>" [skillsRoot] [deckRequest]');
  process.exit(2);
}
const skillsRoot = resolve(repoRoot, skillsRootArg ?? "skills");
const refs = await buildReferenceLibrary(skillsRoot);
const brief: StyleBrief = { kind: "inspiration", value };
// Infer the register from the deck request when supplied, else from the brief value
// (which, for the rich open-loop briefs, already carries the register words).
process.stdout.write(
  composeGeneratorPrompt(brief, refs, slug, { userPrompt: deckRequest ?? value }),
);
