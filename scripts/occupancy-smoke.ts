// Smoke-test the occupancy scorer (engine/occupancy.ts).
// Given the vertical extents of a slide's real content, decide whether the slide
// fills its frame or leaves a void (the underfill failure the layout-fit harness
// never caught). Editorial density is exempt; bleed/full-cover content passes.

import { scoreOccupancy } from "../engine/occupancy.ts";

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
