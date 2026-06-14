// Deck planner — the brief-grounded planning layer.
//
// The #1 reason decks read as machine-made is that every deck's prompt is the
// same shape: same slide-type list, same generic "vary it" instruction. Only the
// token palette changes. This module reads the brief and derives an EXPLICIT,
// per-deck design read + density rhythm, injected into the system prompt before
// the slide types. Two decks now differ in their marching orders, not just color.
//
// Deterministic and pure. The read is keyword-inferred from the user prompt and
// the skill's own frontmatter — a heuristic, honestly labelled, with a "general"
// fallback when no signal is present. No LLM call, no I/O.

import type { Skill } from "./types.ts";
import type { DensityTier } from "./density.ts";

export type PresentationType =
  | "pitch"
  | "report"
  | "teaching"
  | "editorial"
  | "keynote"
  | "general";

export type Audience = "executive" | "academic" | "customer" | "team" | "general";

export type CopyRegister = "formal" | "punchy" | "warm" | "technical" | "plain";

export type AssetAppetite = "image-led" | "balanced" | "data-led";

/**
 * How much layout experimentation the deck may take. The taste-skill lesson:
 * an explicit variance dial set from the brief beats one implicit default.
 * Conservative briefs get disciplined symmetry; expressive briefs EARN
 * asymmetry, overlap and scale jumps instead of defaulting to safe grids.
 */
export type DesignVariance = "conservative" | "confident" | "experimental";

export interface DesignRead {
  presentationType: PresentationType;
  audience: Audience;
  register: CopyRegister;
  assetAppetite: AssetAppetite;
  variance: DesignVariance;
}

export interface DeckPlan {
  read: DesignRead;
  /** One density tier per slide position, length === slideCount. */
  densityRhythm: DensityTier[];
  rationale: string;
}

// Keyword signals per presentation type. Word-boundary, case-insensitive.
const TYPE_SIGNALS: Record<Exclude<PresentationType, "general">, string[]> = {
  pitch: ["pitch", "raise", "investor", "fundrais", "seed round", "series a", "series b", "vc", "venture", "cap table", "valuation"],
  report: ["report", "results", "findings", "analysis", "quarterly", "annual review", "earnings", "kpi", "metrics review", "audit", "study", "consulting", "strategy", "due diligence", "business case", "market entry", "market sizing", "cost reduction", "operating model", "deep dive", "diagnostic", "benchmark", "data-dense", "dense data"],
  teaching: ["training", "workshop", "onboarding", "lesson", "course", "tutorial", "curriculum", "teach", "lecture", "how to"],
  editorial: ["story", "essay", "editorial", "magazine", "manifesto", "narrative", "brand story", "feature piece", "impact report", "progress report", "photo-led", "photo-driven", "photo essay", "documentary", "lookbook"],
  keynote: ["keynote", "launch", "announce", "unveil", "vision", "reveal", "product launch", "ted talk", "mainstage", "main stage", "stage talk", "commencement address", "on stage"],
};

const AUDIENCE_SIGNALS: Record<Exclude<Audience, "general">, string[]> = {
  executive: ["board", "investor", "executive", "c-level", "ceo", "cfo", "leadership", "stakeholder", "shareholder"],
  academic: ["research", "academic", "conference", "peer review", "university", "scholar", "thesis", "scientific", "journal"],
  customer: ["customer", "client", "prospect", "buyer", "user", "sales", "demo for"],
  team: ["team", "internal", "staff", "employee", "all-hands", "all hands", "colleagues", "department"],
};

function hits(haystack: string, needles: string[]): number {
  let n = 0;
  for (const needle of needles) {
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(needle.toLowerCase())}(?:[^a-z0-9]|$)`, "i");
    // A multi-word phrase is a more specific signal than a single word, and it
    // often CONTAINS a competing single-word signal ("impact report" carries
    // "report") — weight phrases double so the specific reading wins the tie.
    if (re.test(haystack)) n += needle.includes(" ") ? 2 : 1;
  }
  return n;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inferPresentationType(text: string): PresentationType {
  let best: PresentationType = "general";
  let bestScore = 0;
  for (const [type, signals] of Object.entries(TYPE_SIGNALS) as [Exclude<PresentationType, "general">, string[]][]) {
    const score = hits(text, signals);
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }
  return best;
}

function inferAudience(text: string): Audience {
  let best: Audience = "general";
  let bestScore = 0;
  for (const [aud, signals] of Object.entries(AUDIENCE_SIGNALS) as [Exclude<Audience, "general">, string[]][]) {
    const score = hits(text, signals);
    if (score > bestScore) {
      bestScore = score;
      best = aud;
    }
  }
  return best;
}

function deriveRegister(type: PresentationType, audience: Audience): CopyRegister {
  // The presentation type wins over the audience: an investor pitch is punchy
  // even though investors read as an executive audience.
  if (type === "pitch" || type === "keynote") return "punchy";
  if (audience === "academic" || type === "teaching") return "technical";
  if (audience === "executive" || type === "report") return "formal";
  if (type === "editorial") return "warm";
  return "plain";
}

// Words in the brief that explicitly push the dial in either direction.
const EXPERIMENTAL_SIGNALS = ["bold", "experimental", "playful", "edgy", "daring", "unconventional", "wild", "expressive", "avant"];
const CONSERVATIVE_SIGNALS = ["corporate", "formal", "conservative", "traditional", "regulatory", "compliance", "board-ready", "sober"];

function deriveVariance(text: string, type: PresentationType, audience: Audience): DesignVariance {
  if (hits(text, EXPERIMENTAL_SIGNALS) > 0) return "experimental";
  if (hits(text, CONSERVATIVE_SIGNALS) > 0) return "conservative";
  // The presentation type wins over the audience: a pitch stays confident even
  // though investors read as an executive audience (same rule as the register).
  if (type === "editorial" || type === "keynote") return "experimental";
  if (type === "pitch") return "confident";
  if (type === "report" || audience === "executive" || audience === "academic") return "conservative";
  return "confident";
}

function deriveAppetite(type: PresentationType, skill: Skill): AssetAppetite {
  if (type === "editorial" || type === "keynote") return "image-led";
  if (type === "report") return "data-led";
  // teaching is data-LIGHT: it teaches with labelled diagrams, specimens and
  // worked examples, not chart density. Balanced (visuals share the layout with
  // structured content) fits the measured register far better than data-led,
  // which would push charts/tables and suppress the explanatory diagram layer.
  if (type === "teaching") return "balanced";
  const treatment = (skill.imageStyle.treatment ?? "").toLowerCase();
  if (treatment && treatment !== "photographic") return "balanced";
  return "balanced";
}

// Density cycles for the deck's interior, ordered so the FIRST interior slide is
// never editorial — that keeps a short deck off a single tier and gives each
// appetite a recognizable rhythm. Endpoints are always editorial (cover/closing).
const INTERIOR_CYCLE: Record<AssetAppetite, DensityTier[]> = {
  "image-led": ["balanced", "editorial", "data-dense", "editorial"],
  "data-led": ["data-dense", "balanced", "data-dense", "editorial"],
  "balanced": ["balanced", "data-dense", "editorial", "balanced"],
};

function buildDensityRhythm(count: number, appetite: AssetAppetite): DensityTier[] {
  if (count <= 0) return [];
  if (count <= 2) return Array.from({ length: count }, () => "editorial" as DensityTier);
  const cycle = INTERIOR_CYCLE[appetite];
  const rhythm: DensityTier[] = ["editorial"];
  for (let i = 0; i < count - 2; i++) rhythm.push(cycle[i % cycle.length]);
  rhythm.push("editorial");
  return rhythm;
}

export function planDeck(args: {
  userPrompt: string;
  slideCount: number;
  skill: Skill;
}): DeckPlan {
  const { userPrompt, slideCount, skill } = args;
  const fm = skill.frontmatter;
  const text = ` ${userPrompt} ${fm.name} ${fm.description} ${fm.inspiration} `.toLowerCase();

  const presentationType = inferPresentationType(text);
  const audience = inferAudience(text);
  const register = deriveRegister(presentationType, audience);
  const assetAppetite = deriveAppetite(presentationType, skill);
  const variance = deriveVariance(text, presentationType, audience);
  const densityRhythm = buildDensityRhythm(slideCount, assetAppetite);

  const read: DesignRead = { presentationType, audience, register, assetAppetite, variance };
  const rationale =
    `Read as a ${presentationType} for a ${audience} audience; ` +
    `${register} copy register, ${assetAppetite} asset appetite, ${variance} design variance.`;

  return { read, densityRhythm, rationale };
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

const REGISTER_GUIDANCE: Record<CopyRegister, string> = {
  formal:
    "measured, precise, evidence-first. Lead bullets with the number, date or fact; ban intensifiers (very, significant, strong, robust); say 'drops 18%' never 'improves substantially'.",
  punchy:
    "short, confident lines, 12 words or fewer; one idea per slide; verbs over adjectives; cut every qualifier (really, quite, key, comprehensive).",
  technical:
    "exact terms, acronyms defined at first use, numbers carry units; no marketing adjectives, the spec is the persuasion.",
  warm:
    "human and concrete: people do things (no passive voice), sensory specifics over abstraction, short sentences that sound spoken.",
  plain: "clear and direct; plain words, no filler, no jargon; say the thing.",
};

// The slide-sequence shape per presentation type. Injected so the deck has a
// PLOT, not just varied layouts: without it a deck can be four problem slides
// then four solution slides and still pass every structural gate.
const ARC_GUIDANCE: Record<PresentationType, string> = {
  pitch: "problem → why now → solution → proof it works → business/economics → the ask",
  report: "answer first (the conclusion up front) → evidence → implications → recommended next steps",
  teaching: "why this matters → core concept → worked example → practice/application → recap",
  editorial: "front matter (cover → opening statement → chapter TOC) → then ONE fixed chapter loop repeated verbatim per chapter (photo opener → lede beat → dense support plates → proof beat: quote or human story → breather) → notes/closing. The loop's repetition IS the system; never invent a new structure per chapter",
  keynote: "status quo → the shift underway → vision → what we built → proof → call to action",
  general: "opening claim → why it matters now → the core idea → support → action",
};

const VARIANCE_GUIDANCE: Record<DesignVariance, string> = {
  conservative:
    "disciplined symmetry. Aligned grids, predictable spacing, restraint as the craft signal. No overlap, no rotation, no scale stunts; the polish lives in rhythm and table/chart precision.",
  confident:
    "controlled asymmetry. Left-anchored headlines, off-center exhibits, one deliberate scale jump per few slides, mixed column widths beyond 50/50. Earn each move; never three safe symmetric slides in a row.",
  experimental:
    "expressive layouts. Asymmetric compositions, elements sharing planes with imagery, dramatic scale contrast, generous deliberate negative space. Still bounded by the occupancy gate; expressive is not empty.",
};

const APPETITE_GUIDANCE: Record<AssetAppetite, string> = {
  "image-led":
    "let pictures carry slides — full-bleed spreads AND integrated visuals. At least a third of content slides should carry imagery, and not only as bleeds: put a photo column beside an argument, inset a figure into a structured layout, set a stat over an image. Bleed ↔ text-grid alternation alone reads as two slides repeated.",
  "data-led":
    "lean on real charts, tables and structured exhibits; every key claim that has data behind it gets a chart or table, not a bullet list. Minimize decorative imagery.",
  "balanced":
    "mix supporting imagery with structured layouts as the content dictates; include at least one slide where a visual shares the layout with structured content.",
};

export function deckPlanPromptBlock(plan: DeckPlan): string {
  const { read, densityRhythm } = plan;
  const rhythm = densityRhythm
    .map((t, i) => `${i + 1}:${t}`)
    .join("  ");
  return `
DECK PLAN (derived from this brief — author to it)
This is not a generic deck. It is ${article(read.presentationType)} ${read.presentationType} for ${article(read.audience)} ${read.audience} audience.
- Narrative arc: ${ARC_GUIDANCE[read.presentationType]}. The deck progresses through this shape; it never circles one beat for half the slides.
- Copy register: ${read.register} — ${REGISTER_GUIDANCE[read.register]}
- Asset appetite: ${read.assetAppetite} — ${APPETITE_GUIDANCE[read.assetAppetite]}
- Design variance: ${read.variance} — ${VARIANCE_GUIDANCE[read.variance]}
- Density rhythm (suggested per-slide density, in order): ${rhythm}
  Follow this rhythm unless the content of a slide clearly calls for another tier. The point is variation: do NOT make every slide the same density.
`;
}
