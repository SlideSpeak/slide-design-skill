import type { Tokens } from "./types.ts";

export function tokensToCss(tokens: Tokens): string {
  const v: string[] = [];

  v.push(`--color-page: ${tokens.color.ground.page};`);
  v.push(`--color-card: ${tokens.color.ground.card};`);
  v.push(`--color-ink: ${tokens.color.ground.ink};`);
  v.push(`--color-signal: ${tokens.color.signal.primary};`);
  v.push(`--color-signal-subtle: ${tokens.color.signal.subtle};`);
  v.push(`--color-muted: ${tokens.color.support.muted};`);
  v.push(`--color-rule: ${tokens.color.support.rule};`);

  v.push(`--font-header: ${tokens.type.header.family};`);
  v.push(`--font-body: ${tokens.type.body.family};`);
  v.push(`--font-data: ${tokens.type.data.family};`);
  v.push(`--font-weight-header: ${tokens.type.header.weight};`);
  v.push(`--font-weight-body: ${tokens.type.body.weight};`);
  v.push(`--font-weight-data: ${tokens.type.data.weight};`);

  tokens.type.header.scale.forEach((size, i) => {
    v.push(`--size-h${i + 1}: ${size}px;`);
  });
  tokens.type.body.scale.forEach((size, i) => {
    v.push(`--size-body-${i + 1}: ${size}px;`);
  });

  v.push(`--space-unit: ${tokens.spacing.unit}px;`);
  tokens.spacing.scale.forEach((s, i) => {
    v.push(`--space-${i + 1}: ${s}px;`);
  });

  v.push(`--radius-card: ${tokens.radius.card}px;`);
  v.push(`--radius-button: ${tokens.radius.button}px;`);
  v.push(`--radius-input: ${tokens.radius.input}px;`);

  v.push(`--elevation-card: ${tokens.elevation.card};`);

  v.push(`--page-width: ${tokens.page.width}px;`);
  v.push(`--page-height: ${tokens.page.height}px;`);
  v.push(`--page-safe: ${tokens.page.safe}px;`);

  return `:root {\n  ${v.join("\n  ")}\n}`;
}

// Neutral, structural-only slide CSS shared by every skill. It wires the .slide
// box to tokens and provides the flow/grid mechanics, but carries NO look: the
// look (eyebrow, source footer, signal bar, table styling, flow rhythm, heading
// line-height/tracking) lives in each skill's own chrome.css so styles can
// genuinely diverge. See defaultChromeCss for the legacy shared look that the
// flagship skills ship as their chrome.css.
export function baseSlideCss(_tokens: Tokens): string {
  return `
.slide {
  width: var(--page-width);
  height: var(--page-height);
  background: var(--color-page);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-weight: var(--font-weight-body);
  font-size: var(--size-body-2);
  padding: var(--page-safe);
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}
.slide h1, .slide h2, .slide h3, .slide h4 {
  font-family: var(--font-header);
  font-weight: var(--font-weight-header);
  margin: 0;
}
.slide h1 { font-size: var(--size-h1); }
.slide h2 { font-size: var(--size-h2); }
.slide h3 { font-size: var(--size-h3); }
.slide h4 { font-size: var(--size-h4); }
.slide-flow {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.slide-flow .flow-grow { flex: 1; min-height: 0; }
.slide-flow .flow-grow-evenly {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  min-height: 0;
}
.slide-flow .flow-stretch-grid {
  flex: 1;
  display: grid;
  min-height: 0;
}
/* Bounded-island layout — STRUCTURE ONLY, carries no look (no color, border,
   shadow, gap, padding, type). Pin a header and footer band, let the middle
   stage fill the height between them, and make repeated cards grow to fill the
   stage. This is the anti-float contract: content occupies the whole slide
   instead of clustering under the headline with an empty lower third. Look
   (gap, padding, radius, color) lives in chrome.css. */
.slide-flow .flow-head,
.slide-flow .flow-foot { flex: none; min-height: 0; }
.slide-flow .flow-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* sparse content: center it in the stage instead of pinning it to the top */
.slide-flow .flow-stage.flow-center { justify-content: center; }
/* a grid stage that fills the height AND stretches its rows to consume it */
.slide-flow .flow-grid-fill {
  flex: 1;
  min-height: 0;
  display: grid;
  align-content: stretch;
}
/* a card/cell that grows to fill its grid or flex track top-to-bottom */
.flow-fill { height: 100%; min-height: 0; box-sizing: border-box; }
/* the body inside a filling card: a full-height column that can distribute its
   own rows (center a sparse card, or space-between a header+content card) */
.flow-fill-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}
.flow-fill-body.flow-center { justify-content: center; }
.flow-fill-body.flow-between { justify-content: space-between; }
.dir-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.dir-list { display: contents; }
`;
}

// The legacy shared look, now opt-in chrome. The nine flagship skills ship this
// verbatim as their chrome.css (so they render exactly as before); the generator
// authors a bespoke chrome.css per brief instead of inheriting this.
export function defaultChromeCss(): string {
  return `
.slide h1, .slide h2, .slide h3, .slide h4 { letter-spacing: -0.01em; }
.slide h1 { line-height: 1.05; }
.slide h2 { line-height: 1.1; }
.slide h3 { line-height: 1.15; }
.slide h4 { line-height: 1.2; }
.slide .eyebrow {
  font-family: var(--font-data);
  font-weight: var(--font-weight-data);
  font-size: var(--size-body-4);
  color: var(--color-muted);
}
.slide .source {
  position: absolute;
  bottom: 32px;
  left: var(--page-safe);
  right: var(--page-safe);
  font-size: var(--size-body-4);
  color: var(--color-muted);
  border-top: 1px solid var(--color-rule);
  padding-top: 8px;
}
.slide .signal-bar {
  height: 3px;
  background: var(--color-signal);
}
.slide-flow {
  gap: 32px;
  padding-bottom: 72px;
}
.dir-table {
  font-size: 20px;
}
.dir-table thead th {
  font-family: var(--font-data);
  font-weight: var(--font-weight-data);
  font-size: var(--size-body-4);
  color: var(--color-muted);
  text-align: left;
  padding: 14px 20px 14px 0;
  border-bottom: 2px solid var(--color-ink);
}
.dir-table tbody th {
  font-family: var(--font-body);
  font-weight: 600;
  text-align: left;
  padding: 18px 20px 18px 0;
  border-bottom: 1px solid var(--color-rule);
  vertical-align: top;
  width: 36%;
}
.dir-table tbody td {
  padding: 18px 20px 18px 0;
  border-bottom: 1px solid var(--color-rule);
  vertical-align: top;
  font-variant-numeric: tabular-nums;
}
.dir-table tbody tr:last-child th,
.dir-table tbody tr:last-child td { border-bottom: none; }
`;
}
