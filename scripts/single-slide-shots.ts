import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDeckShell, loadSkill } from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// For each smoke deck, extract just the Nth slide into a standalone HTML.
const targets: { skill: string; idx: number; label: string }[] = [
  { skill: "academic", idx: 2, label: "data" },             // big-number slide
  { skill: "academic", idx: 4, label: "discussion" },       // 2-col discussion
  { skill: "academic", idx: 5, label: "conclusion" },       // 3 takeaways
  { skill: "pitch", idx: 1, label: "problem" },
  { skill: "pitch", idx: 3, label: "traction" },
  { skill: "product-marketing", idx: 2, label: "feature" },
  { skill: "training", idx: 3, label: "concept" },
  { skill: "training", idx: 5, label: "closing" },
];

for (const t of targets) {
  const html = await readFile(resolve(repoRoot, `scripts/${t.skill}-smoke.html`), "utf-8");
  const skill = await loadSkill(resolve(repoRoot, `skills/${t.skill}`));
  const shell = renderDeckShell(skill);
  const slideRe = /<section class="slide[\s\S]*?<\/section>/g;
  const matches = html.match(slideRe);
  if (!matches || !matches[t.idx]) {
    console.error("no slide", t.idx, "for", t.skill);
    continue;
  }
  const standalone =
    shell.head.replace(
      "body { margin: 0; background: #1a1a1a; padding: 40px; }",
      "body { margin: 0; background: #fff; padding: 0; } .slide { margin: 0; box-shadow: none; }",
    ) +
    matches[t.idx] +
    "\n" +
    shell.foot;
  const out = resolve(repoRoot, `scripts/sshot-${t.skill}-${t.label}.html`);
  await writeFile(out, standalone);
  console.log("wrote", out);
}
