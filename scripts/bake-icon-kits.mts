// Bakes Tabler, Heroicons and Phosphor icon sets into engine/icon-kits.ts, keyed
// by the SAME names the Lucide set uses, so {{@icon name=shield}} renders in
// whichever kit a skill selected. Only files that actually exist on disk are
// baked (ground-truth: we never hand-author icon paths). Names a kit lacks fall
// back to Lucide at render time and are reported here.
//
// Run after `npm install --no-save @phosphor-icons/core heroicons @tabler/icons`.
//   npx tsx scripts/bake-icon-kits.mts
import { readFile, writeFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ICONS } from "../engine/fidelity-data.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const TABLER = resolve(root, "node_modules/@tabler/icons/icons/outline");
const HERO = resolve(root, "node_modules/heroicons/24/outline");
const PHOS = resolve(root, "node_modules/@phosphor-icons/core/assets/regular");

// Lucide name → kit-specific filename candidates (first existing wins; the
// Lucide name itself is always tried first automatically).
const SYNONYMS: Record<string, { t?: string[]; h?: string[]; p?: string[] }> = {
  zap: { t: ["bolt"], h: ["bolt"], p: ["lightning"] },
  globe: { t: ["world"], h: ["globe-alt", "globe-americas"], p: [] },
  "trending-up": { h: ["arrow-trending-up"], p: ["trend-up"] },
  "trending-down": { h: ["arrow-trending-down"], p: ["trend-down"] },
  "dollar-sign": { t: ["currency-dollar"], h: ["currency-dollar"], p: ["currency-dollar"] },
  layers: { t: ["stack-2", "stack"], h: ["square-3-stack-3d", "square-2-stack"], p: ["stack"] },
  "refresh-cw": { t: ["refresh"], h: ["arrow-path"], p: ["arrows-clockwise"] },
  lightbulb: { t: ["bulb"], h: ["light-bulb"], p: [] },
  "message-square": { t: ["message"], h: ["chat-bubble-left-right", "chat-bubble-oval-left"], p: ["chat-centered", "chat"] },
  "triangle-alert": { t: ["alert-triangle"], h: ["exclamation-triangle"], p: ["warning"] },
  "bar-chart": { t: ["chart-bar"], h: ["chart-bar"], p: ["chart-bar"] },
  "chart-bar": { t: ["chart-bar"], h: ["chart-bar-square", "chart-bar"], p: ["chart-bar-horizontal", "chart-bar"] },
  "chart-line": { t: ["chart-line"], h: ["presentation-chart-line"], p: ["chart-line"] },
  "chart-pie": { t: ["chart-pie"], h: ["chart-pie"], p: ["chart-pie"] },
  "circle-check": { t: ["circle-check"], h: ["check-circle"], p: ["check-circle"] },
  "file-text": { t: ["file-text"], h: ["document-text"], p: ["file-text"] },
  "git-branch": { t: ["git-branch"], h: [], p: ["git-branch"] },
  workflow: { t: ["topology-star-3", "sitemap"], h: ["squares-2x2"], p: ["flow-arrow", "tree-structure"] },
  sparkles: { t: ["sparkles"], h: ["sparkles"], p: ["sparkle"] },
  compass: { t: ["compass"], h: [], p: ["compass"] },
  "credit-card": { t: ["credit-card"], h: ["credit-card"], p: ["credit-card"] },
  "shopping-cart": { t: ["shopping-cart"], h: ["shopping-cart"], p: ["shopping-cart"] },
  "map-pin": { t: ["map-pin"], h: ["map-pin"], p: ["map-pin"] },
  "arrow-up-right": { t: ["arrow-up-right"], h: ["arrow-up-right"], p: ["arrow-up-right"] },
  "arrow-right": { t: ["arrow-right"], h: ["arrow-right"], p: ["arrow-right"] },
  rocket: { t: ["rocket"], h: ["rocket-launch"], p: ["rocket"] },
  briefcase: { t: ["briefcase"], h: ["briefcase"], p: ["briefcase"] },
  "building-2": { t: ["building"], h: ["building-office-2", "building-office"], p: ["buildings"] },
  building: { t: ["building"], h: ["building-office"], p: ["buildings"] },
  settings: { t: ["settings"], h: ["cog-6-tooth", "cog-8-tooth"], p: ["gear", "gear-six"] },
  search: { t: ["search"], h: ["magnifying-glass"], p: ["magnifying-glass"] },
  filter: { t: ["filter"], h: ["funnel"], p: ["funnel"] },
  send: { t: ["send"], h: ["paper-airplane"], p: ["paper-plane-tilt", "paper-plane-right"] },
  mail: { t: ["mail"], h: ["envelope"], p: ["envelope"] },
  bell: { t: ["bell"], h: ["bell"], p: ["bell"] },
  star: { t: ["star"], h: ["star"], p: ["star"] },
  heart: { t: ["heart"], h: ["heart"], p: ["heart"] },
  flag: { t: ["flag"], h: ["flag"], p: ["flag"] },
  link: { t: ["link"], h: ["link"], p: ["link"] },
  lock: { t: ["lock"], h: ["lock-closed"], p: ["lock"] },
  "lock-open": { t: ["lock-open"], h: ["lock-open"], p: ["lock-open"] },
  eye: { t: ["eye"], h: ["eye"], p: ["eye"] },
  clock: { t: ["clock"], h: ["clock"], p: ["clock"] },
  calendar: { t: ["calendar"], h: ["calendar"], p: ["calendar"] },
  cloud: { t: ["cloud"], h: ["cloud"], p: ["cloud"] },
  cpu: { t: ["cpu"], h: ["cpu-chip"], p: ["cpu"] },
  database: { t: ["database"], h: ["circle-stack"], p: ["database"] },
  server: { t: ["server"], h: ["server"], p: ["hard-drives"] },
  package: { t: ["package"], h: ["cube", "archive-box"], p: ["package"] },
  truck: { t: ["truck"], h: ["truck"], p: ["truck"] },
  target: { t: ["target"], h: ["viewfinder-circle"], p: ["target"] },
  folder: { t: ["folder"], h: ["folder"], p: ["folder"] },
  route: { t: ["route", "route-2"], h: ["map"], p: ["path", "signpost"] },
  users: { t: ["users"], h: ["users"], p: ["users"] },
  user: { t: ["user"], h: ["user"], p: ["user"] },
  shield: { t: ["shield"], h: ["shield-check", "shield-exclamation"], p: ["shield"] },
  activity: { t: ["activity"], h: ["chart-bar"], p: ["activity", "pulse"] },
  check: { t: ["check"], h: ["check"], p: ["check"] },
  x: { t: ["x"], h: ["x-mark"], p: ["x"] },
  plus: { t: ["plus"], h: ["plus"], p: ["plus"] },
  minus: { t: ["minus"], h: ["minus"], p: ["minus"] },
};

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function innerOf(svg: string): string {
  const m = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  let inner = m ? m[1] : "";
  // Tabler ships a transparent bounding-box path we don't want.
  inner = inner.replace(/<path\s+stroke="none"\s+d="M0 0h24v24H0z"\s+fill="none"\s*\/>/gi, "");
  return inner.replace(/\s+/g, " ").trim();
}

async function bakeKit(
  dir: string,
  kitKey: "t" | "h" | "p",
): Promise<{ icons: Record<string, string>; missing: string[] }> {
  const icons: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of Object.keys(ICONS)) {
    const candidates = [name, ...(SYNONYMS[name]?.[kitKey] ?? [])];
    let found: string | null = null;
    for (const c of candidates) {
      const p = resolve(dir, `${c}.svg`);
      if (await exists(p)) { found = p; break; }
    }
    if (!found) { missing.push(name); continue; }
    const inner = innerOf(await readFile(found, "utf8"));
    if (inner) icons[name] = inner;
    else missing.push(name);
  }
  return { icons, missing };
}

const tabler = await bakeKit(TABLER, "t");
const hero = await bakeKit(HERO, "h");
const phos = await bakeKit(PHOS, "p");

const total = Object.keys(ICONS).length;
console.log(`Lucide names: ${total}`);
console.log(`tabler:    ${Object.keys(tabler.icons).length}/${total}  (fallback→lucide: ${tabler.missing.join(", ") || "none"})`);
console.log(`heroicons: ${Object.keys(hero.icons).length}/${total}  (fallback→lucide: ${hero.missing.join(", ") || "none"})`);
console.log(`phosphor:  ${Object.keys(phos.icons).length}/${total}  (fallback→lucide: ${phos.missing.join(", ") || "none"})`);

const header = `// AUTO-GENERATED by scripts/bake-icon-kits.mts — do not edit by hand.
// Multiple icon kits keyed by the Lucide icon names. A skill picks one via
// tokens.icon.kit; names a kit lacks fall back to the Lucide set at render time.
import { ICONS } from "./fidelity-data.ts";

export interface IconKit {
  mode: "stroke" | "fill";
  viewBox: string;
  strokeWidth: number; // default stroke width for stroke kits (ignored for fill)
  icons: Record<string, string>;
}
`;

const body =
  `\nexport const ICON_KITS: Record<string, IconKit> = {\n` +
  `  lucide: { mode: "stroke", viewBox: "0 0 24 24", strokeWidth: 2, icons: ICONS },\n` +
  `  tabler: { mode: "stroke", viewBox: "0 0 24 24", strokeWidth: 2, icons: ${JSON.stringify(tabler.icons)} },\n` +
  `  heroicons: { mode: "stroke", viewBox: "0 0 24 24", strokeWidth: 1.5, icons: ${JSON.stringify(hero.icons)} },\n` +
  `  phosphor: { mode: "fill", viewBox: "0 0 256 256", strokeWidth: 0, icons: ${JSON.stringify(phos.icons)} },\n` +
  `};\n`;

await writeFile(resolve(root, "engine/icon-kits.ts"), header + body, "utf8");
console.log("\nwrote engine/icon-kits.ts");
