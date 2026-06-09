// Injects a print stylesheet into standalone deck HTML so each .slide becomes
// one 16:9 landscape PDF page (backgrounds forced on). Writes *-print.html; the
// caller renders them with Brave --headless --print-to-pdf.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRINT_CSS = `<style id="deck-print">
@page { size: 1920px 1080px; margin: 0; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .slide { margin: 0 !important; box-shadow: none !important; page-break-inside: avoid; break-inside: avoid; page-break-after: always; break-after: page; }
  .slide:last-child { page-break-after: auto; break-after: auto; }
}
</style>`;

const srcs = process.argv.slice(2);
for (const src of srcs) {
  const p = resolve(__dirname, src);
  const html = await readFile(p, "utf8");
  const injected = html.includes("</head>")
    ? html.replace("</head>", `${PRINT_CSS}\n</head>`)
    : PRINT_CSS + html;
  const outPath = p.replace(/\.html$/, "-print.html");
  await writeFile(outPath, injected, "utf8");
  console.log("wrote " + outPath);
}
