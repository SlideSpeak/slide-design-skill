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
import { scoreOccupancy, scoreCellOccupancy, scoreLegibility } from "../engine/occupancy.ts";
import { scoreDeckRichness } from "../engine/richness.ts";

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

// Density-agnostic gate: a {{@chart}} that rendered to nothing leaves an
// invisible <!--chart-empty:TYPE--> marker (renderer.ts). The occupancy scorer
// exempts editorial slides, so a blank chart on a hero slide would otherwise
// pass green. Fail hard on any marker, regardless of density.
const emptyCharts = [...html.matchAll(/<!--chart-empty:([a-z0-9-]*)-->/gi)].map((m) => m[1] || "none");
if (emptyCharts.length) {
  console.error(`CHART-EMPTY: ${emptyCharts.length} chart(s) rendered no output [${emptyCharts.join(", ")}]. Fix the data slot (comma/space/pipe separated numbers) or the chart type, then re-render. A blank chart fails the gate on any density.`);
  process.exit(1);
}

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
    // --- Visual-event richness: count REALIZED visual elements on this slide. ---
    // Sources: directive output stamped data-visual-event (chart/icon/table/...),
    // skill opt-in marks (meter/signature-mark/...), plus heuristic credit so skills
    // that do not opt in still register their charts/images/tables/giant numerals.
    // NOTE: 'placeholder' is deliberately NOT a richness-satisfying system event.
    // An empty "Your image here" frame must not let a data-bearing slide pass the
    // richness floor (it is counted + surfaced separately below).
    var SYSK = { chart: 1, table: 1, 'visual-plate': 1 };
    var sys = 0, mk = 0;
    slide.querySelectorAll('[data-visual-event]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return; // invisible / collapsed
      var kind = el.getAttribute('data-visual-event') || '';
      var area = r.width * r.height;
      if (SYSK[kind] && area >= 8000) sys++; else mk++;
    });
    // Heuristic credit for un-stamped exhibits (charts/images/tables in hand-built skills).
    slide.querySelectorAll('img,svg,table').forEach(function (el) {
      if (el.hasAttribute('data-visual-event') || el.closest('[data-visual-event]')) return;
      var r = el.getBoundingClientRect(); var area = r.width * r.height; var tag = el.tagName.toLowerCase();
      if (tag === 'table' && area >= 8000) sys++;
      else if (tag === 'img' && area >= 12000) sys++;
      else if (tag === 'svg' && r.width >= 160 && area >= 30000) sys++;
    });
    // Oversized display type (a giant numeral / display word) is itself a visual event.
    var giant = false;
    var gw = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT, null), gn2;
    while ((gn2 = gw.nextNode())) {
      if (!gn2.textContent.trim()) continue;
      var pe = gn2.parentElement; if (!pe) continue;
      if ((parseFloat(getComputedStyle(pe).fontSize) || 0) >= 60) { giant = true; break; }
    }
    if (giant) mk++;
    // A grid of >=2 distinct card-like cells reads as a visual structure.
    if (cells.length >= 2) sys++;

    // Chromatic (saturated) painted area — for the soft, deck-level palette warning.
    var chroma = 0;
    slide.querySelectorAll('*').forEach(function (el) {
      var ecs2 = getComputedStyle(el);
      var cc = rgb(ecs2.backgroundColor);
      if (cc && cc.a > 0.5) {
        var sat = Math.max(cc.r, cc.g, cc.b) - Math.min(cc.r, cc.g, cc.b);
        if (sat > 28) {
          var rr = el.getBoundingClientRect();
          if (rr.width > 2 && rr.height > 2) chroma += Math.min(rr.width * rr.height, sr.width * sr.height);
        }
      }
    });

    // --- Legibility geometry: text boxes with colour + background luminance, ---
    // scrim detection, plus broken-image and visible-placeholder counts. Feeds
    // the legibility scorer (overflow / collision / contrast) and the
    // broken-image / placeholder gates.
    function lum(c) {
      if (!c) return null;
      function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    var scrims = [];
    slide.querySelectorAll('*').forEach(function (el) {
      var s = getComputedStyle(el);
      if (s.position !== 'absolute' && s.position !== 'fixed') return;
      var grad = s.backgroundImage && s.backgroundImage.indexOf('gradient') !== -1;
      var bc = rgb(s.backgroundColor); var semi = bc && bc.a > 0.1 && bc.a < 0.99;
      if (!grad && !semi) return;
      var sR = el.getBoundingClientRect();
      scrims.push([sR.left - sr.left, sR.top - stop, sR.right - sr.left, sR.bottom - stop]);
    });
    var elIds = new Map(); var elSeq = 0;
    var textBoxes = [];
    var tw2 = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT, null), tn2;
    var tr2 = document.createRange();
    while ((tn2 = tw2.nextNode())) {
      if (!tn2.textContent.trim()) continue;
      var pe2 = tn2.parentElement; if (!pe2) continue;
      tr2.selectNodeContents(tn2);
      var rl2 = tr2.getClientRects(); if (!rl2.length) continue;
      if (!elIds.has(pe2)) elIds.set(pe2, elSeq++);
      var elId = elIds.get(pe2);
      var pcs = getComputedStyle(pe2);
      var tlum = lum(rgb(pcs.color));
      var fs = parseFloat(pcs.fontSize) || 0;
      var bgl = null, overImg = false, anc = pe2;
      while (anc && anc !== slide.parentElement) {
        var acs = getComputedStyle(anc);
        if (acs.backgroundImage && acs.backgroundImage !== 'none' && acs.backgroundImage.indexOf('gradient') === -1) { overImg = true; break; }
        var abg = rgb(acs.backgroundColor);
        if (abg && abg.a > 0.5) { bgl = lum(abg); break; }
        anc = anc.parentElement;
      }
      if (bgl === null && !overImg) bgl = lum(page);
      for (var jj = 0; jj < rl2.length; jj++) {
        var rr2 = rl2[jj]; if (rr2.height <= 0.5) continue;
        var bx = { x0: Math.round(rr2.left - sr.left), y0: Math.round(rr2.top - stop), x1: Math.round(rr2.right - sr.left), y1: Math.round(rr2.bottom - stop), el: elId, lum: tlum, bgLum: overImg ? null : bgl, overImage: overImg, hasScrim: false, fontSize: Math.round(fs) };
        if (overImg) {
          for (var ks = 0; ks < scrims.length; ks++) {
            var sc = scrims[ks];
            if (bx.x0 >= sc[0] - 2 && bx.y0 >= sc[1] - 2 && bx.x1 <= sc[2] + 2 && bx.y1 <= sc[3] + 2) { bx.hasScrim = true; break; }
          }
        }
        textBoxes.push(bx);
      }
    }
    var brokenImgs = 0;
    slide.querySelectorAll('img').forEach(function (im) {
      var isrc = im.getAttribute('src') || '';
      if (isrc.indexOf('data:') === 0 && im.naturalWidth === 0 && im.naturalHeight === 0) brokenImgs++;
    });
    var placeholders = 0;
    slide.querySelectorAll('[data-visual-event="placeholder"]').forEach(function (el) {
      var pr = el.getBoundingClientRect();
      if (pr.width * pr.height >= 8000) placeholders++;
    });

    out.push({
      i: i,
      type: slide.getAttribute('data-slide-type') || slide.className.replace('slide ', '').split(' ')[0] || '',
      density: slide.getAttribute('data-density') || '',
      family: slide.getAttribute('data-family') || '',
      slideHeight: Math.round(sr.height),
      safe: Math.round(safe),
      rects: rects,
      cells: cells,
      system: sys,
      mark: mk,
      chroma: Math.round(chroma),
      area: Math.round(sr.width * sr.height),
      slideWidth: Math.round(sr.width),
      textBoxes: textBoxes,
      brokenImgs: brokenImgs,
      placeholders: placeholders,
    });
  });
  var pre = document.createElement('pre');
  pre.id = 'OCCOUT';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
});
</script>`;

// Process-unique temp so parallel measure runs (one per deck) never collide.
const tmp = resolve(repoRoot, "scripts", `.occ-measure-${process.pid}.html`);
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
let placeholderTotal = 0;
console.log("slide                         density      maxGap  at       verdict");
for (const s of slides) {
  const res = scoreOccupancy({ rects: s.rects, slideHeight: s.slideHeight, safe: s.safe, density: s.density });
  const cellRes = scoreCellOccupancy({ cells: s.cells ?? [], density: s.density });
  const leg = scoreLegibility({ boxes: s.textBoxes ?? [], slideW: s.slideWidth ?? s.slideHeight, slideH: s.slideHeight });
  const broken = s.brokenImgs ?? 0;
  placeholderTotal += s.placeholders ?? 0;
  const slideFail = !res.filled || !cellRes.filled || !leg.ok || broken > 0;
  if (slideFail) failures++;
  const verdict = !res.filled ? "UNDERFILL"
    : !cellRes.filled ? "CELL-UNDERFILL"
    : !leg.ok ? "ILLEGIBLE"
    : broken > 0 ? "BROKEN-IMG"
    : "ok";
  console.log(
    `${(s.type + " #" + s.i).padEnd(28)} ${(s.density || "-").padEnd(11)} ` +
    `${String(res.maxGapPx).padStart(6)}  ${(res.gapAt || "-").padEnd(7)} ${verdict}`,
  );
  for (const f of cellRes.failures) {
    console.log(`  └ cell ${f.index}: ${f.kind} — ${f.detail}`);
  }
  for (const f of leg.failures) {
    console.log(`  └ legibility: ${f.kind} — ${f.detail}`);
  }
  if (broken > 0) {
    console.log(`  └ broken-image: ${broken} inlined image(s) decoded to 0×0 (corrupt/blank bytes) — re-render or replace.`);
  }
  for (const w of leg.warnings) {
    console.log(`  ⚠ ${w.kind}: ${w.detail}`);
  }
}
console.log(`\n${slides.length - failures}/${slides.length} slides pass occupancy + legibility.`);
if (placeholderTotal > 0) {
  console.log(`⚠ ${placeholderTotal} visible image placeholder frame(s) across the deck — confirm each is an intentional customer-asset slot, not an unfilled/broken image.`);
}

// Richness gate — does each slide REALIZE visual weight, or is it text-only?
// Density-agnostic and opt-in: only enforced when the skill declares families.
let richFail = false;
const rich = scoreDeckRichness(
  slides.map((s: any) => ({
    family: s.family,
    density: s.density,
    systemEvents: s.system ?? 0,
    markEvents: s.mark ?? 0,
  })),
);
if (rich.enforced) {
  console.log("\nvisual richness (events per slide)");
  console.log("slide                         family         sys  mk   verdict");
  for (const r of rich.slides) {
    const s: any = slides[r.index];
    const verdict = r.hardEmpty ? "EMPTY" : r.meetsFloor ? "ok" : "thin";
    console.log(
      `${((s.type || "") + " #" + r.index).padEnd(28)} ${r.family.padEnd(13)} ` +
      `${String(s.system ?? 0).padStart(3)}  ${String(s.mark ?? 0).padStart(3)}  ${verdict}`,
    );
  }
  console.log(rich.reason);
  if (!rich.passed) richFail = true;

  // Soft palette warning (never fails the gate): a near-monochrome deck where the
  // signal colour barely appears. Fine if intentional; loud if the deck reads flat.
  const totalArea = slides.reduce((a: number, s: any) => a + (s.area || 0), 0) || 1;
  const chromaArea = slides.reduce((a: number, s: any) => a + (s.chroma || 0), 0);
  const chromaPct = chromaArea / totalArea;
  if (chromaPct < 0.004) {
    console.log(
      `\n⚠ palette: signal/accent colour covers ${(chromaPct * 100).toFixed(2)}% of the deck — near-monochrome. ` +
      `Fine if intentional; if the deck reads flat, give the signal real estate (a filled band, a chart series, a plate).`,
    );
  }
}

process.exit(failures || richFail ? 1 : 0);
