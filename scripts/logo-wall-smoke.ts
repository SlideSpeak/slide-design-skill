// Smoke for the {{@logo-wall}} directive, exercised end-to-end through the
// pitch skill's `customers` slide. Two modes: obviously-dummy placeholder
// logos (Acme set) and grounded real-name wordmarks.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkill, renderSlide } from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(__dirname, "../skills");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`OK  ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const skill = await loadSkill(resolve(skillsRoot, "pitch"));
const ctx = { skill, resolvedImages: new Map() };

// Dummy mode: bare directive, no names slot.
const dummy = renderSlide(
  {
    type: "customers",
    slots: {
      headline: "Teams already run their cap table on Vellum.",
      caption: "Design partners, May 2026",
    },
  } as any,
  ctx as any,
  { index: 0, total: 1 },
);
check("dummy: wall renders", dummy.includes("dir-logo-wall"));
check("dummy: 6 entries by default", (dummy.match(/Acme /g) ?? []).length === 6);
check("dummy: geometric marks drawn", (dummy.match(/<svg/g) ?? []).length >= 6);
check("dummy: obviously placeholder", dummy.includes("Acme Corp") && dummy.includes("Acme Labs"));
check("dummy: muted ink, no accent", !dummy.includes("var(--color-signal)") || !dummy.split("dir-logo-wall")[1].includes("var(--color-signal)"));

// Count clamp.
const few = renderSlide(
  { type: "customers", slots: { headline: "x", caption: "" } } as any,
  ctx as any,
  { index: 0, total: 1 },
);
check("count defaults sane", (few.match(/Acme /g) ?? []).length >= 3);

// Named mode: real customer names from the deck content.
const named = renderSlide(
  {
    type: "customers",
    slots: {
      headline: "Teams already run their cap table on Vellum.",
      "customer-names": "Meridianbank | Northstar Freight | Kite Health | Juniper Robotics",
      caption: "Pilot customers, named with permission",
    },
  } as any,
  ctx as any,
  { index: 0, total: 1 },
);
check("named: real names render", named.includes("Meridianbank") && named.includes("Juniper Robotics"));
check("named: no dummy leftovers", !named.includes("Acme"));
const namedWall = named.split("dir-logo-wall")[1] ?? "";
check("named: type-only wordmarks (no marks)", !namedWall.split("</div>")[0].includes("<svg"));

// Escaping: a hostile name must not inject markup.
const hostile = renderSlide(
  {
    type: "customers",
    slots: {
      headline: "x",
      "customer-names": '<img src=x onerror=alert(1)> | Safe Co',
      caption: "",
    },
  } as any,
  ctx as any,
  { index: 0, total: 1 },
);
check("names are escaped", !hostile.includes("<img src=x") && hostile.includes("&lt;img"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
