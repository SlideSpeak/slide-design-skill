// Generate one FAL image per image-treatment (+ plain photographic) so Dom can
// judge quality. Usage: FAL_KEY=… npx tsx scripts/treatment-showcase.mts
// Writes PNGs to ~/Desktop/SlideSpeak-Image-Showcase/ ; a python step builds the sheet.
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FalProvider, GLOBAL_IMAGE_NEGATIVES } from "../engine/image-providers.ts";
import { applyTreatment } from "../engine/image-treatments.ts";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILTER_PY = resolve(__dirname, "image-filters.py");
const OUT = resolve(homedir(), "Desktop", "SlideSpeak-Image-Showcase");
await execFileP("mkdir", ["-p", OUT]);

const apiKey = process.env.FAL_KEY;
if (!apiKey) { console.error("Set FAL_KEY"); process.exit(1); }
const fal = new FalProvider({ apiKey, model: "fal-ai/flux/dev" });
const W = 1216, H = 832;

// label · treatment · subject (subject chosen to flatter the medium)
const ITEMS: [string, string | undefined, string][] = [
  ["photographic",   undefined,        "a calm modern architecture interior with soft north light, warm minimal materials"],
  ["photographic-2", undefined,        "a misty mountain ridge at dawn, layered silhouettes, cool atmospheric haze"],
  ["oil-painting",   "oil-painting",   "a harbour at golden hour, fishing boats, reflective water"],
  ["renaissance",    "renaissance",    "a still life of fruit, bread and a brass vessel on a draped table"],
  ["watercolor",     "watercolor",     "a rainy city street with people and umbrellas, reflections on the pavement"],
  ["risograph",      "risograph",      "a cyclist moving through a stylised city, bold simple shapes"],
  ["line-engraving", "line-engraving", "a detailed botanical study of a fern and seed pods"],
  ["cyanotype",      "cyanotype",      "ocean waves breaking on a rocky shore with seabirds"],
  ["pixel-art",      "pixel-art",      "a cosy bedroom at night with a glowing window and city lights outside"],
  ["halftone",       "halftone",       "a person laughing, candid half-length, plain background"],
  ["ascii",          "ascii",          "a vintage sports car parked on an empty street"],
  ["blueprint",      "blueprint",      "a mechanical combustion engine, three-quarter view"],
];

const POST = new Set(["pixel-art", "halftone", "ascii", "blueprint"]);

async function one(label: string, treatment: string | undefined, subject: string, i: number) {
  const { prompt, negatives } = applyTreatment(subject, [...GLOBAL_IMAGE_NEGATIVES], treatment);
  const img = await fal.generate({ prompt, negative: negatives.join(", "), width: W, height: H });
  const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
  const raw = resolve(OUT, `${String(i).padStart(2, "0")}-${label}.png`);
  await writeFile(raw, buf);
  if (treatment && POST.has(treatment)) {
    // FLUX renders a clean photo; the digital-graphic look comes from the PIL filter.
    await execFileP("python3", [FILTER_PY, treatment, raw, raw], { timeout: 90_000 });
  }
  console.log("✓", label);
  return label;
}

// modest concurrency
const queue = ITEMS.map((it, i) => () => one(it[0], it[1], it[2], i + 1));
const CONC = 4;
for (let i = 0; i < queue.length; i += CONC) {
  await Promise.all(queue.slice(i, i + CONC).map((f) => f().catch((e) => console.error("FAIL", e.message))));
}
console.log("done →", OUT);
