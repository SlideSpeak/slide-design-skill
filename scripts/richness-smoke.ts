// Smoke test for the richness scorer (engine/richness.ts). Pure-unit: feeds
// synthetic per-slide visual-event counts and asserts the family floors + deck
// verdict. No render, no browser.

import { scoreDeckRichness } from "../engine/richness.ts";

let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`✓ ${name}`);
  else {
    console.log(`✗ ${name}`);
    failed++;
  }
}

// Legacy deck (no families) — gate skipped, always passes.
const legacy = scoreDeckRichness([{ systemEvents: 0, markEvents: 0 }]);
check("legacy (no family) is skipped", legacy.enforced === false && legacy.passed === true);

// A data-bearing slide with zero events hard-fails the deck.
const empty = scoreDeckRichness([
  { family: "cover", density: "editorial", systemEvents: 0, markEvents: 1 },
  { family: "comparison", density: "balanced", systemEvents: 0, markEvents: 0 },
  { family: "closing", density: "editorial", systemEvents: 0, markEvents: 1 },
]);
check("data slide with zero events fails (hardEmpty)", empty.passed === false && empty.hardEmpties === 1);

// Same data slide carrying a system (chart) passes.
const withSystem = scoreDeckRichness([
  { family: "cover", density: "editorial", systemEvents: 0, markEvents: 1 },
  { family: "comparison", density: "balanced", systemEvents: 1, markEvents: 0 },
  { family: "closing", density: "editorial", systemEvents: 0, markEvents: 1 },
]);
check("data slide with a system passes", withSystem.passed === true);

// data-dense needs a real system OR >=3 events; two marks is not enough.
const denseThin = scoreDeckRichness([{ family: "matrix", density: "data-dense", systemEvents: 0, markEvents: 2 }]);
check("data-dense with 2 marks is thin", denseThin.slides[0].meetsFloor === false);
const denseOk = scoreDeckRichness([{ family: "timeline", density: "data-dense", systemEvents: 0, markEvents: 3 }]);
check("data-dense with 3 marks meets floor", denseOk.slides[0].meetsFloor === true);

// A typographic statement carried by display type (one event) passes.
const stmt = scoreDeckRichness([{ family: "statement", density: "editorial", systemEvents: 0, markEvents: 1 }]);
check("statement with display type passes", stmt.slides[0].meetsFloor === true);

// More than 30% of content slides thin fails even without a hard-empty.
const mostlyThin = scoreDeckRichness([
  { family: "statement", density: "balanced", systemEvents: 0, markEvents: 0 }, // thin
  { family: "metric-hero", density: "balanced", systemEvents: 0, markEvents: 1 }, // ok
  { family: "comparison", density: "balanced", systemEvents: 1, markEvents: 0 }, // ok
]);
check("over-threshold thin fails", mostlyThin.passed === false && mostlyThin.hardEmpties === 0);

console.log(failed ? `\n${failed} richness check(s) failed` : "\nrichness smoke ok");
process.exit(failed ? 1 : 0);
