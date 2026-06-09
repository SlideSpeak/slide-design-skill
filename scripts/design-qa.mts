// Design-QA: send rendered slides through Gemini Vision, collect layout defects.
//
// Usage:
//   GEMINI_API_KEY=... npx tsx scripts/design-qa.mts <deck-prefix> [slide-count]
//   GEMINI_API_KEY=... npx tsx scripts/design-qa.mts telescope-slide 8
//   GEMINI_API_KEY=... npx tsx scripts/design-qa.mts apple-headspace-deck-s 8
//
// Writes scripts/design-qa-report-<timestamp>.md with all findings.
//
// Cost: ~$0.001 per slide on gemini-2.5-flash. 96 slides ≈ $0.10.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Set GEMINI_API_KEY env var first. (PAL MCP also works in Claude Code; this script is the standalone fallback.)");
  process.exit(1);
}

const [deckPrefix, slideCountArg] = process.argv.slice(2);
if (!deckPrefix) {
  console.error("Usage: tsx design-qa.mts <deck-prefix> [slide-count]");
  console.error("  example: tsx design-qa.mts telescope-slide 8");
  process.exit(2);
}
const slideCount = slideCountArg ? Number(slideCountArg) : 8;

const PROMPT = `You are a senior visual designer reviewing a rendered slide (1920×1080). Identify LAYOUT DEFECTS only (not stylistic preferences). Look for:

1. OVERFLOW: content extends past slide boundaries / gets clipped at any edge
2. MISALIGNMENT: labels/headings/columns that don't line up with what they reference (e.g. weekday labels not centered over their dot-columns; footer text not flush with card left edge)
3. AWKWARD VERTICAL SPACING: footers pulled too high (leaving empty space below footer/at slide bottom), content not vertically balanced, headers floating in white-space, top-weighted layouts with excessive bottom whitespace
4. COLLISIONS: text overlapping lines, labels overlapping each other, chart elements crossing text or other chart elements, data-labels overlapping axis-labels
5. PROPORTION ISSUES: chart too large for its container (overflow), chart too small (lost in whitespace), text too small to read at slide-size
6. ANCHOR-TEXT MISMATCH: side-elements not vertically centered with the main content they accompany

Be RUTHLESSLY critical. ONLY flag REAL geometric/layout issues, NOT stylistic preferences (don't comment on color choices, font choices, copy length).

Output format:
{
  "defects": [
    { "severity": "high|medium|low", "type": "overflow|misalignment|spacing|collision|proportion|hierarchy", "where": "top|bottom|left|right|center", "description": "<one sentence naming the specific elements>" }
  ]
}

If no defects: { "defects": [] }

JSON only. No prose, no markdown fences.`;

interface Defect {
  severity: "high" | "medium" | "low";
  type: string;
  where: string;
  description: string;
}

interface SlideReport {
  slide: number;
  path: string;
  defects: Defect[];
  rawResponse?: string;
  error?: string;
}

async function analyzeOne(slidePath: string, slideNum: number): Promise<SlideReport> {
  let buf: Buffer;
  try {
    buf = await readFile(slidePath);
  } catch (e) {
    return { slide: slideNum, path: slidePath, defects: [], error: `read failed: ${(e as Error).message}` };
  }
  const base64 = buf.toString("base64");

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: "image/png", data: base64 } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0, response_mime_type: "application/json" },
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      return { slide: slideNum, path: slidePath, defects: [], error: `HTTP ${res.status}: ${await res.text()}` };
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    try {
      const cleaned = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      const parsed = JSON.parse(cleaned) as { defects: Defect[] };
      return { slide: slideNum, path: slidePath, defects: parsed.defects ?? [], rawResponse: text };
    } catch (e) {
      return { slide: slideNum, path: slidePath, defects: [], error: `JSON parse failed: ${(e as Error).message}`, rawResponse: text };
    }
  } catch (e) {
    return { slide: slideNum, path: slidePath, defects: [], error: `request failed: ${(e as Error).message}` };
  }
}

const reports: SlideReport[] = [];
console.log(`Running design-QA on ${deckPrefix}-1.png ... ${deckPrefix}-${slideCount}.png ...`);

for (let i = 1; i <= slideCount; i++) {
  const slidePath = resolve(repoRoot, "scripts", `${deckPrefix}-${i}.png`);
  process.stdout.write(`  slide ${i}/${slideCount} ... `);
  const r = await analyzeOne(slidePath, i);
  reports.push(r);
  if (r.error) {
    console.log(`error: ${r.error.slice(0, 80)}`);
  } else {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const d of r.defects) counts[d.severity]++;
    console.log(`${r.defects.length} defects (${counts.high}H ${counts.medium}M ${counts.low}L)`);
  }
}

const totals = reports.reduce(
  (acc, r) => {
    for (const d of r.defects) acc[d.severity]++;
    return acc;
  },
  { high: 0, medium: 0, low: 0 },
);

const lines: string[] = [];
lines.push(`# Design-QA report — ${deckPrefix}`);
lines.push(`Generated ${new Date().toISOString()}`);
lines.push(``);
lines.push(`**Totals across ${reports.length} slides:** ${totals.high} high · ${totals.medium} medium · ${totals.low} low`);
lines.push(``);
for (const r of reports) {
  lines.push(`## Slide ${r.slide} — \`${basename(r.path)}\``);
  if (r.error) {
    lines.push(`> error: ${r.error}`);
  } else if (r.defects.length === 0) {
    lines.push(`✓ no defects flagged`);
  } else {
    for (const d of r.defects) {
      const icon = d.severity === "high" ? "🔴" : d.severity === "medium" ? "🟡" : "🟢";
      lines.push(`${icon} **${d.severity.toUpperCase()} · ${d.type} · ${d.where}** — ${d.description}`);
    }
  }
  lines.push(``);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const reportPath = resolve(repoRoot, "scripts", `design-qa-report-${deckPrefix}-${ts}.md`);
await writeFile(reportPath, lines.join("\n"), "utf8");

console.log(``);
console.log(`Wrote ${reportPath}`);
console.log(`Totals: ${totals.high} high · ${totals.medium} medium · ${totals.low} low`);
