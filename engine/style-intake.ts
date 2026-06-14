import { listSkills } from "./skill-loader.ts";
import type { StyleBrief } from "./skill-generator.ts";

/**
 * Style intake — the consumer never picks a skill from a menu.
 *
 * They say what the deck is about and, optionally, hand over the look in
 * whatever form they already have it: a sentence ("…in McKinsey style"),
 * a website, a few images, a style-guide PDF, pasted brand tokens. The engine
 * reads whatever signal is there and resolves a StyleBrief automatically.
 * It asks a question ONLY when there is no signal at all.
 *
 * This module owns the routing decision (signal → which brief / empty → ask).
 * Turning an artifact into a style descriptor (scrape a URL, OCR a PDF, run
 * vision over images) is delegated to an injectable `describeReference` hook,
 * so the host plugs in whatever extractor it has without changing this logic.
 */

export type StyleReference =
  | { kind: "url"; url: string; descriptor?: string }
  | { kind: "image"; ref: string; descriptor?: string }
  | { kind: "pdf"; ref: string; descriptor?: string }
  | { kind: "tokens"; value: string }; // pasted palette / brand text / CSS

export interface StyleInput {
  /** The one thing the consumer typed. */
  prompt: string;
  /** Anything they attached — any mix, all optional. */
  references?: StyleReference[];
}

export type StyleResolution =
  | { status: "resolved"; brief: StyleBrief; rationale: string }
  | { status: "needs-input"; questions: string[]; rationale: string };

export interface StyleIntakeDeps {
  skillsRoot: string;
  /**
   * Optional artifact → short style-descriptor extractor. URL scraper,
   * PDF OCR, image vision live here (host-provided). When absent, the intake
   * still routes, using any `descriptor` already on the reference.
   */
  describeReference?: (ref: StyleReference) => Promise<string | undefined>;
}

const CLARIFYING_QUESTIONS = [
  "What visual direction fits — clean and corporate, bold and editorial, warm and friendly, or something else?",
  "Got a reference I can match the look to? A website, a few images, or a style-guide PDF all work.",
  "Who is the audience, and what should the deck feel like?",
];

/**
 * Resolve whatever the consumer gave into a StyleBrief — automatically.
 * Order of precedence:
 *   1. Attached references (a website / images / a style-guide PDF / tokens)
 *      → derive the look from them. No question asked.
 *   2. A style cue in the prompt ("…in McKinsey style", "like Stripe",
 *      "Stripe × Linear") → match a built-in skill or generate one.
 *   3. Nothing to go on → return clarifying questions instead of guessing.
 */
export async function resolveStyleInput(
  input: StyleInput,
  deps: StyleIntakeDeps,
): Promise<StyleResolution> {
  const refs = input.references ?? [];

  // 1 — Artifacts win. Explicit material to derive a look from.
  if (refs.length > 0) {
    // A single website, nothing else → the brand-url path.
    if (refs.length === 1 && refs[0].kind === "url") {
      const r = refs[0];
      const desc = r.descriptor ?? (await deps.describeReference?.(r));
      return {
        status: "resolved",
        brief: { kind: "brand-url", url: r.url, scrapedDescription: desc },
        rationale: `Derived the look from the reference website ${r.url}.`,
      };
    }

    // Anything else (images, a PDF, tokens, or a mix) → descriptors → skill.
    const descriptors: string[] = [];
    for (const r of refs) {
      const d =
        r.kind === "tokens"
          ? r.value
          : r.descriptor ?? (await deps.describeReference?.(r)) ?? labelFor(r);
      if (d) descriptors.push(d.trim());
    }
    if (descriptors.length > 1) {
      return {
        status: "resolved",
        brief: { kind: "mix", values: descriptors },
        rationale: `Blended the look from ${descriptors.length} supplied references.`,
      };
    }
    return {
      status: "resolved",
      brief: { kind: "inspiration", value: descriptors[0] ?? "the supplied reference" },
      rationale: "Derived the look from the supplied reference.",
    };
  }

  // 2 — No artifacts. Read the prompt for an explicit STYLE CUE. A cue is a
  // style signal ("in the style of X", "X-style", "like X") — a bare topic word
  // ("a pitch deck", "an internal training session") is NOT a cue.
  //
  // CONTRACT ("NO selectable styles, ever"): a built-in skill match is consulted
  // ONLY against the extracted cue, never the whole brief. Seed folder names are
  // common deck-topic words (pitch, training, consulting, academic, opex), so
  // matching the whole prompt silently loaded a canned template for ordinary
  // topic briefs — the exact "all decks look the same" failure. The preset path
  // now fires only when the user literally names a seed AS the style cue.
  const cue = extractStyleCue(input.prompt);
  if (cue) {
    const presets = await listSkills(deps.skillsRoot);
    const preset = presetFromCue(cue, presets);
    if (preset) {
      return {
        status: "resolved",
        brief: { kind: "preset", name: preset },
        rationale: `Matched the built-in "${preset}" skill from the style cue.`,
      };
    }
    const mix = splitMix(cue);
    if (mix) {
      return {
        status: "resolved",
        brief: { kind: "mix", values: mix },
        rationale: `Read a blended style cue ("${mix.join(" × ")}") from the request.`,
      };
    }
    return {
      status: "resolved",
      brief: { kind: "inspiration", value: cue },
      rationale: `Read the style cue "${cue}" from the request.`,
    };
  }

  // 3 — Nothing to go on. Ask before guessing.
  return {
    status: "needs-input",
    questions: CLARIFYING_QUESTIONS,
    rationale:
      "The request named no visual direction and carried no reference, so the engine asks rather than guess a look.",
  };
}

function labelFor(r: StyleReference): string {
  switch (r.kind) {
    case "url": return `the reference website ${r.url}`;
    case "image": return "the supplied reference image";
    case "pdf": return "the supplied style-guide PDF";
    case "tokens": return r.value;
  }
}

/**
 * Match a built-in skill named in the prompt. Handles hyphenated names
 * ("launch-warm" also matches "launch warm"). Whole-word, case-insensitive.
 */
/**
 * Resolve a preset from a STYLE CUE only when the cue literally names a seed AS
 * the style ("in the style of consulting" → consulting). Rejects:
 *  - reference phrases ("like our last training", "our previous pitch") — those
 *    point at a prior artifact, not a style name (the possessive/temporal marker
 *    is the tell), and
 *  - topic phrases that merely CONTAIN a seed word ("a consulting readout") — the
 *    normalized cue must EQUAL a seed name, not contain it.
 * This upholds the "NO selectable styles, ever" contract on the cue path too.
 */
export function presetFromCue(cue: string, presets: string[]): string | null {
  const lower = cue.toLowerCase();
  if (/\b(our|your|my|their|its|last|previous|prior|existing)\b/.test(lower)) return null;
  const norm = lower
    .replace(/\b(a|an|the|style|styled)\b/gi, " ")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const name of [...presets].sort((a, b) => b.length - a.length)) {
    const n = name.toLowerCase();
    if (norm === n || norm === n.replace(/-/g, " ")) return name;
  }
  return null;
}

export function matchPreset(prompt: string, presets: string[]): string | null {
  const hay = ` ${prompt.toLowerCase()} `;
  // Prefer the longest preset name so "product-marketing" wins over a stray "product".
  const ordered = [...presets].sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    const variants = new Set([name, name.replace(/-/g, " ")]);
    for (const v of variants) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(v.toLowerCase())}(?:[^a-z0-9]|$)`);
      if (re.test(hay)) return name;
    }
  }
  return null;
}

const STYLE_CUE_PATTERNS: RegExp[] = [
  /\b(?:in the style of|inspired by|styled (?:like|after)|à la|a la|look(?:ing)? like|make it look like|like)\s+(.+)$/i,
  /\b([\w .,&'×+-]+?)[-\s]style\b/i,
];

/**
 * Pull a style descriptor out of the prompt, if one is phrased there.
 * Returns a trimmed cue ("Stripe", "a 1970s science magazine") or null.
 */
export function extractStyleCue(prompt: string): string | null {
  for (const re of STYLE_CUE_PATTERNS) {
    const m = prompt.match(re);
    if (m && m[1]) {
      const cue = m[1]
        .trim()
        .replace(/^(?:a|an|the)\s+/i, "")
        .replace(/[.,;:!?]+$/, "")
        .trim();
      // Guard against trailing topic clauses ("like Stripe about pricing").
      const cut = cue.split(/\s+\b(?:about|for|on|covering|regarding)\b\s+/i)[0].trim();
      if (cut.length >= 2 && cut.length <= 80) return cut;
    }
  }
  return null;
}

/**
 * Split a cue into a blend when it is explicitly a mix
 * ("mix of A and B", "A × B", "A meets B", "A + B"). Otherwise null.
 */
export function splitMix(cue: string): string[] | null {
  const isMix =
    /\bmix(?:ture)? of\b/i.test(cue) ||
    /\s(?:×|\+|meets|crossed with)\s/i.test(cue) ||
    /\sx\s/i.test(cue);
  if (!isMix) return null;
  const parts = cue
    .replace(/\bmix(?:ture)? of\b/i, "")
    .split(/\s*(?:×|\+|\bmeets\b|\bcrossed with\b|\bx\b|\band\b|,)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2 && parts.length <= 4) return parts;
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
