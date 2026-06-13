// Density gate against the COUNTED reference numbers (docs/specs/
// 2026-06-11-mckinsey-anatomy.md): a median reference content page carries
// ~100 tokens / ~20 numerals; dense exhibits 70–112 numerals. Methodology
// mirrors the pdftotext audit of the reference decks: visible text only,
// tokens = whitespace-separated words, numerals = /[0-9][0-9.,%]*/ matches.
//
// Floors (derived from the reference counts, never from our own output):
//   - content slides (everything except cover/tracker/section-divider/closing):
//     >= 80 tokens
//   - chart/table/matrix slides: additionally >= 20 numerals
//   - deck median across content slides: >= 90 tokens (warn)
//
// Usage: npx tsx scripts/measure-density.mts <rendered.html>
// Exit 1 when any slide is below a floor.

import { readFileSync } from "node:fs";

const TOKEN_FLOOR = 80;
const NUMERAL_FLOOR = 20;
const MEDIAN_FLOOR = 90;

const EXEMPT_TYPES = new Set([
  "cover", "tracker", "section-divider", "breather", "closing",
  // editorial register (verso): poster moments carry little or no text by design
  "statement", "chapter-toc", "chapter-opener", "photo-breather", "photo-quote",
  "quote-dark", "stat-ledger", "stat-plate",
]);
// Generic exemption beyond hardcoded type names: the renderer stamps each slide
// root with data-density; editorial-density slides (posters, breathers,
// statements) carry little text BY DESIGN, whatever the skill named the type.
const EXEMPT_DENSITY = "editorial";
const NUMERAL_TYPES = new Set([
  "chart-bar", "chart-hbar", "chart-line", "chart-waterfall", "chart-stacked",
  "chart-duo", "chart-trio", "chart-table", "heatmap", "comparison-table",
  "data-plate-bar", "data-plate-stacked", "data-plate-hbar",
]);

const file = process.argv[2];
if (!file) {
  console.error("usage: npx tsx scripts/measure-density.mts <rendered.html>");
  process.exit(2);
}
const html = readFileSync(file, "utf8");

// split into slides on <section data-slide-type=...>
const parts = html.split(/(?=<section\b[^>]*\bdata-slide-type=)/).slice(1);
if (parts.length === 0) {
  console.error("no <section data-slide-type=...> slides found");
  process.exit(2);
}

function visibleText(slideHtml: string): string {
  return slideHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Row = { n: number; type: string; tokens: number; numerals: number; exempt: boolean; fails: string[] };
const rows: Row[] = [];

parts.forEach((part, i) => {
  const openTag = part.slice(0, part.indexOf(">") + 1);
  const typeM = /\bdata-slide-type="([^"]+)"/.exec(openTag);
  const type = typeM ? typeM[1] : "?";
  const densM = /\bdata-density="([^"]+)"/.exec(openTag);
  const exempt = EXEMPT_TYPES.has(type) || (densM ? densM[1] === EXEMPT_DENSITY : false);
  const text = visibleText(part);
  const tokens = text.length ? text.split(/\s+/).length : 0;
  const numerals = (text.match(/[0-9][0-9.,%]*/g) ?? []).length;
  const fails: string[] = [];
  if (!exempt) {
    if (tokens < TOKEN_FLOOR) fails.push(`tokens ${tokens} < ${TOKEN_FLOOR}`);
    if (NUMERAL_TYPES.has(type) && numerals < NUMERAL_FLOOR) {
      fails.push(`numerals ${numerals} < ${NUMERAL_FLOOR}`);
    }
  }
  rows.push({ n: i + 1, type, tokens, numerals, exempt, fails });
});

let failed = 0;
for (const r of rows) {
  const status = r.exempt ? "—" : r.fails.length ? "FAIL" : "ok";
  if (r.fails.length) failed++;
  console.log(
    `slide ${String(r.n).padStart(2)}  ${r.type.padEnd(18)} tokens=${String(r.tokens).padStart(4)}  numerals=${String(r.numerals).padStart(4)}  ${status}${r.fails.length ? "  (" + r.fails.join(", ") + ")" : ""}`,
  );
}

const content = rows.filter((r) => !r.exempt).map((r) => r.tokens).sort((a, b) => a - b);
const median = content.length ? content[Math.floor(content.length / 2)] : 0;
console.log(`\ncontent slides: ${content.length}  median tokens: ${median} (floor ${MEDIAN_FLOOR})  reference median: ~100`);
if (median < MEDIAN_FLOOR) console.log(`WARN: deck median below reference floor`);

if (failed > 0) {
  console.error(`\n${failed} slide(s) below the counted reference floors`);
  process.exit(1);
}
console.log("density gate: all slides at or above the counted reference floors");
