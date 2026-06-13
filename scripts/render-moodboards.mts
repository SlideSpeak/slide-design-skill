// Render moodboards through the machine: composeMoodboardPrompts (the axis
// rotation that fights the model's genre-default palette) + FalProvider
// (flux/dev, 28 steps). No hand-written prompts. The composer fixes the colour
// axes from the subject seed; this host only does the file I/O that
// engine/moodboard.ts deliberately defers to its caller.
//
// Usage:
//   FAL_KEY=... npx tsx scripts/render-moodboards.mts "<subject>" <count> <outDir>

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { composeMoodboardPrompts } from "../engine/moodboard.ts";
import { FalProvider } from "../engine/image-providers.ts";

const [subject, countArg, outDirArg] = process.argv.slice(2);
if (!subject || !outDirArg) {
  console.error('Usage: tsx render-moodboards.mts "<subject>" <count> <outDir>');
  process.exit(2);
}
const count = Math.max(1, parseInt(countArg ?? "3", 10) || 3);

const apiKey = process.env.FAL_KEY;
if (!apiKey) {
  console.error("Set FAL_KEY env var first.");
  process.exit(1);
}

const outDir = resolve(process.cwd(), outDirArg);
await mkdir(outDir, { recursive: true });

const fal = new FalProvider({ apiKey, model: "fal-ai/flux/dev" });
const boards = composeMoodboardPrompts(subject, count);

const W = 1216;
const H = 832;
function slug(axis: string): string {
  return axis
    .split(":")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

console.log(`subject: ${subject}`);
console.log(
  `${boards.length} boards via the machine (flux/dev), ~$${(boards.length * 0.025).toFixed(3)} est.`,
);

const manifest: { board: number; axis: string; file: string; prompt: string }[] = [];
for (let i = 0; i < boards.length; i++) {
  const b = boards[i];
  const file = `board-${i + 1}-${slug(b.axis)}.jpg`;
  process.stdout.write(`  [${i + 1}/${boards.length}] ${b.axis} ... `);
  const img = await fal.generate({ prompt: b.prompt, width: W, height: H });
  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(resolve(outDir, file), buf);
  manifest.push({ board: i + 1, axis: b.axis, file, prompt: b.prompt });
  console.log("ok");
}

await writeFile(
  resolve(outDir, "manifest.json"),
  JSON.stringify({ subject, boards: manifest }, null, 2),
);
console.log("wrote", resolve(outDir, "manifest.json"));
