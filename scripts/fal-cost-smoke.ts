// Smoke-test the FAL cost estimate + the cost warning surfaced by generateDeck.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateFalCostUSD } from "../engine/fal-cost.ts";
import {
  generateDeck,
  type LLMClient,
  type ImageResolver,
  type BackgroundGenerator,
} from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(__dirname, "..", "skills");

let pass = 0,
  fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`OK  ${label}`);
    pass++;
  } else {
    console.log(`FAIL ${label}${detail ? " — " + detail : ""}`);
    fail++;
  }
}

check("estimateFalCostUSD(0) is 0", estimateFalCostUSD(0) === 0);
check("estimateFalCostUSD(-3) is 0", estimateFalCostUSD(-3) === 0);
check("estimateFalCostUSD(4) is 0.10", Math.abs(estimateFalCostUSD(4) - 0.1) < 1e-9, `${estimateFalCostUSD(4)}`);
check("estimateFalCostUSD(8) is 0.20", Math.abs(estimateFalCostUSD(8) - 0.2) < 1e-9, `${estimateFalCostUSD(8)}`);

const noImg: ImageResolver = { async resolve() { throw new Error("none"); } };
function coverSlides(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    type: "cover",
    slots: { title: `Slide ${i}`, subtitle: "ok", "client-name": "ACME", date: "2026" },
    bgPrompt: "soft warm abstract gradient, out of focus",
  }));
}
const llm8: LLMClient = { async generateSlideTree() { return { slides: coverSlides(8) }; } };
const bg: BackgroundGenerator = { async generate() { return "data:image/jpeg;base64,AAAA"; } };

async function main() {
  const withFal = await generateDeck(
    { skillName: "consulting", userPrompt: "x", slideCount: 8, illustrative: true },
    { skillsRoot, llm: llm8, images: noImg, backgroundGenerator: bg },
  );
  check(
    "cost warning present and reports ~$0.20 for 8 FAL calls",
    withFal.warnings.some((w) => /\[cost\]/.test(w) && /\$0\.20/.test(w)),
    withFal.warnings.find((w) => /\[cost\]/.test(w)) ?? "(no cost warning)",
  );

  const noFal = await generateDeck(
    { skillName: "consulting", userPrompt: "x", slideCount: 8, illustrative: true },
    { skillsRoot, llm: llm8, images: noImg },
  );
  check(
    "no cost warning when zero FAL calls",
    !noFal.warnings.some((w) => /\[cost\]/.test(w)),
  );

  console.log(`\n${pass}/${pass + fail} fal-cost checks passed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
