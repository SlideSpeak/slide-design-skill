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

  await mkdir(resolve(targetDir, "examples"), { recursive: true });

  const filesToTemplate = ["SKILL.md", "layout-grammar.md", "image-style.md", "components.html"];
  for (const f of filesToTemplate) {
    const src = await readFile(resolve(templatesDir, f), "utf8");
    const replaced = src.replaceAll("__SKILL_NAME__", name);
    await writeFile(resolve(targetDir, f), replaced, "utf8");
  }

  // tokens.json is pure JSON, no name interpolation needed
  await copyFile(resolve(templatesDir, "tokens.json"), resolve(targetDir, "tokens.json"));

  console.log(`\n✓ Created skill "${name}" at ${targetDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit SKILL.md frontmatter (description, inspiration, typography_kit, color_kit, image_style, forbidden)`);
  console.log(`  2. Tune tokens.json (color.signal.primary, type families)`);
  console.log(`  3. Fill layout-grammar.md (slide-types + composition rules)`);
  console.log(`  4. Fill image-style.md (AI prompt template + decision rules)`);
  console.log(`  5. Add <template id="slide-{type}"> per slide-type in components.html`);
  console.log(`  6. Validate: npx tsx scripts/validate-skill.ts`);
  console.log(`\nSee meta-generator/GENERATOR.md for the full guide.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
