import type { Skill, SlideTreeNode, ResolvedImage } from "./types.ts";
import { tokensToCss, baseSlideCss } from "./token-compiler.ts";
import { DOTMAP_COLS, DOTMAP_ROWS, DOTMAP_LAND, DOTMAP_LAT_TOP, DOTMAP_LAT_BOTTOM } from "./dotmap-data.ts";
import { CITY_COORDS } from "./fidelity-data.ts";
import { ICON_KITS } from "./icon-kits.ts";

export interface RenderContext {
  skill: Skill;
  resolvedImages: Map<string, ResolvedImage>;
}

const SLIDE_TYPE_RE = /^[a-z][a-z0-9-]*$/;
const SAFE_URL_SCHEMES = /^(https:|data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);)/i;

export function renderDeckShell(skill: Skill): { head: string; foot: string } {
  const webFonts = (skill.tokens as { webFonts?: string[] }).webFonts ?? [];
  const fontLink = webFonts.length
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${webFonts.map((f) => "family=" + encodeURIComponent(f)).join("&")}&display=swap" rel="stylesheet">`
    : "";
  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(skill.frontmatter.name)} deck</title>
${fontLink}
<style>
${tokensToCss(skill.tokens)}
${baseSlideCss(skill.tokens)}
${skill.chrome ?? ""}
body { margin: 0; background: #1a1a1a; padding: 40px; }
.slide { margin: 0 auto 40px; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }
.slide-bleed { position: relative; padding: 0 !important; overflow: hidden; }
.slide-bleed > .bleed-content { position: relative; z-index: 1; padding: var(--page-safe); height: 100%; box-sizing: border-box; }
</style>
</head>
<body>
`;
  const foot = `</body>\n</html>\n`;
  return { head, foot };
}

export interface SlideMeta {
  index: number; // 0-based position in the deck
  total: number; // total slide count
}

export function renderSlide(
  node: SlideTreeNode,
  ctx: RenderContext,
  meta?: SlideMeta,
): string {
  const knownTypes = new Set(ctx.skill.grammar.slideTypes.map((t) => t.name));
  const safeType =
    SLIDE_TYPE_RE.test(node.type) && knownTypes.has(node.type) ? node.type : null;

  // Engine-injected synthetic slots: page numbering for footer bands. Not part
  // of the slide tree, so templates can reference {{page-no}}/{{page-total}}
  // without the LLM ever authoring them.
  const slots: Record<string, string> = meta
    ? { ...node.slots, "page-no": String(meta.index + 1), "page-total": String(meta.total) }
    : node.slots;

  let html: string;
  if (safeType) {
    const componentHtml = pickComponent(ctx.skill.components, safeType);
    html = componentHtml ? interpolate(componentHtml, slots, ctx) : renderFallback(node, ctx);
  } else {
    html = renderFallback(node, ctx);
  }

  // Stamp the density tier onto the slide root so the density CSS custom props
  // cascade into the template's inline styles (which reference var(--d-*)).
  if (node.density) html = injectDensityAttr(html, node.density);
  html = injectTypeAttr(html, node.type);
  return html;
}

// Add data-slide-type to the first <section ...> of a rendered slide so
// downstream tooling (e.g. the layout-fit measurement harness) can identify
// the slide type from the DOM. Additive: skips if already present.
function injectTypeAttr(html: string, type: string): string {
  return html.replace(/<section\b([^>]*)>/, (m, attrs) =>
    /\bdata-slide-type=/.test(attrs) ? m : `<section data-slide-type="${type}"${attrs}>`,
  );
}

// Add data-density to the first <section ...> of a rendered slide. A template
// may hardcode its own data-density (for slide-types whose density is part of
// their identity, e.g. a dense matrix) — in that case the template wins and the
// per-slide value is ignored.
function injectDensityAttr(html: string, density: string): string {
  return html.replace(/<section\b([^>]*)>/, (m, attrs) =>
    /\bdata-density=/.test(attrs) ? m : `<section data-density="${density}"${attrs}>`,
  );
}

function pickComponent(componentsHtml: string, slideType: string): string | null {
  // slideType is pre-validated against SLIDE_TYPE_RE and known grammar types,
  // so direct interpolation into the regex is safe.
  const re = new RegExp(
    `<template[^>]*id=["']slide-${slideType}["'][^>]*>([\\s\\S]*?)</template>`,
    "i",
  );
  const m = componentsHtml.match(re);
  return m ? m[1].trim() : null;
}

function interpolate(
  template: string,
  slots: Record<string, string>,
  ctx: RenderContext,
): string {
  // Placeholder drop-slot for customer-supplied media (product shots, screenshots,
  // device mockups, brand photos). Handled first and with OPTIONAL args, so a bare
  // {{@placeholder}} works. We never AI-generate or rebuild a real product/UI — the
  // customer drops their own image into this slot.
  let out = template.replace(
    /\{\{\s*@placeholder(\s+[^{}]*?)?\s*\}\}/g,
    (_match, argString) => {
      const args = argString ? parseDirectiveArgs(argString) : {};
      return renderPlaceholderDirective(args, slots);
    },
  );

  out = out.replace(
    /\{\{\s*@(table|list|chart|gradient-bg|icon|scrim)\s+([^{}]+?)\s*\}\}/g,
    (_match, kind, argString) => {
      const args = parseDirectiveArgs(argString);
      if (kind === "table") return renderTableDirective(args, slots);
      if (kind === "list") return renderListDirective(args, slots);
      if (kind === "chart") return renderChartDirective(args, slots);
      if (kind === "gradient-bg") return renderGradientBgDirective(args, slots, ctx);
      if (kind === "icon") return renderIconDirective(args, slots, ctx);
      if (kind === "scrim") return renderScrimDirective(args, slots);
      return "";
    },
  );

  out = out.replace(/\{\{\s*([\w:-]+)\s*\}\}/g, (_match, key) => {
    if (key.startsWith("image:")) {
      const imgKey = key.slice(6);
      const resolved = ctx.resolvedImages.get(imgKey);
      if (!resolved) return "";
      const safe = safeImageUrl(resolved.url);
      if (!safe) return "";
      return `<img src="${escapeHtmlAttr(safe)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    }
    const value = slots[key];
    return typeof value === "string" ? escapeHtml(value) : "";
  });

  return out;
}

function parseDirectiveArgs(s: string): Record<string, string> {
  const args: Record<string, string> = {};
  const re = /([a-zA-Z][\w-]*)=([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    args[m[1]] = m[2];
  }
  return args;
}

// A neutral, on-brand drop-slot where the customer places their own image. Used
// for anything we must never fabricate: product screenshots, device mockups,
// physical-product shots, real people, brand photography. Renders in the deck's
// own colours (card ground, rule border, muted ink) so it reads as a deliberate
// empty frame, not a broken image.
//   {{@placeholder}}                       — fills its container
//   {{@placeholder ratio=9:19.5}}          — phone-shaped frame
//   {{@placeholder slot=caption}}          — custom caption from a slot
//   {{@placeholder ratio=16:9 label=...}}  — (label arg = single token only)
function renderPlaceholderDirective(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const captionSlot = args.slot ? slots[args.slot] : undefined;
  const label =
    (typeof captionSlot === "string" && captionSlot.trim()) ||
    (args.label ? args.label.replace(/_/g, " ") : "") ||
    "Your image here";

  // ratio like "16:9" or "9:19.5" → CSS aspect-ratio "16 / 9". When given, the
  // slot defines its own shape; otherwise it fills the container it sits in.
  let shape = "width:100%;height:100%;";
  const ratioMatch = args.ratio?.match(/^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    shape = `width:100%;aspect-ratio:${ratioMatch[1]} / ${ratioMatch[2]};max-height:100%;margin:0 auto;`;
  }

  // Lucide "image" glyph, drawn in muted ink.
  const glyph =
    `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<rect x="3" y="3" width="18" height="18" rx="2"/>` +
    `<circle cx="9" cy="9" r="2"/>` +
    `<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;

  return (
    `<div class="ds-placeholder" style="${shape}box-sizing:border-box;` +
    `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;` +
    `border:1.5px dashed var(--color-rule);border-radius:var(--radius-card, 14px);` +
    `background:var(--color-card);color:var(--color-muted);` +
    `font-family:var(--font-body);font-size:15px;line-height:1.3;text-align:center;padding:24px;">` +
    `${glyph}<span>${escapeHtml(label)}</span></div>`
  );
}

function renderListDirective(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const slotName = args.slot;
  if (!slotName) return "";
  const value = slots[slotName];
  if (typeof value !== "string" || value.length === 0) return "";
  const sep = args.sep ?? "|";
  const items = value
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const inner = items
    .map((it) => `<div>${escapeHtml(it)}</div>`)
    .join("");
  return `<div class="dir-list dir-list-${escapeHtmlAttr(slotName)}">${inner}</div>`;
}

function renderTableDirective(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const rowsSlot = args.rows;
  const colsSlot = args.cols;
  const cellsSlot = args.cells;
  if (!rowsSlot || !colsSlot || !cellsSlot) return "";
  const rowsStr = slots[rowsSlot] ?? "";
  const colsStr = slots[colsSlot] ?? "";
  const cellsStr = slots[cellsSlot] ?? "";
  const rowSep = args.rowSep ?? "||";
  const colSep = args.colSep ?? "/";
  const headerSep = args.headerSep ?? "|";

  const rowHeaders = rowsStr
    .split(headerSep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const colHeaders = colsStr
    .split(headerSep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const cellRows = cellsStr
    .split(rowSep)
    .map((row) =>
      row
        .split(colSep)
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    )
    .filter((row) => row.length > 0);

  const colCount = colHeaders.length;
  const headerCells = [
    `<th class="dir-table-corner"></th>`,
    ...colHeaders.map((h) => `<th>${escapeHtml(h)}</th>`),
  ].join("");

  const bodyRows = rowHeaders
    .map((rh, i) => {
      const row = cellRows[i] ?? [];
      const cells = Array.from({ length: colCount }).map(
        (_, j) => `<td>${escapeHtml(row[j] ?? "")}</td>`,
      );
      return `<tr><th scope="row">${escapeHtml(rh)}</th>${cells.join("")}</tr>`;
    })
    .join("");

  return `<table class="dir-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

export function safeImageUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 4096) return null;
  if (hasUnsafeChars(trimmed)) return null;
  if (!SAFE_URL_SCHEMES.test(trimmed)) return null;
  return trimmed;
}

function hasUnsafeChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
    const ch = s[i];
    if (ch === "<" || ch === ">" || ch === '"' || ch === "'" || ch === "`") return true;
  }
  return false;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ─── Chart directive ────────────────────────────────────────────────────────
// Renders an inline SVG chart from numeric data in slot values. Supported
// chart types: bar, hbar, waterfall, line, dots-2x2.
//
// Numbers come from slot values parsed as JSON-array-style strings. We never
// trust slot values to be HTML — every label is escapeHtml'd, every number
// gets a strict numeric check.
function renderChartDirective(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const type = args.type;
  if (type === "bar") return renderBarChart(args, slots);
  if (type === "hbar") return renderHBarChart(args, slots);
  if (type === "waterfall") return renderWaterfallChart(args, slots);
  if (type === "line") return renderLineChart(args, slots);
  if (type === "dots-2x2") return renderDots2x2(args, slots);
  if (type === "stacked-bar") return renderStackedBar(args, slots);
  if (type === "radar") return renderRadar(args, slots);
  if (type === "dot-map") return renderDotMap(args, slots);
  if (type === "glyph") return renderGlyph(args, slots);
  if (type === "heatmap") return renderHeatmap(args, slots);
  return "";
}

// ─── heatmap ─────────────────────────────────────────────────────────────────
// Dense relevance matrix: row headers × column headers, each cell a value mapped
// onto a single-hue ramp (ghost → accent). The consulting "relevance of trend to
// industry" exhibit. Crisp HTML grid (not SVG) so small dense cells stay legible.
// args: rows (slot, "a|b|c" row headers), cols (slot, "x|y|z" col headers),
//       cells (slot, "v/v/v || v/v/v" values), max (literal scale ceiling),
//       low (#hex ghost), high (#hex full), ink (header text).
function renderHeatmap(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const rowHeaders = parseLabels(slots[args.rows] ?? "");
  const colHeaders = parseLabels(slots[args.cols] ?? "");
  if (rowHeaders.length === 0 || colHeaders.length === 0) return "";
  const cellRows = (slots[args.cells] ?? "")
    .split("||")
    .map((r) => r.split("/").map((c) => Number(c.trim())));
  const maxArg = Number(resolveSlotOrLiteral(args.max, slots));
  let max = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : 0;
  if (!max) for (const r of cellRows) for (const v of r) if (Number.isFinite(v)) max = Math.max(max, v);
  if (!max) max = 1;

  const low = parseHexRgb(args.low ?? "#EEF2F5");
  const high = parseHexRgb(args.high ?? "#1F5AC7");
  const ink = args.ink ?? "#1A1A1A";
  const cellH = Math.max(16, Math.min(96, Number(args.cellHeight) || 42));
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const cellColor = (v: number) => {
    const t = Math.max(0, Math.min(1, (Number.isFinite(v) ? v : 0) / max));
    return `rgb(${lerp(low[0], high[0], t)},${lerp(low[1], high[1], t)},${lerp(low[2], high[2], t)})`;
  };

  const headRow =
    `<div></div>` +
    colHeaders
      .map(
        (c) =>
          `<div style="font-family:var(--font-data);font-size:11px;line-height:1.15;color:${ink};text-align:center;padding:0 2px 6px;align-self:end;">${escapeHtml(c)}</div>`,
      )
      .join("");

  const bodyRows = rowHeaders
    .map((rh, i) => {
      const vals = cellRows[i] ?? [];
      const head = `<div style="font-family:var(--font-body);font-size:12px;color:${ink};white-space:nowrap;padding-right:10px;align-self:center;text-align:right;">${escapeHtml(rh)}</div>`;
      const cells = colHeaders
        .map((_, j) => `<div style="min-height:${cellH}px;background:${cellColor(vals[j])};border:1px solid #fff;"></div>`)
        .join("");
      return head + cells;
    })
    .join("");

  // Rows fill the available height equally (minmax(0,1fr)) so the matrix sizes
  // to its container regardless of row count — no fixed-height overflow/clipping.
  // The cellHeight arg becomes a per-cell min-height floor.
  const cols = `minmax(120px, max-content) repeat(${colHeaders.length}, 1fr)`;
  const gridRows = `auto repeat(${rowHeaders.length}, minmax(0, 1fr))`;
  return `<div class="dir-heatmap" style="display:grid;grid-template-columns:${cols};grid-template-rows:${gridRows};gap:0;width:100%;height:100%;">${headRow}${bodyRows}</div>`;
}

function parseHexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return [238, 242, 245];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Sanitize a font-family token passed via a directive arg. parseDirectiveArgs
// already forbids spaces, so families with spaces are referenced as single
// tokens (e.g. font=Fraunces); we strip anything that isn't a safe char.
function fontStack(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  const clean = name.replace(/[^A-Za-z0-9_-]/g, "");
  if (!clean) return fallback;
  return `'${clean}', ${fallback}`;
}

const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
const MONO_FALLBACK = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace";

// Relative luminance of a #rrggbb color — used to pick white vs ink text on a fill.
function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function readableOn(fill: string, light = "#FFFFFF", dark = "#1A1A1A"): string {
  return hexLuminance(fill) > 0.55 ? dark : light;
}

function parseNums(s: string): number[] {
  return s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
}

// Max number of fractional digits across the source tokens, so a value like
// "6.10" renders as "6.10" not "6.1" (JS drops the trailing zero on parse).
function maxDecimals(s: string): number {
  let max = 0;
  for (const tok of s.split(/[\s,]+/)) {
    const t = tok.trim();
    const dot = t.indexOf(".");
    if (dot >= 0 && /^-?\d*\.\d+$/.test(t)) max = Math.max(max, t.length - dot - 1);
  }
  return max;
}

function parseLabels(s: string): string[] {
  return s
    .split("|")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function resolveSlotOrLiteral(
  value: string | undefined,
  slots: Record<string, string>,
): string {
  if (!value) return "";
  if (Object.prototype.hasOwnProperty.call(slots, value)) return slots[value];
  return value;
}

function renderBarChart(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const data = parseNums(slots[args.data] ?? "");
  const labels = parseLabels(slots[args.labels] ?? "");
  const highlight = Number(resolveSlotOrLiteral(args.highlight, slots) || "-1");
  if (data.length === 0) return "";
  const w = 920, h = 440;
  const padL = 56, padR = 16, padT = 48, padB = 104;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const max = Math.max(...data, 0);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const barW = (chartW / data.length) * 0.62;
  const gap = (chartW / data.length) * 0.38;
  const zeroY = padT + chartH * (max / range);

  const accent = args.accent ?? "#FF6A13";
  const base = args.base ?? "#1F3A5F";
  const muted = "#B8C0CC";
  const ink = args.ink ?? base;

  const unit = resolveSlotOrLiteral(args.unit, slots);
  const dec = maxDecimals(slots[args.data] ?? "");
  let bars = "";
  data.forEach((v, i) => {
    const x = padL + gap / 2 + i * (barW + gap);
    const barH = (Math.abs(v) / range) * chartH;
    const y = v >= 0 ? zeroY - barH : zeroY;
    const fill = i === highlight ? accent : base;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}"/>`;
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 12).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="22" fill="${ink}" text-anchor="middle" font-weight="700">${escapeHtml(formatNum(v, unit, false, dec))}</text>`;
    if (labels[i]) {
      bars += renderWrappedLabel(labels[i], x + barW / 2, padT + chartH + 28, barW + gap * 0.85, muted, 17);
    }
  });

  // zero baseline carries the chart — strong, not a hairline
  const axis = `<line x1="${padL}" x2="${w - padR}" y1="${zeroY}" y2="${zeroY}" stroke="${ink}" stroke-width="2"/>`;
  const note = renderChartNote(args, slots, w - padR, 24, accent);

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${axis}${bars}${note}</svg>`;
}

/**
 * Optional takeaway callout on a chart: `note=<slot>` renders the slot's text
 * top-right in the accent colour — the chart's "so what", on the chart itself.
 */
function renderChartNote(
  args: Record<string, string>,
  slots: Record<string, string>,
  x: number,
  y: number,
  color: string,
): string {
  const note = args.note ? (slots[args.note] ?? "") : "";
  if (!note) return "";
  return `<text x="${x}" y="${y}" text-anchor="end" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="17" fill="${color}" font-weight="600">${escapeHtml(note)}</text>`;
}

function renderHBarChart(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const data = parseNums(slots[args.data] ?? "");
  const labels = parseLabels(slots[args.labels] ?? "");
  if (data.length === 0) return "";
  const dec = maxDecimals(slots[args.data] ?? "");
  const highlight = Number(resolveSlotOrLiteral(args.highlight, slots) || "-1");
  const w = 920;
  const rowH = 52;
  const h = data.length * rowH + 32;
  const padL = 260, padR = 100, padT = 8;
  const chartW = w - padL - padR;
  const max = Math.max(...data, 0);
  const accent = args.accent ?? "#FF6A13";
  const base = args.base ?? "#1F3A5F";
  const muted = "#B8C0CC";
  const ink = args.ink ?? base;

  let rows = "";
  data.forEach((v, i) => {
    const y = padT + i * rowH;
    const barW = (v / max) * chartW;
    const fill = i === highlight ? accent : base;
    if (labels[i]) {
      rows += `<text x="${padL - 18}" y="${(y + rowH / 2 + 6).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="18" fill="${ink}" text-anchor="end">${escapeHtml(labels[i])}</text>`;
    }
    rows += `<rect x="${padL}" y="${(y + 10).toFixed(1)}" width="${barW.toFixed(1)}" height="${(rowH - 20).toFixed(1)}" fill="${fill}"/>`;
    rows += `<text x="${(padL + barW + 10).toFixed(1)}" y="${(y + rowH / 2 + 6).toFixed(1)}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="17" fill="${ink}" font-weight="600">${escapeHtml(formatNum(v, resolveSlotOrLiteral(args.unit, slots), false, dec))}</text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${rows}</svg>`;
}

function renderWaterfallChart(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const data = parseNums(slots[args.data] ?? "");
  const labels = parseLabels(slots[args.labels] ?? "");
  if (data.length === 0) return "";
  const w = 920, h = 440;
  const padL = 56, padR = 16, padT = 48, padB = 104;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // running totals; first and last bars start at 0 (totals), middle bars are deltas
  let running = 0;
  const segments: { from: number; to: number; isTotal: boolean }[] = [];
  data.forEach((v, i) => {
    const isTotal = i === 0 || i === data.length - 1;
    if (isTotal) {
      segments.push({ from: 0, to: v, isTotal: true });
      running = v;
    } else {
      const next = running + v;
      segments.push({ from: running, to: next, isTotal: false });
      running = next;
    }
  });
  const allVals = segments.flatMap((s) => [s.from, s.to]);
  const max = Math.max(...allVals, 0);
  const min = Math.min(...allVals, 0);
  const range = (max - min) || 1;
  const scale = chartH / range;
  const zeroY = padT + max * scale;
  // Tighten bar spacing so the staircase reads as one connected drop, not floating pills
  const barW = (chartW / data.length) * 0.8;
  const gap = (chartW / data.length) * 0.2;

  const accent = args.accent ?? "#FF6A13";
  const pos = args.posColor ?? "#1F5AC7";
  const neg = args.negColor ?? "#C8102E";
  const muted = "#B8C0CC";
  const ink = "#1A1A1A";
  const unit = resolveSlotOrLiteral(args.unit, slots);
  const dec = maxDecimals(slots[args.data] ?? "");

  let bars = "";
  segments.forEach((s, i) => {
    const x = padL + gap / 2 + i * (barW + gap);
    const top = Math.min(s.from, s.to);
    const bot = Math.max(s.from, s.to);
    const y = zeroY - bot * scale;
    const barH = (bot - top) * scale;
    const fill = s.isTotal ? accent : s.to > s.from ? pos : neg;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 2).toFixed(1)}" fill="${fill}"/>`;
    // Delta value INSIDE the bar (centered), small + bold + white on color
    if (!s.isTotal && barH > 22) {
      const deltaText = formatNum(s.to - s.from, unit, true, dec);
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y + barH / 2 + 6).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="18" fill="#FFFFFF" text-anchor="middle" font-weight="700">${escapeHtml(deltaText)}</text>`;
    } else if (!s.isTotal) {
      const deltaText = formatNum(s.to - s.from, unit, true, dec);
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="17" fill="${neg}" text-anchor="middle" font-weight="600">${escapeHtml(deltaText)}</text>`;
    }
    // Running-total value ABOVE the bar — large, ink, this is the "what does it sum to" anchor
    if (s.isTotal) {
      const totalText = formatNum(s.to, unit, false, dec);
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 14).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="26" fill="${ink}" text-anchor="middle" font-weight="700" letter-spacing="-0.01em">${escapeHtml(totalText)}</text>`;
    }
    if (labels[i]) {
      bars += renderWrappedLabel(labels[i], x + barW / 2, padT + chartH + 24, barW + gap * 0.85, muted, 17);
    }
    // Solid connector — the staircase line that makes this a waterfall, not floating bars
    if (i < segments.length - 1) {
      const connectY = zeroY - s.to * scale;
      const nextX = padL + gap / 2 + (i + 1) * (barW + gap);
      bars += `<line x1="${(x + barW).toFixed(1)}" x2="${nextX.toFixed(1)}" y1="${connectY.toFixed(1)}" y2="${connectY.toFixed(1)}" stroke="${ink}" stroke-width="1" stroke-opacity="0.35"/>`;
    }
  });

  const baseline = `<line x1="${padL}" x2="${w - padR}" y1="${zeroY}" y2="${zeroY}" stroke="${ink}" stroke-width="2" stroke-opacity="0.85"/>`;
  const note = renderChartNote(args, slots, w - padR, 24, accent);
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${baseline}${bars}${note}</svg>`;
}

// Wrap a label onto up to 2 lines within maxWidth. Uses approximate em-width
// for character measurement (good enough for chart x-axis labels at fontSize 13).
function renderWrappedLabel(
  label: string,
  cx: number,
  topY: number,
  maxWidth: number,
  fill: string,
  fontSize = 15,
): string {
  const charW = fontSize * 0.55;
  const maxChars = Math.max(8, Math.floor(maxWidth / charW));
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length <= maxChars) {
      current = (current + " " + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length === 1) break;
    }
  }
  if (current) lines.push(current);
  // If word still overflows, truncate
  const safe = lines.slice(0, 2).map((l) => (l.length > maxChars + 4 ? l.slice(0, maxChars + 2) + "…" : l));
  return safe
    .map(
      (line, idx) =>
        `<text x="${cx.toFixed(1)}" y="${(topY + idx * (fontSize + 2)).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${fontSize}" fill="${fill}" text-anchor="middle">${escapeHtml(line)}</text>`,
    )
    .join("");
}

function renderLineChart(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const data = parseNums(slots[args.data] ?? "");
  const labels = parseLabels(slots[args.labels] ?? "");
  if (data.length < 2) return "";
  // Optional second trace: dashed reference / benchmark / prior-period
  const compareData = args.compareData ? parseNums(slots[args.compareData] ?? "") : [];
  const dec = maxDecimals((slots[args.data] ?? "") + " " + (args.compareData ? slots[args.compareData] ?? "" : ""));
  const compareLabel = resolveSlotOrLiteral(args.compareLabel, slots);
  const primaryLabel = resolveSlotOrLiteral(args.primaryLabel, slots);
  const hasCompare = compareData.length >= 2;

  const w = 920, h = 420;
  const padL = 64, padR = 48, padT = hasCompare ? 92 : 36, padT0 = hasCompare ? 28 : 36;
  const padB = 68;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const allVals = hasCompare ? [...data, ...compareData] : data;
  const max = Math.max(...allVals);
  const min = Math.min(...allVals);
  const range = max - min || 1;
  const step = chartW / (data.length - 1);
  const compareStep = hasCompare ? chartW / (compareData.length - 1) : 0;

  const accent = args.accent ?? "#FF6A13";
  const base = args.base ?? "#1F3A5F";
  const muted = "#B8C0CC";
  const ink = args.ink ?? base;

  const points = data.map((v, i) => {
    const x = padL + i * step;
    const y = padT + ((max - v) / range) * chartH;
    return { x, y };
  });
  const path = "M " + points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ");
  const fillPath = path + ` L ${padL + chartW} ${padT + chartH} L ${padL} ${padT + chartH} Z`;
  let svg = `<defs><linearGradient id="lc-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${base}" stop-opacity="0.22"/><stop offset="100%" stop-color="${base}" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<path d="${fillPath}" fill="url(#lc-grad)"/>`;
  // gridlines first, so the line draws over them
  for (let g = 0; g <= 4; g++) {
    const gy = padT + (g / 4) * chartH;
    svg += `<line x1="${padL}" x2="${w - padR}" y1="${gy}" y2="${gy}" stroke="${muted}" stroke-width="0.5" stroke-dasharray="2 4"/>`;
  }
  // Compare trace (dashed) renders behind primary; endpoint dot only — legend at top names the series
  if (hasCompare) {
    const cmpPoints = compareData.map((v, i) => {
      const x = padL + i * compareStep;
      const y = padT + ((max - v) / range) * chartH;
      return { x, y };
    });
    const cmpPath = "M " + cmpPoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ");
    svg += `<path d="${cmpPath}" fill="none" stroke="${muted}" stroke-width="2" stroke-dasharray="6 6" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = cmpPoints[cmpPoints.length - 1];
    svg += `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" fill="${muted}"/>`;
    const lastV = compareData[compareData.length - 1];
    // Place the compare label clear of the dashed line and on the OPPOSITE
    // vertical side of the primary endpoint label, so it never overprints the
    // line/dot or the primary value when the two series end close together.
    const primLastY = points[points.length - 1].y;
    const cmpAbove = last.y <= primLastY;
    const cmpLabelY = cmpAbove ? last.y - 13 : last.y + 21;
    svg += `<text x="${(last.x - 12).toFixed(1)}" y="${cmpLabelY.toFixed(1)}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="14" fill="${muted}" text-anchor="end" font-weight="600">${escapeHtml(formatNum(lastV, resolveSlotOrLiteral(args.unit, slots), false, dec))}</text>`;
  }
  svg += `<path d="${path}" fill="none" stroke="${base}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  // dots: first, last, peak
  points.forEach((p, i) => {
    const isPeak = data[i] === max;
    if (i === 0 || i === points.length - 1 || isPeak) {
      const dotFill = isPeak ? accent : base;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isPeak ? 7 : 5}" fill="${dotFill}"/>`;
      svg += `<text x="${p.x.toFixed(1)}" y="${(p.y - 14).toFixed(1)}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="16" fill="${ink}" text-anchor="middle" font-weight="700">${escapeHtml(formatNum(data[i], resolveSlotOrLiteral(args.unit, slots), false, dec))}</text>`;
    }
    if (labels[i]) {
      svg += `<text x="${p.x.toFixed(1)}" y="${(padT + chartH + 28).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="15" fill="${muted}" text-anchor="middle">${escapeHtml(labels[i])}</text>`;
    }
  });
  // legend at top when we have two traces
  if (hasCompare) {
    const lx = padL;
    const ly = padT0;
    svg += `<line x1="${lx}" x2="${lx + 24}" y1="${ly}" y2="${ly}" stroke="${base}" stroke-width="3"/>`;
    svg += `<text x="${lx + 32}" y="${(ly + 5).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="13" fill="${ink}" font-weight="600">${escapeHtml(primaryLabel || "Actual")}</text>`;
    const lx2 = lx + 180;
    svg += `<line x1="${lx2}" x2="${lx2 + 24}" y1="${ly}" y2="${ly}" stroke="${muted}" stroke-width="2" stroke-dasharray="6 6"/>`;
    svg += `<text x="${lx2 + 32}" y="${(ly + 5).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="13" fill="${muted}" font-weight="500">${escapeHtml(compareLabel || "Benchmark")}</text>`;
  }
  svg += renderChartNote(args, slots, w - padR, padT0 + 5, accent);
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${svg}</svg>`;
}

function renderDots2x2(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  // data slot is "x,y,label || x,y,label || ..." rows; highlight slot is the label that gets accent color
  const raw = slots[args.data] ?? "";
  const rows = raw.split("||").map((r) => r.trim()).filter(Boolean);
  if (rows.length === 0) return "";
  const points = rows
    .map((r) => {
      const parts = r.split(",").map((p) => p.trim());
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const label = parts.slice(2).join(",").trim();
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y, label };
    })
    .filter((p): p is { x: number; y: number; label: string } => p !== null);
  if (points.length === 0) return "";
  const highlight = resolveSlotOrLiteral(args.highlight, slots).toLowerCase();
  const xLabel = resolveSlotOrLiteral(args.xLabel, slots);
  const yLabel = resolveSlotOrLiteral(args.yLabel, slots);
  const w = 720, h = 540;
  const padL = 80, padR = 40, padT = 40, padB = 70;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const accent = args.accent ?? "#FF6A13";
  const base = args.base ?? "#1F3A5F";
  const muted = "#B8C0CC";
  const ink = args.ink ?? base;
  // axes assume 0..100 normalized
  let svg = "";
  // quadrant rules
  svg += `<line x1="${padL + chartW / 2}" x2="${padL + chartW / 2}" y1="${padT}" y2="${padT + chartH}" stroke="${muted}" stroke-width="1"/>`;
  svg += `<line x1="${padL}" x2="${padL + chartW}" y1="${padT + chartH / 2}" y2="${padT + chartH / 2}" stroke="${muted}" stroke-width="1"/>`;
  // axis labels
  svg += `<text x="${padL + chartW / 2}" y="${h - 16}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="12" fill="${muted}" text-anchor="middle" letter-spacing="0.04em">${escapeHtml(xLabel)}</text>`;
  svg += `<text transform="rotate(-90 24 ${padT + chartH / 2})" x="24" y="${padT + chartH / 2}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="12" fill="${muted}" text-anchor="middle" letter-spacing="0.04em">${escapeHtml(yLabel)}</text>`;
  for (const p of points) {
    const cx = padL + (p.x / 100) * chartW;
    const cy = padT + ((100 - p.y) / 100) * chartH;
    const isHi = p.label.toLowerCase() === highlight;
    svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isHi ? 10 : 7}" fill="${isHi ? accent : base}"/>`;
    svg += `<text x="${(cx + 14).toFixed(1)}" y="${(cy + 4).toFixed(1)}" style="font-family:var(--font-data, Inter, system-ui, sans-serif)" font-size="14" fill="${ink}" font-weight="${isHi ? 700 : 500}">${escapeHtml(p.label)}</text>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${svg}</svg>`;
}

// ─── stacked-bar ─────────────────────────────────────────────────────────────
// Full-width 100% segmented bar. The hero move: oversized SERIF numerals reversed
// out of each segment. Top row carries a small title (left) + legend (right).
// args: data (slot, numbers → normalized to %), labels (slot, segment names "a|b"),
//       title (slot|literal), accent (1st segment), base (others), font (serif), unit.
function renderStackedBar(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const data = parseNums(slots[args.data] ?? "");
  const labels = parseLabels(slots[args.labels] ?? "");
  if (data.length === 0) return "";
  const sum = data.reduce((a, v) => a + Math.abs(v), 0) || 1;

  const w = 1280, h = 360;
  const padX = 4, topH = 78;
  const barY = topH + 8, barH = h - barY - 4;
  const barW = w - padX * 2;

  const accent = args.accent ?? "#E8401F";
  const base = args.base ?? "#1A1A1A";
  const muted = args.muted ?? "#9AA0A6";
  const ink = args.ink ?? "#1A1A1A";
  const palette = [accent, base, "#3A3F45", "#6B7178", "#B0B6BD"];
  const serif = fontStack(args.font, SERIF_FALLBACK);
  const sans = "'Inter Tight', system-ui, sans-serif";
  const title = resolveSlotOrLiteral(args.title, slots);

  // ── bar segments ──
  let segs = "";
  let x = padX;
  data.forEach((v, i) => {
    const segW = (Math.abs(v) / sum) * barW;
    const fill = palette[i % palette.length];
    const pct = Math.round((Math.abs(v) / sum) * 100);
    const txt = readableOn(fill);
    segs += `<rect x="${x.toFixed(1)}" y="${barY}" width="${segW.toFixed(1)}" height="${barH}" fill="${fill}"/>`;
    // oversized serif numeral, optically centered in the segment via SVG
    // baseline semantics (font-agnostic — no hardcoded cap-height ratio)
    if (segW > 70) {
      segs += `<text x="${(x + 30).toFixed(1)}" y="${(barY + barH / 2).toFixed(1)}" dominant-baseline="central" font-family="${serif}" font-size="116" fill="${txt}" font-weight="400" letter-spacing="-0.01em">${pct}%</text>`;
    }
    x += segW;
  });

  // ── title (top-left) ──
  let top = "";
  if (title) {
    top += `<text x="${padX + 4}" y="42" font-family="${sans}" font-size="22" fill="${ink}" font-weight="700">${escapeHtml(title)}</text>`;
  }
  // ── legend (top-right, right-aligned) ──
  if (labels.length) {
    const charW = 9.5, sw = 16, gap = 9, itemGap = 34;
    const widths = labels.map((l) => sw + gap + l.length * charW);
    const totalW = widths.reduce((a, b) => a + b, 0) + itemGap * (labels.length - 1);
    let lx = w - padX - totalW;
    labels.forEach((l, i) => {
      const fill = palette[i % palette.length];
      top += `<rect x="${lx.toFixed(1)}" y="28" width="${sw}" height="${sw}" fill="${fill}"/>`;
      top += `<text x="${(lx + sw + gap).toFixed(1)}" y="42" font-family="${sans}" font-size="17" fill="${muted}" font-weight="500">${escapeHtml(l)}</text>`;
      lx += widths[i] + itemGap;
    });
  }
  // thin rule under the top row
  top += `<line x1="${padX}" x2="${w - padX}" y1="${topH - 8}" y2="${topH - 8}" stroke="${muted}" stroke-width="1" stroke-opacity="0.4"/>`;

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${top}${segs}</svg>`;
}

// ─── radar / spider ──────────────────────────────────────────────────────────
// args: data (slot numbers, one per axis), labels (slot "a|b|c..."), max (literal,
//       default = nice ceiling of data), accent (stroke+fill), fillOpacity, font (mono labels).
function renderRadar(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const data = parseNums(slots[args.data] ?? "");
  const labels = parseLabels(slots[args.labels] ?? "");
  const n = data.length;
  if (n < 3) return "";
  const maxArg = Number(resolveSlotOrLiteral(args.max, slots));
  const max = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : Math.max(...data, 1) * 1.1;

  const w = 860, h = 780;
  const cx = w / 2, cy = h / 2 + 6;
  const R = 220;
  const accent = args.accent ?? "#E8401F";
  const fillCol = args.fill ?? accent;
  const fillOp = args.fillOpacity ?? "0.16";
  const grid = args.grid ?? "#D9D5CC";
  const labelCol = args.labelColor ?? "#6B7178";
  const mono = fontStack(args.font, MONO_FALLBACK);

  const ang = (i: number) => (-90 + (i * 360) / n) * (Math.PI / 180);
  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(ang(i)),
    y: cy + r * Math.sin(ang(i)),
  });

  let svg = "";
  // concentric grid rings (n-gons)
  for (let g = 1; g <= 4; g++) {
    const rr = (g / 4) * R;
    const poly = Array.from({ length: n }, (_, i) => {
      const p = pt(i, rr);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" ");
    svg += `<polygon points="${poly}" fill="none" stroke="${grid}" stroke-width="1"/>`;
  }
  // spokes
  for (let i = 0; i < n; i++) {
    const p = pt(i, R);
    svg += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${grid}" stroke-width="1"/>`;
  }
  // data polygon
  const dataPoly = data
    .map((v, i) => {
      const p = pt(i, (Math.max(0, v) / max) * R);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
  svg += `<polygon points="${dataPoly}" fill="${fillCol}" fill-opacity="${fillOp}" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>`;
  data.forEach((v, i) => {
    const p = pt(i, (Math.max(0, v) / max) * R);
    svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${accent}"/>`;
  });
  // axis labels (mono, sentence case) just outside the outer ring
  labels.slice(0, n).forEach((l, i) => {
    const p = pt(i, R + 30);
    const c = Math.cos(ang(i));
    const anchor = c > 0.25 ? "start" : c < -0.25 ? "end" : "middle";
    const dy = Math.sin(ang(i)) > 0.5 ? 14 : Math.sin(ang(i)) < -0.5 ? -6 : 4;
    svg += `<text x="${p.x.toFixed(1)}" y="${(p.y + dy).toFixed(1)}" font-family="${mono}" font-size="13" fill="${labelCol}" text-anchor="${anchor}" letter-spacing="0.04em">${escapeHtml(l)}</text>`;
  });

  // Tighten the viewBox to the actual ring+label bbox so the chart fills its
  // column instead of self-padding with whitespace (rings span cy±R, labels
  // reach ~R+30; covers 3–6 axes).
  return `<svg viewBox="0 112 ${w} 548" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;overflow:visible;">${svg}</svg>`;
}

// ─── dot-map ─────────────────────────────────────────────────────────────────
// Dot-matrix world map. Land mask is sampled from real Natural Earth geometry
// and baked into dotmap-data.ts by scripts/bake-dotmap.ts (re-run that to
// change resolution). Per-row column ranges of land cells.
function renderDotMap(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const cols = DOTMAP_COLS, rows = DOTMAP_ROWS;
  const w = 1280;
  const cellW = w / cols;
  const cellH = cellW; // square grid → evenly spaced dots
  const h = Math.round(cellH * rows);
  const r = cellW * 0.30;
  const color = args.color ?? "#5A5F66";
  const accent = args.accent ?? "";
  // Optional compact accent cluster: highlight land dots inside an ellipse
  // centered at (accentX, accentY) normalized, radius accentR. Reads as one
  // glowing region rather than a full-height column.
  const ax = Number(resolveSlotOrLiteral(args.accentX, slots));
  const ay = Number(resolveSlotOrLiteral(args.accentY, slots));
  const ar = Number(resolveSlotOrLiteral(args.accentR, slots)) || 0.06;
  const hasAccent = accent && Number.isFinite(ax) && Number.isFinite(ay);

  const inLand = (c: number, rw: number) => {
    const ranges = DOTMAP_LAND[rw];
    return !!ranges && ranges.some(([a, b]) => c >= a && c <= b);
  };

  let dots = "";
  for (let rw = 0; rw < rows; rw++) {
    for (let c = 0; c < cols; c++) {
      if (!inLand(c, rw)) continue;
      const cx = c * cellW + cellW / 2;
      const cy = rw * cellH + cellH / 2;
      const nx = (c + 0.5) / cols;
      const ny = (rw + 0.5) / rows;
      const isAccent =
        hasAccent &&
        ((nx - ax) / ar) * ((nx - ax) / ar) + ((ny - ay) / (ar * 1.4)) * ((ny - ay) / (ar * 1.4)) <= 1;
      dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${isAccent ? accent : color}"/>`;
    }
  }

  // Pins: accent markers at REAL city coordinates (baked gazetteer), projected
  // with the same equirectangular mapping as the land grid. Unknown cities skip.
  const pinColor = args.pinColor ?? accent ?? "#E8401F";
  const pinNames = resolveSlotOrLiteral(args.pins, slots)
    .split(/[,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const latSpan = DOTMAP_LAT_TOP - DOTMAP_LAT_BOTTOM;
  // Snap a (lon,lat) to the nearest LAND cell centre. Cells are ~3.5°, so a
  // coastal hub's exact coordinate can fall in an ocean/blank cell; snapping
  // guarantees every pin sits on a visible land dot.
  const snapToLand = (lon: number, lat: number): [number, number] | null => {
    const fc = ((lon + 180) / 360) * cols - 0.5;
    const fr = ((DOTMAP_LAT_TOP - lat) / latSpan) * rows - 0.5;
    let best: [number, number] | null = null, bestD = Infinity;
    for (let rr = 0; rr < rows; rr++) {
      const ranges = DOTMAP_LAND[rr];
      if (!ranges) continue;
      for (const [a, b] of ranges) {
        for (let c = a; c <= b; c++) {
          const d = (c - fc) * (c - fc) + (rr - fr) * (rr - fr);
          if (d < bestD) { bestD = d; best = [c, rr]; }
        }
      }
    }
    return best;
  };
  let pins = "";
  for (const nm of pinNames) {
    const co = CITY_COORDS[nm];
    if (!co) continue;
    const cell = snapToLand(co[0], co[1]);
    if (!cell) continue;
    const px = cell[0] * cellW + cellW / 2;
    const py = cell[1] * cellH + cellH / 2;
    pins += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(r * 2.8).toFixed(1)}" fill="${pinColor}" fill-opacity="0.16"/>`;
    pins += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(r * 1.3).toFixed(1)}" fill="${pinColor}"/>`;
  }

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${dots}${pins}</svg>`;
}

// ─── glyph ───────────────────────────────────────────────────────────────────
// Abstract line-art network motifs for process/feature panels. args: variant
// (detect|route|resolve), color (stroke), node (filled-dot color).
function renderGlyph(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const variant = (resolveSlotOrLiteral(args.variant, slots) || "detect").toLowerCase();
  const stroke = args.color ?? "#C7CCD2";
  const node = args.node ?? stroke;
  const w = 260, h = 200;
  const sw = 1.5;
  const L = (x1: number, y1: number, x2: number, y2: number, dash = false) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash ? ' stroke-dasharray="3 4"' : ""}/>`;
  const C = (cx: number, cy: number, r: number, fill = "none") =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill === "none" ? "none" : fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  const Dot = (cx: number, cy: number, r = 3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${node}"/>`;
  const Sq = (cx: number, cy: number, s: number) =>
    `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;

  let g = "";
  if (variant === "detect") {
    // small node top-left, ringed node right, square bottom — connected
    g += L(70, 60, 188, 92) + L(70, 60, 96, 150) + L(188, 92, 96, 150);
    g += Sq(96, 150, 44);
    g += C(188, 92, 26) + Dot(188, 92, 3);
    g += Dot(70, 60, 4);
  } else if (variant === "route") {
    // central node with 4 radiating circles in an X, dashed inner ring
    const cx = 130, cy = 100;
    const pts = [
      [78, 56], [182, 56], [78, 144], [182, 144],
    ];
    for (const [x, y] of pts) {
      g += L(cx, cy, x, y);
      g += C(x, y, 15) + Dot(x, y, 2.5);
    }
    g += C(cx, cy, 22, "none").replace(`stroke-width="${sw}"`, `stroke-width="${sw}" stroke-dasharray="3 4"`);
    g += Dot(cx, cy, 4);
  } else {
    // resolve: central ringed square + 4 corner squares, branching
    const cx = 130, cy = 100;
    const corners = [
      [70, 56], [190, 56], [70, 144], [190, 144],
    ];
    for (const [x, y] of corners) {
      g += L(cx, cy, x, y);
      g += Sq(x, y, 24);
    }
    g += Sq(cx, cy, 40);
    g += Dot(cx, cy, 4);
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">${g}</svg>`;
}

// ─── icon ────────────────────────────────────────────────────────────────────
// Renders a vetted icon by name from a baked kit. The model never authors SVG
// paths — it can only reference a name that exists in the set, so a "shield"
// always looks like a shield. The skill picks the kit (lucide | tabler |
// heroicons | phosphor) via tokens.icon.kit so the icon style matches the vibe;
// names a kit lacks fall back to lucide. Unknown names render nothing.
// args: name (slot|literal), color (#hex | currentColor | var(--x)), size, stroke.
const ICON_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z][a-zA-Z-]*|var\(--[a-z0-9-]+\))$/;
function renderIconDirective(
  args: Record<string, string>,
  slots: Record<string, string>,
  ctx: RenderContext,
): string {
  const name = resolveSlotOrLiteral(args.name, slots).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const kitName = (ctx.skill.tokens.icon?.kit ?? "lucide").toLowerCase();
  const lucide = ICON_KITS.lucide;
  const kit = ICON_KITS[kitName] ?? lucide;

  let inner = kit.icons[name];
  let mode = kit.mode;
  let viewBox = kit.viewBox;
  let defStroke = kit.strokeWidth;
  if (!inner) {
    // Kit lacks this name → fall back to lucide so the icon still appears.
    inner = lucide.icons[name];
    mode = lucide.mode;
    viewBox = lucide.viewBox;
    defStroke = lucide.strokeWidth;
  }
  if (!inner) return "";

  const size = Math.max(8, Math.min(512, Math.round(Number(args.size) || 28)));
  const colorRaw = args.color ?? "currentColor";
  const color = ICON_COLOR_RE.test(colorRaw) ? colorRaw : "currentColor";

  if (mode === "fill") {
    return `<svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${color}" style="display:block;">${inner}</svg>`;
  }
  const sw = Math.max(0.5, Math.min(4, Number(args.stroke) || defStroke));
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${inner}</svg>`;
}

// ─── scrim ───────────────────────────────────────────────────────────────────
// Legibility overlay for editorial / text-on-image compositions. Drops an
// absolutely-positioned gradient veil between a full-bleed image (z-index 0) and
// the content layer, so type stays readable over a photo without dimming the
// whole frame. The reusable counterpart to the inline scrim divs each bleed
// template used to hand-roll.
// args: variant (bottom|top|left|right|bottom-left|bottom-right|top-left|radial|full),
//       color (#hex, dark by default), from (opacity at the strong/anchored edge),
//       to (opacity at the far edge), mid (optional midpoint opacity), z (z-index).
const SCRIM_DIRS: Record<string, string> = {
  bottom: "to top",
  top: "to bottom",
  left: "to right",
  right: "to left",
  "bottom-left": "to top right",
  "bottom-right": "to top left",
  "top-left": "to bottom right",
  "top-right": "to bottom left",
};

function scrimOpacity(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback;
}

function hexToRgba(hex: string, a: number): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return `rgba(14,12,11,${a})`;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function renderScrimDirective(
  args: Record<string, string>,
  _slots: Record<string, string>,
): string {
  const color = args.color ?? "#0E0C0B";
  const from = scrimOpacity(args.from, 0.82);
  const to = scrimOpacity(args.to, 0);
  const mid = scrimOpacity(args.mid, from * 0.35);
  const z = Math.max(0, Math.min(50, Math.round(Number(args.z) || 1)));
  const variant = (args.variant ?? "bottom").toLowerCase();

  let bg: string;
  if (variant === "full") {
    bg = hexToRgba(color, from);
  } else if (variant === "radial") {
    bg = `radial-gradient(130% 120% at 28% 82%, ${hexToRgba(color, to)} 0%, ${hexToRgba(color, mid)} 55%, ${hexToRgba(color, from)} 100%)`;
  } else {
    const dir = SCRIM_DIRS[variant] ?? "to top";
    bg = `linear-gradient(${dir}, ${hexToRgba(color, from)} 0%, ${hexToRgba(color, mid)} 48%, ${hexToRgba(color, to)} 100%)`;
  }
  return `<div class="slide-scrim" style="position:absolute;inset:0;background:${bg};z-index:${z};pointer-events:none;"></div>`;
}

function formatNum(n: number, unit?: string, signed = false, decimals?: number): string {
  const u = unit ?? "";
  const sign = signed && n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  let s: string;
  if (decimals != null && decimals > 0 && abs < 1000) s = abs.toFixed(decimals);
  else if (abs >= 1000) s = (abs / 1000).toFixed(1) + "k";
  else if (abs >= 100) s = String(Math.round(abs));
  else if (Math.abs(abs - Math.round(abs)) < 1e-6) s = String(Math.round(abs));
  else s = abs.toFixed(1);
  // currency-style unit splits: "$M" → prefix "$", suffix "M". Plain "$" → just prefix.
  const m = u.match(/^([$€£])(.*)$/);
  if (m) return `${sign}${m[1]}${s}${m[2]}`;
  return `${sign}${s}${u}`;
}

// ─── Gradient background directive ───────────────────────────────────────────
// Renders an inline SVG full-bleed gradient with multi-stop colors + blurs.
// Used by launch-style hero slides without external image API.
function renderGradientBgDirective(
  args: Record<string, string>,
  slots: Record<string, string>,
  ctx: RenderContext,
): string {
  const presetName = resolveSlotOrLiteral(args.preset, slots) || "warm";
  const useFal = args.fal !== "false";

  // Priority 1: per-slide AI-generated background. generateDeck() runs
  // BackgroundGenerator before render and injects the resulting data-URI
  // into slots["bg-image"] (or whichever slot bgSlot points at).
  if (useFal && args.bgSlot) {
    const slotVal = slots[args.bgSlot];
    if (typeof slotVal === "string" && slotVal.startsWith("data:image/")) {
      return `<img src="${slotVal}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">`;
    }
  }

  // Priority 2: skill-level baked cache (shared across decks).
  const cached = ctx.skill.cachedGradients?.[presetName];
  if (useFal && cached) {
    return `<img src="${cached}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">`;
  }
  // Deterministic id (no Math.random): keeps HTML snapshots/PPTX diffs stable.
  // The blur filter is preset-independent, so same-preset duplicates are harmless.
  const id = "gbg-" + (presetName.replace(/[^a-z0-9]/gi, "").slice(0, 16) || "warm");
  const preset = GRADIENT_PRESETS[presetName] ?? GRADIENT_PRESETS.warm;
  const w = 1920, h = 1080;
  const blobs = preset.blobs
    .map((b, i) => {
      const cx = b.cx * w, cy = b.cy * h, r = b.r * w;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${b.color}" filter="url(#${id}-blur)"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;z-index:0;">
    <defs>
      <filter id="${id}-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="120"/></filter>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="${preset.base}"/>
    ${blobs}
  </svg>`;
}

interface GradientBlob { cx: number; cy: number; r: number; color: string; }
interface GradientPreset { base: string; blobs: GradientBlob[]; }
const GRADIENT_PRESETS: Record<string, GradientPreset> = {
  warm: {
    base: "#FFE4D2",
    blobs: [
      { cx: 0.15, cy: 0.2, r: 0.35, color: "#FF8A5C" },
      { cx: 0.85, cy: 0.3, r: 0.3, color: "#FFB07A" },
      { cx: 0.2, cy: 0.85, r: 0.32, color: "#FF6B6B" },
      { cx: 0.75, cy: 0.78, r: 0.28, color: "#FFCBA0" },
      { cx: 0.5, cy: 0.5, r: 0.18, color: "#FFFDFB" },
    ],
  },
  coral: {
    base: "#FFCBC0",
    blobs: [
      { cx: 0.2, cy: 0.25, r: 0.32, color: "#FF7B7B" },
      { cx: 0.78, cy: 0.2, r: 0.3, color: "#FFA68B" },
      { cx: 0.5, cy: 0.85, r: 0.36, color: "#FFB39C" },
      { cx: 0.85, cy: 0.6, r: 0.22, color: "#FFE0CC" },
    ],
  },
  ember: {
    base: "#1A0E0A",
    blobs: [
      { cx: 0.18, cy: 0.3, r: 0.34, color: "#FF5A2C" },
      { cx: 0.8, cy: 0.22, r: 0.28, color: "#FFA56B" },
      { cx: 0.62, cy: 0.78, r: 0.3, color: "#FF6B3A" },
      { cx: 0.18, cy: 0.85, r: 0.24, color: "#7A2410" },
    ],
  },
  dawn: {
    base: "#FFE0D6",
    blobs: [
      { cx: 0.25, cy: 0.2, r: 0.28, color: "#FFCFA8" },
      { cx: 0.7, cy: 0.18, r: 0.3, color: "#FFB29A" },
      { cx: 0.45, cy: 0.55, r: 0.34, color: "#FF9990" },
      { cx: 0.85, cy: 0.78, r: 0.26, color: "#D6B5E0" },
      { cx: 0.15, cy: 0.82, r: 0.24, color: "#FFCBBC" },
    ],
  },
  // Consulting-blue atmospheres on deep navy — on-brand fallback for mckinsey
  // covers/dividers when no FAL hero image is supplied.
  navy: {
    base: "#051C2C",
    blobs: [
      { cx: 0.78, cy: 0.28, r: 0.32, color: "#16456B" },
      { cx: 0.9, cy: 0.62, r: 0.26, color: "#2B6CB0" },
      { cx: 0.62, cy: 0.5, r: 0.2, color: "#1B3A57" },
      { cx: 0.85, cy: 0.9, r: 0.22, color: "#6FA8DC" },
    ],
  },
  azure: {
    base: "#0A2438",
    blobs: [
      { cx: 0.3, cy: 0.3, r: 0.3, color: "#2B6CB0" },
      { cx: 0.72, cy: 0.25, r: 0.26, color: "#1B4A74" },
      { cx: 0.5, cy: 0.8, r: 0.32, color: "#16456B" },
      { cx: 0.85, cy: 0.6, r: 0.2, color: "#6FA8DC" },
    ],
  },
  // Cold blue-black nocturnal atmosphere — fallback for night-themed bleed
  // decks when no FAL photograph is supplied. A single cold light in deep dark.
  midnight: {
    base: "#08090E",
    blobs: [
      { cx: 0.7, cy: 0.32, r: 0.34, color: "#1A2738" },
      { cx: 0.82, cy: 0.2, r: 0.18, color: "#3D5A72" },
      { cx: 0.4, cy: 0.85, r: 0.3, color: "#11151F" },
      { cx: 0.2, cy: 0.4, r: 0.22, color: "#141A26" },
    ],
  },
  // Deep-blue night-train atmospheres with a warm brass pocket — on-brand
  // fallbacks for nocturnal bleed decks when no FAL photograph is supplied.
  night: {
    base: "#0A0E16",
    blobs: [
      { cx: 0.72, cy: 0.7, r: 0.36, color: "#16213B" },
      { cx: 0.85, cy: 0.82, r: 0.2, color: "#C6A875" },
      { cx: 0.3, cy: 0.3, r: 0.3, color: "#11192A" },
      { cx: 0.55, cy: 0.55, r: 0.18, color: "#1B2A45" },
    ],
  },
  dusk: {
    base: "#0C1018",
    blobs: [
      { cx: 0.25, cy: 0.4, r: 0.34, color: "#1B2A45" },
      { cx: 0.8, cy: 0.3, r: 0.26, color: "#2A3A5C" },
      { cx: 0.6, cy: 0.85, r: 0.28, color: "#10151F" },
      { cx: 0.88, cy: 0.7, r: 0.16, color: "#C6A875" },
    ],
  },
  cabin: {
    base: "#0E0B08",
    blobs: [
      { cx: 0.3, cy: 0.7, r: 0.34, color: "#3A2A18" },
      { cx: 0.78, cy: 0.4, r: 0.24, color: "#C6A875" },
      { cx: 0.2, cy: 0.25, r: 0.22, color: "#171008" },
      { cx: 0.65, cy: 0.8, r: 0.2, color: "#5A3F22" },
    ],
  },
  lounge: {
    base: "#0A0E16",
    blobs: [
      { cx: 0.7, cy: 0.35, r: 0.32, color: "#16213B" },
      { cx: 0.35, cy: 0.7, r: 0.28, color: "#3A2A18" },
      { cx: 0.82, cy: 0.78, r: 0.18, color: "#C6A875" },
      { cx: 0.45, cy: 0.4, r: 0.18, color: "#11192A" },
    ],
  },
};

function renderFallback(node: SlideTreeNode, _ctx: RenderContext): string {
  const safeTypeClass = SLIDE_TYPE_RE.test(node.type) ? node.type : "unknown";
  const slotLines = Object.entries(node.slots)
    .map(
      ([k, v]) =>
        `<div><span class="eyebrow">${escapeHtml(k)}</span><div>${escapeHtml(String(v ?? ""))}</div></div>`,
    )
    .join("\n");
  return `<section class="slide slide-${safeTypeClass}">
  <div class="signal-bar"></div>
  <div style="margin-top:48px; display:flex; flex-direction:column; gap:24px;">
    <h2>${escapeHtml(node.type)}</h2>
    ${slotLines}
  </div>
</section>`;
}
