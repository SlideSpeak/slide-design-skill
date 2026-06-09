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
