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

      // Orphan single character — almost always a shredded table cell, e.g.
      // "n/a" split into a lone "n" and "a" across two columns (Kelvin slide 13).
      if (!EYEBROW_SLOTS.has(slot) && /^[a-zA-Z]$/.test(value.trim())) {
        findings.push({
          rule: "orphan-char",
          severity: "warn",
          slideIndex,
          slot,
          message: `Slot "${slot}" is the single character "${value.trim()}" — likely a split cell (e.g. "n/a"). Provide the full value verbatim.`,
        });
      }

      // A fictional titled expert at a named institution manufactures false
      // authority (unlike obviously-illustrative role-only attribution).
      if (/\b(?:Dr|Prof|Professor)\.?\s+[A-Z][a-z]+/.test(value)) {
        findings.push({
          rule: "named-expert",
          severity: "warn",
          slideIndex,
          slot,
          message: `Titled named expert in "${slot}" ("${value.trim().slice(0, 60)}"). If illustrative, use role-only attribution ("a marine ecologist") or footer-label the slide illustrative.`,
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
    // same word reads as a checkbox list, not arguments. Chart furniture
    // (ex#-data, ex#-labels, ex#-unit-line, ...) is data, not rhetoric —
    // parallel structure there is correct, never a finding.
    const families = new Map<string, string[]>();
    for (const [slot, value] of visibleSlots(slide)) {
      if (!/\d/.test(slot)) continue;
      if (/-(data|labels|cells|unit|unit-line|highlight|ref-line|ref-label|status|word)$/.test(slot)) continue;
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

  // Deck-level: eyebrow overuse. A running section header (the same few values
  // repeating across slides, the consulting-register kicker) is structure, not
  // decoration — only mostly-unique per-slide labels are the agency tell.
  const n = slides.length;
  if (n > 0) {
    const eyebrowValues: string[] = [];
    const eyebrowSlides = slides.filter((s) => {
      const vals = Object.entries(s.slots ?? {}).filter(
        ([k, v]) => EYEBROW_SLOTS.has(k) && typeof v === "string" && v.length > 0,
      );
      if (vals.length === 0) return false;
      for (const [, v] of vals) eyebrowValues.push((v as string).trim().toLowerCase());
      return true;
    }).length;
    const distinct = new Set(eyebrowValues).size;
    const mostlyUnique = distinct >= Math.max(2, Math.ceil(eyebrowValues.length * 0.7));
    const cap = Math.ceil(n / 3);
    if (eyebrowSlides > cap && mostlyUnique) {
      findings.push({
        rule: "eyebrow-overuse",
        severity: "warn",
        slideIndex: -1,
        message: `Eyebrow label on ${eyebrowSlides}/${n} slides (cap ${cap}). Drop most; the headline alone carries the slide.`,
      });
    }
  }

  // Per-slide: a slide that DECLARES data-dense must carry the volume. Token
  // count across visible slots is a crude but honest proxy — four bullets in
  // a big multi-zone layout is underfill wearing a dense label.
  slides.forEach((s, i) => {
    if (s.density !== "data-dense") return;
    let tokens = 0;
    let exhibitNumerals = 0;
    for (const [k, v] of Object.entries(s.slots ?? {})) {
      if (NON_TEXT_SLOT_RE.test(k)) continue;
      if (typeof v !== "string" || v.startsWith("data:")) continue;
      tokens += v.split(/[\s|/]+/).filter(Boolean).length;
      // A realized exhibit carries its volume in chart/table DATA, not prose.
      // Count numerals in data-bearing slots toward the floor so a slide whose
      // density lives in a long series/full table is not false-flagged as thin.
      if (/(^|[-_])(data|cells|labels|values|series|rows|cols)$/i.test(k) || /chart|table|matrix|grid/i.test(k)) {
        exhibitNumerals += (v.match(/-?\d[\d.,]*/g) || []).length;
      }
    }
    // An exhibit-bearing data-dense slide (>= 8 data numerals) realizes its
    // volume visually; the prose token floor does not apply.
    if (exhibitNumerals >= 8) return;
    // Floor derived from the counted reference decks (anatomy spec): a median
    // reference content page renders ~100 tokens, of which ~25-40 are chart
    // numerals the renderer adds — so authored content below ~70 tokens cannot
    // reach the reference page weight.
    if (tokens < 70) {
      findings.push({
        rule: "thin-dense-slide",
        severity: "warn",
        slideIndex: i,
        message: `Slide declares data-dense but carries only ~${tokens} content tokens (reference floor ~70 authored). Reference-grade density means long series, full tables, full panels — add volume or drop the tier.`,
      });
    }
  });

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

  // Deck-level: image-subject monotony. When ≥2 slides carry a bgPrompt (the
  // per-slide hero/background art prompt), the deck should depict a DIFFERENT
  // subject per slide under one shared visual language. The failure this catches
  // is the model varying only the STYLE words (chrome, mercury, near-black) and
  // the shape-primitive/motion vocabulary (ribbon, sphere, rising, folding) while
  // redrawing the same motif. We strip that shared style register from each
  // bgPrompt and inspect the residual SUBJECT vocabulary: if the residual sets
  // overlap heavily (avg pairwise Jaccard >= threshold) OR the deck spends too few
  // distinct subject tokens across its images (richness floor), it is one motif
  // reworded. Advisory (warn), never blocks an existing deck's gate.
  const monotony = detectImageSubjectMonotony(slides);
  if (monotony) {
    findings.push({
      rule: "image-subject-monotony",
      severity: "warn",
      slideIndex: -1,
      message: monotony,
    });
  }

  // Deck-level: mixed currency glyphs. A lone "£40" in an otherwise-EUR deck
  // (Nordwind) reads as a rendering error. Flag a rare currency when another
  // clearly dominates. (A deck deliberately comparing currencies will trip this;
  // it is a warning, not a hard fail.)
  const CURRENCIES: { key: string; re: RegExp }[] = [
    { key: "EUR", re: /€|\bEUR\b/g },
    { key: "USD", re: /\$|\bUSD\b/g },
    { key: "GBP", re: /£|\bGBP\b/g },
    { key: "JPY", re: /¥|\bJPY\b/g },
    { key: "INR", re: /₹|\bINR\b/g },
  ];
  const curCounts: Record<string, number> = {};
  for (const s of slides) {
    for (const [, v] of visibleSlots(s)) {
      for (const { key, re } of CURRENCIES) {
        const n = (v.match(re) ?? []).length;
        if (n) curCounts[key] = (curCounts[key] ?? 0) + n;
      }
    }
  }
  const curEntries = Object.entries(curCounts);
  if (curEntries.length >= 2) {
    const dominant = curEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
    for (const [g, c] of curEntries) {
      if (g !== dominant[0] && c <= 2 && dominant[1] >= 4) {
        findings.push({
          rule: "mixed-currency",
          severity: "warn",
          slideIndex: -1,
          message: `Currency "${g}" appears ${c}× while "${dominant[0]}" dominates (${dominant[1]}×). A stray currency glyph reads as an error — normalize to one currency.`,
        });
      }
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

// ---------------------------------------------------------------------------
// image-subject-monotony
//
// Shared STYLE register stripped from each bgPrompt before comparing subjects.
// Three groups, all of which a deck legitimately holds CONSTANT under "one
// visual language": (a) material/palette/finish/lighting/quality words; (b)
// abstract shape-PRIMITIVE nouns (ribbon, sphere, curve, column), the
// vocabulary of an abstract sculpture, not a concrete subject; (c) motion/pose
// verbs (folding, rising, sweeping). What survives is the concrete subject a
// slide actually depicts (robot, gripper, staircase, monolith, skyline). The
// guiding principle (caps-strip lesson): prose alone never holds, only a
// mechanical residual-vocabulary check separates "one motif reworded" from
// "genuinely different figures, one language".
const IMAGE_STYLE_STOPLIST = new Set<string>([
  // material / palette / finish / lighting / quality
  "chrome", "metal", "metallic", "mercury", "aluminium", "aluminum", "steel",
  "silver", "liquid", "poured", "molten", "brushed", "polished", "mirror",
  "near-black", "near", "black", "void", "ice-blue", "ice", "blue", "rim",
  "light", "lighting", "studio", "specular", "reflection", "reflections",
  "reflective", "premium", "luxury", "product", "render", "rendered", "realism",
  "realistic", "photorealistic", "cold", "cinematic", "negative", "space",
  "sharp", "deep", "dark", "darkness", "matte", "gloss", "glossy", "hardware",
  "architectural", "edge", "edges", "surface", "finish", "abstract",
  "sculptural", "industrial", "minimal", "minimalist", "clean", "smooth",
  "soft", "hard", "high", "contrast", "detail", "tight", "macro", "close-up",
  "closeup", "close", "wide", "shot", "composition", "background", "backdrop",
  "field", "depth", "tone", "tones", "tonal", "gradient", "glow", "ambient",
  "color", "colour", "palette", "muted", "saturated", "monochrome", "grayscale",
  "greyscale", "texture", "grain", "atmosphere", "atmospheric", "mood", "moody",
  "lit", "shadow", "shadows", "highlight", "highlights", "bright", "darkened",
  // abstract shape-PRIMITIVE nouns (an abstract form, not a concrete subject)
  "form", "shape", "ribbon", "sphere", "curve", "column", "blob", "swirl",
  "wave", "arc", "loop", "coil", "spiral", "twist", "fold", "drape", "sheet",
  "mass", "volume", "structure", "object", "shard", "splinter", "droplet",
  "blobs", "ribbons", "spheres", "curves", "columns", "waves", "arcs",
  // motion / process / pose verbs (present participle and past)
  "folding", "folded", "splitting", "split", "rising", "risen", "curving",
  "curved", "climbing", "climbed", "receding", "receded", "standing", "stood",
  "sweeping", "swept", "ascending", "descending", "flowing", "pouring",
  "dripping", "melting", "morphing", "twisting", "coiling", "unfurling",
  "bending", "stretching", "floating", "hovering", "spinning", "rotating",
  // generic glue / quantity / position words
  "single", "vast", "empty", "the", "and", "into", "with", "for", "out", "off",
  "over", "under", "across", "through", "between", "not", "text", "type",
  "this", "that", "these", "those", "its", "are", "very", "more", "most",
  "some", "any", "all", "one", "two", "three", "set", "scene", "image",
  "picture", "photo", "photograph", "view", "frame", "left", "right", "upper",
  "lower", "top", "bottom", "corner", "center", "centre", "side", "front",
  "back", "behind", "around", "like", "made", "tall", "vertical", "horizontal",
  "long", "short", "big", "small", "large",
]);

const IMAGE_SUBJECT_JACCARD_THRESHOLD = 0.5;
const IMAGE_SUBJECT_RICHNESS_FLOOR = 1.5;

/** Residual SUBJECT tokens of one bgPrompt: atoms ≥3 chars, minus style words. */
function subjectTokens(prompt: string): Set<string> {
  const out = new Set<string>();
  for (const raw of prompt.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
    if (!raw) continue;
    // Split hyphenated compounds into atoms so "liquid-metal" and "near-black"
    // are stoplisted by their parts, not preserved as fake-unique tokens.
    for (const atom of raw.split("-")) {
      if (atom.length < 3) continue;
      if (IMAGE_STYLE_STOPLIST.has(atom)) continue;
      out.add(atom);
    }
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Deck-level: are the per-slide hero/background subjects one motif reworded?
 * Returns a warning message, or null when the images carry distinct subjects
 * (or there are fewer than 2 bgPrompts to compare). Pure + defensive: skips
 * empty / data: / url: bgPrompt values, exactly like the slot-skip patterns.
 */
function detectImageSubjectMonotony(slides: SlideTreeNode[]): string | null {
  const prompts: string[] = [];
  for (const s of slides) {
    const bg = s.bgPrompt;
    if (typeof bg !== "string") continue;
    const v = bg.trim();
    if (v.length === 0) continue;
    if (v.startsWith("data:") || v.startsWith("url:")) continue;
    prompts.push(v);
  }
  if (prompts.length < 2) return null;

  const sets = prompts.map(subjectTokens);

  // Average pairwise Jaccard of residual subject-token sets.
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      sum += jaccard(sets[i], sets[j]);
      pairs++;
    }
  }
  const avgJaccard = pairs > 0 ? sum / pairs : 0;

  // Subject-vocabulary richness: distinct residual atoms across the whole deck
  // per image. The spec's "distinct subject head-nouns <= half the images" in its
  // robust form: when the model only reworded one motif, the residual subject
  // vocabulary is tiny (the OLD chrome-blob set collapses to ~0.25 atoms/image).
  const allAtoms = new Set<string>();
  for (const s of sets) for (const a of s) allAtoms.add(a);
  const richness = allAtoms.size / prompts.length;

  const tooSimilar = avgJaccard >= IMAGE_SUBJECT_JACCARD_THRESHOLD;
  const tooPoor = richness <= IMAGE_SUBJECT_RICHNESS_FLOOR;
  if (!tooSimilar && !tooPoor) return null;

  return `Background image subjects are too similar across ${prompts.length} slides (one motif repeated). Vary the figure per slide; keep the palette/material language.`;
}
