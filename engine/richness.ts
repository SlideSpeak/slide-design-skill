// Richness scorer — the "boring deck" detector.
//
// Occupancy (engine/occupancy.ts) caught UNDERFILL: thin content stretched across
// a frame. It never caught the opposite-axis failure: a slide that FILLS the frame
// with text yet realizes no visual argument — no chart, no icon, no drawn mark, no
// oversized figure. The gates validated whether a SKILL was CAPABLE of richness
// (validate-skill's graphic-layer counts constructs in the skill FILES); nothing
// measured whether a generated DECK actually REALIZED it. Same failure shape as the
// blank-chart bug: capability present, realization empty, no gate on the realization.
//
// This scores the visual events a slide actually rendered (supplied by the measure
// harness from the live DOM) against a per-family floor. Pure function.
//
// Calibration: it measures visual-EVENT DENSITY, never colour saturation. A
// deliberately austere, near-monochrome deck stays valid as long as each slide
// carries real visual weight (oversized type, meters, charts, marks). Empty is the
// failure, not severe. (A separate soft palette warning lives in the measure script.)
//
// Opt-in, like the family contract: if no slide declares a composition family
// (legacy skills), the gate is skipped entirely.

import { DATA_BEARING_FAMILIES } from "./composition-families.ts";

export interface SlideVisuals {
  family?: string;
  density?: string;
  /** Counts of realized visual events, already filtered to VISIBLE + non-trivial. */
  systemEvents: number; // chart / table / image / grid-of-cells — a substantial structure
  markEvents: number; // icon / meter / oversized numeral / mark / plate — a smaller event
}

export interface RichnessSlideResult {
  index: number;
  family: string;
  density: string;
  events: number;
  meetsFloor: boolean;
  /** Data-bearing family, non-editorial, ZERO events — the worst case. */
  hardEmpty: boolean;
  rule: string;
}

export interface RichnessResult {
  passed: boolean;
  /** False when no families are declared (legacy skill) — gate skipped. */
  enforced: boolean;
  slides: RichnessSlideResult[];
  contentSlides: number;
  belowFloor: number;
  hardEmpties: number;
  reason: string;
}

// A deck fails if more than this share of its content slides miss their floor.
export const BELOW_FLOOR_MAX_FRACTION = 0.3;

const DATA_BEARING = new Set<string>(DATA_BEARING_FAMILIES);
const BOOKEND = new Set(["cover", "closing"]);

function scoreSlide(v: SlideVisuals, index: number): RichnessSlideResult {
  const family = String(v.family ?? "");
  const density = String(v.density ?? "");
  const system = Math.max(0, v.systemEvents ?? 0);
  const mark = Math.max(0, v.markEvents ?? 0);
  const events = system + mark;
  const isData = DATA_BEARING.has(family);

  let meetsFloor: boolean;
  let rule: string;
  if (!family) {
    meetsFloor = events >= 1;
    rule = "no family: >=1 event";
  } else if (density === "editorial") {
    // Editorial slides may breathe — the softest floor — but are NOT exempt
    // (occupancy exempts them; that exemption was part of the original blind spot).
    meetsFloor = events >= 1;
    rule = "editorial: >=1 event";
  } else if (isData) {
    if (density === "data-dense") {
      // A dense slide must carry real structure, not just many marks.
      meetsFloor = system >= 1 || events >= 3;
      rule = "data-dense: a system (chart/table/grid) or >=3 events";
    } else {
      meetsFloor = system >= 1 || events >= 2;
      rule = "data-bearing: a system or >=2 events";
    }
  } else {
    // metric-hero, image-spread, split-visual, statement, quote: one event suffices.
    // (Oversized display type counts as an event, supplied by the measure harness.)
    meetsFloor = events >= 1;
    rule = ">=1 event";
  }

  const hardEmpty = isData && density !== "editorial" && events === 0;
  return { index, family: family || "-", density: density || "-", events, meetsFloor, hardEmpty, rule };
}

export function scoreDeckRichness(slides: SlideVisuals[]): RichnessResult {
  const enforced = slides.some((s) => !!s.family);
  const results = slides.map(scoreSlide);

  if (!enforced) {
    return {
      passed: true,
      enforced: false,
      slides: results,
      contentSlides: 0,
      belowFloor: 0,
      hardEmpties: 0,
      reason: "no composition families declared (legacy skill) — richness gate skipped",
    };
  }

  const content = results.filter((r) => !BOOKEND.has(r.family));
  const belowFloor = content.filter((r) => !r.meetsFloor).length;
  const hardEmpties = results.filter((r) => r.hardEmpty).length;
  const frac = content.length ? belowFloor / content.length : 0;
  const passed = hardEmpties === 0 && frac <= BELOW_FLOOR_MAX_FRACTION;

  const reason = passed
    ? `visual richness ok: ${content.length - belowFloor}/${content.length} content slides carry visual weight`
    : `${hardEmpties} data slide(s) with zero visual events; ${belowFloor}/${content.length} content slides below their floor ` +
      `(${Math.round(frac * 100)}%, cap ${Math.round(BELOW_FLOOR_MAX_FRACTION * 100)}%) — these read as text-only. ` +
      `Give each a real visual (chart, table, meter, icon set, oversized number or marked figure); never invent data to fake a chart.`;

  return { passed, enforced: true, slides: results, contentSlides: content.length, belowFloor, hardEmpties, reason };
}
