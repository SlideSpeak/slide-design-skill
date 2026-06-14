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

// Diagnostic-only mirror of the image-subject-monotony score, used to PRINT the
// similarity number in the ground-truth case. The pass/fail VERDICT comes from
// the real lintSlideTree; this only reproduces the headline metrics for the log.
// (Stoplist intentionally trimmed to the words these two ground-truth sets use.)
const DIAG_STOPLIST = new Set<string>([
  "chrome", "metal", "mercury", "aluminium", "liquid", "poured", "brushed",
  "polished", "mirror", "near", "black", "void", "deep", "tight", "macro",
  "close", "form", "ribbon", "sphere", "curve", "column", "folding", "folded",
  "splitting", "rising", "curving", "climbing", "receding", "standing",
  "sweeping", "ascending", "sculptural", "industrial", "single", "vast",
  "the", "and", "into", "with", "out", "left", "right", "upper", "lower",
  "corner", "like", "tall", "vertical", "detail", "edge", "blocks",
]);
function diagSubjectTokens(p: string): Set<string> {
  const out = new Set<string>();
  for (const raw of p.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/))
    for (const atom of raw.split("-")) {
      if (atom.length < 3 || DIAG_STOPLIST.has(atom)) continue;
      out.add(atom);
    }
  return out;
}
function describeSubjectMonotony(prompts: string[]): string {
  const sets = prompts.map(diagSubjectTokens);
  let sum = 0, pairs = 0;
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i], b = sets[j];
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      const uni = a.size + b.size - inter;
      sum += uni === 0 ? (a.size === 0 ? 1 : 0) : inter / uni;
      pairs++;
    }
  const avg = pairs ? sum / pairs : 0;
  const all = new Set<string>();
  for (const s of sets) for (const x of s) all.add(x);
  return `avg Jaccard=${avg.toFixed(3)}, subject richness=${(all.size / prompts.length).toFixed(2)}/img`;
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

// 12b. running section kicker (same few values repeating) → NOT flagged
{
  const sections = ["The market", "The options", "The plan"];
  const slides = Array.from({ length: 9 }, (_, i) =>
    slide("section", { kicker: sections[Math.floor(i / 3)], headline: `Head ${i}` }),
  );
  const { findings } = lintSlideTree(slides);
  check("running section kicker not flagged", !has(findings, "eyebrow-overuse"));
}

// 12c. data-dense slide with thin content → thin-dense-slide
{
  const { findings } = lintSlideTree([
    { type: "grid", density: "data-dense", slots: { "action-title": "Four areas matter most for the rollout", "a": "Speed", "b": "Cost", "c": "Risk", "d": "Control" } },
  ] as never);
  check("thin data-dense slide flagged", has(findings, "thin-dense-slide"));
}

// 12d. data-dense slide with real volume → NOT flagged
{
  const cells = Array.from({ length: 8 }, (_, r) => Array.from({ length: 6 }, (_, c) => `${r * c + 4}`).join(" / ")).join(" || ");
  const { findings } = lintSlideTree([
    { type: "table", density: "data-dense", slots: { "action-title": "The options differ on capital, speed and control across all six criteria", "rows": "Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta", "cols": "Capex|Speed|Margin|Control|Risk|Fit", "cells": cells, "insight": "The middle options dominate on every criterion that the board weighted highly in the spring review", "source": "Team analysis" } },
  ] as never);
  check("full data-dense slide not flagged", !has(findings, "thin-dense-slide"));
}

// 12e. parallel chart-data slot families (ex#-labels, ex#-unit-line) → NOT uniform-bullets
{
  const { findings } = lintSlideTree([
    { type: "chart-trio", density: "data-dense", slots: {
      "action-title": "The case is self-funding from 2030 across all three views of the build",
      "ex1-title": "Revenue and cost", "ex1-unit-line": "EUR millions per year", "ex1-data": "1 2 3", "ex1-labels": "26|27|28",
      "ex2-title": "EBITDA per year", "ex2-unit-line": "EUR millions", "ex2-data": "1 2 3", "ex2-labels": "26|27|28",
      "ex3-title": "Cumulative cash", "ex3-unit-line": "EUR millions, since 2026", "ex3-data": "1 2 3", "ex3-labels": "26|27|28",
      "source": "Team analysis",
    } },
  ] as never);
  check("chart data slot families not uniform-bullets", !has(findings, "uniform-bullets"));
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

// 20. topic-label headline flagged; assertion headline passes
{
  const { findings } = lintSlideTree([
    slide("a", { headline: "Key benefits" }),
    slide("b", { "action-title": "Our team" }),
    slide("c", { headline: "The first two weeks decide the brand relationship." }),
    slide("d", { headline: "Returns drop when sizing is guesswork" }),
  ]);
  const flagged = findings.filter((f) => f.rule === "topic-label-headline");
  check("topic labels flagged", flagged.length === 2, JSON.stringify(flagged));
  check("assertion headlines pass", !flagged.some((f) => f.slideIndex >= 2), JSON.stringify(flagged));
}

// 21. uniform bullets: 3+ items opening with the same word
{
  const { findings } = lintSlideTree([
    slide("plan", {
      "item-1": "Improve visibility across plants",
      "item-2": "Improve supplier response times",
      "item-3": "Improve reporting cadence",
    }),
    slide("varied", {
      "item-1": "Returns drop 18% in the pilot",
      "item-2": "One shared catalogue replaces eleven",
      "item-3": "Plant managers see the same numbers",
    }),
  ]);
  const flagged = findings.filter((f) => f.rule === "uniform-bullets");
  check("uniform bullets flagged", flagged.length === 1 && flagged[0].slideIndex === 0, JSON.stringify(flagged));
}

// 22. body restating the title flagged; additive body passes
{
  const { findings } = lintSlideTree([
    slide("a", {
      headline: "Quiet cabins are composed for genuine rest",
      body: "The cabins are quiet and composed so guests genuinely rest.",
    }),
    slide("b", {
      headline: "Quiet cabins are composed for genuine rest",
      body: "Triple-glazed windows and decoupled bogies cut interior noise to 24 dB at speed.",
    }),
  ]);
  const flagged = findings.filter((f) => f.rule === "body-restates-title");
  check("restating body flagged", flagged.length === 1 && flagged[0].slideIndex === 0, JSON.stringify(flagged));
}

// 23. generic closing flagged; concrete ask passes
{
  const generic = lintSlideTree([slide("cover", { headline: "x is y" }), slide("closing", { "call-to-action": "Thank you" })]);
  const concrete = lintSlideTree([slide("cover", { headline: "x is y" }), slide("closing", { "call-to-action": "Approve the pilot for Q3" })]);
  check("generic closing flagged", has(generic.findings, "generic-closing"));
  check("concrete ask passes", !has(concrete.findings, "generic-closing"));
}

// 24. numbered eyebrow flagged; plain eyebrow and non-eyebrow numbers pass
{
  const { findings } = lintSlideTree([
    slide("a", { eyebrow: "06 · How it works" }),
    slide("b", { eyebrow: "001 / Capabilities" }),
    slide("c", { eyebrow: "Why this window matters" }),
    slide("d", { body: "Phase 2 starts in 06/2027 · Berlin" }),
  ]);
  const flagged = findings.filter((f) => f.rule === "numbered-eyebrow");
  check("numbered eyebrows flagged", flagged.length === 2, JSON.stringify(flagged));
  check("plain eyebrow + body numbers pass", !flagged.some((f) => f.slideIndex >= 2), JSON.stringify(flagged));
}

// 25. poetic labels flagged; plain labels pass
{
  const { findings } = lintSlideTree([
    slide("a", { label: "Field notes" }),
    slide("b", { eyebrow: "Quietly in use at" }),
    slide("c", { label: "Testimonials" }),
  ]);
  const flagged = findings.filter((f) => f.rule === "poetic-label");
  check("poetic labels flagged", flagged.length === 2 && !flagged.some((f) => f.slideIndex === 2), JSON.stringify(flagged));
}

// 26. image-subject-monotony: bgPrompts that rework one motif → warn
{
  const motif = [
    slide("cover", { headline: "A" }, { bgPrompt: "A poured-mercury industrial arm folding into a chrome ribbon, brushed aluminium on a near-black void" }),
    slide("bleed", { headline: "B" }, { bgPrompt: "A tight detail of a folded chrome ribbon and a brushed-aluminium edge, poured liquid metal" }),
    slide("bleed", { headline: "C" }, { bgPrompt: "A poured-mercury sphere splitting into a rising chrome curve, brushed aluminium, near-black void" }),
  ];
  const { findings } = lintSlideTree(motif);
  check("repeated-motif bgPrompts flagged", has(findings, "image-subject-monotony"));
  check("image-subject-monotony is warn + deck-level", findings.some((f) => f.rule === "image-subject-monotony" && f.severity === "warn" && f.slideIndex === -1));
}

// 27. image-subject-monotony: distinct subjects, one language → pass
{
  const distinct = [
    slide("cover", { headline: "A" }, { bgPrompt: "A sweeping liquid-chrome robotic arm curving down from the upper right corner" }),
    slide("bleed", { headline: "B" }, { bgPrompt: "A single chrome industrial robot gripper hand in tight macro close-up" }),
    slide("bleed", { headline: "C" }, { bgPrompt: "An ascending staircase of polished mirror-chrome blocks like a rising bar chart" }),
    slide("bleed", { headline: "D" }, { bgPrompt: "A vast receding array of identical tall mirror-chrome monoliths standing in formation" }),
  ];
  const { findings } = lintSlideTree(distinct);
  check("distinct-subject bgPrompts pass", !has(findings, "image-subject-monotony"));
}

// 28. image-subject-monotony: only one bgPrompt → never fires (nothing to compare)
{
  const { findings } = lintSlideTree([
    slide("cover", { headline: "A" }, { bgPrompt: "A chrome robot arm on a near-black void" }),
    slide("body", { body: "no background here" }),
  ]);
  check("single bgPrompt deck not flagged", !has(findings, "image-subject-monotony"));
}

// 29. image-subject-monotony: data:/url: bgPrompt values are skipped, not compared
{
  const { findings } = lintSlideTree([
    slide("cover", { headline: "A" }, { bgPrompt: "data:image/png;base64,AAAA" }),
    slide("bleed", { headline: "B" }, { bgPrompt: "url:https://example.com/a.png" }),
    slide("bleed", { headline: "C" }, { bgPrompt: "A chrome ribbon on a near-black void" }),
  ]);
  // Only one real (non-data/url) prompt remains → nothing to compare → no finding.
  check("data/url bgPrompts skipped", !has(findings, "image-subject-monotony"));
}

// 30. GROUND-TRUTH VALIDATION: the proof this attacks the cause. Run the rule
// on the 4 ORIGINAL (samey) prompts and the 4 DISTINCT prompts, print the
// similarity score + verdict for each, and assert OLD warns / NEW passes.
{
  const OLD_PROMPTS = [
    "A single liquid-metal sculptural form, a poured-mercury industrial arm folding into a chrome ribbon, brushed aluminium and polished chrome on a deep near-black void",
    "A tight detail of a folded chrome ribbon and a brushed-aluminium edge, poured liquid metal",
    "A poured-mercury sphere splitting into a rising chrome curve, brushed aluminium, deep near-black void",
    "A vertical column of liquid chrome rising out of a near-black void, brushed aluminium and mercury",
  ];
  const NEW_PROMPTS = [
    "A sweeping liquid-chrome robotic arm curving down from the upper right corner",
    "A single chrome industrial robot gripper hand in tight macro close-up",
    "An ascending staircase of polished mirror-chrome blocks climbing left to right like a rising bar chart",
    "A vast receding array of identical tall mirror-chrome monoliths standing in formation",
  ];
  const toDeck = (prompts: string[]) =>
    prompts.map((p, i) => slide(i === 0 ? "cover" : "bleed", { headline: `S${i}` }, { bgPrompt: p }));

  const oldFlagged = has(lintSlideTree(toDeck(OLD_PROMPTS)).findings, "image-subject-monotony");
  const newFlagged = has(lintSlideTree(toDeck(NEW_PROMPTS)).findings, "image-subject-monotony");

  console.log(`\n--- ground-truth: ${describeSubjectMonotony(OLD_PROMPTS)} -> ${oldFlagged ? "WARN" : "PASS"} (OLD, want WARN)`);
  console.log(`--- ground-truth: ${describeSubjectMonotony(NEW_PROMPTS)} -> ${newFlagged ? "WARN" : "PASS"} (NEW, want PASS)\n`);

  check("ground-truth OLD 4 (samey) warns", oldFlagged);
  check("ground-truth NEW 4 (distinct) passes", !newFlagged);
}

// 31. orphan-char: a single-letter cell (split "n/a") flagged; "n/a" passes
{
  const f = lintSlideTree([slide("table", { "col-today": "n", "col-scale": "a", headline: "Unit economics" })]).findings;
  check("orphan-char flags split cell", has(f, "orphan-char"), JSON.stringify(rulesOn(f, 0)));
  const ok = lintSlideTree([slide("table", { "col-today": "n/a", "col-scale": "12mo" })]).findings;
  check("orphan-char no false positive on n/a", !has(ok, "orphan-char"));
}

// 32. named-expert: titled fictional expert flagged; role-only passes
{
  const f = lintSlideTree([slide("quote", { body: "Dr. Ines Kollberg, Coastal Research Station" })]).findings;
  check("named-expert flags Dr. Name", has(f, "named-expert"));
  const ok = lintSlideTree([slide("quote", { body: "A marine ecologist who studies the coast" })]).findings;
  check("named-expert no false positive on role-only", !has(ok, "named-expert"));
}

// 33. mixed-currency: a stray £ in a EUR deck flagged; single currency passes
{
  const deck = [
    slide("stat", { headline: "EUR 210m revenue", body: "up from EUR 80m and EUR 140m" }),
    slide("chart", { caption: "EUR 40 per unit", note: "the 2024 forecast is £40" }),
  ];
  check("mixed-currency flags the stray glyph", has(lintSlideTree(deck).findings, "mixed-currency"));
  const ok = lintSlideTree([slide("stat", { a: "EUR 10", b: "EUR 20", c: "EUR 30", d: "EUR 40" })]).findings;
  check("mixed-currency no false positive single currency", !has(ok, "mixed-currency"));
}

// 34. A25: chart/table-driven dense slide not thin; prose-thin dense still flagged
{
  const exhibit = lintSlideTree([slide("chart", { "ex1-data": "40|55|62|71|80|88|96|104|119|130", "ex1-labels": "a|b|c|d|e|f|g|h|i|j", headline: "Growth" }, { density: "data-dense" })]).findings;
  check("A25: chart-driven dense slide not flagged thin", !has(exhibit, "thin-dense-slide"), JSON.stringify(exhibit));
  const thin = lintSlideTree([slide("statement", { headline: "Big idea", body: "Three words only" }, { density: "data-dense" })]).findings;
  check("A25: prose-thin dense slide still flagged", has(thin, "thin-dense-slide"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
