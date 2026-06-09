// Runs a deterministic post-process filter (pixel-art / halftone / ascii /
// blueprint) on an already-generated image. FLUX cannot render these reliably, so
// we render a clean photo and transform it here. Backed by scripts/image-filters.py
// (Pillow) — shelled out because the engine has no native image lib and PIL is an
// already-established, proven dependency across the repo's tooling.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const FILTER_SCRIPT = resolve(__dirname, "..", "scripts", "image-filters.py");

export const POSTPROCESS_FILTERS = new Set([
  "pixel-art",
  "halftone",
  "ascii",
  "blueprint",
]);

// Takes a data:image/...;base64 URI, runs the named filter, returns a new
// data-URI. On any failure returns the original (the filter is an enhancement,
// not a hard requirement — a deck must still render).
export async function postProcessDataUri(
  dataUri: string,
  filter: string,
): Promise<string> {
  if (!POSTPROCESS_FILTERS.has(filter)) return dataUri;
  const m = dataUri.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!m) return dataUri;

  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "ds-filter-"));
    const inPath = join(dir, "in.jpg");
    const outPath = join(dir, "out.jpg");
    await writeFile(inPath, Buffer.from(m[1], "base64"));
    await execFileP("python3", [FILTER_SCRIPT, filter, inPath, outPath], {
      timeout: 60_000,
    });
    const buf = await readFile(outPath);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return dataUri;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
