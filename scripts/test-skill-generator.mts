import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeGeneratorPrompt,
  parseGeneratedSkill,
  materializeSkill,
  buildReferenceLibrary,
  slugForBrief,
  type StyleBrief,
  type GeneratorLLM,
  type GeneratedSkillFiles,
} from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(__dirname, "..", "skills");

// ─────────────────────────────────────────────────────────────────────────
// 1. Slug helper sanity
// ─────────────────────────────────────────────────────────────────────────

const cases: Array<[StyleBrief, string]> = [
  [{ kind: "inspiration", value: "like Lovable" }, "like-lovable"],
  [{ kind: "inspiration", value: "Stripe brand-feel" }, "stripe-brand-feel"],
  [{ kind: "mix", values: ["Apple", "Headspace"] }, "apple-headspace"],
  [{ kind: "brand-url", url: "https://www.stripe.com/pricing" }, "stripe-com"],
  [{ kind: "preset", name: "lovable" }, "lovable"],
];
for (const [brief, expected] of cases) {
  const got = slugForBrief(brief);
  console.log(got === expected ? "✓" : "✗", `slug ${JSON.stringify(brief)} → "${got}"${got === expected ? "" : ` (expected "${expected}")`}`);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Compose generator prompt — sanity check it contains the brief + refs
// ─────────────────────────────────────────────────────────────────────────

const refs = await buildReferenceLibrary(skillsRoot);
console.log(`\nLoaded ${refs.length} reference skills:`, refs.map((r) => r.name).join(", "));

const sampleBrief: StyleBrief = { kind: "inspiration", value: "like Notion" };
const sampleSlug = slugForBrief(sampleBrief);
const prompt = composeGeneratorPrompt(sampleBrief, refs, sampleSlug);
console.log(`\nPrompt for ${JSON.stringify(sampleBrief)}: ${prompt.length} chars`);
const checks: Array<[string, boolean]> = [
  ["mentions brief", prompt.includes("like Notion")],
  ["mentions slug", prompt.includes(`"${sampleSlug}"`)],
  ["lists references", refs.every((r) => prompt.includes(`"${r.name}"`))],
  ["names tokens.json shape", prompt.includes('"page": { "ratio": "16:9"')],
  ["names 6 files in RESPONSE FORMAT", prompt.includes("SKILL.md") && prompt.includes("components.html") && prompt.includes("image-style.md") && prompt.includes("chrome.css")],
  ["names validator constraints", prompt.includes("VALIDATOR CONSTRAINTS")],
  ["exposes reference structure (slide types)", /structure \(\d+ slide types\):/.test(prompt)],
  ["instructs divergence from references", prompt.includes("DIVERGE FROM THE REFERENCES")],
];
for (const [name, ok] of checks) console.log(ok ? "✓" : "✗", name);

// 2b. Register-specific skill-requirement blocks are injected by brief inference
const pitchBrief: StyleBrief = { kind: "inspiration", value: "an investor pitch deck to raise a Series B" };
const pitchPrompt = composeGeneratorPrompt(pitchBrief, refs, slugForBrief(pitchBrief));
const edBrief: StyleBrief = { kind: "inspiration", value: "a photo-led impact report for an ocean nonprofit" };
const edPrompt = composeGeneratorPrompt(edBrief, refs, slugForBrief(edBrief));
const regChecks: Array<[string, boolean]> = [
  ["pitch brief injects PITCH SKILL REQUIREMENTS", /PITCH SKILL REQUIREMENTS/.test(pitchPrompt)],
  ["pitch block forbids a fixed skeleton and names spine families", /spine family/.test(pitchPrompt) && /do not reach for a fixed pitch skeleton/i.test(pitchPrompt)],
  ["pitch brief omits the editorial block", !/EDITORIAL SKILL REQUIREMENTS/.test(pitchPrompt)],
  ["editorial brief injects EDITORIAL SKILL REQUIREMENTS", /EDITORIAL SKILL REQUIREMENTS/.test(edPrompt)],
  ["editorial brief omits the pitch block", !/PITCH SKILL REQUIREMENTS/.test(edPrompt)],
  ["neutral brief omits both register blocks", !/PITCH SKILL REQUIREMENTS/.test(prompt) && !/EDITORIAL SKILL REQUIREMENTS/.test(prompt)],
];
for (const [name, ok] of regChecks) console.log(ok ? "✓" : "✗", name);

// ─────────────────────────────────────────────────────────────────────────
// 3. End-to-end with a "frozen LLM" — replays the apple-headspace files we
//    just generated manually, as if they were a fresh LLM response. Proves
//    parse → materialize → loadSkill round-trip works without changes.
// ─────────────────────────────────────────────────────────────────────────

async function loadFiles(nameOrRelPath: string): Promise<GeneratedSkillFiles> {
  const dir = nameOrRelPath.includes("/") ? resolve(skillsRoot, nameOrRelPath) : resolve(skillsRoot, nameOrRelPath);
  const [skill, tokens, grammar, components, image, chrome] = await Promise.all([
    readFile(resolve(dir, "SKILL.md"), "utf8"),
    readFile(resolve(dir, "tokens.json"), "utf8"),
    readFile(resolve(dir, "layout-grammar.md"), "utf8"),
    readFile(resolve(dir, "components.html"), "utf8"),
    readFile(resolve(dir, "image-style.md"), "utf8"),
    readFile(resolve(dir, "chrome.css"), "utf8").catch(() => ""),
  ]);
  return {
    "SKILL.md": skill,
    "tokens.json": tokens,
    "layout-grammar.md": grammar,
    "components.html": components,
    "image-style.md": image,
    "chrome.css": chrome,
  };
}

const frozenFiles = await loadFiles("../examples/generated/apple-headspace");
// Pack as a fake LLM JSON response then run it through parse → materialize.
const frozenJson = JSON.stringify(frozenFiles);
const fakeLLM: GeneratorLLM = {
  async generateSkill() {
    return parseGeneratedSkill(frozenJson);
  },
};

const fakeBrief: StyleBrief = { kind: "mix", values: ["apple", "headspace"] };
const fakeSlug = slugForBrief(fakeBrief);
console.log(`\nEnd-to-end with frozen LLM (slug=${fakeSlug})`);

// We can't use materializeSkill directly here because the frozen SKILL.md has
// name=apple-headspace, which is also our slug. Validate happy path then.
const fakePrompt = composeGeneratorPrompt(fakeBrief, refs, fakeSlug);
const files = await fakeLLM.generateSkill(fakePrompt, fakeBrief);
const { skill, cleanup } = await materializeSkill(files, fakeSlug);

console.log("✓ materialized skill name:", skill.frontmatter.name);
console.log("✓ slide types:", skill.grammar.slideTypes.length);
console.log("✓ tokens.page:", `${skill.tokens.page.width}×${skill.tokens.page.height}`);
console.log("✓ components extracted:", (skill.components.match(/id="slide-/g) || []).length);

await cleanup();

// ─────────────────────────────────────────────────────────────────────────
// 4. Parse error paths
// ─────────────────────────────────────────────────────────────────────────

console.log("\nParser error handling:");
const errorCases: Array<[string, string]> = [
  ["not JSON", "this is not json"],
  ["wrong shape (array)", JSON.stringify([1, 2, 3])],
  ["missing key", JSON.stringify({ "SKILL.md": "x", "tokens.json": "x", "layout-grammar.md": "x", "components.html": "x" })],
  ["non-string value", JSON.stringify({ "SKILL.md": 42, "tokens.json": "", "layout-grammar.md": "", "components.html": "", "image-style.md": "" })],
];
for (const [name, payload] of errorCases) {
  try { parseGeneratedSkill(payload); console.log("✗", name, "should have thrown"); }
  catch (e) { console.log("✓", name, "→", (e as Error).message.slice(0, 80)); }
}

// JSON-in-code-fence (should succeed):
const fenced = "```json\n" + JSON.stringify(frozenFiles) + "\n```";
try {
  const out = parseGeneratedSkill(fenced);
  console.log("✓ json-in-code-fence parsed:", Object.keys(out).length, "keys");
} catch (e) {
  console.log("✗ json-in-code-fence failed:", (e as Error).message);
}

console.log("\nall done");
