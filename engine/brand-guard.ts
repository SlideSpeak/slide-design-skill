const BLOCK_REGEX = /\b(logo|trademark|brand-?mark|wordmark|™|®|©)\b/i;

const BRAND_BLOCKLIST = [
  "mckinsey", "bcg", "boston consulting", "bain",
  "apple", "google", "microsoft", "amazon", "meta", "facebook",
  "nike", "adidas", "puma",
  "tesla", "ferrari", "porsche", "bmw", "mercedes-benz", "mercedes benz", "audi", "volkswagen",
  "coca-cola", "coca cola", "pepsi", "starbucks",
  "lvmh", "louis vuitton", "gucci", "prada", "hermès",
  "deloitte", "pwc", "ernst & young", "kpmg", "accenture",
  "goldman sachs", "jpmorgan", "morgan stanley",
  "openai", "anthropic", "chatgpt",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BRAND_COMBINED_REGEX = new RegExp(
  `\\b(${BRAND_BLOCKLIST.map(escapeRegex).join("|")})\\b`,
  "i",
);

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  sanitized?: string;
  warning?: string;
}

export function guardImagePrompt(prompt: string): GuardResult {
  if (BLOCK_REGEX.test(prompt)) {
    return {
      allowed: false,
      reason: `Prompt contains brand-asset terminology (logo/trademark/etc). Original: "${prompt}"`,
    };
  }

  const match = prompt.match(BRAND_COMBINED_REGEX);
  if (match) {
    const matched = match[1].toLowerCase();
    const brand = BRAND_BLOCKLIST.find((b) => b.toLowerCase() === matched) ?? matched;
    return {
      allowed: false,
      reason: `Prompt references blocked brand name: "${brand}".`,
    };
  }

  return { allowed: true, sanitized: prompt };
}

/**
 * Guard the final assembled prompt (after template substitution).
 *
 * Negative-prompt phrasing in legitimate skill templates ("no logos, no
 * trademarks, no recognizable products") would trip the strict guard. Strip
 * those negative contexts BEFORE running brand-asset checks, so we still catch
 * positive mentions a malicious skill template could inject.
 */
export function guardAssembledImagePrompt(prompt: string): GuardResult {
  const stripped = stripNegativeContexts(prompt);
  return guardImagePrompt(stripped);
}

// Matches "no X", "without X", "excluding X", "avoid X", "free of X", "minus X"
// followed by a comma-separated list of terms. We blank these out so the brand
// guard only inspects positive content.
const NEGATIVE_CONTEXT_RE =
  /\b(no|without|exclude|excluding|avoid|avoiding|free of|minus|never|not)\s+([^,.;]*)/gi;

function stripNegativeContexts(prompt: string): string {
  return prompt.replace(NEGATIVE_CONTEXT_RE, (match) => " ".repeat(match.length));
}

// Slot guard is softer than image guard: brand references are allowed in
// source/citation/context slots (a consulting deck can cite McKinsey research)
// but flagged in headlines/bullets/etc. Slots are kept either way; reviewer decides.
const SOURCE_LIKE_SLOTS = new Set([
  "source",
  "sources",
  "citation",
  "footnote",
  "client-name",
  "company-name",
  "engagement-type",
]);

// ─── Ground-truth fidelity: flag model-generated claims ──────────────────────
// A figure or citation that the user did NOT supply is, by definition, invented
// by the model. That is fine for illustrative/fictional decks but dangerous when
// the deck is about real data. We don't block — we surface ONE consolidated
// warning listing the figures/sources that weren't in the user's request, so the
// caller can verify before presenting them as real. Mirrors the YMYL number-
// validation pattern: never let a fabricated precise figure pass silently.

// One whole number token: optional currency, digits (with , . grouping), an
// attached magnitude suffix (k/m/b/bn/t), then optional % and +. The suffix is
// attached (no space) so "$42 billion" yields "$42", never a stray "b".
const FIGURE_TOKEN_RE = /[$€£]?\d+(?:[.,]\d+)*(?:bn|[kmbtKMBT])?%?\+?/g;
// Keep only figures that read as a real claim — currency, %, magnitude, trailing
// "+", a decimal, or 3+ digits. Bare small integers ("3 steps") are dropped.
function isSignificantFigure(t: string): boolean {
  return (
    /[$€£%]/.test(t) ||
    /(?:bn|[kmbtKMBT])\+?$/.test(t) ||
    /\+$/.test(t) ||
    /\d[.,]\d/.test(t) ||
    /\d{3}/.test(t)
  );
}
const CITATION_RE =
  /\b(?:according to|per\s+[A-Z]|sources?:\s|research (?:by|from|shows|finds)|study (?:by|shows|finds)|report(?:ed)? by|data from|[A-Z][A-Za-z.&]+\s+\((?:19|20)\d\d\))/;

function digitKey(s: string): string {
  return s.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

export function flagModelGeneratedClaims(
  slots: Record<string, string>,
  userPrompt: string,
): string | null {
  const promptDigits = new Set(
    (userPrompt.match(/\d[\d.,]*/g) ?? []).map(digitKey).filter(Boolean),
  );
  const figures = new Map<string, true>();
  const citations = new Map<string, true>();

  for (const value of Object.values(slots)) {
    if (typeof value !== "string" || value.length === 0) continue;
    // Skip non-prose slot values: data-URIs (inlined FAL/stock backgrounds) and
    // bare URLs. Scanning a base64 image blob for "figures" produced thousands
    // of bogus claims; these slots never carry author-stated data anyway.
    if (/^\s*(data:|https?:\/\/)/i.test(value)) continue;
    // Bare hex colors (ink/tint styling slots) are not figures either.
    if (/^\s*#[0-9a-f]{3,8}\s*$/i.test(value)) continue;
    for (const m of value.match(FIGURE_TOKEN_RE) ?? []) {
      const tok = m.trim();
      if (!isSignificantFigure(tok)) continue;
      const key = digitKey(tok);
      if (key && !promptDigits.has(key)) figures.set(tok, true);
    }
    if (CITATION_RE.test(value)) {
      citations.set(value.length > 60 ? value.slice(0, 57) + "…" : value, true);
    }
  }

  if (figures.size === 0 && citations.size === 0) return null;
  const parts: string[] = [];
  if (figures.size) {
    const list = [...figures.keys()].slice(0, 8).join(", ");
    parts.push(`${figures.size} figure(s) not in your request [${list}${figures.size > 8 ? ", …" : ""}]`);
  }
  if (citations.size) {
    parts.push(`${citations.size} source/citation claim(s)`);
  }
  return `Fidelity: ${parts.join(" and ")} were model-generated. Fine for illustrative/fictional decks; verify before presenting as real data.`;
}

// ─── Typography guard: no all-caps label cliché, ever ────────────────────────
// The product rule is absolute: no uppercased label typography anywhere. LLM-
// authored chrome.css / components routinely reach for `text-transform:uppercase`
// plus wide positive tracking (the "stripe eyebrow" / tracked-caps cliché). We
// strip it at load so every rendered deck is guaranteed caps-free regardless of
// what the model wrote. Removing the transform reverts a label to its authored
// (sentence) case; inside a block that forced uppercase we also drop the positive
// letter-spacing, which only existed to space out the caps.
const UPPERCASE_DECL_RE =
  /text-transform\s*:\s*uppercase\s*(?:!important)?\s*;?/gi;
const POSITIVE_TRACKING_RE =
  /letter-spacing\s*:\s*0*\.\d+\s*em\s*(?:!important)?\s*;?/gi;
const HAS_UPPERCASE_RE = /text-transform\s*:\s*uppercase/i;

export function stripUppercaseTypography(source: string): string {
  // 1) CSS declaration blocks: if a block forced uppercase, drop the transform
  //    AND its tracked-caps letter-spacing together.
  let out = source.replace(/\{[^{}]*\}/g, (block) => {
    if (!HAS_UPPERCASE_RE.test(block)) return block;
    return block.replace(UPPERCASE_DECL_RE, "").replace(POSITIVE_TRACKING_RE, "");
  });
  // 2) Anything left (inline style="" attributes) — remove the transform outright.
  out = out.replace(UPPERCASE_DECL_RE, "");
  return out;
}

export function guardSlotContent(slotName: string, content: string): GuardResult {
  if (SOURCE_LIKE_SLOTS.has(slotName)) {
    return { allowed: true, sanitized: content };
  }

  const match = content.match(BRAND_COMBINED_REGEX);
  if (match) {
    const matched = match[1].toLowerCase();
    const brand = BRAND_BLOCKLIST.find((b) => b.toLowerCase() === matched) ?? matched;
    return {
      allowed: true,
      sanitized: content,
      warning: `Slot "${slotName}" references brand "${brand}" — review before publishing.`,
    };
  }
  return { allowed: true, sanitized: content };
}
