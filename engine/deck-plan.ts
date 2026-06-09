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

export interface DesignRead {
  presentationType: PresentationType;
  audience: Audience;
  register: CopyRegister;
  assetAppetite: AssetAppetite;
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
  report: ["report", "results", "findings", "analysis", "quarterly", "annual review", "earnings", "kpi", "metrics review", "audit", "study"],
  teaching: ["training", "workshop", "onboarding", "lesson", "course", "tutorial", "curriculum", "teach", "lecture", "how to"],
  editorial: ["story", "essay", "editorial", "magazine", "manifesto", "narrative", "brand story", "feature piece"],
  keynote: ["keynote", "launch", "announce", "unveil", "vision", "reveal", "product launch"],
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
    if (re.test(haystack)) n++;
  }
  return n;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferPresentationType(text: string): PresentationType {
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

function deriveAppetite(type: PresentationType, skill: Skill): AssetAppetite {
  if (type === "editorial" || type === "keynote") return "image-led";
  if (type === "report") return "data-led";
  // teaching leans on diagrams/data; a non-photographic skill treatment also
  // signals the deck is not carried by photography.
  if (type === "teaching") return "data-led";
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
  const densityRhythm = buildDensityRhythm(slideCount, assetAppetite);

  const read: DesignRead = { presentationType, audience, register, assetAppetite };
  const rationale =
    `Read as a ${presentationType} for a ${audience} audience; ` +
    `${register} copy register, ${assetAppetite} asset appetite.`;

  return { read, densityRhythm, rationale };
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

const REGISTER_GUIDANCE: Record<CopyRegister, string> = {
  formal: "measured, precise, evidence-first; no hype words.",
  punchy: "short, confident lines; one idea per slide; verbs over adjectives.",
  technical: "exact terms, defined acronyms, no marketing gloss.",
  warm: "human, narrative, concrete detail over abstraction.",
  plain: "clear and direct; plain words, no filler.",
};

const APPETITE_GUIDANCE: Record<AssetAppetite, string> = {
  "image-led": "lean on full-bleed imagery and type-on-image; let pictures carry slides.",
  "data-led": "lean on charts, tables and structured exhibits; minimize decorative imagery.",
  "balanced": "mix supporting imagery with structured layouts as the content dictates.",
};

export function deckPlanPromptBlock(plan: DeckPlan): string {
  const { read, densityRhythm } = plan;
  const rhythm = densityRhythm
    .map((t, i) => `${i + 1}:${t}`)
    .join("  ");
  return `
DECK PLAN (derived from this brief — author to it)
This is not a generic deck. It is ${article(read.presentationType)} ${read.presentationType} for ${article(read.audience)} ${read.audience} audience.
- Copy register: ${read.register} — ${REGISTER_GUIDANCE[read.register]}
- Asset appetite: ${read.assetAppetite} — ${APPETITE_GUIDANCE[read.assetAppetite]}
- Density rhythm (suggested per-slide density, in order): ${rhythm}
  Follow this rhythm unless the content of a slide clearly calls for another tier. The point is variation: do NOT make every slide the same density.
`;
}
