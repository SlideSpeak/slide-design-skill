// Measure per-slide occupancy of a rendered deck and flag underfilled slides.
// Usage: npx tsx scripts/measure-occupancy.mts <renderedDeckHtmlRelPath>
//
// Structure-agnostic: it measures the vertical extents of REAL content
// (text-node rects, images, rules) per slide — never layout containers — and
// runs the pure scorer (engine/occupancy.ts). Works on any rendered deck,
// bespoke or generated; no data-fit attributes required. Exit 1 on any underfill.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreOccupancy, scoreCellOccupancy } from "../engine/occupancy.ts";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

const [htmlArg] = process.argv.slice(2);
if (!htmlArg) {
  console.error("Usage: tsx measure-occupancy.mts <renderedDeckHtmlRelPath>");
  process.exit(2);
}

const htmlPath = resolve(repoRoot, htmlArg);
const html = await readFile(htmlPath, "utf8");

const measurer = `
<script>
window.addEventListener('load', function () {
  var out = [];
  document.querySelectorAll('.slide').forEach(function (slide, i) {
    var sr = slide.getBoundingClientRect(), stop = sr.top;
    var cs = getComputedStyle(slide), safe = parseFloat(cs.paddingTop) || 0;
    var rects = [];
    var w = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT, null);
    var range = document.createRange(), n;
    while ((n = w.nextNode())) {
      if (!n.textContent.trim()) continue;
      range.selectNodeContents(n);
      var rl = range.getClientRects();
      for (var j = 0; j < rl.length; j++) if (rl[j].height > 0.5) rects.push([Math.round(rl[j].top - stop), Math.round(rl[j].bottom - stop)]);
    }
    slide.querySelectorAll('img,svg,hr').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.height > 0.5) rects.push([Math.round(r.top - stop), Math.round(r.bottom - stop)]);
    });
    // Filled blocks: elements whose background CONTRASTS with the page read as
    // occupied (swatches, image tiles, lifted cards). A near-page-colour card
    // (barely visible) does NOT count, matching how the eye reads it as empty.
    function rgb(s) { var m = String(s).match(/(\\d+)\\D+(\\d+)\\D+(\\d+)(?:\\D+([\\d.]+))?/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null; }
    var page = rgb(cs.backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
    slide.querySelectorAll('*').forEach(function (el) {
      var ecs = getComputedStyle(el);
      var hasImg = ecs.backgroundImage && ecs.backgroundImage !== 'none';
      var c = rgb(ecs.backgroundColor);
      var contrast = c ? Math.abs(c.r - page.r) + Math.abs(c.g - page.g) + Math.abs(c.b - page.b) : 0;
      if (hasImg || (c && c.a > 0.5 && contrast > 60)) {
        var r = el.getBoundingClientRect();
        if (r.height > 4 && r.width > 4) rects.push([Math.round(r.top - stop), Math.round(r.bottom - stop)]);
      }
    });
    // Card-like cells: bordered (2+ sides) or contrast-tinted boxes holding
    // text, measured by their OWN content so edge-pinned voids and one-word
    // cards inside cards are visible (the page scan reads the cell surface as
    // filled). Leaf cells only; near-slide-sized frames are the page's job.
    var slideArea = sr.width * sr.height;
    var candidates = [];
    slide.querySelectorAll('*').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.height < 160 || r.width < 160) return;
      if (r.width * r.height > 0.55 * slideArea) return;
      if (!el.textContent.trim()) return;
      var ecs = getComputedStyle(el);
      var sides = 0;
      ['Top', 'Right', 'Bottom', 'Left'].forEach(function (s) {
        if (parseFloat(ecs['border' + s + 'Width']) > 0 && ecs['border' + s + 'Style'] !== 'none') sides++;
      });
      var c = rgb(ecs.backgroundColor);
      var contrast = c ? Math.abs(c.r - page.r) + Math.abs(c.g - page.g) + Math.abs(c.b - page.b) : 0;
      var tinted = (ecs.backgroundImage && ecs.backgroundImage !== 'none') || (c && c.a > 0.5 && contrast > 60);
      if (sides >= 2 || tinted) candidates.push(el);
    });
    var cells = [];
    candidates.forEach(function (el) {
      var isLeaf = true;
      for (var k = 0; k < candidates.length; k++) {
        if (candidates[k] !== el && el.contains(candidates[k])) { isLeaf = false; break; }
      }
      if (!isLeaf) return;
      var r = el.getBoundingClientRect();
      var ecs = getComputedStyle(el);
      var pad = ((parseFloat(ecs.paddingTop) || 0) + (parseFloat(ecs.paddingBottom) || 0)) / 2;
      var cellRects = [];
      var textArea = 0;
      var cw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var cr = document.createRange(), cn;
      while ((cn = cw.nextNode())) {
        if (!cn.textContent.trim()) continue;
        cr.selectNodeContents(cn);
        var crl = cr.getClientRects();
        for (var j = 0; j < crl.length; j++) {
          if (crl[j].height <= 0.5) continue;
          cellRects.push([Math.round(crl[j].top - r.top), Math.round(crl[j].bottom - r.top)]);
          textArea += crl[j].width * crl[j].height;
        }
      }
      var hasVisual = !!el.querySelector('img,svg,canvas,video') ||
        (ecs.backgroundImage && ecs.backgroundImage !== 'none');
      el.querySelectorAll('img,svg,hr').forEach(function (v) {
        var vr = v.getBoundingClientRect();
        if (vr.height > 0.5) cellRects.push([Math.round(vr.top - r.top), Math.round(vr.bottom - r.top)]);
      });
      if (!hasVisual) {
        var cellBg = rgb(ecs.backgroundColor);
        var base = (cellBg && cellBg.a > 0.5) ? cellBg : page;
        var descs = el.querySelectorAll('*');
        for (var d = 0; d < descs.length; d++) {
          var dcs = getComputedStyle(descs[d]);
          if (dcs.backgroundImage && dcs.backgroundImage !== 'none') { hasVisual = true; break; }
          var dc = rgb(dcs.backgroundColor);
          if (dc && dc.a > 0.5 && (Math.abs(dc.r - base.r) + Math.abs(dc.g - base.g) + Math.abs(dc.b - base.b)) > 60) {
            var dr = descs[d].getBoundingClientRect();
            if (dr.height > 4 && dr.width > 4) cellRects.push([Math.round(dr.top - r.top), Math.round(dr.bottom - r.top)]);
          }
        }
      }
      var ownBg = rgb(ecs.backgroundColor);
      cells.push({
        height: Math.round(r.height),
        area: Math.round(r.width * r.height),
        pad: Math.round(pad),
        rects: cellRects,
        textArea: Math.round(textArea),
        hasVisual: hasVisual,
        bg: (ownBg && ownBg.a > 0.5) ? (ownBg.r + ',' + ownBg.g + ',' + ownBg.b) : null,
      });
    });
    out.push({
      i: i,
      type: slide.getAttribute('data-slide-type') || slide.className.replace('slide ', '').split(' ')[0] || '',
      density: slide.getAttribute('data-density') || '',
      slideHeight: Math.round(sr.height),
      safe: Math.round(safe),
      rects: rects,
      cells: cells,
    });
  });
  var pre = document.createElement('pre');
  pre.id = 'OCCOUT';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
});
</script>`;

const tmp = resolve(repoRoot, "scripts", ".occ-measure.html");
await writeFile(tmp, html.replace("</body>", measurer + "\n</body>"));

const { stdout } = await execFileP(BRAVE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--virtual-time-budget=8000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${tmp}`,
], { maxBuffer: 96 * 1024 * 1024 });
await unlink(tmp).catch(() => {});

const m = stdout.match(/<pre id="OCCOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.error("No OCCOUT block — render or measure failed."); process.exit(1); }
const slides = JSON.parse(
  m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
);

let failures = 0;
console.log("slide                         density      maxGap  at       verdict");
for (const s of slides) {
  const res = scoreOccupancy({ rects: s.rects, slideHeight: s.slideHeight, safe: s.safe, density: s.density });
  const cellRes = scoreCellOccupancy({ cells: s.cells ?? [], density: s.density });
  if (!res.filled || !cellRes.filled) failures++;
  const verdict = !res.filled ? "UNDERFILL" : !cellRes.filled ? "CELL-UNDERFILL" : "ok";
  console.log(
    `${(s.type + " #" + s.i).padEnd(28)} ${(s.density || "-").padEnd(11)} ` +
    `${String(res.maxGapPx).padStart(6)}  ${(res.gapAt || "-").padEnd(7)} ${verdict}`,
  );
  for (const f of cellRes.failures) {
    console.log(`  └ cell ${f.index}: ${f.kind} — ${f.detail}`);
  }
}
console.log(`\n${slides.length - failures}/${slides.length} slides fill the frame.`);
process.exit(failures ? 1 : 0);
