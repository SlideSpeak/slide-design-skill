// Smoke-test the `{{image:self-M}}` relative image reference (renderer.ts).
// An image-bearing template reused at two deck positions must reference its OWN
// image at each position; absolute `{{image:N-M}}` refs must keep working.
import { renderSlide, type RenderContext } from "../engine/renderer.ts";
import type { ResolvedImage } from "../engine/types.ts";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`OK  ${label}`); pass++; }
  else { console.log(`FAIL ${label}${detail ? " — " + detail : ""}`); fail++; }
}

const img = (marker: string): ResolvedImage => ({
  url: `data:image/png;base64,AAAA${marker}`,
  source: "fal",
  width: 100,
  height: 100,
});

// Minimal skill: one image-bearing type using a RELATIVE ref, one using ABSOLUTE.
const components = [
  '<template id="slide-spread"><section class="slide"><div>{{image:self-0}}</div></section></template>',
  '<template id="slide-fixed"><section class="slide"><div>{{image:2-0}}</div></section></template>',
].join("\n");

const skill = {
  grammar: { slideTypes: [{ name: "spread" }, { name: "fixed" }], rules: [] },
  components,
  imageStyle: {},
} as any;

const resolvedImages = new Map<string, ResolvedImage>([
  ["3-0", img("EVAP")],
  ["4-0", img("COND")],
  ["2-0", img("FIXED")],
]);
const ctx: RenderContext = { skill, resolvedImages };

// Same reused template at index 3 and index 4 → each gets its own image.
const at3 = renderSlide({ type: "spread", slots: {} } as any, ctx, { index: 3, total: 6 });
const at4 = renderSlide({ type: "spread", slots: {} } as any, ctx, { index: 4, total: 6 });
check("self ref at index 3 → own image (EVAP)", at3.includes("AAAAEVAP"), at3);
check("self ref at index 3 → NOT the other (COND)", !at3.includes("AAAACOND"));
check("self ref at index 4 → own image (COND)", at4.includes("AAAACOND"), at4);
check("self ref at index 4 → NOT the other (EVAP)", !at4.includes("AAAAEVAP"));

// Absolute ref unchanged regardless of position.
const fixedAt9 = renderSlide({ type: "fixed", slots: {} } as any, ctx, { index: 9, total: 12 });
check("absolute ref still resolves (FIXED)", fixedAt9.includes("AAAAFIXED"), fixedAt9);

console.log(`\nself-image: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
