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

  // Stamp the density tier onto the slide root as data-density. NOTE: this is a
  // HOOK, not a guaranteed cascade — neither baseSlideCss nor tokensToCss define
  // any [data-density] rules or --d-* props, so the attribute does nothing unless
  // a per-skill chrome.css authors [data-density] rules itself. Density is realized
  // by the generator choosing a denser/airier LAYOUT per the deck-plan rhythm; the
  // attribute just lets a skill that wants to also tune spacing off it. (Generated
  // skills that vary density are asked for [data-density] chrome in the generator
  // prompt and warned by validate-skill when missing.)
  if (node.density) html = injectDensityAttr(html, node.density);
  html = injectTypeAttr(html, node.type);
  // Stamp the composition family so the richness gate can apply a per-family
  // floor against the RENDERED deck (additive; only when the grammar declares one).
  const family = ctx.skill.grammar.slideTypes.find((t) => t.name === node.type)?.family;
  if (family) html = injectFamilyAttr(html, family);
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

// Add data-family to the first <section ...> of a rendered slide so the richness
// gate (scripts/measure-occupancy.mts → engine/richness.ts) can read each slide's
// composition family from the DOM and apply its per-family visual floor. Additive.
function injectFamilyAttr(html: string, family: string): string {
  return html.replace(/<section\b([^>]*)>/, (m, attrs) =>
    /\bdata-family=/.test(attrs) ? m : `<section data-family="${family}"${attrs}>`,
  );
}

// Stamp data-visual-event onto a directive's rendered output so the richness gate
// can count REALIZED visual elements in the DOM (not just the skill's capability).
// No-op on empty output and on invisible markers (e.g. the chart-empty comment),
// and idempotent if the element is already stamped.
function stampVisualEvent(html: string, eventType: string): string {
  if (!html || html.startsWith("<!--")) return html;
  const m = html.match(/^\s*<([a-zA-Z][\w-]*)/);
  if (!m) return html;
  const insertAt = m.index! + m[0].length;
  if (/^[^>]*\sdata-visual-event=/.test(html.slice(insertAt))) return html;
  return html.slice(0, insertAt) + ` data-visual-event="${eventType}"` + html.slice(insertAt);
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
      return stampVisualEvent(renderPlaceholderDirective(args, slots), "placeholder");
    },
  );

  // Logo wall: like @placeholder its args are OPTIONAL, so it gets its own
  // pass (the shared directive regex requires an arg string).
  out = out.replace(
    /\{\{\s*@logo-wall(\s+[^{}]*?)?\s*\}\}/g,
    (_match, argString) => {
      const args = argString ? parseDirectiveArgs(argString) : {};
      return stampVisualEvent(renderLogoWallDirective(args, slots), "logo-wall");
    },
  );

  out = out.replace(
    /\{\{\s*@(table|list|chart|gradient-bg|icon|scrim)\s+([^{}]+?)\s*\}\}/g,
    (_match, kind, argString) => {
      const args = parseDirectiveArgs(argString);
      if (kind === "table") return stampVisualEvent(renderTableDirective(args, slots), "table");
      if (kind === "list") return renderListDirective(args, slots);
      if (kind === "chart") return stampVisualEvent(renderChartDirective(args, slots), "chart");
      if (kind === "gradient-bg") return stampVisualEvent(renderGradientBgDirective(args, slots, ctx), "surface");
      if (kind === "icon") return stampVisualEvent(renderIconDirective(args, slots, ctx), "icon");
      if (kind === "scrim") return renderScrimDirective(args, slots);
      return "";
    },
  );

  out = out.replace(/\{\{\s*([\w:-]+)\s*\}\}/g, (_match, key) => {
    if (key.startsWith("image:")) {
      const imgKey = key.slice(6);
      const resolved = ctx.resolvedImages.get(imgKey);
      if (!resolved) return "";
      // safeBgImageSrc (not safeImageUrl) so an inline image may be a big base64
      // data-URI (durable/offline export) as well as a remote https URL — both
      // validated against attribute breakout.
      const safe = safeBgImageSrc(resolved.url);
      if (!safe) return "";
      return `<img src="${escapeHtmlAttr(safe)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    }
    const value = slots[key];
    return typeof value === "string" ? emphasize(escapeHtml(value)) : "";
  });

  return out;
}

// Inline emphasis: **text** inside a slot value becomes <strong>text</strong>.
// Runs AFTER escaping, so the only markup that can emerge is the tag the engine
// itself writes here — slot authors still cannot inject HTML. Skills decide what
// emphasis looks like by styling `.slide strong` in their chrome.css.
function emphasize(escaped: string): string {
  return escaped.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

export function parseDirectiveArgs(s: string): Record<string, string> {
  const args: Record<string, string> = {};
  const re = /([a-zA-Z][\w-]*)=([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1];
    const val = m[2];
    // Color args drop raw into SVG/CSS attributes; reject breakout/CSS payloads
    // so a generated (LLM-authored) template cannot smuggle an injection here.
    // An unsafe color arg is simply omitted, falling back to the chart default.
    if (COLOR_ARG_KEYS.has(key) && !safeColorArg(val)) continue;
    args[key] = val;
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

// Customer/partner logo wall. Real logos are customer assets we never invent;
// this renders the two honest variants:
//   {{@logo-wall names=<slot>}} — the user's OWN customer names (pipe-separated)
//     set as plain type wordmarks in muted ink, weight/tracking varied so the
//     row reads as different brands. Grounded: every name comes from the deck
//     content. No marks — a drawn glyph next to a real company would be a
//     wrong logo.
//   {{@logo-wall}} / {{@logo-wall count=5}} — obviously-dummy placeholder
//     logos: a distinct geometric mark + an Acme-family wordmark per entry.
//     Deliberately unmistakable as placeholders ("swap me"), never plausible
//     real companies.
function renderLogoWallDirective(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const WEIGHTS = [700, 500, 700, 600, 800, 600, 700, 500];
  const TRACKING = ["-0.02em", "0.05em", "0", "-0.01em", "0.08em", "0.01em", "-0.02em", "0.03em"];
  const wordmark = (name: string, i: number, mark: string) =>
    `<span style="display:inline-flex;align-items:center;gap:14px;white-space:nowrap;">` +
    mark +
    `<span style="font-family:var(--font-header);font-size:26px;line-height:1;` +
    `font-weight:${WEIGHTS[i % WEIGHTS.length]};letter-spacing:${TRACKING[i % TRACKING.length]};">` +
    `${escapeHtml(name)}</span></span>`;

  const namesRaw = args.names ? slots[args.names] : undefined;
  const names =
    typeof namesRaw === "string"
      ? namesRaw.split("|").map((s) => s.trim()).filter((s) => s.length > 0)
      : [];

  let items: string[];
  if (names.length > 0) {
    items = names.map((n, i) => wordmark(n, i, ""));
  } else {
    // Distinct abstract marks, drawn in currentColor (the wall sets muted ink).
    const MARKS = [
      `<circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="4"/>`,
      `<rect x="4" y="14" width="6" height="12" fill="currentColor"/><rect x="12" y="8" width="6" height="18" fill="currentColor"/><rect x="20" y="4" width="6" height="22" fill="currentColor"/>`,
      `<rect x="15" y="2" width="18" height="18" transform="rotate(45 15 11)" fill="currentColor"/>`,
      `<path d="M15 4 A11 11 0 0 1 15 26 Z" fill="currentColor"/><path d="M15 4 A11 11 0 0 0 15 26" fill="none" stroke="currentColor" stroke-width="3.5"/>`,
      `<path d="M15 3 L25 9 L25 21 L15 27 L5 21 L5 9 Z" fill="none" stroke="currentColor" stroke-width="4"/>`,
      `<circle cx="15" cy="8" r="4.5" fill="currentColor"/><circle cx="8" cy="21" r="4.5" fill="currentColor"/><circle cx="22" cy="21" r="4.5" fill="currentColor"/>`,
      `<rect x="5" y="5" width="20" height="20" fill="none" stroke="currentColor" stroke-width="4.5"/>`,
      `<path d="M5 25 A20 20 0 0 1 25 5 L25 25 Z" fill="currentColor"/>`,
    ];
    const DUMMIES = ["Acme Corp", "Acme Labs", "Acme Cloud", "Acme Studio", "Acme Group", "Acme Partners", "Acme Systems", "Acme One"];
    const parsed = parseInt(args.count ?? "", 10);
    const count = Math.min(8, Math.max(3, Number.isFinite(parsed) ? parsed : 6));
    items = Array.from({ length: count }, (_, i) =>
      wordmark(
        DUMMIES[i % DUMMIES.length],
        i,
        `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" style="flex:none;">${MARKS[i % MARKS.length]}</svg>`,
      ),
    );
  }

  return (
    `<div class="dir-logo-wall" style="display:flex;align-items:center;justify-content:space-evenly;` +
    `flex-wrap:wrap;gap:44px 40px;width:100%;color:var(--color-muted);">` +
    items.join("") +
    `</div>`
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
  // Item content rides in a span so an item div that a skill styles as
  // display:grid (numbered claims, tracker rows) keeps ONE content cell —
  // otherwise inline <strong> emphasis would split the text into separate
  // anonymous grid items and shred the layout.
  // An item starting with "--" is a SUB-item (second outline level): the
  // prefix is stripped and the div gets class "sub" for the skill to style.
  const inner = items
    .map((it) => {
      const isSub = it.startsWith("--");
      const text = isSub ? it.slice(2).trim() : it;
      return `<div${isSub ? ' class="sub"' : ""}><span>${emphasize(escapeHtml(text))}</span></div>`;
    })
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
        (_, j) => `<td>${emphasize(escapeHtml(row[j] ?? ""))}</td>`,
      );
      return `<tr><th scope="row">${emphasize(escapeHtml(rh))}</th>${cells.join("")}</tr>`;
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

// Validate an inline <img src> for a background slot before it reaches the DOM.
// The trusted path injects a full FAL/baked `data:image;base64,…` (often >100KB,
// so safeImageUrl's 4096-char cap would reject it), but the same slot is
// LLM-authorable when no bgPrompt overwrites it, so the value still crosses a
// trust boundary. A bare `.startsWith("data:image/")` check let
// `data:image/png,"><img src=x onerror=…>` break out of the src attribute.
// Accept ONLY: an https URL with no breakout chars, OR a base64 data:image whose
// payload is strictly the base64 alphabet (quotes/brackets cannot survive).
export function safeBgImageSrc(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length === 0 || s.length > 8_000_000) return null;
  if (/^https:\/\//i.test(s)) return hasUnsafeChars(s) ? null : s;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) return s;
  return null;
}

// Color args (accent/ink/fill/base/…) interpolate raw into SVG/CSS attributes.
// In hand-authored skill templates this is trusted, but GENERATED skill
// templates are LLM output, so reject any value that could break out of the
// attribute or smuggle a CSS payload. Keeps hex, named colors, var(--…),
// rgb()/hsl(), and slot-name tokens; drops anything with quotes/brackets/url().
const COLOR_ARG_KEYS = new Set([
  "accent", "ink", "color", "fill", "base", "low", "high", "muted", "neg", "stroke",
]);
function safeColorArg(v: string): boolean {
  if (v.length > 64) return false;
  if (/[<>"'`;]/.test(v)) return false;
  if (/url\(|expression\(|\/\*|@import|javascript:/i.test(v)) return false;
  return true;
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
  // Degenerate-data guard for series charts: parseNums is maximally tolerant, so
  // `data="40 garbage 80"` silently became a 2-bar chart and `data="40"` a 1-bar
  // chart — both were credited as a realized chart by the richness gate. A
  // 1-point series is not a chart, and a chart built from FEWER numbers than the
  // author wrote is silently wrong. Emit a (distinct) empty marker so the gate fails.
  const SERIES_TYPES = new Set(["bar", "hbar", "line", "waterfall", "stacked-bar"]);
  const ctype = (args.type || "").toLowerCase();
  if (args.data && SERIES_TYPES.has(ctype)) {
    const rawData = slots[args.data] ?? "";
    const rawTokens = rawData.split(/[\s,|]+/).map((t) => t.trim()).filter((t) => t.length > 0);
    const nums = parseNums(rawData);
    const safeType = ctype.replace(/[^a-z0-9-]/g, "");
    if (nums.length < 2) return `<!--chart-empty:degenerate-${safeType}-->`;
    if (nums.length < rawTokens.length) return `<!--chart-empty:dropped-tokens-${safeType}-->`;
    // Axis labels must match the series length. The canonical {{@chart}} gotcha
    // is comma-separated labels in a pipe-delimited slot (Clinic: 3 bars, the two
    // labels comma-joined into one) so most bars render unlabelled — unreadable.
    if (args.labels) {
      const labelCount = parseLabels(slots[args.labels] ?? "").length;
      if (labelCount > 0 && labelCount !== nums.length) {
        return `<!--chart-empty:label-mismatch-${safeType}-->`;
      }
    }
  }

  const out = dispatchChart(args, slots);
  if (out === "") {
    // A chart was requested but produced nothing: bad/empty data slot, or an
    // unknown type. Emit an INVISIBLE marker (renders to nothing) so a blank
    // chart cannot ship silently — render-fixture and the occupancy gate scan
    // for it and fail. This is the signal the engine never gave before.
    const t = (args.type || "none").replace(/[^a-z0-9-]/gi, "").slice(0, 24);
    return `<!--chart-empty:${t}-->`;
  }
  return out;
}

function dispatchChart(
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
  if (type === "stacked-cols") return renderStackedCols(args, slots);
  if (type === "stacked-area") return renderStackedArea(args, slots);
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
    const n = (lerp(low[0], high[0], t) << 16) | (lerp(low[1], high[1], t) << 8) | lerp(low[2], high[2], t);
    return `#${n.toString(16).padStart(6, "0")}`;
  };

  const headRow =
    `<div></div>` +
    colHeaders
      .map(
        (c) =>
          `<div style="font-family:var(--font-data);font-size:11px;line-height:1.15;color:${ink};text-align:center;padding:0 2px 6px;align-self:end;">${escapeHtml(c)}</div>`,
      )
      .join("");

  // values=1 prints the value INSIDE each cell (the reference matrix carries
  // a number in every cell, the ramp only encodes it a second time)
  const showValues = args.values === "1";
  const bodyRows = rowHeaders
    .map((rh, i) => {
      const vals = cellRows[i] ?? [];
      const head = `<div style="font-family:var(--font-body);font-size:12px;color:${ink};white-space:nowrap;padding-right:10px;align-self:center;text-align:right;">${escapeHtml(rh)}</div>`;
      const cells = colHeaders
        .map((_, j) => {
          const fill = cellColor(vals[j]);
          const inner = showValues && Number.isFinite(vals[j])
            ? `<span style="font-family:var(--font-data);font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:${readableOn(fill)};">${escapeHtml(String(vals[j]))}</span>`
            : "";
          return `<div style="min-height:${cellH}px;background:${fill};border:1px solid #fff;display:flex;align-items:center;justify-content:center;">${inner}</div>`;
        })
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
    // Accept comma, whitespace AND pipe as separators. labels use pipe
    // (parseLabels), so a chart's data slot was easy to write pipe-separated
    // too; that silently parsed to NaN and the chart vanished. Tolerate all
    // three so the same directive can't be split-by-the-wrong-delimiter.
    .split(/[\s,|]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
}

// Max number of fractional digits across the source tokens, so a value like
// "6.10" renders as "6.10" not "6.1" (JS drops the trailing zero on parse).
export function maxDecimals(s: string): number {
  let max = 0;
  // Use the SAME delimiter set as parseNums (whitespace, comma AND pipe). A
  // pipe-separated data slot like "1.25|2.50|3.75" parses fine but, split here
  // on whitespace/comma only, yielded dec=0 and rounded labels to 1/3/4.
  for (const tok of s.split(/[\s,|]+/)) {
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

// Resolve a bar `highlight` arg to a 0-based index. Accept EITHER a numeric
// index OR a label string (matched case-insensitively against `labels`).
// The index-only contract was an invisible footgun: passing the label (the
// obvious guess) yielded NaN and highlighted nothing, silently. Returns -1
// when the arg is absent or matches no label.
function resolveHighlight(
  arg: string | undefined,
  slots: Record<string, string>,
  labels: string[],
): number {
  const raw = (resolveSlotOrLiteral(arg, slots) || "").trim();
  if (!raw) return -1;
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) return asNum;
  return labels.findIndex((l) => l.toLowerCase() === raw.toLowerCase());
}

// "Nice" y-axis ticks spanning the data domain (reference decks carry a full
// tick scale on every chart — 6 to 18 labels). Returns ticks from
// floor(min/step) to ceil(max/step) at a 1/2/2.5/5 step.
function niceTicks(min: number, max: number, target = 6): number[] {
  const span = max - min || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step * 1e-9; t += step) ticks.push(Math.round(t * 1e9) / 1e9);
  return ticks;
}

function tickFormat(ticks: number[], unit: string): string[] {
  const dec = ticks.reduce((d, t) => {
    const s = String(t);
    const i = s.indexOf(".");
    return Math.max(d, i >= 0 ? s.length - i - 1 : 0);
  }, 0);
  return ticks.map((t) => formatNum(t, unit, false, dec));
}

function resolveSlotOrLiteral(
  value: string | undefined,
  slots: Record<string, string>,
): string {
  if (!value) return "";
  if (Object.prototype.hasOwnProperty.call(slots, value)) return slots[value];
  // A kebab-case token that is NOT an authored slot reads as a dangling slot
  // reference (e.g. unit=chart-unit with no chart-unit in the tree) — resolve
  // to empty instead of leaking the slot name into rendered chart text. True
  // literals at these call sites (navy, Lora, auto, %, #2B6CB0, 5) never carry
  // an interior hyphen; directive-routing args (type=, variant=, slot=) are
  // read directly and never pass through here.
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(value)) return "";
  return value;
}

function renderBarChart(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const data = parseNums(slots[args.data] ?? "");
  const labels = parseLabels(slots[args.labels] ?? "");
  const highlight = resolveHighlight(args.highlight, slots, labels);
  if (data.length === 0) return "";
  // Secondary values strip (a second measure per period under the axis, the
  // USPS-RHB device): stripData=<slot> numbers + stripLabel=<slot> row label.
  const stripVals = args.stripData ? parseNums(slots[args.stripData] ?? "") : [];
  const hasStrip = stripVals.length > 0;
  // Reference-grade chart furniture (each opt-in per template): fontScale=
  // scales all type (multi-up panels render the same viewBox smaller),
  // height= overrides the viewBox height, yAxis=1 draws a full tick scale,
  // refLine/refLabel a dashed reference line with a right-edge marker,
  // divider/dividerLabels an actual/forecast split.
  const fScale = Math.min(2, Math.max(0.8, Number(args.fontScale ?? "1") || 1));
  const F = (n: number) => Math.round(n * fScale * 2) / 2;
  const hOverride = Number(args.height ?? "");
  const hBase = Number.isFinite(hOverride) && hOverride >= 360 && hOverride <= 760 ? hOverride : 440;
  // Fill-encodes time direction (opt-in): bars at index >= outlineFrom (or
  // < outlineTo) render as outlines — forecast vs actual, prior vs current.
  const outlineFromRaw = args.outlineFrom ? resolveSlotOrLiteral(args.outlineFrom, slots).trim() : "";
  const outlineFrom = outlineFromRaw ? Number(outlineFromRaw) : NaN;
  const outlineToRaw = args.outlineTo ? resolveSlotOrLiteral(args.outlineTo, slots).trim() : "";
  const outlineTo = outlineToRaw ? Number(outlineToRaw) : NaN;
  // growthCallout="i:j" draws a dotted leader lane between two bar tops and
  // announces the delta as the biggest type on the chart; growthLabel=<slot>
  // overrides the computed percentage.
  const gcRaw = args.growthCallout ? resolveSlotOrLiteral(args.growthCallout, slots).trim() : "";
  const gcMatch = /^(\d+)\s*:\s*(\d+)$/.exec(gcRaw);
  const gcPad = gcMatch ? 64 : 0;
  const w = 920, h = hBase + (hasStrip ? 28 : 0) + gcPad;
  const refRaw = args.refLine ? resolveSlotOrLiteral(args.refLine, slots).trim() : "";
  const refVal = refRaw ? Number(refRaw) : NaN;
  let max = Math.max(...data, 0);
  let min = Math.min(...data, 0);
  if (Number.isFinite(refVal)) {
    max = Math.max(max, refVal);
    min = Math.min(min, refVal);
  }
  const hasAxis = args.yAxis === "1";
  // the reference scale is DENSE (USPS: up to 17 ticks); multi-up panels with
  // scaled-up type get a coarser scale so labels never collide
  const ticks = hasAxis ? niceTicks(min, max, fScale >= 1.5 ? 6 : 10) : [];
  if (ticks.length >= 2) {
    min = Math.min(min, ticks[0]);
    max = Math.max(max, ticks[ticks.length - 1]);
  }
  const range = max - min || 1;

  const accent = args.accent ?? "#FF6A13";
  const base = args.base ?? "#1F3A5F";
  const muted = args.muted ?? "#B8C0CC";
  const ink = args.ink ?? base;

  const unit = resolveSlotOrLiteral(args.unit, slots);
  const dec = maxDecimals(slots[args.data] ?? "");
  const tickStrs = tickFormat(ticks, unit);
  const padL = hasAxis
    ? Math.max(56, 16 + Math.max(0, ...tickStrs.map((s) => s.length)) * F(13) * 0.66)
    : 56;
  const padR = 16, padT = 48 + gcPad, padB = 104 + (hasStrip ? 28 : 0);
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barW = (chartW / data.length) * 0.62;
  const gap = (chartW / data.length) * 0.38;
  const zeroY = padT + chartH * (max / range);
  // Dense year-series stay readable: value type steps down with bar count;
  // the reference labels EVERY period up to ~16, only longer series thin out.
  const valueFs = F(data.length <= 8 ? 22 : data.length <= 14 ? 18 : 15);
  const labelStep = Math.ceil(data.length / 16);
  const labelFs = F(data.length <= 14 ? 17 : 15);

  let axisSvg = "";
  if (hasAxis) {
    ticks.forEach((t, i) => {
      const ty = padT + ((max - t) / range) * chartH;
      if (Math.abs(t) > 1e-9) {
        axisSvg += `<line x1="${padL}" x2="${w - padR}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${muted}" stroke-width="0.5" stroke-dasharray="2 4"/>`;
      }
      axisSvg += `<text x="${(padL - 10).toFixed(1)}" y="${(ty + F(13) * 0.35).toFixed(1)}" text-anchor="end" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(13)}" fill="${ink}">${escapeHtml(tickStrs[i])}</text>`;
    });
  }
  let dividerSvg = "";
  const divRaw = args.divider ? resolveSlotOrLiteral(args.divider, slots).trim() : "";
  const divIdx = divRaw ? Number(divRaw) : NaN;
  if (Number.isFinite(divIdx) && divIdx > 0 && divIdx < data.length) {
    const dx = padL + divIdx * (barW + gap);
    dividerSvg += `<line x1="${dx.toFixed(1)}" x2="${dx.toFixed(1)}" y1="22" y2="${(padT + chartH).toFixed(1)}" stroke="${ink}" stroke-width="1" stroke-dasharray="4 5"/>`;
    const dlRaw = args.dividerLabels ? resolveSlotOrLiteral(args.dividerLabels, slots) : "";
    const dl = dlRaw.split("|").map((s) => s.trim());
    if (dl[0]) dividerSvg += `<text x="${(dx - 10).toFixed(1)}" y="16" text-anchor="end" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(12.5)}" fill="${ink}" font-weight="700">${escapeHtml(dl[0])}</text>`;
    if (dl[1]) dividerSvg += `<text x="${(dx + 10).toFixed(1)}" y="16" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(12.5)}" fill="${ink}" fill-opacity="0.55" font-weight="700">${escapeHtml(dl[1])}</text>`;
  }
  let refSvg = "";
  if (Number.isFinite(refVal)) {
    const ry = padT + ((max - refVal) / range) * chartH;
    refSvg += `<line x1="${padL}" x2="${w - padR}" y1="${ry.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="${ink}" stroke-width="1.5" stroke-dasharray="7 5"/>`;
    refSvg += `<polygon points="${(w - padR + 2).toFixed(1)},${ry.toFixed(1)} ${(w - padR + 12).toFixed(1)},${(ry - 5).toFixed(1)} ${(w - padR + 12).toFixed(1)},${(ry + 5).toFixed(1)}" fill="${ink}"/>`;
    const refValText = formatNum(refVal, unit, false, dec);
    refSvg += `<text x="${(w - padR - 8).toFixed(1)}" y="${(ry - 9).toFixed(1)}" text-anchor="end" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(14)}" fill="${ink}" font-weight="700">${escapeHtml(refValText)}</text>`;
    const refLabel = args.refLabel ? resolveSlotOrLiteral(args.refLabel, slots) : "";
    if (refLabel) {
      // same line, left of the value — below the rule it collides with the
      // x labels when the threshold runs near the chart floor
      const labelX = w - padR - 8 - refValText.length * F(14) * 0.66 - 12;
      refSvg += `<text x="${labelX.toFixed(1)}" y="${(ry - 9).toFixed(1)}" text-anchor="end" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(12.5)}" fill="${ink}" fill-opacity="0.55">${escapeHtml(refLabel)}</text>`;
    }
  }
  let bars = "";
  data.forEach((v, i) => {
    const x = padL + gap / 2 + i * (barW + gap);
    const barH = (Math.abs(v) / range) * chartH;
    const y = v >= 0 ? zeroY - barH : zeroY;
    const fill = i === highlight ? accent : base;
    const isOutline =
      (Number.isFinite(outlineFrom) && i >= outlineFrom) ||
      (Number.isFinite(outlineTo) && i < outlineTo);
    if (isOutline) {
      bars += `<rect x="${(x + 1).toFixed(1)}" y="${(y + 1).toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${Math.max(barH - 2, 1).toFixed(1)}" fill="none" stroke="${fill}" stroke-width="2"/>`;
    } else {
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}"/>`;
    }
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 10).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${valueFs}" fill="${ink}" text-anchor="middle" font-weight="700">${escapeHtml(formatNum(v, unit, false, dec))}</text>`;
    if (labels[i] && (i % labelStep === 0 || i === data.length - 1)) {
      bars += renderWrappedLabel(labels[i], x + barW / 2, padT + chartH + 28, (barW + gap * 0.85) * labelStep, muted, labelFs);
    }
  });
  let growthSvg = "";
  if (gcMatch) {
    const gi = Math.min(Number(gcMatch[1]), data.length - 1);
    const gj = Math.min(Number(gcMatch[2]), data.length - 1);
    const topY = (idx: number) => {
      const v = data[idx];
      const barH = (Math.abs(v) / range) * chartH;
      return v >= 0 ? zeroY - barH : zeroY;
    };
    const xi = padL + gap / 2 + gi * (barW + gap) + barW / 2;
    const xj = padL + gap / 2 + gj * (barW + gap) + barW / 2;
    const yi = topY(gi) - valueFs - 18;
    const yj = topY(gj) - valueFs - 18;
    const laneY = Math.min(yi, yj) - 26;
    growthSvg += `<polyline points="${xi.toFixed(1)},${yi.toFixed(1)} ${xi.toFixed(1)},${laneY.toFixed(1)} ${xj.toFixed(1)},${laneY.toFixed(1)} ${xj.toFixed(1)},${yj.toFixed(1)}" fill="none" stroke="${ink}" stroke-width="1" stroke-dasharray="2 5"/>`;
    const gLabel = args.growthLabel ? resolveSlotOrLiteral(args.growthLabel, slots) : "";
    const a = data[gi], b = data[gj];
    const text =
      gLabel ||
      (a !== 0 ? `${b >= a ? "+" : ""}${Math.round(((b - a) / Math.abs(a)) * 100)}%` : "");
    if (text) {
      growthSvg += `<text x="${((xi + xj) / 2).toFixed(1)}" y="${(laneY - 12).toFixed(1)}" text-anchor="middle" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(38)}" fill="${accent}" font-weight="600" letter-spacing="-0.01em">${escapeHtml(text)}</text>`;
    }
  }

  // zero baseline carries the chart — strong, not a hairline
  const axis = `<line x1="${padL}" x2="${w - padR}" y1="${zeroY}" y2="${zeroY}" stroke="${ink}" stroke-width="2"/>`;
  let strip = "";
  if (hasStrip) {
    // own block under the category labels: small label line, hairline, values
    const labelY = padT + chartH + 56;
    const stripY = padT + chartH + 82;
    const stripLabel = args.stripLabel ? (slots[args.stripLabel] ?? "") : "";
    const stripDec = maxDecimals(slots[args.stripData!] ?? "");
    if (stripLabel) {
      strip += `<text x="${padL}" y="${labelY}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(13)}" fill="${muted}" font-weight="600">${escapeHtml(stripLabel)}</text>`;
    }
    strip += `<line x1="${padL}" x2="${w - padR}" y1="${labelY + 6}" y2="${labelY + 6}" stroke="${muted}" stroke-width="0.5"/>`;
    stripVals.forEach((v, i) => {
      const x = padL + gap / 2 + i * (barW + gap) + barW / 2;
      strip += `<text x="${x.toFixed(1)}" y="${stripY}" text-anchor="middle" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(data.length <= 14 ? 14 : 13)}" fill="${ink}" font-weight="600">${escapeHtml(formatNum(v, "", false, stripDec))}</text>`;
    });
  }
  const note = renderChartNote(args, slots, w - padR, 24, accent);

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${axisSvg}${dividerSvg}${axis}${bars}${growthSvg}${refSvg}${strip}${note}</svg>`;
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
  const highlight = resolveHighlight(args.highlight, slots, labels);
  const w = 920;
  // long rankings tighten the row pitch so 8-14 rows stay inside the exhibit
  const rowH = data.length <= 8 ? 52 : data.length <= 12 ? 44 : 38;
  const h = data.length * rowH + 32;
  const padL = 260, padR = 100, padT = 8;
  const chartW = w - padL - padR;
  // Scale by the largest MAGNITUDE so a series with negative or all-negative
  // values (deltas, declines, losses) renders valid widths. The old
  // `Math.max(...data, 0)` produced max=0 for all-negative data → barW=-Infinity
  // and malformed SVG that no gate caught. maxAbs<=0 (all zeros) is an empty chart.
  const maxAbs = Math.max(...data.map((v) => Math.abs(v)), 0);
  if (maxAbs <= 0) return "";
  const accent = args.accent ?? "#FF6A13";
  const base = args.base ?? "#1F3A5F";
  const muted = args.muted ?? "#B8C0CC";
  const ink = args.ink ?? base;

  let rows = "";
  data.forEach((v, i) => {
    const y = padT + i * rowH;
    const barW = (Math.abs(v) / maxAbs) * chartW;
    const fill = v < 0 ? (args.neg ?? muted) : i === highlight ? accent : base;
    if (labels[i]) {
      rows += `<text x="${padL - 18}" y="${(y + rowH / 2 + 6).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="18" fill="${ink}" text-anchor="end">${escapeHtml(labels[i])}</text>`;
    }
    rows += `<rect x="${padL}" y="${(y + 10).toFixed(1)}" width="${barW.toFixed(1)}" height="${(rowH - 20).toFixed(1)}" fill="${fill}"/>`;
    rows += `<text x="${(padL + barW + 10).toFixed(1)}" y="${(y + rowH / 2 + 6).toFixed(1)}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="17" fill="${ink}" font-weight="600">${escapeHtml(formatNum(v, resolveSlotOrLiteral(args.unit, slots), false, dec))}</text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${rows}</svg>`;
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
  const muted = args.muted ?? "#B8C0CC";
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
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${baseline}${bars}${note}</svg>`;
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
  // Inline series labels (the reference style): primaryNote/compareNote put
  // the series name + growth note ON the trace ("Cost  +1.5% p.a.") and
  // replace the detached legend.
  const primaryNote = args.primaryNote ? resolveSlotOrLiteral(args.primaryNote, slots) : "";
  const compareNote = args.compareNote ? resolveSlotOrLiteral(args.compareNote, slots) : "";
  const inline = args.inline === "1" || !!primaryNote || !!compareNote;
  const fScale = Math.min(2, Math.max(0.8, Number(args.fontScale ?? "1") || 1));
  const F = (n: number) => Math.round(n * fScale * 2) / 2;

  // Annotation callouts: callouts=<slot>, value "idx:text|idx:text" (idx is a
  // 0-based data index). Each becomes a white box with a leader line pointing
  // at its data point — causes explained ON the chart. Boxes stack in lanes
  // above the plot area, which grows downward to make room.
  const calloutItems: { idx: number; text: string }[] = [];
  if (args.callouts) {
    for (const part of (slots[args.callouts] ?? "").split("|")) {
      const m = /^(\d+)\s*:\s*(.+)$/.exec(part.trim());
      if (!m) continue;
      const idx = Number(m[1]);
      if (idx >= 0 && idx < data.length) calloutItems.push({ idx, text: m[2].trim() });
    }
  }
  const calloutBoxH = 34, calloutGap = 10;
  const calloutBase = hasCompare && !inline ? 48 : 12;
  const calloutZone = calloutItems.length
    ? calloutBase + calloutItems.length * (calloutBoxH + calloutGap) + 8
    : 0;

  // Secondary values strip under the axis (same device as the bar chart):
  // stripData=<slot> numbers per period + stripLabel=<slot> row label.
  const stripVals = args.stripData ? parseNums(slots[args.stripData] ?? "") : [];
  const hasStrip = stripVals.length > 0;

  const hOverride = Number(args.height ?? "");
  const hBase = Number.isFinite(hOverride) && hOverride >= 360 && hOverride <= 760 ? hOverride : 420;
  const w = 920;
  const refRaw = args.refLine ? resolveSlotOrLiteral(args.refLine, slots).trim() : "";
  const refVal = refRaw ? Number(refRaw) : NaN;
  // fill=solid: saturated area under the trace (the reference look for a
  // single amount-series); the domain then includes 0 so the area is honest
  const fillSolid = args.fill === "solid";
  const allVals = hasCompare ? [...data, ...compareData] : [...data];
  if (Number.isFinite(refVal)) allVals.push(refVal);
  if (fillSolid) allVals.push(0);
  let max = Math.max(...allVals);
  let min = Math.min(...allVals);
  const hasAxis = args.yAxis === "1";
  // dense reference scale on full-width charts, coarser in multi-up panels
  const ticks = hasAxis ? niceTicks(min, max, fScale >= 1.5 ? 6 : 10) : [];
  if (ticks.length >= 2) {
    min = Math.min(min, ticks[0]);
    max = Math.max(max, ticks[ticks.length - 1]);
  }
  const range = max - min || 1;
  const unitStr = resolveSlotOrLiteral(args.unit, slots);
  const tickStrs = tickFormat(ticks, unitStr);
  const padL = hasAxis
    ? Math.max(64, 16 + Math.max(0, ...tickStrs.map((s) => s.length)) * F(13) * 0.66)
    : 64;
  const padTBase = hasCompare && !inline ? 92 : 36;
  const padR = 48, padT = Math.max(padTBase, calloutZone), padT0 = hasCompare && !inline ? 28 : 36;
  const padB = 68 + (hasStrip ? 32 : 0);
  // callout lanes may not crush the plot: the viewBox grows by whatever the
  // callout zone adds on top, keeping the plot area constant
  const h = hBase + (hasStrip ? 32 : 0) + Math.max(0, padT - padTBase);
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const step = chartW / (data.length - 1);
  const compareStep = hasCompare ? chartW / (compareData.length - 1) : 0;

  const accent = args.accent ?? "#FF6A13";
  const base = args.base ?? "#1F3A5F";
  const muted = args.muted ?? "#B8C0CC";
  const ink = args.ink ?? base;

  const points = data.map((v, i) => {
    const x = padL + i * step;
    const y = padT + ((max - v) / range) * chartH;
    return { x, y };
  });
  const path = "M " + points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ");
  const fillPath = path + ` L ${padL + chartW} ${padT + chartH} L ${padL} ${padT + chartH} Z`;
  let svg = `<defs><linearGradient id="lc-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${base}" stop-opacity="0.22"/><stop offset="100%" stop-color="${base}" stop-opacity="0"/></linearGradient></defs>`;
  svg += fillSolid
    ? `<path d="${fillPath}" fill="${base}" fill-opacity="0.9"/>`
    : `<path d="${fillPath}" fill="url(#lc-grad)"/>`;
  // gridlines first, so the line draws over them; with yAxis=1 the grid sits
  // on the ticks and every tick carries its value (the reference scale)
  if (hasAxis) {
    ticks.forEach((t, i) => {
      const gy = padT + ((max - t) / range) * chartH;
      svg += `<line x1="${padL}" x2="${w - padR}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${muted}" stroke-width="0.5" stroke-dasharray="2 4"/>`;
      svg += `<text x="${(padL - 10).toFixed(1)}" y="${(gy + F(13) * 0.35).toFixed(1)}" text-anchor="end" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(13)}" fill="${ink}">${escapeHtml(tickStrs[i])}</text>`;
    });
  } else {
    for (let g = 0; g <= 4; g++) {
      const gy = padT + (g / 4) * chartH;
      svg += `<line x1="${padL}" x2="${w - padR}" y1="${gy}" y2="${gy}" stroke="${muted}" stroke-width="0.5" stroke-dasharray="2 4"/>`;
    }
  }
  // actual/forecast divider: dashed vertical at a data index, zone labels
  const divRaw = args.divider ? resolveSlotOrLiteral(args.divider, slots).trim() : "";
  const divIdx = divRaw ? Number(divRaw) : NaN;
  if (Number.isFinite(divIdx) && divIdx > 0 && divIdx < data.length) {
    const dx = padL + divIdx * step;
    // with callouts the top zone is taken (boxes + endpoint values) — zone
    // labels drop to the plot floor instead; over a solid fill they invert
    const labelY = calloutItems.length ? padT + chartH - 12 : padT - 10;
    const onFill = fillSolid && calloutItems.length > 0;
    const dlFill = onFill ? "#FFFFFF" : ink;
    svg += `<line x1="${dx.toFixed(1)}" x2="${dx.toFixed(1)}" y1="${(calloutItems.length ? padT : padT - 22).toFixed(1)}" y2="${(padT + chartH).toFixed(1)}" stroke="${ink}" stroke-width="1" stroke-dasharray="4 5"/>`;
    const dlRaw = args.dividerLabels ? resolveSlotOrLiteral(args.dividerLabels, slots) : "";
    const dl = dlRaw.split("|").map((s) => s.trim());
    if (dl[0]) svg += `<text x="${(dx - 10).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="end" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(12.5)}" fill="${dlFill}" font-weight="700">${escapeHtml(dl[0])}</text>`;
    if (dl[1]) svg += `<text x="${(dx + 10).toFixed(1)}" y="${labelY.toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(12.5)}" fill="${dlFill}" fill-opacity="0.7" font-weight="700">${escapeHtml(dl[1])}</text>`;
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
    svg += `<text x="${(last.x - 12).toFixed(1)}" y="${cmpLabelY.toFixed(1)}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(14)}" fill="${muted}" text-anchor="end" font-weight="600">${escapeHtml(formatNum(lastV, resolveSlotOrLiteral(args.unit, slots), false, dec))}</text>`;
    // inline compare label sits below the dashed trace in the flatter early
    // run (mid-run it strikes through steep segments when the traces overlap)
    if (inline && compareLabel) {
      const ci = Math.round((cmpPoints.length - 1) * 0.32);
      const cp = cmpPoints[ci];
      svg += `<text x="${cp.x.toFixed(1)}" y="${(cp.y + 28).toFixed(1)}" text-anchor="middle" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(15)}" fill="${ink}" fill-opacity="0.62" font-weight="700">${escapeHtml(compareLabel)}${compareNote ? `<tspan dx="10" font-weight="600" font-size="${F(13.5)}">${escapeHtml(compareNote)}</tspan>` : ""}</text>`;
    }
  }
  svg += `<path d="${path}" fill="none" stroke="${base}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  // inline primary label rides above the trace mid-run (the end zone belongs
  // to the endpoint values); over a solid fill it clears the local maximum of
  // the surrounding points so it never sinks into the area
  if (inline && primaryLabel) {
    const pi = Math.round((points.length - 1) * 0.55);
    const pp = points[pi];
    let labelY = pp.y - 16;
    if (fillSolid) {
      const lo = Math.max(0, pi - 2), hi = Math.min(points.length - 1, pi + 2);
      labelY = Math.min(...points.slice(lo, hi + 1).map((q) => q.y)) - 16;
    }
    svg += `<text x="${pp.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(15.5)}" fill="${base}" font-weight="700">${escapeHtml(primaryLabel)}${primaryNote ? `<tspan dx="10" font-weight="600" font-size="${F(13.5)}" fill="${ink}">${escapeHtml(primaryNote)}</tspan>` : ""}</text>`;
  }
  // reference line with right-edge marker ("◀ 15"), the statutory-cap device
  if (Number.isFinite(refVal)) {
    const ry = padT + ((max - refVal) / range) * chartH;
    svg += `<line x1="${padL}" x2="${w - padR}" y1="${ry.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="${ink}" stroke-width="1.5" stroke-dasharray="7 5"/>`;
    svg += `<polygon points="${(w - padR + 4).toFixed(1)},${ry.toFixed(1)} ${(w - padR + 14).toFixed(1)},${(ry - 5).toFixed(1)} ${(w - padR + 14).toFixed(1)},${(ry + 5).toFixed(1)}" fill="${ink}"/>`;
    const refValText = formatNum(refVal, unitStr, false, dec);
    svg += `<text x="${(w - padR - 8).toFixed(1)}" y="${(ry - 9).toFixed(1)}" text-anchor="end" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(14)}" fill="${ink}" font-weight="700">${escapeHtml(refValText)}</text>`;
    const refLabel = args.refLabel ? resolveSlotOrLiteral(args.refLabel, slots) : "";
    if (refLabel) {
      // label sits on the same line, left of the value — below the rule it
      // would collide with the x labels when the threshold runs near the floor
      const labelX = w - padR - 8 - refValText.length * F(14) * 0.66 - 12;
      svg += `<text x="${labelX.toFixed(1)}" y="${(ry - 9).toFixed(1)}" text-anchor="end" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(12.5)}" fill="${ink}" fill-opacity="0.55">${escapeHtml(refLabel)}</text>`;
    }
  }
  // dots: first, last, peak; the reference labels EVERY period up to ~16
  const labelStep = Math.ceil(data.length / 16);
  const dataMax = Math.max(...data);
  points.forEach((p, i) => {
    const isPeak = data[i] === dataMax;
    if (i === 0 || i === points.length - 1 || isPeak) {
      const dotFill = isPeak ? accent : base;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isPeak ? 7 : 5}" fill="${dotFill}"/>`;
      // with a tick scale, a first point sitting exactly on a tick would print
      // the same number twice (axis label + value) — the axis carries it
      const dupesTick = hasAxis && i === 0 && ticks.includes(data[i]);
      if (!dupesTick) {
        // the first point sits ON the axis — its value anchors to the right of
        // the dot so it never overprints a tick label
        const firstOnAxis = hasAxis && i === 0;
        svg += `<text x="${(firstOnAxis ? p.x + 8 : p.x).toFixed(1)}" y="${(p.y - 14).toFixed(1)}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(16)}" fill="${ink}" text-anchor="${firstOnAxis ? "start" : "middle"}" font-weight="700">${escapeHtml(formatNum(data[i], resolveSlotOrLiteral(args.unit, slots), false, dec))}</text>`;
      }
    }
    if (labels[i] && (i % labelStep === 0 || i === data.length - 1)) {
      svg += `<text x="${p.x.toFixed(1)}" y="${(padT + chartH + 28).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(15)}" fill="${muted}" text-anchor="middle">${escapeHtml(labels[i])}</text>`;
    }
  });
  if (hasStrip) {
    const labelY = padT + chartH + 54;
    const stripY = padT + chartH + 80;
    const stripLabel = args.stripLabel ? (slots[args.stripLabel] ?? "") : "";
    const stripDec = maxDecimals(slots[args.stripData!] ?? "");
    if (stripLabel) {
      svg += `<text x="${padL}" y="${labelY}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${F(13)}" fill="${muted}" font-weight="600">${escapeHtml(stripLabel)}</text>`;
    }
    svg += `<line x1="${padL}" x2="${w - padR}" y1="${labelY + 6}" y2="${labelY + 6}" stroke="${muted}" stroke-width="0.5"/>`;
    stripVals.forEach((v, i) => {
      if (i % labelStep !== 0 && i !== stripVals.length - 1) return;
      const x = padL + i * step;
      svg += `<text x="${x.toFixed(1)}" y="${stripY}" text-anchor="middle" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="${F(14)}" fill="${ink}" font-weight="600">${escapeHtml(formatNum(v, "", false, stripDec))}</text>`;
    });
  }
  // legend at top when we have two traces (inline labels replace it)
  if (hasCompare && !inline) {
    const lx = padL;
    const ly = padT0;
    svg += `<line x1="${lx}" x2="${lx + 24}" y1="${ly}" y2="${ly}" stroke="${base}" stroke-width="3"/>`;
    svg += `<text x="${lx + 32}" y="${(ly + 5).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="13" fill="${ink}" font-weight="600">${escapeHtml(primaryLabel || "Actual")}</text>`;
    const lx2 = lx + 180;
    svg += `<line x1="${lx2}" x2="${lx2 + 24}" y1="${ly}" y2="${ly}" stroke="${muted}" stroke-width="2" stroke-dasharray="6 6"/>`;
    svg += `<text x="${lx2 + 32}" y="${(ly + 5).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="13" fill="${muted}" font-weight="500">${escapeHtml(compareLabel || "Benchmark")}</text>`;
  }
  svg += renderChartNote(args, slots, w - padR, padT0 + 5, accent);
  // callout boxes draw last so they sit above gridlines and traces
  calloutItems.forEach((c, lane) => {
    const p = points[c.idx];
    const fs = F(14);
    const bw = Math.min(360, Math.max(80, c.text.length * fs * 0.56)) + 24;
    const bx = Math.max(8, Math.min(w - 8 - bw, p.x - bw / 2));
    const by = calloutBase + lane * (calloutBoxH + calloutGap);
    const anchorX = Math.max(bx + 10, Math.min(bx + bw - 10, p.x));
    svg += `<line x1="${anchorX.toFixed(1)}" y1="${by + calloutBoxH}" x2="${p.x.toFixed(1)}" y2="${(p.y - 9).toFixed(1)}" stroke="${ink}" stroke-width="1"/>`;
    svg += `<polygon points="${(p.x - 4).toFixed(1)},${(p.y - 10).toFixed(1)} ${(p.x + 4).toFixed(1)},${(p.y - 10).toFixed(1)} ${p.x.toFixed(1)},${(p.y - 3).toFixed(1)}" fill="${ink}"/>`;
    svg += `<rect x="${bx.toFixed(1)}" y="${by}" width="${bw.toFixed(1)}" height="${calloutBoxH}" fill="#FFFFFF" stroke="${ink}" stroke-width="1"/>`;
    svg += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(by + calloutBoxH / 2 + 5).toFixed(1)}" style="font-family:var(--font-data, 'Inter Tight', system-ui, sans-serif)" font-size="${fs}" fill="${ink}" text-anchor="middle" font-weight="500">${escapeHtml(c.text)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${svg}</svg>`;
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
  const muted = args.muted ?? "#B8C0CC";
  const ink = args.ink ?? base;
  // axes assume 0..100 normalized
  let svg = "";
  // quadrant rules
  svg += `<line x1="${padL + chartW / 2}" x2="${padL + chartW / 2}" y1="${padT}" y2="${padT + chartH}" stroke="${muted}" stroke-width="1"/>`;
  svg += `<line x1="${padL}" x2="${padL + chartW}" y1="${padT + chartH / 2}" y2="${padT + chartH / 2}" stroke="${muted}" stroke-width="1"/>`;
  // axis labels
  svg += `<text x="${padL + chartW / 2}" y="${h - 16}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="12" fill="${muted}" text-anchor="middle" letter-spacing="0.04em">${escapeHtml(xLabel)}</text>`;
  svg += `<text transform="rotate(-90 24 ${padT + chartH / 2})" x="24" y="${padT + chartH / 2}" style="font-family:var(--font-data, ui-monospace, monospace);font-variant-numeric:tabular-nums" font-size="12" fill="${muted}" text-anchor="middle" letter-spacing="0.04em">${escapeHtml(yLabel)}</text>`;
  // Opt-in quadrant anchors: quadLabels="TL|TR|BL|BR" names the four fields
  // in the corners so the matrix reads without decoding the axes first.
  const quadRaw = args.quadLabels ? resolveSlotOrLiteral(args.quadLabels, slots) : "";
  if (quadRaw) {
    const q = quadRaw.split("|").map((s) => s.trim());
    const qPos: Array<[number, number, string]> = [
      [padL + 14, padT + 24, "start"],
      [padL + chartW - 14, padT + 24, "end"],
      [padL + 14, padT + chartH - 14, "start"],
      [padL + chartW - 14, padT + chartH - 14, "end"],
    ];
    q.slice(0, 4).forEach((label, i) => {
      if (!label) return;
      const [qx, qy, anchor] = qPos[i];
      svg += `<text x="${qx}" y="${qy}" text-anchor="${anchor}" style="font-family:var(--font-data, Inter, system-ui, sans-serif)" font-size="13" fill="${muted}" font-weight="600">${escapeHtml(label)}</text>`;
    });
  }
  for (const p of points) {
    const cx = padL + (p.x / 100) * chartW;
    const cy = padT + ((100 - p.y) / 100) * chartH;
    const isHi = p.label.toLowerCase() === highlight;
    svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isHi ? 10 : 7}" fill="${isHi ? accent : base}"/>`;
    // labels on the right quarter anchor left of the dot so they stay inside the frame
    const flip = p.x > 72;
    svg += `<text x="${(flip ? cx - 14 : cx + 14).toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="${flip ? "end" : "start"}" style="font-family:var(--font-data, Inter, system-ui, sans-serif)" font-size="14" fill="${ink}" font-weight="${isHi ? 700 : 500}">${escapeHtml(p.label)}</text>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${svg}</svg>`;
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
  const customPalette = args.palette
    ? args.palette.split("|").filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.trim()))
    : [];
  const palette = customPalette.length >= 2 ? customPalette : [accent, base, "#3A3F45", "#6B7178", "#B0B6BD"];
  const valueSize = Math.max(24, Math.min(140, Number(args.valueSize) || 116));
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
    // Per-segment fit: render the numeral at full size when it fits, step down
    // once for narrow segments, and skip rather than clip at the viewBox edge.
    const pctText = `${pct}%`;
    const fits = (size: number) => segW > pctText.length * size * 0.62 + size * 0.4;
    const size = fits(valueSize) ? valueSize : fits(valueSize * 0.5) ? valueSize * 0.5 : 0;
    if (size >= 20) {
      segs += `<text x="${(x + size * 0.26).toFixed(1)}" y="${(barY + barH / 2).toFixed(1)}" dominant-baseline="central" font-family="${serif}" font-size="${size.toFixed(0)}" fill="${txt}" font-weight="400" letter-spacing="-0.01em">${pctText}</text>`;
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

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${top}${segs}</svg>`;
}

// ─── stacked-area ────────────────────────────────────────────────────────────
// Composition over time as saturated stacked bands — the reference's
// volume-forecast device (USPS p12): the exhibit is one solid block of ink,
// never a thin line floating in white. args: data (slot, "a/b/c || a/b/c" one
// row per period), labels (slot, period names), segLabels (slot, legend),
// palette (#hex|...), yAxis=1 (tick scale), height= (360-760), fontScale=,
// unit, ink, muted. Total values print at first/last/peak of the top line.
function renderStackedArea(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const rows = (slots[args.data] ?? "")
    .split("||")
    .map((r) => r.split("/").map((c) => Number(c.trim())).filter((n) => Number.isFinite(n)))
    .filter((r) => r.length > 0);
  const labels = parseLabels(slots[args.labels] ?? "");
  const segLabels = args.segLabels ? parseLabels(slots[args.segLabels] ?? "") : [];
  if (rows.length < 2) return "";
  const segCount = Math.min(...rows.map((r) => r.length));
  if (segCount < 1) return "";

  const fScale = Math.min(2, Math.max(0.8, Number(args.fontScale ?? "1") || 1));
  const F = (n: number) => Math.round(n * fScale * 2) / 2;
  const hOverride = Number(args.height ?? "");
  const h = Number.isFinite(hOverride) && hOverride >= 360 && hOverride <= 760 ? hOverride : 480;
  const w = 920;

  const ink = args.ink ?? "#1A1A1A";
  const muted = args.muted ?? "#9AA0A6";
  const palette = (args.palette ?? "")
    .split("|")
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.trim()));
  if (palette.length === 0) palette.push("#1F3A5F", "#2B6CB0", "#6FA8DC", "#9DBFDD");
  const sans = "var(--font-data, 'Inter Tight', system-ui, sans-serif)";
  const mono = "var(--font-data, ui-monospace, monospace)";
  const unit = resolveSlotOrLiteral(args.unit, slots);
  const dec = maxDecimals(slots[args.data] ?? "");

  const totals = rows.map((r) => r.slice(0, segCount).reduce((a, v) => a + Math.max(0, v), 0));
  let max = Math.max(...totals);
  const hasAxis = args.yAxis === "1";
  const ticks = hasAxis ? niceTicks(0, max, fScale >= 1.5 ? 6 : 9) : [];
  if (ticks.length >= 2) max = Math.max(max, ticks[ticks.length - 1]);
  const range = max || 1;
  const tickStrs = tickFormat(ticks, unit);
  const padL = hasAxis
    ? Math.max(56, 16 + Math.max(0, ...tickStrs.map((s) => s.length)) * F(13) * 0.66)
    : 24;
  const padR = 24, padT = 72, padB = 44;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const n = rows.length;
  const step = chartW / (n - 1);
  const yOf = (v: number) => padT + ((max - v) / range) * chartH;

  let svg = "";
  // tick labels + tick marks (no gridlines across the saturated bands)
  if (hasAxis) {
    ticks.forEach((t, i) => {
      const ty = yOf(t);
      svg += `<line x1="${padL - 6}" x2="${padL}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${ink}" stroke-width="1"/>`;
      svg += `<text x="${(padL - 12).toFixed(1)}" y="${(ty + F(13) * 0.35).toFixed(1)}" text-anchor="end" style="font-family:${mono};font-variant-numeric:tabular-nums" font-size="${F(13)}" fill="${ink}">${escapeHtml(tickStrs[i])}</text>`;
    });
  }
  // cumulative bands, bottom-up; white hairline between bands keeps them crisp
  const cum: number[][] = [];
  for (let k = 0; k < segCount; k++) {
    cum[k] = rows.map((r, i) => (k === 0 ? 0 : cum[k - 1][i]) + Math.max(0, r[k]));
  }
  for (let k = 0; k < segCount; k++) {
    const upper = cum[k].map((v, i) => `${(padL + i * step).toFixed(1)},${yOf(v).toFixed(1)}`);
    const lowerVals = k === 0 ? rows.map(() => 0) : cum[k - 1];
    const lower = lowerVals.map((v, i) => `${(padL + i * step).toFixed(1)},${yOf(v).toFixed(1)}`).reverse();
    svg += `<polygon points="${upper.join(" ")} ${lower.join(" ")}" fill="${palette[k % palette.length]}" stroke="#FFFFFF" stroke-width="1"/>`;
  }
  // total line on top + first/last/peak values
  const topPath = "M " + cum[segCount - 1].map((v, i) => `${(padL + i * step).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" L ");
  svg += `<path d="${topPath}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`;
  const peakIdx = totals.indexOf(Math.max(...totals));
  totals.forEach((t, i) => {
    if (i !== 0 && i !== n - 1 && i !== peakIdx) return;
    const x = padL + i * step;
    const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    svg += `<text x="${x.toFixed(1)}" y="${(yOf(t) - 12).toFixed(1)}" text-anchor="${anchor}" style="font-family:${mono};font-variant-numeric:tabular-nums" font-size="${F(16)}" fill="${ink}" font-weight="700">${escapeHtml(formatNum(t, unit, false, dec))}</text>`;
  });
  // x labels: every period up to ~16
  const labelStep = Math.ceil(n / 16);
  for (let i = 0; i < n; i++) {
    if (!labels[i] || (i % labelStep !== 0 && i !== n - 1)) continue;
    svg += `<text x="${(padL + i * step).toFixed(1)}" y="${(padT + chartH + 26).toFixed(1)}" text-anchor="middle" style="font-family:${sans}" font-size="${F(15)}" fill="${muted}">${escapeHtml(labels[i])}</text>`;
  }
  // baseline carries the chart
  svg += `<line x1="${padL}" x2="${w - padR}" y1="${(padT + chartH).toFixed(1)}" y2="${(padT + chartH).toFixed(1)}" stroke="${ink}" stroke-width="2"/>`;
  // legend swatches top-left
  let lx = padL;
  segLabels.slice(0, segCount).forEach((l, k) => {
    svg += `<rect x="${lx.toFixed(1)}" y="20" width="14" height="14" fill="${palette[k % palette.length]}"/>`;
    svg += `<text x="${(lx + 22).toFixed(1)}" y="32" style="font-family:${sans}" font-size="${F(13.5)}" fill="${ink}" font-weight="500">${escapeHtml(l)}</text>`;
    lx += 22 + l.length * F(13.5) * 0.58 + 28;
  });
  svg += renderChartNote(args, slots, w - padR, 32, args.accent ?? ink);
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${svg}</svg>`;
}

// ─── stacked-cols ────────────────────────────────────────────────────────────
// Multi-period stacked columns with values INSIDE the segments (white on dark
// fills, ink on light) — the consulting workhorse for composition over time.
// args: data (slot, "a/b/c || a/b/c" one row per period, segments in order),
//       labels (slot, period names "2026|2027|..."), segLabels (slot, legend
//       names per segment), palette (#hex|#hex|... per segment), ink, muted,
//       unit. Column totals print above each column.
function renderStackedCols(
  args: Record<string, string>,
  slots: Record<string, string>,
): string {
  const rows = (slots[args.data] ?? "")
    .split("||")
    .map((r) => r.split("/").map((c) => Number(c.trim())).filter((n) => Number.isFinite(n)))
    .filter((r) => r.length > 0);
  const labels = parseLabels(slots[args.labels] ?? "");
  const segLabels = args.segLabels ? parseLabels(slots[args.segLabels] ?? "") : [];
  if (rows.length === 0) return "";

  const w = 920, h = 460;
  const padL = 12, padR = 12, padT = 76, padB = 44;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const n = rows.length;
  const colW = (chartW / n) * 0.62;
  const gap = (chartW / n) * 0.38;

  const ink = args.ink ?? "#1A1A1A";
  const muted = args.muted ?? "#9AA0A6";
  const palette = (args.palette ?? "")
    .split("|")
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.trim()));
  if (palette.length === 0) palette.push("#1F3A5F", "#2B6CB0", "#6FA8DC", "#9DBFDD", "#CFE0EE");
  const sans = "var(--font-data, 'Inter Tight', system-ui, sans-serif)";
  const unit = resolveSlotOrLiteral(args.unit, slots);
  const dec = maxDecimals(slots[args.data] ?? "");

  const totals = rows.map((r) => r.reduce((a, v) => a + Math.abs(v), 0));
  const maxTotal = Math.max(...totals, 1);
  const scale = chartH / maxTotal;

  let svg = "";
  // legend (top-left swatch row)
  if (segLabels.length) {
    let lx = padL;
    segLabels.forEach((l, i) => {
      svg += `<rect x="${lx}" y="14" width="14" height="14" fill="${palette[i % palette.length]}"/>`;
      svg += `<text x="${lx + 20}" y="26" style="font-family:${sans}" font-size="14" fill="${muted}" font-weight="500">${escapeHtml(l)}</text>`;
      lx += 20 + l.length * 7.6 + 26;
    });
  }
  rows.forEach((r, i) => {
    const x = padL + gap / 2 + i * (colW + gap);
    let y = padT + chartH;
    r.forEach((v, j) => {
      const segH = Math.abs(v) * scale;
      y -= segH;
      const fill = palette[j % palette.length];
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${colW.toFixed(1)}" height="${segH.toFixed(1)}" fill="${fill}"/>`;
      // value inside the segment when it fits (the anatomy device: white on dark)
      if (segH > 26) {
        svg += `<text x="${(x + colW / 2).toFixed(1)}" y="${(y + segH / 2).toFixed(1)}" dominant-baseline="central" text-anchor="middle" style="font-family:${sans}" font-size="15" font-weight="600" fill="${readableOn(fill)}">${escapeHtml(formatNum(v, "", false, dec))}</text>`;
      }
    });
    // column total above
    svg += `<text x="${(x + colW / 2).toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" style="font-family:${sans}" font-size="17" font-weight="700" fill="${ink}">${escapeHtml(formatNum(totals[i], unit, false, dec))}</text>`;
    if (labels[i]) {
      svg += `<text x="${(x + colW / 2).toFixed(1)}" y="${(padT + chartH + 28).toFixed(1)}" text-anchor="middle" style="font-family:${sans}" font-size="15" fill="${muted}">${escapeHtml(labels[i])}</text>`;
    }
  });
  // baseline
  svg += `<line x1="${padL}" x2="${w - padR}" y1="${padT + chartH}" y2="${padT + chartH}" stroke="${ink}" stroke-width="2"/>`;
  svg += renderChartNote(args, slots, w - padR, 26, palette[1] ?? ink);
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${svg}</svg>`;
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

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${dots}${pins}</svg>`;
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
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:100%;display:block;">${g}</svg>`;
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

export function formatNum(n: number, unit?: string, signed = false, decimals?: number): string {
  let u = unit ?? "";
  // A unit token for an inline number label is short and compound at most
  // ("EUR", "%", "$M", "$M ARR", "EUR bn", "kg CO2e", "USD/ton"). A descriptive
  // unit-LINE ("EUR per parcel, share of the EUR 0.78 gap") belongs in the
  // exhibit caption band, not on every bar — appending it overprints the chart.
  // Only drop values that READ as a descriptive phrase, never a legitimate
  // compound unit: more than three words, a descriptive connector word, or
  // absurd length. (The old guard dropped ANY unit with a space or >6 chars,
  // which shredded "$M ARR"/"EUR bn"/"USD/ton" off the pitch/data decks.)
  const uTokens = u.trim().split(/\s+/).filter(Boolean);
  const DESCRIPTIVE_WORD = /^(per|share|of|gap|vs|versus|from|to|the|a|an|each|by|in|on|over|under)$/i;
  if (uTokens.length > 3 || u.length > 16 || uTokens.some((t) => DESCRIPTIVE_WORD.test(t))) u = "";
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
    const safe = safeBgImageSrc(slots[args.bgSlot]);
    if (safe) {
      return `<img src="${escapeHtmlAttr(safe)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">`;
    }
  }

  // Priority 2: skill-level baked cache (shared across decks).
  const safeCached = safeBgImageSrc(ctx.skill.cachedGradients?.[presetName]);
  if (useFal && safeCached) {
    return `<img src="${escapeHtmlAttr(safeCached)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">`;
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
  // Sunlit workshop morning — a bright daylit bone-and-oak field with a soft
  // window-light wash and warm brass/oak pockets. On-brand fallback for warm
  // daylit product-launch bleed decks when no FAL photograph is supplied.
  workshop: {
    base: "#EFE7DB",
    blobs: [
      { cx: 0.2, cy: 0.18, r: 0.34, color: "#FBF6EE" },
      { cx: 0.82, cy: 0.3, r: 0.26, color: "#E2D2B6" },
      { cx: 0.7, cy: 0.82, r: 0.3, color: "#C9A368" },
      { cx: 0.18, cy: 0.8, r: 0.24, color: "#D8C6AA" },
      { cx: 0.5, cy: 0.5, r: 0.16, color: "#FFFDF8" },
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
