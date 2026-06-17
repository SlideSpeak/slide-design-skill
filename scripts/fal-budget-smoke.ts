// Smoke-test the per-deck FAL-call ceiling (cost guard).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

function coverSlides(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    type: "cover",
    slots: { title: `Slide ${i}`, subtitle: "ok", "client-name": "ACME", date: "2026" },
    bgPrompt: "soft warm abstract gradient, out of focus",
  }));
}
const llmFor = (n: number): LLMClient => ({
  async generateSlideTree() {
    return { slides: coverSlides(n) };
  },
});
const noImg: ImageResolver = {
  async resolve() {
    throw new Error("none");
  },
};
function countingBg(): { gen: BackgroundGenerator; calls: () => number } {
  let calls = 0;
  return {
    gen: {
      async generate() {
        calls += 1;
        return "data:image/jpeg;base64,AAAA";
      },
    },
    calls: () => calls,
  };
}

async function main() {
  {
    const bg = countingBg();
    const r = await generateDeck(
      { skillName: "consulting", userPrompt: "x", slideCount: 8, illustrative: true },
      { skillsRoot, llm: llmFor(8), images: noImg, backgroundGenerator: bg.gen },
    );
    check(
      "all 8 cover slides survive validation (test assumption)",
      r.slides.length === 8,
      `slides=${r.slides.length}`,
    );
    check(
      "default ceiling does not throttle a normal 8-slide deck",
      bg.calls() === 8 && r.falCallsUsed === 8,
      `bgCalls=${bg.calls()} falCallsUsed=${r.falCallsUsed}`,
    );
    check(
      "no ceiling warning on a normal deck",
      !r.warnings.some((w) => /ceiling/i.test(w)),
    );
  }

  {
    const bg = countingBg();
    const r = await generateDeck(
      { skillName: "consulting", userPrompt: "x", slideCount: 8, illustrative: true, maxFalCalls: 3 },
      { skillsRoot, llm: llmFor(8), images: noImg, backgroundGenerator: bg.gen },
    );
    check(
      "ceiling caps background FAL calls to maxFalCalls",
      bg.calls() === 3 && r.falCallsUsed === 3,
      `bgCalls=${bg.calls()} falCallsUsed=${r.falCallsUsed}`,
    );
    check(
      "ceiling emits a warning",
      r.warnings.some((w) => /ceiling/i.test(w)),
    );
  }

  console.log(`\n${pass}/${pass + fail} fal-budget checks passed`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
