import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDeckShell, loadSkill } from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

async function extract(skillName: string, deckPath: string) {
  const html = await readFile(resolve(repoRoot, deckPath), "utf-8");
  const skill = await loadSkill(resolve(repoRoot, `skills/${skillName}`));
  const shell = renderDeckShell(skill);
  const slideRe = /<section class="slide[\s\S]*?<\/section>/g;
  const matches = html.match(slideRe);
  if (!matches) {
    console.error("no slides matched");
    return;
  }
  for (let i = 0; i < matches.length; i++) {
    const standalone =
      shell.head.replace(
        "body { margin: 0; background: #1a1a1a; padding: 40px; }",
        "body { margin: 0; background: #fff; padding: 0; } .slide { margin: 0; box-shadow: none; }",
      ) +
      matches[i] +
      "\n" +
      shell.foot;
    const out = resolve(repoRoot, `scripts/sl-${skillName}-${i}.html`);
    await writeFile(out, standalone);
  }
  console.log(skillName, "wrote", matches.length, "slides");
}

await extract("mckinsey", "scripts/mckinsey-deck.html");
await extract("launch-warm", "scripts/launch-warm-deck.html");
