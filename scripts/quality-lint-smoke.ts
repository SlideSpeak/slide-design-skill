// Smoke-test the anti-slop quality linter (engine/quality-lint.ts).
// Each check exercises one rule plus its negative (no false positive).

import { lintSlideTree, type LintFinding } from "../engine/quality-lint.ts";
import { validateSlideTree } from "../engine/validate.ts";
import type { SlideTreeNode, Skill } from "../engine/types.ts";

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`OK  ${label}`);
    pass++;
  } else {
    console.log(`FAIL ${label}${detail ? " — " + detail : ""}`);
    fail++;
  }
}

function slide(type: string, slots: Record<string, string>, extra?: Partial<SlideTreeNode>): SlideTreeNode {
  return { type, slots, ...extra };
}

function has(findings: LintFinding[], rule: string): boolean {
  return findings.some((f) => f.rule === rule);
}
function rulesOn(findings: LintFinding[], slideIndex: number): string[] {
  return findings.filter((f) => f.slideIndex === slideIndex).map((f) => f.rule);
}

// 1. em-dash in visible text → error
{
  const { findings } = lintSlideTree([slide("statement", { headline: "We build — and we ship." })]);
  check("em-dash detected", has(findings, "em-dash"));
  check("em-dash severity is error", findings.some((f) => f.rule === "em-dash" && f.severity === "error"));
}

// 2. en-dash separator → flagged as em-dash rule
{
  const { findings } = lintSlideTree([slide("statement", { headline: "Revenue grew – fast." })]);
  check("en-dash detected", has(findings, "em-dash"));
}

// 3. clean hyphen → NOT flagged
{
  const { findings } = lintSlideTree([slide("statement", { headline: "A well-built product, 2018-2026." })]);
  check("plain hyphen not flagged", !has(findings, "em-dash"));
}

// 4. AI filler phrases → ai-phrase
{
  const { findings } = lintSlideTree([
    slide("body", { body: "We leverage seamless synergy to unlock next-gen growth." }),
  ]);
  check("ai-phrase detected", has(findings, "ai-phrase"));
}

// 5. real prose without filler → NOT flagged
{
  const { findings } = lintSlideTree([
    slide("body", { body: "Sales rose because the team shortened the onboarding flow." }),
  ]);
  check("clean prose no ai-phrase", !has(findings, "ai-phrase"));
}

// 6. placeholder names → placeholder-name
{
  const { findings } = lintSlideTree([
    slide("quote", { attribution: "John Doe, Acme Corp" }),
  ]);
  check("placeholder-name detected", has(findings, "placeholder-name"));
}

// 7. generic step labels → generic-step-label
{
  const { findings } = lintSlideTree([
    slide("process", { step1: "Phase 01", step2: "Stage 2: Install" }),
  ]);
  check("generic-step-label detected", has(findings, "generic-step-label"));
}

// 8. fake-precise number NOT in prompt → flagged
{
  const { findings } = lintSlideTree([slide("stat", { value: "73% faster" })]);
  check("fake-precise-number flagged", has(findings, "fake-precise-number"));
}

// 9. same number present in userPrompt → NOT flagged
{
  const { findings } = lintSlideTree([slide("stat", { value: "73% faster" })], {
    userPrompt: "Our benchmark shows 73% improvement",
  });
  check("number in prompt not flagged", !has(findings, "fake-precise-number"));
}

// 10. deck marked illustrative → no fake-number findings
{
  const { findings } = lintSlideTree([slide("stat", { value: "$12.4M ARR" })], { illustrative: true });
  check("illustrative deck skips fake-number", !has(findings, "fake-precise-number"));
}

// 11. eyebrow on most slides → eyebrow-overuse (deck-level, slideIndex -1)
{
  const slides = Array.from({ length: 9 }, (_, i) =>
    slide("section", { eyebrow: `Topic ${i}`, headline: `Head ${i}` }),
  );
  const { findings } = lintSlideTree(slides);
  check("eyebrow-overuse detected", has(findings, "eyebrow-overuse"));
}

// 12. eyebrow on few slides (<= ceil(n/3)) → NOT flagged
{
  const slides = Array.from({ length: 9 }, (_, i) =>
    slide("section", i < 2 ? { eyebrow: "Intro", headline: "H" } : { headline: "H" }),
  );
  const { findings } = lintSlideTree(slides);
  check("sparse eyebrows not flagged", !has(findings, "eyebrow-overuse"));
}

// 13. density monotony on a long deck → density-monotony
{
  const slides = Array.from({ length: 8 }, () =>
    slide("body", { body: "x" }, { density: "balanced" }),
  );
  const { findings } = lintSlideTree(slides);
  check("density-monotony detected", has(findings, "density-monotony"));
}

// 14. mixed density → NOT flagged
{
  const slides = [
    slide("cover", { h: "x" }, { density: "editorial" }),
    ...Array.from({ length: 6 }, () => slide("body", { body: "x" }, { density: "balanced" })),
    slide("stat", { v: "x" }, { density: "data-dense" }),
  ];
  const { findings } = lintSlideTree(slides);
  check("mixed density not flagged", !has(findings, "density-monotony"));
}

// 15. short deck (<= 6) never flags density-monotony
{
  const slides = Array.from({ length: 5 }, () => slide("body", { body: "x" }, { density: "balanced" }));
  const { findings } = lintSlideTree(slides);
  check("short deck no density-monotony", !has(findings, "density-monotony"));
}

// 16. only visible slots scanned — em-dash in bgPrompt is ignored
{
  const { findings } = lintSlideTree([
    slide("cover", { headline: "Clean headline" }, { bgPrompt: "moody photo — cinematic" }),
  ]);
  check("bgPrompt not scanned", !has(findings, "em-dash"));
}

// 17. fully clean deck → zero findings (no false positives)
{
  const slides = [
    slide("cover", { headline: "The makers who stayed small" }, { density: "editorial" }),
    slide("body", { body: "They kept the team to nine people for a decade." }, { density: "balanced" }),
    slide("quote", { attribution: "Mara Vance, Northwind" }, { density: "balanced" }),
  ];
  const { findings } = lintSlideTree(slides, { userPrompt: "story about a small maker studio" });
  check("clean deck zero findings", findings.length === 0, `got ${JSON.stringify(findings)}`);
}

// 18. findings carry slideIndex + slot
{
  const { findings } = lintSlideTree([slide("statement", { headline: "ship — fast" })]);
  const f = findings.find((x) => x.rule === "em-dash");
  check("finding has slideIndex 0", !!f && f.slideIndex === 0);
  check("finding has slot name", !!f && f.slot === "headline");
}

// 19. validateSlideTree surfaces lint findings as warnings (non-strict, non-blocking)
{
  const skill = {
    grammar: { slideTypes: [{ name: "statement", requiredSlots: [], optionalSlots: [] }], rules: [] },
  } as unknown as Skill;
  const raw = { slides: [{ type: "statement", slots: { headline: "We build — and ship." } }] };
  const result = validateSlideTree(raw, skill, 1, { userPrompt: "make a deck" });
  check("validate surfaces em-dash as warning", result.warnings.some((w) => /em-dash/i.test(w)));
  check("validate stays ok in non-strict", result.ok === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
