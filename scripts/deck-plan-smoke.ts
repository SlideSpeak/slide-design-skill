// Smoke-test the deck planner (engine/deck-plan.ts).
// The planner derives a brief-grounded design read + density rhythm and renders
// the DECK PLAN prompt block. Each check exercises one inference plus a guard
// against the obvious wrong answer.

import { planDeck, deckPlanPromptBlock } from "../engine/deck-plan.ts";
import { composeSystemPrompt } from "../engine/prompt-composer.ts";
import type { Skill } from "../engine/types.ts";

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

function skillStub(overrides?: Partial<Skill>): Skill {
  return {
    frontmatter: {
      name: "neutral",
      version: "0.1.0",
      description: "a clean neutral look",
      inspiration: "swiss editorial",
      typography_kit: "Inter",
      color_kit: "ink on paper",
      image_style: "photographic",
      forbidden: "clipart",
    },
    systemPromptBody: "",
    tokens: {} as Skill["tokens"],
    grammar: {
      slideTypes: [
        { name: "cover", when: "first", requiredSlots: ["headline"], optionalSlots: [], family: "cover" },
        { name: "section", when: "opener", requiredSlots: ["headline"], optionalSlots: [], family: "statement" },
        { name: "body", when: "content", requiredSlots: ["body"], optionalSlots: [], family: "prose" },
        { name: "grid", when: "items", requiredSlots: ["items"], optionalSlots: [], family: "grid" },
        { name: "closing", when: "last", requiredSlots: ["headline"], optionalSlots: [], family: "closing" },
      ],
      rules: [],
    },
    imageStyle: {
      aiPromptTemplate: "{subject}",
      aiStyleModifiers: [],
      aiNegativePrompt: [],
      stockQueryTemplate: "{subject}",
      stockStyleModifiers: [],
      decisionRules: {},
    },
    components: "",
    chrome: "",
    examples: [],
    rootDir: "/tmp/neutral",
    cachedGradients: {},
    ...overrides,
  } as Skill;
}

const skill = skillStub();

// 1. pitch inferred from a fundraising brief
{
  const p = planDeck({ userPrompt: "Pitch deck to raise our seed round from investors", slideCount: 10, skill });
  check("pitch type inferred", p.read.presentationType === "pitch", p.read.presentationType);
}

// 2. report inferred from a results/analysis brief
{
  const p = planDeck({ userPrompt: "Quarterly results: analysis of our Q3 findings", slideCount: 10, skill });
  check("report type inferred", p.read.presentationType === "report", p.read.presentationType);
}

// 3. teaching inferred from a training brief
{
  const p = planDeck({ userPrompt: "Onboarding training workshop for new engineers", slideCount: 10, skill });
  check("teaching type inferred", p.read.presentationType === "teaching", p.read.presentationType);
}

// 4. editorial inferred from a brand-story brief
{
  const p = planDeck({ userPrompt: "A brand story essay: the makers who stayed small", slideCount: 10, skill });
  check("editorial type inferred", p.read.presentationType === "editorial", p.read.presentationType);
}

// 5. no signal → general
{
  const p = planDeck({ userPrompt: "Slides about our project", slideCount: 8, skill: skillStub({
    frontmatter: { ...skill.frontmatter, name: "x", description: "x", inspiration: "x" },
  }) });
  check("general fallback", p.read.presentationType === "general", p.read.presentationType);
}

// 6. executive audience inferred
{
  const p = planDeck({ userPrompt: "Strategy update for the board and leadership", slideCount: 10, skill });
  check("executive audience inferred", p.read.audience === "executive", p.read.audience);
}

// 7. academic audience inferred
{
  const p = planDeck({ userPrompt: "Research findings for the conference, peer review", slideCount: 10, skill });
  check("academic audience inferred", p.read.audience === "academic", p.read.audience);
}

// 8. register: pitch → punchy
{
  const p = planDeck({ userPrompt: "Investor pitch to raise a seed round", slideCount: 10, skill });
  check("pitch register punchy", p.read.register === "punchy", p.read.register);
}

// 9. register: report/executive → formal
{
  const p = planDeck({ userPrompt: "Quarterly results analysis for the board", slideCount: 10, skill });
  check("report register formal", p.read.register === "formal", p.read.register);
}

// 10. asset appetite: editorial → image-led
{
  const p = planDeck({ userPrompt: "A brand story essay about staying small", slideCount: 10, skill });
  check("editorial appetite image-led", p.read.assetAppetite === "image-led", p.read.assetAppetite);
}

// 11. asset appetite: report → data-led
{
  const p = planDeck({ userPrompt: "Quarterly results analysis with the numbers", slideCount: 10, skill });
  check("report appetite data-led", p.read.assetAppetite === "data-led", p.read.assetAppetite);
}

// 12. density rhythm length === slideCount
{
  const p = planDeck({ userPrompt: "anything", slideCount: 9, skill });
  check("rhythm length matches count", p.densityRhythm.length === 9, `${p.densityRhythm.length}`);
}

// 13. rhythm starts and ends editorial (cover + closing breathe)
{
  const p = planDeck({ userPrompt: "anything", slideCount: 9, skill });
  check("rhythm bookends editorial",
    p.densityRhythm[0] === "editorial" && p.densityRhythm[8] === "editorial",
    p.densityRhythm.join(","));
}

// 14. rhythm is never monotone for a real deck (passes the density-monotony lint)
{
  const p = planDeck({ userPrompt: "anything", slideCount: 9, skill });
  check("rhythm not monotone", new Set(p.densityRhythm).size >= 2, p.densityRhythm.join(","));
}

// 15. data-led rhythm includes data-dense
{
  const p = planDeck({ userPrompt: "Quarterly results analysis with the numbers", slideCount: 9, skill });
  check("data-led rhythm has data-dense", p.densityRhythm.includes("data-dense"), p.densityRhythm.join(","));
}

// 16. image-led rhythm leans editorial in the middle
{
  const p = planDeck({ userPrompt: "A brand story essay about staying small", slideCount: 9, skill });
  const middle = p.densityRhythm.slice(1, -1);
  check("image-led rhythm has editorial in middle", middle.includes("editorial"), p.densityRhythm.join(","));
}

// 17. short deck (count 2) stays valid
{
  const p = planDeck({ userPrompt: "anything", slideCount: 2, skill });
  check("count-2 rhythm length", p.densityRhythm.length === 2);
  check("count-2 rhythm editorial", p.densityRhythm.every((t) => t === "editorial"));
}

// 18. count-1 deck
{
  const p = planDeck({ userPrompt: "anything", slideCount: 1, skill });
  check("count-1 rhythm", p.densityRhythm.length === 1 && p.densityRhythm[0] === "editorial");
}

// 19. prompt block carries the read + rhythm
{
  const p = planDeck({ userPrompt: "Investor pitch to raise a seed round", slideCount: 8, skill });
  const block = deckPlanPromptBlock(p);
  check("block has DECK PLAN header", /DECK PLAN/.test(block));
  check("block names presentation type", /pitch/i.test(block));
  check("block names register", /punchy/i.test(block));
  check("block lists a density rhythm", /editorial/i.test(block) && /density/i.test(block));
}

// 20. composeSystemPrompt injects the plan before the slide types
{
  const out = composeSystemPrompt(skill, {
    userPrompt: "Investor pitch to raise a seed round",
    slideCount: 8,
    language: "en",
  });
  const planIdx = out.indexOf("DECK PLAN");
  const typesIdx = out.indexOf("SLIDE TYPES YOU MAY USE");
  check("compose includes DECK PLAN", planIdx >= 0);
  check("DECK PLAN precedes SLIDE TYPES", planIdx >= 0 && typesIdx >= 0 && planIdx < typesIdx);
}

// 21. editorial genre signals: a photo-led impact/progress report reads editorial,
// not report — the multi-word phrase outweighs the bare "report" hit
{
  const p = planDeck({ userPrompt: "Photo-led impact report 2025 for an ocean nonprofit", slideCount: 12, skill });
  check("impact report reads editorial", p.read.presentationType === "editorial", p.read.presentationType);
  const q = planDeck({ userPrompt: "Quarterly results: analysis of our Q3 findings", slideCount: 10, skill });
  check("plain results brief still reads report", q.read.presentationType === "report", q.read.presentationType);
}

// 22. editorial decks get the editorial contract injected; others do not
{
  const ed = composeSystemPrompt(skill, {
    userPrompt: "Photo-led impact report 2025 for an ocean nonprofit",
    slideCount: 12,
    language: "en",
  });
  check("editorial contract injected", /EDITORIAL CONTRACT/.test(ed));
  check("editorial arc is the chapter loop", /chapter loop/i.test(ed));
  check("contract carries the photo pacing law", /40% of slides carry a photograph/.test(ed));
  const pitch = composeSystemPrompt(skill, {
    userPrompt: "Investor pitch to raise a seed round",
    slideCount: 8,
    language: "en",
  });
  check("no editorial contract on a pitch", !/EDITORIAL CONTRACT/.test(pitch));
  check("pitch contract injected", /PITCH CONTRACT/.test(pitch));
  check("pitch contract carries the statement law", /THE HEADLINE IS THE WHOLE SLIDE/.test(pitch));
  check("pitch contract spends the accent on the money", /spent on the money/i.test(pitch));
  check("no pitch contract on an editorial deck", !/PITCH CONTRACT/.test(ed));
}

// variance dial: explicit signals win, then type beats audience, report defaults conservative
{
  const exp = planDeck({ userPrompt: "A bold, playful launch keynote", slideCount: 10, skill });
  check("explicit/keynote variance experimental", exp.read.variance === "experimental", exp.read.variance);
  const cons = planDeck({ userPrompt: "Quarterly results analysis for the board", slideCount: 10, skill });
  check("report variance conservative", cons.read.variance === "conservative", cons.read.variance);
  const pitch = planDeck({ userPrompt: "Investor pitch to raise a seed round", slideCount: 10, skill });
  check("pitch variance confident (type beats executive audience)", pitch.read.variance === "confident", pitch.read.variance);
  const block = deckPlanPromptBlock(pitch);
  check("block names variance", /design variance/i.test(block) && /confident/i.test(block));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
