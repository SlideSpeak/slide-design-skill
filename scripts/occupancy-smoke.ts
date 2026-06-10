// Smoke-test the occupancy scorer (engine/occupancy.ts).
// Given the vertical extents of a slide's real content, decide whether the slide
// fills its frame or leaves a void (the underfill failure the layout-fit harness
// never caught). Editorial density is exempt; bleed/full-cover content passes.

import { scoreOccupancy, scoreCellOccupancy, type CellInput } from "../engine/occupancy.ts";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`OK  ${label}`); pass++; }
  else { console.log(`FAIL ${label}${detail ? " — " + detail : ""}`); fail++; }
}

const H = 1080, SAFE = 110;

// A densely-filled band from top-safe to bottom-safe (rows every ~80px).
function filledRects(): [number, number][] {
  const r: [number, number][] = [];
  for (let t = SAFE; t < H - SAFE; t += 80) r.push([t, t + 56]);
  return r;
}

// 1. editorial density is exempt even with a huge void
{
  const res = scoreOccupancy({ rects: [[SAFE, 300]], slideHeight: H, safe: SAFE, density: "editorial" });
  check("editorial exempt", res.filled === true);
}

// 2. a well-filled non-editorial slide passes
{
  const res = scoreOccupancy({ rects: filledRects(), slideHeight: H, safe: SAFE, density: "balanced" });
  check("well-filled passes", res.filled === true, JSON.stringify(res));
}

// 3. content clinging to the top with an empty bottom (float) is flagged
{
  const res = scoreOccupancy({ rects: [[SAFE, 200], [220, 380]], slideHeight: H, safe: SAFE, density: "balanced" });
  check("bottom void flagged", res.filled === false, JSON.stringify(res));
  check("bottom void located", res.gapAt === "bottom");
}

// 4. a large empty band in the middle is flagged
{
  const res = scoreOccupancy({ rects: [[SAFE, 300], [800, H - SAFE]], slideHeight: H, safe: SAFE, density: "data-dense" });
  check("middle void flagged", res.filled === false, JSON.stringify(res));
  check("middle void located", res.gapAt === "middle");
}

// 5. a large empty top is flagged
{
  const res = scoreOccupancy({ rects: [[600, H - SAFE]], slideHeight: H, safe: SAFE, density: "balanced" });
  check("top void flagged", res.filled === false, JSON.stringify(res));
  check("top void located", res.gapAt === "top");
}

// 6. elements side by side in the same row are not a vertical gap
{
  const rects: [number, number][] = [];
  for (let t = SAFE; t < H - SAFE; t += 80) { rects.push([t, t + 56]); rects.push([t, t + 56]); } // two columns
  const res = scoreOccupancy({ rects, slideHeight: H, safe: SAFE, density: "balanced" });
  check("two columns same rows pass", res.filled === true, JSON.stringify(res));
}

// 7. a single full-cover rect (bleed photo) passes
{
  const res = scoreOccupancy({ rects: [[0, H]], slideHeight: H, safe: SAFE, density: "balanced" });
  check("full-cover bleed passes", res.filled === true, JSON.stringify(res));
}

// 8. result carries the gap size in px
{
  const res = scoreOccupancy({ rects: [[SAFE, 200]], slideHeight: H, safe: SAFE, density: "balanced" });
  check("maxGapPx reported", typeof res.maxGapPx === "number" && res.maxGapPx > 400, JSON.stringify(res));
}

// 9. no content → cannot judge, passes (not our failure mode)
{
  const res = scoreOccupancy({ rects: [], slideHeight: H, safe: SAFE, density: "balanced" });
  check("empty rects passes", res.filled === true);
}

// 10. overlapping/touching bands merge (a continuous column is filled)
{
  const res = scoreOccupancy({ rects: [[SAFE, 500], [480, H - SAFE]], slideHeight: H, safe: SAFE, density: "balanced" });
  check("overlapping bands merge to filled", res.filled === true, JSON.stringify(res));
}

// 11. a single medium gap (two genuine sections) passes — only one big void or
//     a true float should fail, not a deliberate two-part split
{
  const res = scoreOccupancy({ rects: [[SAFE, 400], [560, H - SAFE]], slideHeight: H, safe: SAFE, density: "balanced" });
  check("single medium gap passes", res.filled === true, JSON.stringify(res));
}

// --- cell-interior occupancy (scoreCellOccupancy) ---

function cell(over: Partial<CellInput>): CellInput {
  return { height: 380, area: 560 * 380, pad: 28, rects: [], textArea: 0, hasVisual: false, ...over };
}

// 12. the nightline failure: number top, title+line at the bottom, void between
{
  const res = scoreCellOccupancy({
    cells: [cell({ rects: [[28, 60], [290, 352]], textArea: 14_000 })],
    density: "balanced",
  });
  check("edge-pinned cell void flagged", res.filled === false && res.failures[0]?.kind === "cell-void", JSON.stringify(res));
}

// 13. the same content grouped compactly in the middle of the cell passes
{
  const res = scoreCellOccupancy({
    cells: [cell({ rects: [[120, 180], [190, 260]], textArea: 14_000 })],
    density: "balanced",
  });
  check("centered compact cell passes", res.filled === true, JSON.stringify(res));
}

// 14. one-word card: large cell, tiny text coverage → sparse-cell
{
  const res = scoreCellOccupancy({
    cells: [cell({ height: 170, area: 600 * 170, rects: [[60, 84]], textArea: 1_300 })],
    density: "balanced",
  });
  check("one-word card flagged sparse", res.filled === false && res.failures[0]?.kind === "sparse-cell", JSON.stringify(res));
}

// 15. a swatch / image tile (no text) is content itself, never flagged
{
  const res = scoreCellOccupancy({
    cells: [cell({ textArea: 0, rects: [] }), cell({ hasVisual: true, textArea: 0, rects: [[0, 380]] })],
    density: "balanced",
  });
  check("text-free swatch and image tile pass", res.filled === true, JSON.stringify(res));
}

// 16. editorial density is exempt at cell level too
{
  const res = scoreCellOccupancy({
    cells: [cell({ rects: [[28, 60], [290, 352]], textArea: 14_000 })],
    density: "editorial",
  });
  check("editorial exempt at cell level", res.filled === true);
}

// 17. short cells are not void-checked (a compact stat row is fine)
{
  const res = scoreCellOccupancy({
    cells: [cell({ height: 200, area: 400 * 200, pad: 20, rects: [[20, 80]], textArea: 18_000 })],
    density: "balanced",
  });
  check("short cell skips void check", res.filled === true, JSON.stringify(res));
}

// 18. a tall cell with rich content filling it passes
{
  const res = scoreCellOccupancy({
    cells: [cell({ height: 600, area: 560 * 600, rects: [[28, 120], [150, 320], [350, 560]], textArea: 90_000 })],
    density: "data-dense",
  });
  check("rich tall cell passes", res.filled === true, JSON.stringify(res));
}

// 19. a cell with an image plus a caption passes the sparse check (visual counts)
{
  const res = scoreCellOccupancy({
    cells: [cell({ height: 400, area: 500 * 400, hasVisual: true, rects: [[28, 300], [320, 350]], textArea: 4_000 })],
    density: "balanced",
  });
  check("image + caption cell passes", res.filled === true, JSON.stringify(res));
}

// 20. swatch exhibit: cells with mutually different opaque backgrounds are the
//     content themselves (material palette) — captions on colour fields pass
{
  const swatch = (bg: string) => cell({ height: 370, area: 330 * 370, rects: [[330, 352]], textArea: 1_100, bg });
  const res = scoreCellOccupancy({
    cells: [swatch("43,34,24"), swatch("113,121,135"), swatch("62,68,88"), swatch("202,191,174")],
    density: "data-dense",
  });
  check("swatch exhibit passes", res.filled === true, JSON.stringify(res));
}

// 21. uniform card surfaces (same tint everywhere) stay subject to the checks
{
  const card = () => cell({ height: 170, area: 600 * 170, rects: [[60, 84]], textArea: 1_300, bg: "42,42,51" });
  const res = scoreCellOccupancy({ cells: [card(), card(), card(), card()], density: "balanced" });
  check("uniform tinted cards still flagged", res.filled === false, JSON.stringify(res));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
