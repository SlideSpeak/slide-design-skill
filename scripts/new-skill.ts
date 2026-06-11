// Bootstrap a new skill from the meta-generator templates.
// Usage: npx tsx scripts/new-skill.ts <skill-name>

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const templatesDir = resolve(repoRoot, "meta-generator/templates");
const skillsRoot = resolve(repoRoot, "skills");

const NAME_RE = /^[a-z][a-z0-9-]*$/;

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage: tsx scripts/new-skill.ts <skill-name>");
    process.exit(1);
  }
  if (!NAME_RE.test(name)) {
    console.error(`Skill name must match ${NAME_RE} (lowercase, hyphens). Got: "${name}".`);
    process.exit(1);
  }

  const targetDir = resolve(skillsRoot, name);
  if (existsSync(targetDir)) {
    console.error(`Skill "${name}" already exists at ${targetDir}`);
    process.exit(1);
  }

  await mkdir(targetDir, { recursive: true });

  const filesToTemplate = ["SKILL.md", "layout-grammar.md", "image-style.md", "components.html", "chrome.css"];
  for (const f of filesToTemplate) {
    const src = await readFile(resolve(templatesDir, f), "utf8");
    const replaced = src.replaceAll("__SKILL_NAME__", name);
    await writeFile(resolve(targetDir, f), replaced, "utf8");
  }

  // tokens.json is pure JSON, no name interpolation needed
  await copyFile(resolve(templatesDir, "tokens.json"), resolve(targetDir, "tokens.json"));

  console.log(`\n✓ Created skill "${name}" at ${targetDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit SKILL.md frontmatter + body, incl. the "## Graphic system" section`);
  console.log(`  2. Tune tokens.json (color.signal.primary, type families, icon.kit)`);
  console.log(`  3. Author chrome.css (the look: labels, footer, tables, rhythm, devices)`);
  console.log(`  4. Fill layout-grammar.md (slide-types + composition rules + families)`);
  console.log(`  5. Fill image-style.md (AI prompt template + decision rules)`);
  console.log(`  6. Add <template id="slide-{type}"> per slide-type in components.html`);
  console.log(`  7. Validate: npm run validate, then render a fixture and run`);
  console.log(`     npm run measure:occupancy on it (fix every flagged slide)`);
  console.log(`\nSee meta-generator/GENERATOR.md for the full guide.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
