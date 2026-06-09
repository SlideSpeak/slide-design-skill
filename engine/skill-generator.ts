import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { loadSkill, listSkills } from "./skill-loader.ts";
import type { Skill, Tokens } from "./types.ts";
import {
  COMPOSITION_FAMILIES,
  FAMILY_INTENT,
  DEFAULT_TRAP_FAMILY,
} from "./composition-families.ts";

/**
 * Codified version of the manual style-derivation workflow validated 2026-05-28.
 * Given a free-form style brief,
 * produces a 6-file skill package and loads it as an in-memory Skill.
 *
 * The LLM does the generation; this module composes the generator-prompt,
 * parses the structured response, materializes files to disk (temp by default),
 * and hands back a Skill object the existing engine can consume unchanged.
 */

export type StyleBrief =
  | { kind: "preset"; name: string }
  | { kind: "inspiration"; value: string }
  | { kind: "mix"; values: string[] }
  | { kind: "brand-url"; url: string; scrapedDescription?: string };

export interface GeneratedSkillFiles {
  "SKILL.md": string;
  "tokens.json": string;
  "layout-grammar.md": string;
  "components.html": string;
  "image-style.md": string;
  "chrome.css": string;
}

export interface SkillReference {
  name: string;
  description: string;
  colorKit: string;
  typographyKit: string;
  slideTypeCount: number;
  exampleHeadline?: string;
}

export interface GeneratorLLM {
  /**
   * The LLM call. Implementations call Claude / OpenAI / etc with the prompt
   * and return the 6 file contents. The prompt instructs the model to respond
   * with a single JSON object whose keys are the 6 filenames. Implementations
   * are responsible for extracting that JSON from the response.
   */
  generateSkill(prompt: string, brief: StyleBrief): Promise<GeneratedSkillFiles>;
}

const FILE_KEYS = [
  "SKILL.md",
  "tokens.json",
  "layout-grammar.md",
  "components.html",
  "image-style.md",
  "chrome.css",
] as const;

const SLUG_MAX = 32;
const SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;

export function slugForBrief(brief: StyleBrief): string {
  const raw = (() => {
    switch (brief.kind) {
      case "preset": return brief.name;
      case "inspiration": return brief.value;
      case "mix": return brief.values.join("-");
      case "brand-url": {
        // TODO: not yet implemented — needs a scraper
        try { return new URL(brief.url).hostname.replace(/^www\./, ""); }
        catch { return "brand"; }
      }
    }
  })();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, SLUG_MAX);
  if (!slug || !/^[a-z]/.test(slug)) return "adhoc";
  return slug;
}

export function describeBrief(brief: StyleBrief): string {
  switch (brief.kind) {
    case "preset":
      return `Use existing preset skill "${brief.name}" — no generation needed.`;
    case "inspiration":
      return `Generate a new skill inspired by: "${brief.value}".`;
    case "mix":
      return `Generate a new skill that BLENDS these influences: ${brief.values.map((v) => `"${v}"`).join(" × ")}. The result must be neither anchor alone — it must earn both.`;
    case "brand-url": {
      // TODO: not yet implemented — needs a scraper
      const desc = brief.scrapedDescription
        ? ` Scraped brand context: ${brief.scrapedDescription}`
        : "";
      return `Generate a new skill for brand at ${brief.url}.${desc}`;
    }
  }
}

/**
 * Builds the LLM prompt. The prompt is self-contained — it explains the
 * 6-file format, names the validator constraints, gives reference excerpts
 * from existing skills, and states the brief. The model's job is to return
 * a JSON object whose 6 keys are the filenames and whose values are the
 * full file contents as strings.
 */
export function composeGeneratorPrompt(
  brief: StyleBrief,
  references: SkillReference[],
  slug: string,
): string {
  const refsBlock = references
    .map(
      (r) =>
        `- "${r.name}": ${r.description}\n  colors: ${r.colorKit}\n  type: ${r.typographyKit}\n  ${r.slideTypeCount} slide types`,
    )
    .join("\n");

  const familyBlock = COMPOSITION_FAMILIES.map(
    (f) => `  - ${f} — ${FAMILY_INTENT[f]}`,
  ).join("\n");

  return `You are the skill-generator for SlideSpeak. Your job: produce a 6-file slide-design skill package for the engine. The engine renders any deck the LLM later generates using these files.

BRIEF
${describeBrief(brief)}
The generated skill must be named exactly "${slug}" (frontmatter \`name:\` must equal "${slug}", folder will be created with this name).

REFERENCE SKILLS (existing, validated — your output should be in the same shape)
${refsBlock}

THE 6 FILES YOU MUST PRODUCE

1. SKILL.md — frontmatter (YAML) + authoring guide (markdown body). Frontmatter requires fields: \`name\` (= "${slug}"), \`version\` ("0.1.0"), \`description\` (one paragraph naming when to use this skill, what it looks like, what it is NOT), \`inspiration\` (concrete refs), \`typography_kit\` (specific fonts + weights + tracking), \`color_kit\` (specific hex values + role), \`image_style\` (gradient direction + mockup style), \`forbidden\` (concrete anti-clichés this skill rejects — at least 5 items). Body is 6–10 short sections: hero stance, type rules, color rules, anti-cliché list, voice rules, slide hierarchy, density rule.

2. tokens.json — strict shape:
{
  "color": {
    "ground": { "page": "#......", "card": "#......", "ink": "#......" },
    "signal": { "primary": "#......", "subtle": "#......" },
    "support": { "muted": "#......", "rule": "#......" }
  },
  "type": {
    "header": { "family": "...", "weight": 400-800, "scale": [largest, ..., smallest] },
    "body": { "family": "...", "weight": 400, "scale": [...] },
    "data": { "family": "...", "weight": 500 }
  },
  "spacing": { "unit": 4, "scale": [4,8,12,16,24,32,48,64,96] },
  "radius": { "card": 8-32, "button": 8-999, "input": 8-16 },
  "elevation": { "card": "0 1px 2px rgba(...), 0 8px 32px rgba(...)" },
  "page": { "ratio": "16:9", "width": 1920, "height": 1080, "safe": 96 },
  "icon": { "kit": "lucide" },
  "webFonts": ["Family:wght@...", ...]
}

Pick \`icon.kit\` to match the vibe — it changes how every {{@icon}} looks:
- "lucide" — clean thin stroke, neutral/modern (default safe choice)
- "tabler" — slightly heavier even stroke, technical/dense decks
- "heroicons" — light 1.5px stroke, calm product/SaaS feel
- "phosphor" — solid filled icons, warm/editorial/consumer feel
Choose the one whose weight and fill match the brand; do NOT default to lucide every time.

3. layout-grammar.md — pipe-table with columns \`slide-type\`, \`when\`, \`family\`, \`required slots\`, \`optional slots\`. Must have at least 5 slide types. Slot names are kebab-case. Then a \`## Composition Rules\` section with at least 3 bulleted rules. One Composition Rule MUST be a ground-truth fidelity rule, e.g.: "Numbers, sources, and citations are rendered only from user-supplied input — never fabricated. Geographic and icon visuals come from engine directives (dot-map, geo-pins, icon), never hand-drawn SVG or invented coordinates."

**CRITICAL — composition families, not just slide types.** Each slide type declares ONE composition family in the \`family\` column. A family is the VISUAL ARCHETYPE the slide renders as, independent of its name. The available families are:
${familyBlock}
The monotony failure we are fixing: a deck whose every slide is a headline + N labelled columns of bullets. Many distinctly-NAMED types ("market", "team", "roadmap") that are all the SAME family (\`${DEFAULT_TRAP_FAMILY}\`) read as one slide repeated 14 times. That is the single most common way a generated deck looks AI-made. To prevent it:
- Your slide types MUST span a REPERTOIRE of at least 6 distinct families across the grammar.
- NO single family may be worn by more than ~35% of your slide types. \`${DEFAULT_TRAP_FAMILY}\` is the default trap — reach for it LAST, not first. Most enumerations are better as a \`flow-diagram\`, \`comparison\`, \`timeline\`, \`metric-hero\`, or \`statement\`.
- Pick the family from what the CONTENT actually is: a process is a \`flow-diagram\` (not three cards), two options are a \`comparison\` (not a 2-col grid of bullets), one key figure is a \`metric-hero\` (not a card), a sequence of dates is a \`timeline\`.

Derive the slide types from the BRIEF and the deck-kind it implies — do NOT reach for a fixed skeleton. A pitch, a research report, a workshop, a product launch and an investor update each need a different set of slide types, in a different order, with different anchors. Invent the set the brief actually calls for (minimum 5). The cover is the only always-required slide. Use directives where they fit: {{@chart}} for trends/comparisons, {{@list}} for enumerations (items separated by |), {{@table}} for matrices, {{@gradient-bg}} for bleed backgrounds.

(For reference only, NOT a template to copy: a generic launch deck might run cover → status-quo → the-shift → product-intro → feature → customer-proof → pricing → cta. Treat this as one example of the shape, never the default.)

4. components.html — one \`<template id="slide-NAME">...</template>\` per slide-type. Every required slot MUST appear as \`{{slot-name}}\` inside its template. Use \`{{@chart}}\`, \`{{@list}}\`, \`{{@gradient-bg}}\` directives where appropriate. Inline CSS only — no external classes beyond \`slide\`, \`slide-bleed\`, \`slide-flow\`, \`bleed-content\`, \`flow-grow\`, and the bounded-island utilities below.

**CRITICAL — fill the slide, never float.** The #1 layout failure is content clustering at the TOP under the headline, leaving the lower third or half of the slide empty. The engine's base CSS ships neutral, look-free utilities that solve this; every non-bleed content template MUST use them so content occupies the WHOLE slide:
- Structure a content slide as a bounded island: \`<div class="slide-flow"><div class="flow-head">…title/eyebrow…</div><div class="flow-stage">…main content…</div><div class="flow-foot">…footer/source…</div></div>\`. The head and foot pin top and bottom; the stage fills everything between.
- If the stage's content is SPARSE (a sentence, one metric, a short list), add \`flow-center\` to the stage (\`class="flow-stage flow-center"\`) so it sits in the optical middle instead of floating to the top.
- If the stage holds a GRID of peer cards, use \`<div class="flow-grid-fill" style="grid-template-columns:…; gap:…">\` and give each card \`class="flow-fill"\` so the cards STRETCH to the full height. Inside a card, wrap its content in \`<div class="flow-fill-body flow-between">\` (or \`flow-center\`) so the card's own content distributes over its height and the card is never half-empty either.
- These utilities carry NO look (no color, border, gap, padding) — you still set gap/padding/radius/color in chrome.css. They only do the flex/grid height mechanics.
- A template that puts a headline at the top and a short \`{{@list}}\` directly under it with no growable stage is a FAILURE — it will float. Wrap it.

Available CSS variables: \`--color-page\`, \`--color-card\`, \`--color-ink\`, \`--color-signal\`, \`--color-subtle\`, \`--color-muted\`, \`--color-rule\`, \`--font-header\`, \`--font-body\`, \`--font-data\`, \`--elevation-card\`. Bleed templates use \`<section class="slide slide-NAME slide-bleed">\` with an inline gradient background OR \`{{@gradient-bg bgSlot=bg-image}}\` for FAL-rendered backgrounds; content templates use \`<section class="slide slide-NAME"><div class="slide-flow">...</div></section>\`.

**CRITICAL — never fabricate a real product, UI, or person; use {{@placeholder}}.** Anything the customer would supply from their own world — app screenshots, device/phone mockups, product photos, dashboards, real people, brand photography — must NOT be hand-built as fake HTML/CSS UI and must NOT be requested as an AI or stock image. Reconstructing a product never looks right and isn't ours to invent. Instead drop a placeholder slot the customer fills in: \`{{@placeholder}}\` (fills its frame), \`{{@placeholder ratio=9:19.5}}\` (phone), \`{{@placeholder ratio=16:9}}\` (screen), optionally \`{{@placeholder slot=caption-slot}}\` for a custom caption. It renders an on-brand empty frame in the deck's own colours. For a phone-mockup slide, wrap {{@placeholder ratio=9:19.5}} in your own device-frame chrome (bezel, notch) but leave the SCREEN as the placeholder. Atmospheric backgrounds, abstract textures and gradients are NOT products — those still use {{@gradient-bg}} / image categories as normal.

The engine's base CSS is NEUTRAL — it only wires the .slide box, heading sizes (from tokens) and the flex/grid mechanics of .slide-flow/.flow-grow. It applies NO look. Any look-bearing class you use (\`eyebrow\`, \`source\`, \`signal-bar\`, the \`dir-table\` emitted by {{@table}}, plus heading line-height/tracking and the .slide-flow gap/rhythm) is UNSTYLED until you style it in chrome.css (file 6). This is deliberate: it is how your skill looks different from every other skill. Do not assume any inherited footer, eyebrow or table styling exists.

**CRITICAL — distinct hero-anchor on cover slide.** The cover MUST have a distinct compositional primitive (a visual anchor that earns the slide), not just a large centered product name. Different brands demand different anchors:
- chat-bubble cover (for conversational / AI-builder products) — the cover IS a chat exchange
- metric-led cover (for fintech / data products) — a huge number anchors, product name is a small chip
- breath-circle or icon-led cover (for wellness / consumer apps) — a visual symbol carries the slide
- command-palette cover (for dev-tools) — the palette IS the cover, product name lives inside
- photograph-led cover (for editorial) — full-bleed photo with title overlay
- framed-mat cover (for gallery / craft) — centered framed composition with mat-board chip
- chart-led cover (for research / annual reports) — a teaser chart IS the cover
- typography-only cover (for brutalist / literary) — huge type as the visual

NEVER default to "product-name top-left + positioning-line below + mono eyebrows in four corners + arrow-circle bottom-right" — that's the launch-warm pattern; reusing it for a new skill is a generator failure, not a design choice. The cover composition is half the brand's signal — make it distinctly its own.

**CRITICAL — accent deployment, not accent sprinkle.** Picking accent hex values is not enough; you must define WHERE the accent appears and HOW MUCH, the way the reference brand actually deploys it. Accent colour is a budget, not a default. Real brands apply their accent with discipline and repetition: it lands on the same kind of element every time (one hero number, the primary CTA, a single data series, one bleed moment) and is absent everywhere else, surrounded by the brand's ground colour. Spreading the accent across eyebrows, rules, icons and headings at once reads as generic — a failure, not richness. In SKILL.md's colour rules AND in chrome.css, state the accent's role explicitly: which one or two element types carry it, the cap per slide (often a single accent moment), and what stays neutral. Example of the DISCIPLINE (not the colours): a fintech reference might put its accent only on the card surface and the primary action, against generous near-white — never on every label.

Equally, do NOT retreat into near-monochrome or all-dark out of caution. If the brief or its reference points to a bright, optimistic or colour-forward world, commit to it — match the reference's real brightness and saturation rather than defaulting to safe grey-on-dark. Under-using colour is as much a brand failure as scattering it. Decide the deck's overall key (light / dark / colour-forward) from the brief, not from a default.

5. image-style.md — must contain (literal lines, backticks included as shown):
- A line of the form: Prompt template: \`<one-line prompt fragment containing {subject}>\`
- A line of the form: Negative prompt: <comma-separated list>
- A line of the form: Search-query template: \`<fragment containing {subject}>\`
- Decision rules: at least one bullet per category (gradient, product, person, chart, building). Each bullet uses the form: - \`category\` → AI default | stock | ask
- OPTIONALLY a line of the form: Treatment: \`<name>\` to apply a deliberate stylistic abstraction to EVERY AI image instead of literal photography. Pick one ONLY if it genuinely fits the brand's world. Choices: photographic (default, omit the line); painted/printed mediums — oil-painting, renaissance, watercolor, risograph, cyanotype, line-engraving; digital-graphic — pixel-art, halftone, ascii, blueprint. A heritage/cultural brand → renaissance or line-engraving; an artisanal brand → watercolor; a playful indie brand → risograph or halftone; a retro/gaming brand → pixel-art; a dev/technical brand → ascii or blueprint. Do NOT reach for the same treatment every time, and do NOT add one just to seem clever — most decks stay photographic.

For product/UI/person imagery use {{@placeholder}} (see above), never an AI image — treatments apply to atmospheric / conceptual imagery only.

6. chrome.css — the LOOK of this skill, emitted after the neutral base. This is where the brand's visual identity lives and where this skill earns the right to look unlike the others. Define, using the CSS variables above:
- \`.slide .eyebrow\` — how labels/kickers read in THIS brand (font, case, color, size, tracking). Sentence case, normal tracking — NEVER uppercase + letter-spacing (a banned cliché).
- \`.slide .source\` — the footer/citation treatment (or omit a footer entirely if the brand wouldn't use one).
- \`.slide .signal-bar\` and any accent primitives the components reference.
- \`.dir-table\`, \`.dir-table thead th\`, \`.dir-table tbody th/td\` — the full table look, IF any slide-type uses {{@table}} (rule weight, label column, padding, numeric treatment). Skip if you use no tables.
- \`.slide-flow { gap: ...; padding-bottom: ...; }\` — the vertical rhythm. Pick a gap that matches the brand's density (tight/editorial/airy), not a default 32px.
- heading line-height / letter-spacing on \`.slide h1..h4\` if the type system wants it.
Make these choices FROM THE BRIEF. A warm consumer brand, a brutalist editorial brand and a dense data brand must produce visibly different chrome.css — different rhythm, different label treatment, different table weight. Reusing the same values across briefs is a generator failure.

HARD RULES — these read as machine-made; they are non-negotiable across ALL files
- NO uppercase-set labels. Never \`text-transform: uppercase\`, never letter-spaced all-caps eyebrows/kickers. Labels are sentence case at normal tracking. (The loader strips uppercase typography defensively, but emitting it is a failure.)
- NO accent line / colored bar / colored border pinned to a card EDGE (no \`border-top: 3px solid <accent>\` on a card, no left-edge accent stripe). A colored rule on the lip of a card is the loudest AI tell there is. Carry accent through a number, an icon, a filled chip, or a single tinted surface instead — never the card's edge.
- NO em-dashes (—) anywhere in copy, SKILL.md prose, or example text. Use a comma, a period, or "to" for ranges. Hyphens in compound words are fine.
- NO fake product UI, no invented logos, no real brand names (use {{@placeholder}}, see above).

VALIDATOR CONSTRAINTS (your output must pass)
- frontmatter \`name\` must equal "${slug}" exactly.
- tokens.page must be exactly 1920×1080.
- ≥ 5 slide types, ≥ 3 composition rules.
- Every slide type declares a known \`family\` (one of: ${COMPOSITION_FAMILIES.join(", ")}); the grammar spans ≥ 6 distinct families and no family exceeds ~35% of types.
- Non-bleed content templates use the bounded-island utilities (a \`flow-stage\` or \`flow-grid-fill\`) so content fills the slide.
- Every grammar slide-type must have a matching \`<template id="slide-NAME">\`.
- Every required slot must appear as \`{{slot}}\` (or be consumed by a \`{{@directive arg=slot ...}}\`) inside its template.
- No undeclared \`{{placeholders}}\` — every \`{{x}}\` must be either a declared slot, an \`image:N\` reference, or a directive.
- No uppercase-set labels, no card-edge accent lines, no em-dashes.
- No brand names, logos, or copyrighted artwork references in any of the files.

RESPONSE FORMAT
Return one strict JSON object — no prose, no markdown fences. Shape:
{
  "SKILL.md": "...full file contents as string, including the --- frontmatter delimiters and the markdown body...",
  "tokens.json": "...full JSON as string (do NOT inline as object — keep it as a JSON string)...",
  "layout-grammar.md": "...full markdown...",
  "components.html": "...full HTML...",
  "image-style.md": "...full markdown...",
  "chrome.css": "...full CSS — the bespoke look for this skill..."
}

NOW GENERATE THE SKILL for: ${describeBrief(brief)}`;
}

/**
 * Parses a free-form LLM response and extracts the 6 named files. Accepts:
 * - A JSON object with the 6 keys (preferred)
 * - A JSON-in-code-fence (\`\`\`json ... \`\`\`) — extracts the fence
 * - Loose plain text (errors)
 *
 * Returns the parsed files. Throws on missing keys or invalid JSON.
 */
export function parseGeneratedSkill(response: string): GeneratedSkillFiles {
  const trimmed = response.trim();
  let jsonText = trimmed;
  const fence = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) jsonText = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(
      `Generator response is not valid JSON: ${(e as Error).message}. First 200 chars: ${jsonText.slice(0, 200)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Generator response must be a JSON object.");
  }
  const obj = parsed as Record<string, unknown>;
  for (const key of FILE_KEYS) {
    if (typeof obj[key] !== "string") {
      throw new Error(`Generator response missing or non-string key: "${key}".`);
    }
  }
  return {
    "SKILL.md": obj["SKILL.md"] as string,
    "tokens.json": obj["tokens.json"] as string,
    "layout-grammar.md": obj["layout-grammar.md"] as string,
    "components.html": obj["components.html"] as string,
    "image-style.md": obj["image-style.md"] as string,
    "chrome.css": obj["chrome.css"] as string,
  };
}

/**
 * Writes the 6 files to disk and loads them as a Skill object via the
 * existing loadSkill. By default uses a fresh temp directory; pass `baseDir`
 * to materialize under a specific path (e.g. skills/<slug>/ for inspection).
 *
 * Returns a cleanup function that removes the temp dir (no-op if baseDir was
 * provided by the caller).
 */
export async function materializeSkill(
  files: GeneratedSkillFiles,
  slug: string,
  options: { baseDir?: string } = {},
): Promise<{ skill: Skill; dir: string; cleanup: () => Promise<void> }> {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid slug "${slug}": must match ${SLUG_RE}`);
  }
  let dir: string;
  let ownsDir = false;
  if (options.baseDir) {
    dir = resolve(options.baseDir);
    await mkdir(dir, { recursive: true });
  } else {
    dir = await mkdtemp(join(tmpdir(), `slidespeak-skill-${slug}-`));
    ownsDir = true;
  }

  await Promise.all(
    FILE_KEYS.map((k) => writeFile(join(dir, k), files[k], "utf8")),
  );

  let skill: Skill;
  try {
    skill = await loadSkill(dir);
  } catch (e) {
    if (ownsDir) await rm(dir, { recursive: true, force: true });
    throw e;
  }

  if (skill.frontmatter.name !== slug) {
    if (ownsDir) await rm(dir, { recursive: true, force: true });
    throw new Error(
      `Generated SKILL.md frontmatter name "${skill.frontmatter.name}" != slug "${slug}". Generator must respect the assigned slug.`,
    );
  }

  return {
    skill,
    dir,
    cleanup: async () => {
      if (ownsDir) await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Full end-to-end: brief → LLM call → 5 files → Skill object.
 */
export async function generateSkill(
  brief: StyleBrief,
  deps: {
    llm: GeneratorLLM;
    references: SkillReference[];
    baseDir?: string;
  },
): Promise<{ skill: Skill; dir: string; cleanup: () => Promise<void> }> {
  const slug = slugForBrief(brief);
  const prompt = composeGeneratorPrompt(brief, deps.references, slug);

  const maxAttempts = 3;
  let lastError: unknown;
  let files: GeneratedSkillFiles | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      files = await deps.llm.generateSkill(prompt, brief);
      break;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  if (!files) {
    throw new Error(
      `generateSkill: LLM call failed after ${maxAttempts} attempts. Last error: ${(lastError as Error)?.message ?? String(lastError)}`,
    );
  }
  return materializeSkill(files, slug, { baseDir: deps.baseDir });
}

/**
 * Scans a skills directory and returns compact reference summaries suitable
 * for inclusion in the generator prompt as few-shot anchors.
 */
const REF_CACHE = new Map<string, SkillReference[]>();

export async function buildReferenceLibrary(
  skillsRoot: string,
): Promise<SkillReference[]> {
  const cacheKey = resolve(skillsRoot);
  const cached = REF_CACHE.get(cacheKey);
  if (cached) return cached;

  const names = await listSkills(skillsRoot);
  const refs: SkillReference[] = [];
  for (const name of names) {
    try {
      const skillMd = await readFile(join(skillsRoot, name, "SKILL.md"), "utf8");
      const parsed = matter(skillMd);
      const fm = parsed.data as Record<string, unknown>;
      const grammarMd = await readFile(
        join(skillsRoot, name, "layout-grammar.md"),
        "utf8",
      );
      const slideTypeCount = (grammarMd.match(/^\|\s*`?slide-/gm) || []).length;
      refs.push({
        name,
        description: typeof fm.description === "string" ? fm.description.slice(0, 280) : "",
        colorKit: typeof fm.color_kit === "string" ? fm.color_kit.slice(0, 200) : "",
        typographyKit: typeof fm.typography_kit === "string" ? fm.typography_kit.slice(0, 200) : "",
        slideTypeCount,
      });
    } catch (e) {
      console.warn(`buildReferenceLibrary: skipping skill "${name}" (load failed: ${(e as Error).message})`);
    }
  }
  REF_CACHE.set(cacheKey, refs);
  return refs;
}
