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

export function scoreCellOccupancy(input: {
  cells: CellInput[];
  density?: string;
}): CellOccupancyResult {
  if (input.density === "editorial") return { filled: true, failures: [] };

  // Exhibit detection: when the cells of a slide carry mutually DIFFERENT
  // opaque backgrounds (a material palette, colour swatches, mood tiles), the
  // surfaces themselves are the content — a tiny caption on a big colour field
  // is correct, not sparse. Uniform card surfaces (every cell the same tint)
  // stay subject to the checks.
  const opaqueBgs = input.cells.map((c) => c.bg).filter((b): b is string => !!b);
  const uniqueBgs = new Set(opaqueBgs).size;
  const isExhibit = uniqueBgs >= 3 && uniqueBgs >= input.cells.length / 2;

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
