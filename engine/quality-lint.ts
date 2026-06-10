// Anti-slop quality linter.
//
// Deterministic, content-level checks over an authored slide tree. Where the
// composition-variety guard in validate.ts catches *structural* monotony, this
// catches the *content* tells that make a deck read as machine-generated:
// filler phrases, placeholder names, fake-precise numbers, eyebrow overuse,
// em-dashes, single-density decks.
//
// Pure function. No I/O. Findings are advisory (severity "warn") by default and
// surface as warnings on the ValidationResult; em-dashes are "error" because the
// em-dash ban is a hard product rule. The caller decides whether to block.

import type { SlideTreeNode } from "./types.ts";

export type LintSeverity = "warn" | "error";

export interface LintFinding {
  rule: string;
  severity: LintSeverity;
  /** 0-based slide index, or -1 for deck-level findings. */
  slideIndex: number;
  slot?: string;
  message: string;
}

export interface LintOptions {
  /** The original user prompt. Numbers that appear here are real, not invented. */
  userPrompt?: string;
  /** The deck is explicitly sample/illustrative content — skip fake-number checks. */
  illustrative?: boolean;
}

// Slot keys whose values are not human-facing copy (image data, background art).
const NON_TEXT_SLOT_RE = /(^bg-?image$)|image/i;

// Eyebrow-style slot keys — the small label above a headline.
const EYEBROW_SLOTS = new Set(["eyebrow", "kicker", "overline", "label", "section"]);

const AI_PHRASES = [
  "leverage",
  "seamless",
  "synergy",
  "unlock",
  "next-gen",
  "revolutionize",
  "game-changing",
  "cutting-edge",
  "world-class",
  "best-in-class",
  "state-of-the-art",
  "elevate",
  "supercharge",
  "paradigm shift",
  "holistic",
];

const PLACEHOLDER_NAMES = [
  /\bjohn doe\b/i,
  /\bjane doe\b/i,
  /\bacme\b/i,
  /\blorem ipsum\b/i,
];

const STEP_LABEL_RE = /^\s*(stage|phase|step)\s*\d+\b/i;

// Headline-carrying slots — where the assertion-not-label rule applies.
const HEADLINE_SLOTS = new Set(["headline", "action-title", "statement"]);

// Blatant topic-label headlines (deck-template residue, not an argument).
const TOPIC_LABEL_RE =
  /^\s*(agenda|overview|introduction|background|summary|about us|our (team|mission|vision|values|story)|the (team|problem|solution|market|opportunity)|key (takeaways?|benefits?|features?|findings?)|next steps?|thank you|appendix|q\s?&\s?a)\s*$/i;

// Words that signal a clause is being asserted, not just named.
const VERB_SIGNALS = new Set([
  "is", "are", "was", "were", "be", "been", "has", "have", "had", "do", "does",
  "will", "would", "can", "cannot", "could", "should", "must", "need", "needs",
  "make", "makes", "made", "decide", "decides", "drive", "drives", "create",
  "creates", "become", "becomes", "require", "requires", "mean", "means",
  "win", "wins", "fail", "fails", "grow", "grows", "cost", "costs", "feel",
  "feels", "start", "starts", "begin", "begins", "deliver", "delivers",
  "deserve", "deserves", "belong", "belongs", "matter", "matters", "depend",
  "depends", "change", "changes", "build", "builds", "buy", "buys", "choose",
  "chooses", "keep", "keeps", "stay", "stays", "turn", "turns", "let", "lets",
]);

// Generic closing lines — a close with no concrete ask.
const GENERIC_CLOSING_RE =
  /^\s*(thank you!?|thanks!?|let'?s talk!?|get in touch!?|contact us!?|questions\??|any questions\??|reach out!?)\s*$/i;

// Agency-portfolio decoration tells (taste-skill v2 adoption).
// A section counter dressed as a label: "06 · how it works", "001 / index".
const NUMBERED_EYEBROW_RE = /^\s*0?\d{1,3}\s*[·./|-]\s*\S/;
// Poetic section labels that replace plain language.
const POETIC_LABEL_RE =
  /^\s*(field notes?|quietly in use( at)?|on our desks?|selected works?|scroll to explore|notes from the (field|studio))\s*$/i;

// Precise-looking metric numbers: percentages, multipliers, currency,
// k/M/B-suffixed, and grouped thousands. Bare integers (years, counts) are
// intentionally NOT matched — they are rarely the "fake spec aesthetic" tell.
const NUMBER_PATTERNS: RegExp[] = [
  /\d+(?:\.\d+)?%/g, // 73%
  /\d+(?:\.\d+)?x\b/gi, // 4.2x
  /[$€£]\s?\d+(?:[.,]\d+)?\s?[kmb]?\b/gi, // $12.4M
  /\b\d+(?:\.\d+)?\s?[kmb]\b/gi, // 48k, 3.5B
  /\b\d{1,3}(?:,\d{3})+\b/g, // 10,000
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const AI_PHRASE_RES = AI_PHRASES.map(
  (p) => new RegExp("\\b" + escapeRegExp(p) + "\\b", "i"),
);

/** Slots that carry human-facing copy, with their key. */
function visibleSlots(slide: SlideTreeNode): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(slide.slots ?? {})) {
    if (typeof v !== "string" || v.length === 0) continue;
    if (NON_TEXT_SLOT_RE.test(k)) continue;
    if (v.startsWith("data:")) continue;
    out.push([k, v]);
  }
  return out;
}

export function lintSlideTree(
  slides: SlideTreeNode[],
  opts: LintOptions = {},
): { findings: LintFinding[] } {
  const findings: LintFinding[] = [];
  const userPrompt = opts.userPrompt ?? "";

  slides.forEach((slide, slideIndex) => {
    for (const [slot, value] of visibleSlots(slide)) {
      // em-dash / en-dash separator — hard rule.
      if (/[—–]/.test(value)) {
        findings.push({
          rule: "em-dash",
          severity: "error",
          slideIndex,
          slot,
          message: `em-dash/en-dash in "${slot}": use a hyphen or restructure.`,
        });
      }

      // AI filler phrases.
      const hits = AI_PHRASES.filter((_, i) => AI_PHRASE_RES[i].test(value));
      if (hits.length > 0) {
        findings.push({
          rule: "ai-phrase",
          severity: "warn",
          slideIndex,
          slot,
          message: `AI filler in "${slot}": ${hits.join(", ")}. Use concrete language.`,
        });
      }

      // Placeholder names.
      if (PLACEHOLDER_NAMES.some((re) => re.test(value))) {
        findings.push({
          rule: "placeholder-name",
          severity: "warn",
          slideIndex,
          slot,
          message: `Placeholder name in "${slot}": use a believable, specific name.`,
        });
      }

      // Generic step labels.
      if (STEP_LABEL_RE.test(value)) {
        findings.push({
          rule: "generic-step-label",
          severity: "warn",
          slideIndex,
          slot,
          message: `Generic step label in "${slot}": let the step content be the label.`,
        });
      }

      // Numbered eyebrows: "06 · how it works" dressed as a label. Real page
      // numbers live in footer chrome, not in eyebrow slots.
      if (EYEBROW_SLOTS.has(slot) && NUMBERED_EYEBROW_RE.test(value)) {
        findings.push({
          rule: "numbered-eyebrow",
          severity: "warn",
          slideIndex,
          slot,
          message: `Numbered eyebrow in "${slot}": "${value.trim()}". A section counter dressed as a label is an agency-portfolio tell; use plain language or drop it.`,
        });
      }

      // Poetic section labels.
      if (POETIC_LABEL_RE.test(value)) {
        findings.push({
          rule: "poetic-label",
          severity: "warn",
          slideIndex,
          slot,
          message: `Poetic label in "${slot}": "${value.trim()}". Say it plainly (Testimonials, Latest work) or drop the label.`,
        });
      }

      // Topic-label headlines: a title that names a topic instead of asserting
      // a claim. Blatant labels always flag; short verb-less noun phrases flag
      // conservatively (4 words or fewer, no verb signal, no sentence period).
      if (HEADLINE_SLOTS.has(slot)) {
        const words = value.trim().toLowerCase().replace(/[^a-z0-9\s'-]/g, "").split(/\s+/).filter(Boolean);
        const hasVerb = words.some((w) => VERB_SIGNALS.has(w));
        const blatant = TOPIC_LABEL_RE.test(value);
        if (blatant || (words.length > 0 && words.length <= 4 && !hasVerb && !/[.!?]\s*$/.test(value.trim()))) {
          findings.push({
            rule: "topic-label-headline",
            severity: "warn",
            slideIndex,
            slot,
            message: `Topic label in "${slot}": "${value.trim()}". Titles are claims that carry the argument ("X decides Y"), never labels.`,
          });
        }
      }

      // Fake-precise numbers.
      if (!opts.illustrative) {
        const flagged = collectFakeNumbers(value, userPrompt);
        if (flagged.length > 0) {
          findings.push({
            rule: "fake-precise-number",
            severity: "warn",
            slideIndex,
            slot,
            message: `Unsourced precise number(s) in "${slot}": ${flagged.join(", ")}. Use real data or mark illustrative.`,
          });
        }
      }
    }

    // Uniform bullets: 3+ parallel items in one slot family opening with the
    // same word reads as a checkbox list, not arguments.
    const families = new Map<string, string[]>();
    for (const [slot, value] of visibleSlots(slide)) {
      if (!/\d/.test(slot)) continue;
      const stem = slot.replace(/\d+/g, "#");
      const list = families.get(stem) ?? [];
      list.push(value);
      families.set(stem, list);
    }
    for (const [stem, values] of families) {
      if (values.length < 3) continue;
      const counts = new Map<string, number>();
      for (const v of values) {
        const first = v.trim().toLowerCase().match(/^[a-z0-9'-]+/i)?.[0];
        if (first) counts.set(first, (counts.get(first) ?? 0) + 1);
      }
      const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (worst && worst[1] >= 3) {
        findings.push({
          rule: "uniform-bullets",
          severity: "warn",
          slideIndex,
          slot: stem,
          message: `${worst[1]} parallel "${stem}" items all open with "${worst[0]}". Vary the grammatical structure; each item carries a different kind of point.`,
        });
      }
    }

    // Body restating the title in synonyms adds nothing.
    const slots = slide.slots ?? {};
    const head = [...HEADLINE_SLOTS]
      .map((k) => slots[k])
      .find((v): v is string => typeof v === "string" && v.length > 0);
    if (head) {
      const headWords = contentWords(head);
      if (headWords.size >= 3) {
        for (const bk of ["body", "intro", "lead", "sub", "subtitle"]) {
          const bv = slots[bk];
          if (typeof bv !== "string" || bv.length === 0) continue;
          const bodyWords = contentWords(bv);
          let overlap = 0;
          for (const w of headWords) if (bodyWords.has(w)) overlap++;
          if (overlap / headWords.size >= 0.6) {
            findings.push({
              rule: "body-restates-title",
              severity: "warn",
              slideIndex,
              slot: bk,
              message: `"${bk}" largely restates the headline. Body copy must ADD something: the mechanism, the evidence, or the consequence.`,
            });
            break;
          }
        }
      }
    }
  });

  // Deck-level: generic closing with no concrete ask.
  if (slides.length > 1) {
    const last = slides[slides.length - 1];
    for (const [slot, value] of visibleSlots(last)) {
      if (GENERIC_CLOSING_RE.test(value)) {
        findings.push({
          rule: "generic-closing",
          severity: "warn",
          slideIndex: slides.length - 1,
          slot,
          message: `Generic closing "${value.trim()}". Close with a concrete next action (verb + object + when), not a pleasantry.`,
        });
        break;
      }
    }
  }

  // Deck-level: eyebrow overuse.
  const n = slides.length;
  if (n > 0) {
    const eyebrowSlides = slides.filter((s) =>
      Object.entries(s.slots ?? {}).some(
        ([k, v]) => EYEBROW_SLOTS.has(k) && typeof v === "string" && v.length > 0,
      ),
    ).length;
    const cap = Math.ceil(n / 3);
    if (eyebrowSlides > cap) {
      findings.push({
        rule: "eyebrow-overuse",
        severity: "warn",
        slideIndex: -1,
        message: `Eyebrow label on ${eyebrowSlides}/${n} slides (cap ${cap}). Drop most; the headline alone carries the slide.`,
      });
    }
  }

  // Deck-level: density monotony (only when every slide declares a density).
  if (n > 6) {
    const tiers = slides.map((s) => s.density);
    if (tiers.every((t) => t != null) && new Set(tiers).size === 1) {
      findings.push({
        rule: "density-monotony",
        severity: "warn",
        slideIndex: -1,
        message: `All ${n} slides are "${tiers[0]}" density. Vary density within the deck (editorial / balanced / data-dense).`,
      });
    }
  }

  return { findings };
}

const STOP_WORDS = new Set([
  "the", "and", "with", "that", "this", "from", "your", "their", "they",
  "have", "has", "are", "is", "was", "were", "for", "not", "but", "you",
  "our", "its", "into", "than", "then", "them", "what", "when", "how",
  "every", "each", "all", "more", "most", "very", "will", "would", "can",
]);

/** Lowercased content words (>3 chars, minus stopwords) for overlap checks. */
function contentWords(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/)) {
    if (w.length > 3 && !STOP_WORDS.has(w)) out.add(w);
  }
  return out;
}

/** Return the precise-number tokens in `value` that do NOT appear in `userPrompt`. */
function collectFakeNumbers(value: string, userPrompt: string): string[] {
  const flagged: string[] = [];
  const seen = new Set<string>();
  for (const re of NUMBER_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
      const token = m[0].trim();
      const key = token.toLowerCase().replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      if (userPrompt.includes(token)) continue;
      flagged.push(token);
    }
  }
  return flagged;
}
