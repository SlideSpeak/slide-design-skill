// Occupancy scorer — the underfill detector.
//
// The layout-fit work fought FLOAT (content clustering at the top) and OVERFLOW
// (content spilling past the frame). It never caught the opposite failure:
// UNDERFILL, where thin content is stretched across a large layout and leaves a
// void. "Fill the height" over-rotates into "stretch thin content into empty
// boxes". This measures whether a slide's real content actually occupies the
// frame, by finding the largest empty vertical band between content.
//
// Pure function. The caller (a render harness) supplies the vertical extents of
// the slide's real content — text-node rects, images, rules — NOT layout
// containers (a full-height wrapper would mask every void). A full-cover element
// (a bleed photograph) yields one band covering the slide, so bleed spreads pass.

export interface OccupancyInput {
  /** [top, bottom] of each real content element, px relative to the slide top. */
  rects: [number, number][];
  slideHeight: number;
  /** Page safe padding; the expected content band is [safe, slideHeight - safe]. */
  safe: number;
  /** Editorial density is allowed to breathe and is exempt. */
  density?: string;
}

export interface OccupancyResult {
  filled: boolean;
  /** Largest empty vertical band inside the content area, px. */
  maxGapPx: number;
  gapAt: "top" | "middle" | "bottom" | null;
  reason: string;
}

// A single void this tall (or taller) reads as underfill. ~0.21 of a 1080 slide.
export const VOID_MAX_PX = 230;
//
// NOTE on the "space-between divided list" failure (rows spread down the frame
// with content stuck at the top of each band, only the last row flush): it has
// the SAME inter-content gap sizes as the CORRECT centered-equal-rows layout —
// only the content's position WITHIN each band differs, which these flat rects
// cannot see. A gap-size threshold cannot separate the two without flagging good
// centered layouts, so the guard does NOT try. That failure is prevented at the
// source instead: the generator emits the centered `.flow-rows`/`.flow-row`
// pattern (token-compiler.ts) rather than `justify-content:space-between`.

// ---------------------------------------------------------------------------
// Cell-interior occupancy — the empty-cell detector.
//
// The page-level scorer above cannot see INSIDE cards: a grid of bordered cells
// whose content is pinned to the cell edges (a number at the top, a caption at
// the bottom, a void between) passes the page scan because the cell borders /
// tinted surfaces read as "filled blocks". Visually those cells are empty boxes
// with captions — the single loudest underfill tell on structured slides.
// This scores each card-like container by its OWN content:
//   1. interior void   — the largest empty vertical band inside a tall cell
//   2. sparse coverage — a large text-bearing cell whose text covers almost
//      none of its area (the one-word-card failure)
// Conservative by design: cells without text (swatches, image tiles) are the
// content themselves and are never flagged; editorial density is exempt.

/** A tall cell tolerates an interior void up to max(this, FRACTION × height). */
export const CELL_VOID_MAX_PX = 180;
export const CELL_VOID_MAX_FRACTION = 0.45;
/** Only cells at least this tall are checked for interior voids. */
export const CELL_VOID_MIN_HEIGHT = 240;
/** Sparse-coverage check applies to text-bearing cells at least this big… */
export const SPARSE_CELL_MIN_AREA = 60_000;
/** …whose text covers less than this share of the cell. */
export const SPARSE_TEXT_COVERAGE = 0.035;

export interface CellInput {
  /** Cell box height and total area, px. */
  height: number;
  area: number;
  /** Interior padding (top/bottom average is fine); content band shrinks by it. */
  pad: number;
  /** [top, bottom] of each real content element, px relative to the CELL top. */
  rects: [number, number][];
  /** Total area of the cell's text rects, px². */
  textArea: number;
  /** True if the cell contains an image/svg/background-image (visual content). */
  hasVisual: boolean;
  /** The cell's own opaque background colour ("r,g,b"), null if transparent. */
  bg?: string | null;
}

export interface CellFailure {
  index: number;
  kind: "cell-void" | "sparse-cell";
  detail: string;
}

export interface CellOccupancyResult {
  filled: boolean;
  failures: CellFailure[];
}

// Largest pairwise RGB (Manhattan) distance among a set of "r,g,b" backgrounds.
// Used to tell a real material/swatch palette (wide spread) from a card grid
// that merely varies its dark tint by a few RGB (which is not an exhibit).
function maxBgSpread(bgs: string[]): number {
  const cols = bgs
    .map((s) => s.split(",").map((n) => parseInt(n, 10)))
    .filter((c) => c.length === 3 && c.every((n) => Number.isFinite(n)));
  let max = 0;
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const d = Math.abs(cols[i][0] - cols[j][0]) + Math.abs(cols[i][1] - cols[j][1]) + Math.abs(cols[i][2] - cols[j][2]);
      if (d > max) max = d;
    }
  }
  return max;
}

export function scoreCellOccupancy(input: {
  cells: CellInput[];
  density?: string;
}): CellOccupancyResult {
  if (input.density === "editorial") return { filled: true, failures: [] };

  // Exhibit detection: when the cells of a slide carry mutually DIFFERENT
  // opaque backgrounds (a material palette, colour swatches, mood tiles), the
  // surfaces themselves are the content — a tiny caption on a big colour field
  // is correct, not sparse. The backgrounds must be MEANINGFULLY distinct now,
  // not three tints within ~20 RGB: a near-uniform dark card grid that varied
  // its tint slightly used to switch the detector off entirely (the Clinic teal
  // recap-card failure). Requiring real colour spread means such a grid is no
  // longer treated as an exhibit, so the empty-cell checks apply to it again.
  const opaqueBgs = input.cells.map((c) => c.bg).filter((b): b is string => !!b);
  const uniqueBgs = [...new Set(opaqueBgs)];
  const isExhibit =
    uniqueBgs.length >= 3 &&
    uniqueBgs.length >= input.cells.length / 2 &&
    maxBgSpread(uniqueBgs) >= 120;

  const failures: CellFailure[] = [];
  input.cells.forEach((cell, index) => {
    if (isExhibit && cell.bg) return;
    const hasText = cell.textArea > 0;

    // Sparse coverage: a big cell that carries only a word or a short label.
    if (
      hasText && !cell.hasVisual &&
      cell.area >= SPARSE_CELL_MIN_AREA &&
      cell.textArea / cell.area < SPARSE_TEXT_COVERAGE
    ) {
      failures.push({
        index,
        kind: "sparse-cell",
        detail: `text covers ${(100 * cell.textArea / cell.area).toFixed(1)}% of a ${Math.round(cell.area / 1000)}k px² cell`,
      });
      return;
    }

    // Interior void: content pinned to the cell edges with a hole between.
    if (!hasText || cell.height < CELL_VOID_MIN_HEIGHT) return;
    const top = cell.pad;
    const bottom = cell.height - cell.pad;
    const bands = cell.rects
      .map(([a, b]) => [Math.max(top, Math.min(a, b)), Math.min(bottom, Math.max(a, b))] as [number, number])
      .filter(([a, b]) => b - a > 0.5)
      .sort((x, y) => x[0] - y[0]);
    if (bands.length === 0) return;
    const merged: [number, number][] = [bands[0]];
    for (let i = 1; i < bands.length; i++) {
      const last = merged[merged.length - 1];
      if (bands[i][0] <= last[1] + 1) last[1] = Math.max(last[1], bands[i][1]);
      else merged.push(bands[i]);
    }
    let maxGap = merged[0][0] - top;
    for (let i = 1; i < merged.length; i++) maxGap = Math.max(maxGap, merged[i][0] - merged[i - 1][1]);
    maxGap = Math.max(maxGap, bottom - merged[merged.length - 1][1]);

    const threshold = Math.max(CELL_VOID_MAX_PX, CELL_VOID_MAX_FRACTION * cell.height);
    if (maxGap > threshold) {
      failures.push({
        index,
        kind: "cell-void",
        detail: `${Math.round(maxGap)}px interior void in a ${Math.round(cell.height)}px cell`,
      });
    }
  });

  return { filled: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Legibility scorer — the overprint / overflow / low-contrast detector.
//
// occupancy measures vertical FILL only: an overprinted chart, a title colliding
// with its eyebrow, a headline bleeding off the safe area, or white-on-light text
// all score filled:true. Legibility is the single most client-facing failure
// class and was entirely ungated. This scores three cheap signals from the
// rendered geometry the harness supplies:
//   1. overflow  — a text box exits the slide rect (clipped headline / footer)
//   2. collision — two text boxes from DIFFERENT elements overlap (overprint)
//   3. contrast  — text over a SOLID background below ~3:1 (white-on-light)
// Text over a background IMAGE with no scrim is surfaced as a WARNING (we cannot
// sample photo luminance without pixels, so it is advisory, not a hard fail).
// Pure function; editorial density is NOT exempt (a clipped editorial headline is
// still broken), but expressive bleeds are fine — overflow only fires on true
// clipping past the slide edge, not on reaching the safe margin.

export interface TextBox {
  /** Box bounds in px relative to the slide top-left. */
  x0: number; y0: number; x1: number; y1: number;
  /** Distinct element id so wrapped lines of one element are not "collisions". */
  el: number;
  /** Relative luminance 0..1 of the text colour, or null if unknown. */
  lum: number | null;
  /** Relative luminance of the nearest SOLID background, or null if over an image/unknown. */
  bgLum: number | null;
  /** True when the nearest background behind the text is an image (photo), not a solid colour. */
  overImage: boolean;
  /** True when a scrim/overlay sits between the image and the text. */
  hasScrim: boolean;
  fontSize: number;
}

export interface LegibilityResult {
  ok: boolean;
  failures: { kind: "overflow" | "collision" | "contrast"; detail: string }[];
  warnings: { kind: "text-on-image" | "low-contrast"; detail: string }[];
}

/** Borderline contrast (AA large-text floor): warn, do not fail. */
export const MIN_CONTRAST = 3.0;
/** Clearly illegible (white-on-light / tone-on-tone): hard fail. Tuned below the
 *  AA boundary so a deliberately muted keynote tone at ~2.8:1 warns rather than
 *  fails, while a near-vanishing white-on-light subhead (~1.5:1) fails. */
export const CONTRAST_FAIL = 2.2;
/** A text element this large is a display/watermark device (ghost numerals,
 *  oversized section numbers) where bleeding off the frame is a DELIBERATE move,
 *  not clipped content — exempt it from the overflow check. Readable headlines,
 *  eyebrows, footers and body are all well below this, so a genuinely clipped
 *  headline/eyebrow/footer is still caught. */
export const DISPLAY_BLEED_FONT = 140;

function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

export function scoreLegibility(input: {
  boxes: TextBox[];
  slideW: number;
  slideH: number;
}): LegibilityResult {
  const failures: LegibilityResult["failures"] = [];
  const warnings: LegibilityResult["warnings"] = [];
  const TOL = 6; // sub-pixel / rounding tolerance before "off the edge" counts

  const seenOverflow = new Set<number>();
  for (const b of input.boxes) {
    const out =
      b.x0 < -TOL ? "left" :
      b.y0 < -TOL ? "top" :
      b.x1 > input.slideW + TOL ? "right" :
      b.y1 > input.slideH + TOL ? "bottom" : null;
    // Skip display/watermark bleeds — a 760px ghost numeral positioned off-edge is
    // a deliberate device, not clipped content (false-flagged the consulting seed).
    if (out && b.fontSize < DISPLAY_BLEED_FONT && !seenOverflow.has(b.el)) {
      seenOverflow.add(b.el);
      failures.push({ kind: "overflow", detail: `text clipped past the ${out} edge (box ${Math.round(b.x0)},${Math.round(b.y0)}–${Math.round(b.x1)},${Math.round(b.y1)} in ${input.slideW}×${input.slideH})` });
    }

    // Contrast against a known solid background: hard-fail clear failures,
    // warn on borderline (so a muted-but-readable keynote tone is not flagged red).
    if (b.lum != null && b.bgLum != null) {
      const cr = contrastRatio(b.lum, b.bgLum);
      if (cr < CONTRAST_FAIL) {
        failures.push({ kind: "contrast", detail: `text contrast ${cr.toFixed(1)}:1 (below ${CONTRAST_FAIL}:1) — illegible on its background` });
      } else if (cr < MIN_CONTRAST) {
        warnings.push({ kind: "low-contrast", detail: `text contrast ${cr.toFixed(1)}:1 (below the ${MIN_CONTRAST}:1 large-text floor) — verify at projection size` });
      }
    } else if (b.overImage && !b.hasScrim && b.fontSize >= 12 && (b.x1 - b.x0) * (b.y1 - b.y0) > 1500) {
      warnings.push({ kind: "text-on-image", detail: `text set on a background image with no scrim — verify legibility / add a text plate (box at ${Math.round(b.x0)},${Math.round(b.y0)})` });
    }
  }

  // Collision: two text blocks of SIMILAR scale overprinting. We require the
  // overlap to be a large share of the LARGER box (not just the smaller), so a
  // short label sitting inside a big wrapped-headline's bounding box — whose
  // rect is mostly whitespace, not ink — does not read as a collision. Giant
  // display containers are skipped for the same reason (their bbox is mostly
  // air). This trades recall for precision: a gate that flags layered typography
  // as broken trains people to ignore it.
  const slideArea = input.slideW * input.slideH;
  const reported = new Set<string>();
  for (let i = 0; i < input.boxes.length; i++) {
    for (let j = i + 1; j < input.boxes.length; j++) {
      const a = input.boxes[i], b = input.boxes[j];
      if (a.el === b.el) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox <= 8 || oy <= 8) continue; // need a real 2D overlap, not a touching edge
      const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
      const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (areaA > 0.4 * slideArea || areaB > 0.4 * slideArea) continue; // page-spanning container bbox
      const larger = Math.max(areaA, areaB);
      const overlap = ox * oy;
      if (larger > 0 && overlap / larger > 0.25) {
        const key = `${Math.min(a.el, b.el)}-${Math.max(a.el, b.el)}`;
        if (reported.has(key)) continue;
        reported.add(key);
        failures.push({ kind: "collision", detail: `two text blocks overprint (${Math.round(100 * overlap / larger)}% overlap near ${Math.round(Math.max(a.x0, b.x0))},${Math.round(Math.max(a.y0, b.y0))})` });
      }
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}

export function scoreOccupancy(input: OccupancyInput): OccupancyResult {
  const { slideHeight, safe } = input;
  const top = safe;
  const bottom = slideHeight - safe;

  if (input.density === "editorial") {
    return { filled: true, maxGapPx: 0, gapAt: null, reason: "editorial density is exempt" };
  }

  // Clamp to the content band and drop zero-height rects.
  const bands = input.rects
    .map(([a, b]) => [Math.max(top, Math.min(a, b)), Math.min(bottom, Math.max(a, b))] as [number, number])
    .filter(([a, b]) => b - a > 0.5)
    .sort((x, y) => x[0] - y[0]);

  if (bands.length === 0) {
    return { filled: true, maxGapPx: 0, gapAt: null, reason: "no measurable content" };
  }

  // Merge overlapping/touching bands so a continuous column counts as covered.
  const merged: [number, number][] = [bands[0]];
  for (let i = 1; i < bands.length; i++) {
    const last = merged[merged.length - 1];
    if (bands[i][0] <= last[1] + 1) last[1] = Math.max(last[1], bands[i][1]);
    else merged.push(bands[i]);
  }

  // Empty gaps: above the first band, between bands, below the last band.
  let maxGap = 0;
  let gapAt: OccupancyResult["gapAt"] = null;
  const consider = (size: number, where: NonNullable<OccupancyResult["gapAt"]>) => {
    if (size > maxGap) { maxGap = size; gapAt = where; }
  };
  consider(merged[0][0] - top, "top");
  for (let i = 1; i < merged.length; i++) consider(merged[i][0] - merged[i - 1][1], "middle");
  consider(bottom - merged[merged.length - 1][1], "bottom");

  const filled = maxGap <= VOID_MAX_PX;
  return {
    filled,
    maxGapPx: Math.round(maxGap),
    gapAt: filled ? null : gapAt,
    reason: filled
      ? "content occupies the frame"
      : `${Math.round(maxGap)}px empty band at ${gapAt} — content does not fill its layout`,
  };
}
