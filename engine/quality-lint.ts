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
  });

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
