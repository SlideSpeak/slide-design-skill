// Measure layout fit of a fixture deck. Usage:
//   npx tsx scripts/measure-fit.mts <skillName> <fixtureRelPath>
// example: npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json
//
// Renders via the real engine (no FAL), injects a measuring script, reads the
// final DOM with Brave --dump-dom, and asserts the Bounded Intrinsic Content
// Island contract. Exit 1 on any violation.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeck,
  loadSkill,
  wrapAsStandaloneHtml,
  type LLMClient,
  type ImageResolver,
} from "../engine/index.ts";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

// Thresholds. A fixed designed gap is ~26-40px; space-evenly stretch was ~150px.
const GAP_MAX = 80;       // px — any inter-row gap above this means stretched distribution
const OVERFLOW_TOL = 2;   // px — sub-pixel rounding allowance

const [skillName, fixtureArg] = process.argv.slice(2);
if (!skillName || !fixtureArg) {
  console.error("Usage: tsx measure-fit.mts <skillName> <fixtureRelPath>");
  process.exit(2);
}

const payload = JSON.parse(await readFile(resolve(repoRoot, fixtureArg), "utf8"));
const llm: LLMClient = { async generateSlideTree() { return payload; } };
const noImg: ImageResolver = { async resolve() { throw new Error("none"); } };

const result = await generateDeck(
  { skillName, userPrompt: `${skillName} fit fixture`, slideCount: payload.slides.length, imageBudget: 0 },
  { skillsRoot: resolve(repoRoot, "skills"), llm, images: noImg },
);

const skill = await loadSkill(resolve(repoRoot, "skills", skillName));
const body = wrapAsStandaloneHtml(skill, result.slides);

// Inject a measuring script that runs after layout and serialises per-slide
// box metrics into <pre id="FITOUT">…</pre> so --dump-dom can carry it out.
const measurer = `
<script>
window.addEventListener('load', function () {
  function rel(el, top){ var r = el.getBoundingClientRect(); return { top: r.top - top, bottom: r.bottom - top }; }
  var out = [];
  document.querySelectorAll('.slide').forEach(function (slide, i) {
    var stop = slide.getBoundingClientRect().top;
    var type = slide.getAttribute('data-slide-type') || '';
    var density = slide.getAttribute('data-density') || '';
    var island = slide.querySelector('[data-fit="island"]');
    var footer = slide.querySelector('[data-fit="footer"]');
    var rows = slide.querySelector('[data-fit="rows"]');
    var rec = { i: i, type: type, density: density };
    if (island) {
      rec.islandBottom = rel(island, stop).bottom;
      rec.islandClip = island.scrollHeight - island.clientHeight; // >0 means content overflowed the island
    }
    rec.footerTop = footer ? rel(footer, stop).top : (1080 - 32);
    if (rows) {
      var kids = Array.prototype.filter.call(rows.children, function (c) { return c.getBoundingClientRect().height > 0; });
      var gaps = [];
      for (var k = 0; k < kids.length - 1; k++) {
        gaps.push(rel(kids[k + 1], stop).top - rel(kids[k], stop).bottom);
      }
      rec.maxGap = gaps.length ? Math.max.apply(null, gaps) : 0;
      rec.rowCount = kids.length;
    }
    out.push(rec);
  });
  var pre = document.createElement('pre');
  pre.id = 'FITOUT';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
});
</script>`;
const html = body.replace("</body>", measurer + "\n</body>");

const tmp = resolve(repoRoot, "scripts", `.fit-${skillName}.html`);
await writeFile(tmp, html);

const { stdout } = await execFileP(BRAVE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--virtual-time-budget=4000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${tmp}`,
], { maxBuffer: 64 * 1024 * 1024 });
await unlink(tmp).catch(() => {});

const m = stdout.match(/<pre id="FITOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.error("No FITOUT block — render or measure failed."); process.exit(1); }
const metrics = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));

let failures = 0;
console.log("slide                                  density     islandBot  footerTop  clip  maxGap  verdict");
for (const r of metrics) {
  const crash = r.islandBottom != null && r.islandBottom > r.footerTop + OVERFLOW_TOL;
  const clip = (r.islandClip ?? 0) > OVERFLOW_TOL;
  const stretched = (r.maxGap ?? 0) > GAP_MAX;
  const bad = crash || clip || stretched;
  if (bad) failures++;
  const why = [crash && "CRASH", clip && "OVERFLOW", stretched && "STRETCHED"].filter(Boolean).join(",") || "ok";
  console.log(
    `${(r.type + " #" + r.i).padEnd(38)} ${(r.density || "-").padEnd(11)} ` +
    `${String(Math.round(r.islandBottom ?? 0)).padStart(9)} ${String(Math.round(r.footerTop ?? 0)).padStart(10)} ` +
    `${String(Math.round(r.islandClip ?? 0)).padStart(5)} ${String(Math.round(r.maxGap ?? 0)).padStart(7)}  ${why}`
  );
}
console.log(`\n${metrics.length - failures}/${metrics.length} slides pass.`);
process.exit(failures ? 1 : 0);
