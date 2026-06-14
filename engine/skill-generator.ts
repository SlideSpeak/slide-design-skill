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
import { inferPresentationType } from "./deck-plan.ts";

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
  /** The slide-type names this skill defines, so a new generation can pick a divergent structure. */
  slideTypes?: string[];
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
        `- "${r.name}": ${r.description}\n  colors: ${r.colorKit}\n  type: ${r.typographyKit}\n  structure (${r.slideTypeCount} slide types): ${r.slideTypes?.length ? r.slideTypes.join(", ") : "n/a"}`,
    )
    .join("\n");

  const familyBlock = COMPOSITION_FAMILIES.map(
    (f) => `  - ${f} — ${FAMILY_INTENT[f]}`,
  ).join("\n");

  const presentationType = inferPresentationType(describeBrief(brief).toLowerCase());
  const editorialBlock =
    presentationType === "editorial" ? editorialSkillRequirements() : "";
  const pitchBlock = presentationType === "pitch" ? pitchSkillRequirements() : "";
  const teachingBlock = presentationType === "teaching" ? teachingSkillRequirements() : "";
  const keynoteBlock = presentationType === "keynote" ? keynoteSkillRequirements() : "";
  const reportBlock = presentationType === "report" ? reportSkillRequirements() : "";

  return `You are the skill-generator for SlideSpeak. Your job: produce a 6-file slide-design skill package for the engine. The engine renders any deck the LLM later generates using these files.

BRIEF
${describeBrief(brief)}
The generated skill must be named exactly "${slug}" (frontmatter \`name:\` must equal "${slug}", folder will be created with this name).

REFERENCE SKILLS (existing, validated — match their FILE FORMAT, never their look or their structure)
${refsBlock}

DIVERGE FROM THE REFERENCES, ESPECIALLY SAME-REGISTER ONES. The references above are NOT a menu to copy; they are shown so you can avoid what already exists. Your skill MUST NOT reuse the spine or the slide-type set of any reference. If a reference reads as the same register as this brief (another pitch, another editorial deck), pick a DIFFERENT spine family and a substantially different slide-type set and sequencing: two skills in one register sharing a skeleton is the single failure this instruction exists to prevent. Same 6-file format, different structure.

THE 6 FILES YOU MUST PRODUCE

1. SKILL.md — frontmatter (YAML) + authoring guide (markdown body). Frontmatter requires fields: \`name\` (= "${slug}"), \`version\` ("0.1.0"), \`description\` (one paragraph naming when to use this skill, what it looks like, what it is NOT), \`inspiration\` (concrete refs), \`typography_kit\` (specific fonts + weights + tracking), \`color_kit\` (specific hex values + role), \`image_style\` (gradient direction + mockup style), \`forbidden\` (concrete anti-clichés this skill rejects — at least 5 items). Body is 7–11 short sections: hero stance, type rules, color rules, anti-cliché list, voice rules, slide hierarchy, density rule, a graphic-system section (the signature mark, surface treatment, structural devices, the depth moment, and where each appears — see the graphic-layer rules under file 6), and a layout-variance posture (conservative / confident / experimental, derived from the brief) that states how much asymmetry and scale contrast this style permits.

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

**CRITICAL — font choices are tells now.** A handful of typefaces have become the signature of AI-generated design because every model reaches for them. These are BANNED as the skill's identity:
- Inter (or Inter Tight) as the HEADER family, or Inter for header AND body. Inter as a body/data workhorse next to a distinctive header face is acceptable.
- Fraunces and Instrument Serif as display serifs. They scream "AI made this" in 2026.
- Playfair Display, DM Serif, Space Grotesk as the lazy "make it designy" reach.
Instead pick from a wider pool and MATCH IT TO THE BRIEF, e.g. sans: Geist, Satoshi, Cabinet Grotesk, Outfit, General Sans, Manrope, Bricolage Grotesque, Schibsted Grotesk, Hanken Grotesk, Figtree; serif: Source Serif 4, Newsreader, Lora, Spectral, Libre Caslon, STIX Two Text, Crimson Pro; mono/data: JetBrains Mono, IBM Plex Mono, Geist Mono, Spline Sans Mono. Two different briefs must not land on the same pairing; the typeface is half the style's identity.

Pick \`icon.kit\` to match the vibe — it changes how every {{@icon}} looks:
- "lucide" — clean thin stroke, neutral/modern (default safe choice)
- "tabler" — slightly heavier even stroke, technical/dense decks
- "heroicons" — light 1.5px stroke, calm product/SaaS feel
- "phosphor" — solid filled icons, warm/editorial/consumer feel
Choose the one whose weight and fill match the brand; do NOT default to lucide every time.

3. layout-grammar.md — pipe-table with columns \`slide-type\`, \`when\`, \`family\`, \`required slots\`, \`optional slots\`, \`visual roles\`. Must have at least 5 slide types. The \`visual roles\` column names the visual construct(s) each type realizes (one or more of: item-marker, chartlet, meter, signature-mark, oversized-number, visual-plate) — every data-bearing family type (comparison, timeline, matrix, cards-grid, table, flow-diagram) MUST declare at least one, and its template MUST actually render it. Slot names are kebab-case. Then a \`## Composition Rules\` section with at least 3 bulleted rules. One Composition Rule MUST be a ground-truth fidelity rule, e.g.: "Numbers, sources, and citations are rendered only from user-supplied input — never fabricated. Geographic and icon visuals come from engine directives (dot-map, geo-pins, icon), never hand-drawn SVG or invented coordinates."

**CRITICAL — composition families, not just slide types.** Each slide type declares ONE composition family in the \`family\` column. A family is the VISUAL ARCHETYPE the slide renders as, independent of its name. The available families are:
${familyBlock}
The monotony failure we are fixing: a deck whose every slide is a headline + N labelled columns of bullets. Many distinctly-NAMED types ("market", "team", "roadmap") that are all the SAME family (\`${DEFAULT_TRAP_FAMILY}\`) read as one slide repeated 14 times. That is the single most common way a generated deck looks AI-made. To prevent it:
- Your slide types MUST span a REPERTOIRE of at least 6 distinct families across the grammar.
- NO single family may be worn by more than ~35% of your slide types. \`${DEFAULT_TRAP_FAMILY}\` is the default trap — reach for it LAST, not first. Most enumerations are better as a \`flow-diagram\`, \`comparison\`, \`timeline\`, \`metric-hero\`, or \`statement\`.
- Pick the family from what the CONTENT actually is: a process is a \`flow-diagram\` (not three cards), two options are a \`comparison\` (not a 2-col grid of bullets), one key figure is a \`metric-hero\` (not a card), a sequence of dates is a \`timeline\`.
- TEXTURE registers, beyond family names. The eye reads three registers: BOXED surfaces (cards-grid, table, matrix — they all read as one texture regardless of name), UNBOXED typography (statement, metric-hero, quote — type set directly on the page, no card around it), and VISUAL (image-spread, split-visual). The boxed families together may cover at most HALF of your slide types; include at least 2 unboxed types. A deck with no unboxed slide reads as a wall of boxes.
- INTEGRATED imagery, not only bleeds. Unless the brief is strictly data/text, include at least one \`split-visual\` type where a photograph shares the slide with structured content: a photo column beside the argument (grid with one image cell, \`object-fit: cover\`, optionally text on the image under a {{@scrim}}), a figure inset in the layout, or a hero stat set over an image region. Decks that only alternate full-bleed photo ↔ text grid read as two slides repeated — split-visual is the middle register that breaks that rhythm.
- REALIZE A VISUAL on every data-bearing family. A \`comparison\`, \`timeline\`, \`matrix\`, \`cards-grid\`, \`table\` or \`flow-diagram\` type that renders as a title sitting over plain text columns is the boredom tell, and it now FAILS the rendered richness gate. Its template MUST carry a real visual construct: a {{@chart}} or {{@table}} directive, a meter/bar, an icon per item, a marked/ledgered list, a dominant numeral, or a figure plate. Non-directive visuals (a meter you draw, a giant numeral, a row marker, an image plate) MUST carry a \`data-visual-event="meter|oversized-number|item-marker|signature-mark|visual-plate"\` attribute so the gate counts them. NEVER invent data to manufacture a chart — if a point has no real numbers, carry it visually another way (icons per item, a labelled diagram, a dominant figure), never a fabricated series.

Charts can carry their own takeaway: \`{{@chart type=bar data=... note=<slot>}}\` renders the slot top-right on the chart in the accent colour — use it so a data slide states its so-what ON the exhibit.

Derive the slide types from the BRIEF and the deck-kind it implies — do NOT reach for a fixed skeleton. A pitch, a research report, a workshop, a product launch and an investor update each need a different set of slide types, in a different order, with different anchors. Invent the set the brief actually calls for (minimum 5). The cover is the only always-required slide. Use directives where they fit: {{@chart}} for trends/comparisons, {{@list}} for enumerations (items separated by |), {{@table}} for matrices, {{@gradient-bg}} for bleed backgrounds.

(For reference only, NOT a template to copy: a generic launch deck might run cover → status-quo → the-shift → product-intro → feature → customer-proof → pricing → cta. Treat this as one example of the shape, never the default.)

4. components.html — one \`<template id="slide-NAME">...</template>\` per slide-type. Every required slot MUST appear as \`{{slot-name}}\` inside its template. Use \`{{@chart}}\`, \`{{@list}}\`, \`{{@gradient-bg}}\` directives where appropriate. Inline CSS only — no external classes beyond \`slide\`, \`slide-bleed\`, \`slide-flow\`, \`bleed-content\`, \`flow-grow\`, and the bounded-island utilities below.

**CRITICAL — fill the frame, but match the layout to the content.** Two opposite failures both read as machine-made: (a) FLOAT — content clustering at the TOP under the headline with an empty lower half; (b) UNDERFILL — thin content stretched across a layout that is too big for it, leaving large empty bands or rows of half-empty boxes. The cure for both is one principle: choose a layout sized to the content you actually have, then fill it. The engine ships neutral, look-free utilities for the mechanics:
- Structure a content slide as a bounded island: \`<div class="slide-flow"><div class="flow-head">…title/eyebrow…</div><div class="flow-stage">…main content…</div><div class="flow-foot">…footer/source…</div></div>\`. The head and foot pin top and bottom; the stage fills between.
- SPARSE stage (a sentence, one metric, a short list): add \`flow-center\` to the stage (\`class="flow-stage flow-center"\`) so the content sits as a compact band in the optical middle. Do NOT stretch it to the edges.
- GRID of peer cards: only STRETCH cards to full height (\`flow-grid-fill\` + card \`flow-fill\` + inner \`flow-fill-body flow-between\`) when each card genuinely carries enough to fill it — a chart, a paragraph, a multi-line list. If each card is THIN (a word, a short phrase, a number + a one-line label), do NOT stretch: a stretched thin card is a tall empty box. Instead keep the cards sized to their content and center the whole grid as a band (\`flow-stage flow-center\` wrapping a normal grid, no \`flow-fill\`).
- Match the cell COUNT to the content. Do not pour many short items into a many-cell full-height grid (twelve one-word items in a twelve-cell grid renders as twelve empty boxes). Give each item a short supporting line, use fewer larger cells, or pick a more compact composition.
- VERTICAL LIST / LEDGER (rows with dividers or hairlines): to fill the stage, give the rows EQUAL-height tracks and CENTER each row's content in its track — use \`<div class="flow-rows">\` (equal tracks) with each row \`class="flow-row"\` (content centers vertically). Do NOT use \`justify-content:space-between\` on natural-height rows: that spreads the rows but the content and its divider stay stuck at the top of each band, leaving a void under every item and only the LAST row landing flush at the bottom. Put dividers on the row's border so they sit at even intervals.
- If a point genuinely has little to say, make it an editorial-density slide (one line, deliberate space), never a half-filled grid.
- These utilities carry NO look (no color, border, gap, padding) — you still set those in chrome.css. They only do the flex/grid height mechanics.
- FAILURES: a headline with a short \`{{@list}}\` under it and no growable stage (floats); a full-height grid of thin cells (underfills); \`flow-fill\` + \`flow-between\` on a card that holds only a number, a title and one line (the line drops to the bottom and the card's middle is a void — this is the single most common underfill, do NOT do it). Wrap and size deliberately.
- MANDATORY occupancy gate: prose alone does not guarantee a filled deck. After you render, you MUST run \`npx tsx scripts/measure-occupancy.mts <rendered-deck.html>\` and FIX every slide it reports as UNDERFILL or CELL-UNDERFILL (re-template or re-author that slide, then re-measure) until every slide passes. The gate also measures INSIDE each card: a cell whose own content leaves a big interior void, or a large card carrying only a word, fails even when the page-level scan passes. A deck with any flagged slide is not finished.

Available CSS variables: \`--color-page\`, \`--color-card\`, \`--color-ink\`, \`--color-signal\`, \`--color-subtle\`, \`--color-muted\`, \`--color-rule\`, \`--font-header\`, \`--font-body\`, \`--font-data\`, \`--elevation-card\`. Bleed templates use \`<section class="slide slide-NAME slide-bleed">\` with an inline gradient background OR \`{{@gradient-bg bgSlot=bg-image}}\` for FAL-rendered backgrounds; content templates use \`<section class="slide slide-NAME"><div class="slide-flow">...</div></section>\`.

Customer/partner logo walls: use \`{{@logo-wall names=<slot>}}\` when the user names real customers (their names render as plain type wordmarks, grounded in the content), or bare \`{{@logo-wall}}\` for an obviously-dummy placeholder wall (Acme-set geometric marks the customer replaces with real logos). NEVER hand-draw a real brand's logo and never invent plausible-sounding company names — a dummy logo must read as "swap me".

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

**CRITICAL — genre-default palettes are tells.** Every AI reaches for the same palette per brief genre, which makes unrelated decks look like siblings. BANNED as the automatic choice: premium/artisan → warm beige + brass + oxblood + espresso; tech/AI → purple-blue glow on dark; fintech → navy + teal; wellness → sage + cream; luxury travel → navy + gold. If the brief itself names colours, follow the brief. Otherwise deliberately rotate to a less-expected axis that still fits the world (cold luxury silver/chrome/smoke, deep forest + bone + amber, true black-and-tan, cobalt + cream, oxide red + plaster, ink + citron). Two skills generated from similar briefs must not share a palette.

5. image-style.md — must contain (literal lines, backticks included as shown):
- A line of the form: Prompt template: \`<one-line prompt fragment containing {subject}>\`
- A line of the form: Negative prompt: <comma-separated list>
- A line of the form: Search-query template: \`<fragment containing {subject}>\`
- A stated DISTINCT-FIGURES principle: the image system must say, in its own words, that a deck holds ONE visual language (palette, material, lighting from this skill) but depicts a DISTINCT figure per slide tied to that slide's content; the style anchor / moodboard fixes the palette and material only and is NEVER an object cloned onto every slide.
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

**CRITICAL — the graphic layer. A deck of styled text boxes reads as bland, machine-made.** Typography, palette and layout alone are not a visual identity; every hand-crafted deck carries a GRAPHIC SYSTEM: drawn, bespoke, derived from the brand's world. Your skill MUST define one, implemented across components.html and chrome.css, with four parts:
1. SIGNATURE MARK — one bespoke graphic device derived from the brand idea, authored as inline SVG (or a precise CSS construct) in the templates: a three-segment bar for a motorsport brand, a route line with stops for a logistics brand, a registration cross for a print brand, a rising tick for a fund. It recurs in the SAME place at the SAME size (masthead, divider, closing), like a wordmark would. You design this ornament yourself — the ground-truth rule bans hand-drawn DATA (maps, coordinates, fake charts), not hand-drawn ornament.
2. SURFACE TREATMENT — at least one slide register gets a designed surface, not a flat fill: a subtle grain (SVG feTurbulence data-URI at low opacity), a hairline grid or dot lattice, a duotone field, a paper tint with a printed edge. Covers, dividers and the closing are the natural home.
3. STRUCTURAL DEVICES — the connective tissue, drawn with intent: how THIS brand renders a divider, a marker, a frame, a tick, a leader line. Pseudo-elements (::before/::after) on labels, rows and cells are the cheap deterministic way. A brand whose every rule is \`1px solid var(--color-rule)\` has no handwriting.
4. ONE DEPTH MOMENT — at least one template where something is LARGE and CROPPED or layered: an oversized numeral bleeding off the canvas edge, the signature mark at 10x scale cropped behind content, type overlapping an image or field edge. Flat decks have no foreground; one planned overlap per deck changes how crafted the whole thing feels.
Document the system in SKILL.md (a "## Graphic system" section: what the mark is, where each device appears, what it never does). Deployment is a budget, like the accent: the SAME devices in the SAME places on every slide — never a different trick per slide.
BANNED as graphic assets (this would be the new slop): random blobs, squiggles, Memphis confetti, sprinkled geometric shapes, corner swooshes, "network node" meshes, generic dotted world maps, clip-art arrows, abstract circles orbiting a headline. If a shape is not derived from the brand's world and deployed with discipline, it does not belong.

${editorialBlock}${pitchBlock}${teachingBlock}${keynoteBlock}${reportBlock}HARD RULES — these read as machine-made; they are non-negotiable across ALL files
- NO uppercase-set labels. Never \`text-transform: uppercase\`, never letter-spaced all-caps eyebrows/kickers. Labels are sentence case at normal tracking. (The loader strips uppercase typography defensively, but emitting it is a failure.)
- NO accent line / colored bar / colored border pinned to a card EDGE (no \`border-top: 3px solid <accent>\` on a card, no left-edge accent stripe). A colored rule on the lip of a card is the loudest AI tell there is. Carry accent through a number, an icon, a filled chip, or a single tinted surface instead — never the card's edge.
- NO em-dashes (—) anywhere in copy, SKILL.md prose, or example text. Use a comma, a period, or "to" for ranges. Hyphens in compound words are fine.
- TYPE FLOOR: no CSS font-size below 14px anywhere (labels, page numbers, table headers, tags, captions included); body/description text runs 16-21px. Slides are 1920×1080 viewed at a distance — 12px chrome is unreadable. If content does not fit at readable sizes, change the layout or split the slide, never the type. (SVG font-size attributes inside a viewBox are exempt; they scale.)
- NO fake product UI, no invented logos, no real brand names (use {{@placeholder}}, see above).
- NO agency-portfolio decoration tells: no numbered eyebrows ("06 · how it works", "001 / Capabilities" — a real page number in the footer chrome is fine, a section counter dressed as a label is not), no poetic section labels ("Field notes", "Quietly in use at", "On our desks" — say "Testimonials", "Latest work", or drop the label), no decorative status dots on labels or list rows, no photo-credit-style captions as decoration ("Field study no. 12 · A. Costa").

VALIDATOR CONSTRAINTS (your output must pass)
- frontmatter \`name\` must equal "${slug}" exactly.
- tokens.page must be exactly 1920×1080.
- ≥ 5 slide types, ≥ 3 composition rules.
- Every slide type declares a known \`family\` (one of: ${COMPOSITION_FAMILIES.join(", ")}); the grammar spans ≥ 6 distinct families and no family exceeds ~35% of types.
- Boxed families (cards-grid, table, matrix) together cover at most half the types; at least 2 types are unboxed (statement, metric-hero, quote).
- Non-bleed content templates use the bounded-island utilities (a \`flow-stage\` or \`flow-grid-fill\`) so content fills the slide.
- Every grammar slide-type must have a matching \`<template id="slide-NAME">\`.
- Every required slot must appear as \`{{slot}}\` (or be consumed by a \`{{@directive arg=slot ...}}\`) inside its template.
- No undeclared \`{{placeholders}}\` — every \`{{x}}\` must be either a declared slot, an \`image:N\` reference, or a directive.
- No uppercase-set labels, no card-edge accent lines, no em-dashes.
- A graphic layer must exist: at least 3 bespoke graphic constructs across components.html and chrome.css (inline <svg> marks, painting ::before/::after devices, svg data-URI textures, gradient surfaces). Styled text boxes alone fail validation.
- Every data-bearing family type (comparison, timeline, matrix, cards-grid, table, flow-diagram) declares a \`visual roles\` entry AND its template renders that visual — a directive ({{@chart}}/{{@table}}), or a meter/numeral/marked-item/plate carrying a \`data-visual-event\` attribute. A data-bearing template that is pure text fails the rendered richness gate.
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
 * EDITORIAL SKILL REQUIREMENTS — the skill-side counterpart to the deck-time
 * editorial contract (prompt-composer). Appended to the generator prompt when
 * the brief reads as a photo-led editorial style. These laws are distilled from
 * measured professional editorial references; the skill must implement the
 * editorial SYSTEM, not just editorial colors.
 */
function editorialSkillRequirements(): string {
  return `EDITORIAL SKILL REQUIREMENTS (this brief reads as a photo-led editorial style — the skill must implement the editorial system, not just editorial colors)
- CHAPTER ENGINE. The slide-type set must cover a repeatable chapter loop: a chapter TOC or divider, a photo chapter opener, a lede/article page, at least one data plate, a proof beat (quote or human story), and a zero-or-low-text photo breather. These types recur verbatim per chapter; the deck's structure is the loop, not one-off slides.
- PHOTO TEMPLATES. Photographs render as hard splits (photo column beside a paper panel, a side that can alternate left/right via a slot or data-attribute) or as full bleeds. Give photo templates an \`ink\` slot so display type flips dark/light into the photo's quiet zone. NEVER emit a scrim, gradient overlay, or darkening wash for legibility — the photograph is art-directed to carry a quiet zone instead.
- SURFACE SEPARATION. Photos and data never share a template surface: charts, stats, and body copy live on flat paper or flat-color plates, never over an image.
- CHROME IS NAVIGATION, AND ITS ABSENCE IS A REGISTER. Build the chrome once (a breadcrumb header or an index footer, identical on every content page) AND include at least 2 poster types (a giant stat, a full-screen quote, a full-bleed photo moment) that drop the chrome entirely. Roughly 80% chrome, 20% poster.
- ACCENT WITH AN ENUMERATED JOB LIST. SKILL.md's color rules must list the accent's exact jobs (e.g. TOC highlight, table ground, quote ink, a highlighter band over key claims) and nothing else; data visualization stays greyscale or single-accent, and grounds are never tinted with the accent.
- THE NUMBER IS THE CHART. The dominant data treatment is the giant numeral (same family as the text) plus caption and source, or a ruled hairline table. Axis charts are rare, direct-labelled, legend-free.
- SIZE-DRIVEN HIERARCHY. Levels sit roughly 2.5x apart; regular weight dominates even at display sizes, bold is rationed. One grotesque, or one serif + one sans with a hard role contract (one face for narrative/display, the other for data/function, roles never blurred).
- ONE OWN LAYOUT MOVE. Beyond this list, invent at least one signature layout move derived from the brief's world (a stat taking the entire screen, an oversized table of contents, a ghost numeral behind content, a vertical lede rail...). The editorial register rewards one bold ownable move repeated with discipline.
- PHOTOGRAPHIC SYSTEM AS A LAYER. image-style.md must define the photography as a first-class system: documentary subjects from the brief's world, one or two named grading families, quiet-zone art direction inside the prompt template, and crop conventions. The deck does not exist without its photography.

`;
}

/**
 * PITCH SKILL REQUIREMENTS. The skill-side counterpart to the deck-time pitch
 * contract (prompt-composer). Appended to the generator prompt when the brief
 * reads as an investor or pitch deck. These laws are distilled from measured
 * professional pitch references; the skill must implement the pitch SYSTEM
 * (statement-as-slide, bimodal density, accent-on-money, light chrome,
 * type-as-hero), not just pitch colors.
 */
function pitchSkillRequirements(): string {
  return `PITCH SKILL REQUIREMENTS (this brief reads as an investor or pitch deck; the skill must implement the pitch SYSTEM, not just pitch colors)
- INVENT THIS DECK'S OWN STRUCTURE, do not reach for a fixed pitch skeleton. The slide-type set, the sequencing beyond the bare arc, and the way each beat is realised must be derived from THIS brief. Do NOT default to the standard march (cover, thesis statement, problem statement, market metric, contrast, product, how-it-works, traction, model, money, ask): that is ONE skeleton among many, and reusing it makes every pitch a re-skin of the last. Pick and commit to ONE spine family that fits the brief and let it shape the structure: poster-statement (type-as-hero, corner-pinned declaratives, minimal chrome), branded-surface (the brand colour and full-bleed surfaces are the identity, one-word interstitial act-breaks, each beat a surface or card), or proof-stack (product and data renders carry it, show-don't-tell, callouts over imagery). Two pitch skills must not share a spine family or the same slide-type set. Beyond the graphic devices below, invent at least one signature STRUCTURAL move (a recurring rail, a one-word divider system, a stat band, a ghost-numeral spread, a living-dashboard panel) and repeat it with discipline.
- THE HEADLINE IS THE SLIDE, never a bullet stack. Whatever the spine, a content slide carries one terse declarative idea (a corner-pinned statement, a one-word interstitial, a giant number, a single claim on a surface), not a title-plus-body-plus-bullets column. A bulleted body is the exception, never the default; reading the headlines in order tells the whole pitch.
- BIMODAL, THEATRICAL DENSITY. The type set must support a real low end: 1 to 4 element posters (a statement, a full-bleed brand moment, a single giant numeral) that alternate with occasional data bursts, with almost nothing in the medium middle. A one-element statement is a finished slide; the breather is a poster, never a half-filled grid. The layout grammar must treat a single-statement slide as legitimate, not underfill.
- ONE ACCENT, RESERVED FOR THE MONEY. SKILL.md's color rules must define exactly one accent and forbid tinting content grounds with it. The accent runs loudest on the proof, traction and financials slides and stays quiet everywhere else. A maximal brand may flood whole grounds as its identity, but only if the brief's brand is genuinely that saturated; the default is the reserved single accent.
- CHROME IS LIGHT OR GONE. No persistent index footer or breadcrumb (that is the editorial register, wrong here). Pitch chrome is a one-word kicker, an oversized faded page numeral, or a branded hairline on the edge: poster, not navigation. Most content slides carry almost no chrome.
- DATA IS CONVICTION, NOT ANALYSIS. The dominant data treatment is the giant inline numeral or a theatrical money moment (a real P&L or traction burst), not an analysis dashboard. Where an axis chart exists, exactly one series takes the accent and the rest recede to grey, values direct-labelled on the mark, axes and legends minimal. Data always carries a source line; unsourced or redacted placeholder numbers are a do-not-ship tell.
- BRAND-ART IMAGERY, NOT EDITORIAL PHOTOGRAPHY. image-style.md must define the visual layer as brand art, 3D render, or product imagery used as a rationed accent, not a documentary photo spine. Imagery share varies widely by brand; the spine is the STATEMENT plus the color system, not a photo rhythm.
- TYPE-AS-HERO. Display type runs huge (one family, size carries hierarchy, weight rationed even at display size), levels spaced wide. Sentence case, never tracked all-caps (house rule).
- 2 TO 3 OWNED SIGNATURE DEVICES. Invent a small set of repeated, ownable devices from the brief's world (a corner-pinned giant statement, a ghost numeral behind content, a two-color headline highlight, an owned accent-on-money treatment) and repeat them with discipline. A pitch without signature devices is a template, not a system.

`;
}

/**
 * TEACHING SKILL REQUIREMENTS. The skill-side counterpart to the deck-time
 * teaching contract (prompt-composer). Appended to the generator prompt when the
 * brief reads as a training / workshop / onboarding / academic deck. Distilled
 * from measured professional instructional decks (brand guidelines, an employee
 * handbook, a workshop); the skill must implement the teaching SYSTEM
 * (rule-with-proof split, chapter gating, semantic grounds, do/don't, wayfinding,
 * diagram-over-chart, calm type), not just calm colors.
 */
function teachingSkillRequirements(): string {
  return `TEACHING SKILL REQUIREMENTS (this brief reads as a training / workshop / onboarding / academic style; the skill must implement the teaching SYSTEM, not just calm colors)
- COMMIT TO ONE TEACHING SPINE FAMILY and let it shape the slide-type set. Pick ONE and build its structure: split-frame manual (a persistent rule-prose / specimen split on most content types, do/don't and misuse grids, inline spec callouts with leader lines), mode-switching workshop (chapters as semantic colour-ground modes, a learning-objectives opener and a recap/don'ts close per chapter, a framed "diagram register", activity/step prompts), or chaptered handbook/primer (lettered chapters with illustration dividers, calm prose, definition and hierarchy-ladder types, reads front-to-back). Two teaching skills must NOT share a spine family or slide-type set. Invent at least one signature structural move and repeat it with discipline.
- THE SPLIT-FRAME (OR ITS EQUIVALENT) IS A REQUIRED TYPE. At least one core content type co-presents a rule/explanation with its specimen / worked example / labelled diagram on ONE slide (a left prose column beside a right specimen panel, or a concept stated above its worked example). The lead text slot is explanatory prose, never a headline-over-bullets.
- CHAPTER DIVIDERS AS A TYPE. Include a near-empty section-divider type (chapter name or number on a flat colour ground) and design the chrome so dividers DROP the wayfinding furniture. The grammar must treat a 1-2 element divider as a legitimate, finished slide, not underfill.
- A DO/DON'T (CORRECT vs INCORRECT) TYPE. Provide a slide type that shows a right and a wrong example TOGETHER (the wrong one struck or marked), or a grid of "do not" cards. Realize the strike/marker as a real drawn element carrying \`data-visual-event\`, not a colour swap.
- SEMANTIC GROUND COLOUR. tokens.json + chrome.css must support tinting WHOLE grounds per chapter/mode (not only an accent on white). SKILL.md's colour rules must enumerate which mode each ground colour means, so the colour itself becomes wayfinding.
- GENTLE PERSISTENT WAYFINDING. Build the chrome once — a chapter number, a running section tab, or a step counter on every content slide. Calm orientation, present and consistent; the inverse of a poster deck's deleted chrome.
- REAL IMAGERY FIRST; DIAGRAMS ONLY WHERE THEY GENUINELY TEACH. The single biggest tell of a dull teaching deck is hand-drawn SVG sketches of things that should be photographs. If a subject photographs well — food, nature, a place, a tool, a material, a built object, a person at work — it is a REAL generated image (a full-bleed photographic hero, a photo specimen plate, a photographic background under a quiet zone), NOT a crude line sketch. image-style.md MUST define a real PHOTOGRAPHY system with a treatment that harmonises with this skill's palette and material (warm natural light, muted-to-palette grade, etc.) — never "near-zero / illustration-led photography". Most content slides carry a real image somewhere. Reserve DRAWN diagrams for genuinely SCHEMATIC content a photo cannot show — a topology, a load path, a process flow, a labelled anatomy, a do/don't comparison of structures — and draw those PRECISELY (clean construction lines, leader-lined callouts, real labels), never as a childlike doodle. Charts stay rare (teaching is not data-heavy); imagery is abundant. Every data-bearing family type still realizes a visual (richness gate). Use {{@gradient-bg}} (a photographic bgPrompt) for bleed heroes/dividers and image slots for specimen photos.
- VARY THE COMPOSITION — do NOT put the text on the same side of every slide. A teaching deck where every content slide is "prose left, visual right" reads as one slide repeated (the monotony tell). The slide-type set MUST span real compositional variety: image-led full-bleed slides with the words set into a photo's quiet zone, slides with the image LEFT and prose right as well as right/left, centered single-idea moments, a full-photo chapter divider, and the rule/proof split run BOTH ways. Alternate them through the deck.
- SIZING DISCIPLINE — no crammed slivers, no overflow. Body copy runs a consistent comfortable reading scale (18-22px); size the LAYOUT to the content. Never press the words into a narrow strip while half the frame sits empty (the cover-imbalance tell), and never let copy spill past the edge of its card or panel — if text does not fit, the card or the type size is wrong; fix the layout, never ship the overflow. Every card/panel is sized to what it holds.
- CALM TYPE WITH A MEMORABLE DISPLAY. One expressive display face for chapter/concept identity + one rational workhorse for the explanatory body at a real reading size (18-22px); hierarchy mostly from scale. Sentence case — no tracked all-caps (the guideline-deck all-caps display is not our house register).
- LOCK THE PRIMITIVES; vary only the CONTAINER. The atoms are ONE component each, identical everywhere: the numbered/step marker uses the SAME shape, weight and colour on every slide (not black circles here, outlined italics there, red serifs elsewhere); the wayfinding chrome (chapter tab / step tracker / page furniture) is the SAME and PRESENT on every content slide (only a full divider may drop it — never the most procedural slide); a caption card is one treatment. Variety lives in layout and composition, never in the atom. Re-skinning a primitive per slide is the amateur tell, the exact opposite failure of monotony.
- ONE PHOTOGRAPHIC GRADE across the whole deck. image-style.md must lock a SINGLE art direction — one light direction, one colour grade, one lens/distance feel, one mood — so every photo reads as one shoot. Never mix moody atmospheric hero shots with bright clinical studio plates unless both are graded into the same envelope; state the lock in the prompt template (e.g. "always soft overcast daylight, desaturated warm grade, shallow DOF"). A grab-bag of grades is the #1 stitched-from-different-prompts tell.
- TEXT OVER A PHOTO NEEDS A GUARANTEED BACKING. The photo is generated and non-deterministic, so never bet legibility on a "quiet zone" staying quiet: set text on an opaque or translucent card, a solid plate, or a real scrim/gradient, so a re-roll cannot bury the words. (This overrides the editorial no-scrim rule, which assumes hand-art-directed photography.)
- PUSH THE SIGNATURE DEVICE INTO THE CONTENT, not just the chrome. The deck's structural identity must shape the core teaching blocks (the step list, the recap, the comparison), not only the margins/footers. Do NOT default the "here are the N steps" or "recap" moment to a generic row of equal cards — express it THROUGH the spine (a paginated marginal sequence, a session timeline, a mnemonic column, a diagrammed sequence). A shared card-grid recap is what makes three different decks collapse into looking the same.
- HUMANISE EVERY LABEL. Diagram callouts, captions and labels render the exact words a reader sees — never a slug, key or token string. Write "white gills", never "white_gills"; "the volva, a cup", never "the_volva,_a_cup".

`;
}

/**
 * KEYNOTE SKILL REQUIREMENTS. The skill-side counterpart to the deck-time keynote
 * contract (prompt-composer). Appended to the generator prompt when the brief reads
 * as a big-stage spoken talk (product launch / vision mainstage / narrative talk).
 * Distilled from the canonical keynote archetypes (cinematic product launch, vision
 * manifesto, TED narrative arc); the skill must implement the keynote SYSTEM (slide
 * as backdrop, cinematic full-bleed imagery, the build/reveal mechanic, monumental
 * type, stage-native colour, crescendo pacing), not just big type on black.
 */
function keynoteSkillRequirements(): string {
  return `KEYNOTE SKILL REQUIREMENTS (this brief reads as a big-stage spoken talk — a launch, a vision mainstage, or a narrative talk; the skill must implement the keynote SYSTEM, not just big type on a dark ground)
- COMMIT TO ONE KEYNOTE SPINE FAMILY and let it shape the slide-type set. Pick ONE and build its structure: cinematic product-launch (full-bleed product heroes, single-word act-break interstitials, a feature-reveal cadence where each beat is an image plus one phrase, a climactic reveal, then a "ships / price / availability" payoff), vision-manifesto mainstage (monumental belief statements, reframing giant-number slides, a status-quo → the-shift → the-future arc carried on bold colour or photographic fields, sparse emotional imagery used as punctuation), or story-arc narrative (a continuous TED-style personal journey — hook, turn, struggle, insight, universal takeaway — atmospheric human / place imagery, conversational fragment text, NO chaptered chrome and no spec slides). Two keynote skills must NOT share a spine family or slide-type set. Invent at least one signature structural move and repeat it with discipline.
- RADICAL MINIMALISM IS A REQUIRED TYPE. At least one core content type is a single line / single word / single number owning a full field, and at least one is a full-bleed image with the text set into an engineered backing. The default content slide is NOT a title-over-bullets column. The grammar MUST treat a 1-element slide as legitimate and finished, never underfill — this is the register's signature, not a gap.
- THE BUILD AND THE REVEAL AS TYPES. Provide a progressive-disclosure type (the same frame across 2 to 3 steps, one element added per step) AND a climactic reveal type staged for maximum drama (full-frame, alone, the deck's loudest moment, with the slides around it setting up and paying off). The reveal is where the deck peaks; design the grammar so the build-up and the reveal are distinct, recurring moves.
- CINEMATIC IMAGERY IS THE SPINE. image-style.md MUST define a real, dramatic PHOTOGRAPHY or RENDER system as the dominant visual layer — this is the most image-led register, so most content slides carry a full-bleed, edge-to-edge, emotionally-lit image. Lock ONE art direction (one light direction, one colour grade, one lens / distance feel, one mood) so the whole deck reads as a single film — a grab-bag of grades is the #1 stitched-from-different-prompts tell. Use {{@gradient-bg}} (a cinematic bgPrompt) for heroes, reveals and pause fields; reserve drawn diagrams for the rare schematic a photo genuinely cannot show, never as the default.
- MONUMENTAL TYPE-AS-HERO. One display face run at the largest scale of any register; a single phrase fills the frame. Levels are spaced by scale and silence, weight rationed even at display size. Sentence case, never tracked all-caps (house rule).
- STAGE-NATIVE COLOUR, COMMITTED. tokens.json + chrome.css must support a dramatic, emissive ground built for a projected auditorium — a full dark / near-black stage, OR one saturated brand field — with text and a single accent reading at high contrast. Lock whether THIS deck lives on dark, on light, or on a bold colour, and hold it across the whole deck. (A navigated footer, paper grounds, and report furniture are the wrong register here.)
- CHROME IS GONE OR A WHISPER. No index footer, breadcrumb, page numerals or running furniture (that is the report / teaching register). At most a faint act marker or a small logo bug. The deck is a sequence of full-frame moments, not a navigated document.
- THEATRICAL PACING WITH A REAL LOW END. The type set must support pause slides (a word, a held image, a black or colour field) and cluster the energy toward a peak; design the grammar so 35 to 50% of the deck can be 1-to-3-element moments. Never a steady medium — the rhythm is the performance.
- CLAIM ONLY WHAT IS TRUE. The skill's voice rules must forbid manufacturing the big stat or the world-first claim for drama. Superlatives and figures presented as real must be real and user-supplied; where a number is missing, the line goes qualitative. A fabricated headline number on a stage is the worst failure of the register.
- LOCK THE PRIMITIVES; vary only the COMPOSITION. The atoms (the act marker, the number treatment, the caption, the logo bug, the build-step indicator) are ONE component each, identical everywhere; variety lives in scale, image and composition, never in re-skinning the atom per slide. Text over any image sits on a guaranteed backing (a scrim, a plate, or an engineered dark gradient), never betting legibility on a non-deterministic photo's quiet zone.
- PUSH THE SIGNATURE DEVICE INTO THE MOMENTS, not just the chrome. The structural identity must shape the core beats (the reveal, the build, the statement), not only the margins — a generic centred-text slide repeated N times is what collapses three different keynotes into one look. The signature move must show up IN the content, recurring with discipline.
- DO NOT SHIP THE DOCUMENT YOU FORBADE. The biggest keynote failure is a skill whose prose bans tables and bullets but whose components.html then RENDERS them. components.html must NOT contain: a ranked spec table (numbered rows with a right-aligned value column), a bulleted / dotted list of label rows, a multi-column roadmap of titled paragraphs, or a two-column prose comparison. If a beat carries facts (a spec, an availability, a pledge, a contrast), realize it as ONE staged line per slide, or as a build (below) — never as a multi-row value/label component. A datasheet, a bullet list, or a two-up doc panel disqualifies the skill regardless of how restrained the colours are.
- THE BUILD COMPONENT IS PROGRESSIVE DISCLOSURE, NOT A STACK. Design the build slide-type as ONE held frame across 2 to 3 consecutive slides with a single element revealed/lit per slide (prior steps dimmed or absent) — the deck JSON authors it as a short run of build slides, not one slide with a three-row list. The component must be incapable of showing a finished multi-item list at once. (For a narrative/TED skill, prefer NO list-bearing build at all: realize the rising beats as separate full-bleed image moments each carrying one fragment.)
- ENCODE THE CRESCENDO, AND KNOW WHICH KIND OF PEAK YOU HAVE. The peak slide-type must be the deck's loudest — but loudness comes in two forms and the skill must pick the right one. For a TYPE-LED peak (a STAR number, a turn line, a manifesto statement) the peak type carries the LARGEST display token in the skill (fit-to-frame, not a fixed px a setup number or pause word can match). For an IMAGE-LED peak (a product reveal / hero unveiling) the loudness is the IMAGE: the reveal bgPrompt makes the product the brightest, highest-contrast, full-frame hero of the deck, and the reveal's NAME is a confident label (a moderate display size over a scrim), NOT frame-filling text — a headline so large it covers the product is a broken reveal, because the product is the payoff. Either way, no pause word, setup number, cover or price may out-shout the peak.
- BAKE THE LOCKED GRADE INTO EVERY BGPROMPT, not just the prose. image-style.md must define the grade as a fixed suffix clause (one light direction, one colour grade, one lens/mood) that is appended to EVERY slide's bgPrompt, so no body slide silently drops it and renders cold/off-palette. State the suffix verbatim and instruct that every bgPrompt ends with it.
- LOCK A HERO PRODUCT/SUBJECT ACROSS ITS SLIDES (launch especially). If the deck has a recurring hero object (a product), its bgPrompt must carry an IDENTICAL, specific description of that object on the cover, the reveal and every feature beat, so the image model renders the SAME object every time (only the scene/light around it varies). Product-identity drift — the cover showing a different machine than the reveal — destroys a launch, because the reveal IS the payoff.
- VARY THE COMPOSITION; CAP TEMPLATE REUSE. A signature device should repeat, but not as three identical frames. No single composition (a split-panel doc, a number poster, a contrast pair) may appear more than ~twice per deck, and never two paragraph-dense "support" slides back to back; vary scale/crop within a repeated family so the deck builds an energy gradient toward the peak instead of flattening into plateaus.

`;
}

/**
 * REPORT SKILL REQUIREMENTS. The skill-side counterpart to the deck-time report
 * contract (prompt-composer). Appended to the generator prompt when the brief
 * reads as a dense-data / consulting / analytical report. Distilled from
 * measured professional references (a McKinsey engagement deck, IBM's light
 * report system, Palantir's two-value monochrome financial system, Freitag's
 * technical-worksheet system); the skill must implement the data SYSTEM (boxed
 * exhibits, labelled data, repeated chrome, scheduled breathers, semantic
 * single-colour, ledger prose, numeric consistency), not just a corporate palette.
 */
function reportSkillRequirements(): string {
  return `REPORT SKILL REQUIREMENTS (this brief reads as a dense-data / consulting / analytical report; the skill must implement the data SYSTEM, not just a corporate palette)
- COMMIT TO ONE DATA SPINE FAMILY and let it shape the slide-type set. Pick ONE and build its structure: light analytical report (one emphasis colour on near-white, boxed exhibits with header bands, the two-panel exhibit+drivers default, numbered footnotes plus a SOURCE bar, a contents tracker, inline-emphasis ledgers), dark two-value monochrome financial (a near-black / charcoal ground with one light value, an outline-past / filled-present bar encoding, oversized plus-minus-percent callouts on dotted leaders, banded divider cards, ZERO data accent — fill-vs-outline and size do all the work), or technical-worksheet (a rulered blueprint world, a fixed series-colour order where palette position IS the legend, a visible styled grid with designed empty cells, mono for ALL numbers with slashed zeros). Two report skills must NOT share a spine family or slide-type set; no mashup, at most one borrowed device.
- THE BOXED EXHIBIT IS A FIRST-CLASS TYPE. Provide an exhibit type with a header band (title plus a unit line) over the chart, and a two-panel variant pairing the exhibit (~60-65%) with a boxed drivers / implications side panel that shares the header treatment. Support causal annotation callouts (a white box with a leader pointing at the data). The chart never floats naked — that boxed framing is the register's signature surface.
- LABELLED-DATA CHART DISCIPLINE, WITH REAL SCAFFOLDING. {{@chart}} usage must direct-label values on the mark, suppress legends and gridlines, and declare units once in the band or caption. Provide the dense chart types this register needs (a stacked bar with inside-segment values and a forecast / actual divider, a waterfall with bridge connectors and labelled deltas, a 2x2 with quadrant labels and axis-endpoint anchors). A chart whose scaffolding is missing fails the gate; a chart that needs gridlines has too many marks. NEVER fabricate a series to manufacture an exhibit.
- BUILD THE CHROME ONCE, AS A DECK-WIDE SYSTEM. A running section kicker, a single contents / tracker type (a vertical colour band with the current section highlighted), numbered footnotes, a full-width SOURCE band, and a page numeral are identical on every content type and survive ground swaps. This persistent navigation IS the register (the inverse of a pitch's deleted chrome); design it once and never let it bend on a dark slide.
- A LEDGER TYPE FOR QUALITATIVE PROSE. Provide a two-column ledger (numbered circle badges per row, dashed row separators, a small functional chip or icon per row, and inline emphasis colouring only the load-bearing phrase). This is how the register carries prose without becoming a text wall — reach for it instead of a bullet column.
- NUMBERS-AS-EVENT BREATHERS, SCHEDULED. Provide a big-stat breather type (one display numeral at 5 to 10x body, plus a caption and a prior-year / trend / source context line) used to open topics and pace the deck. Breathers carry content, never a repeated tracker; the grammar must treat a no-more-than-7-element breather as a finished slide, and support a 9-13-element dense exhibit page whose furniture is internalised (no half-empty driver panels — panels top-align and fill).
- ONE COLOUR FAMILY, SEMANTIC, NO MOOD. tokens.json plus SKILL.md colour rules state one family doing title / emphasis / data / surface OR a fixed series order that is itself the legend; accents never tint grounds or whole text blocks; emphasis may run inline on the load-bearing phrase. No gradients on data surfaces, no decorative tints, no stock-photo moods.
- ROW ANATOMY BY ROLE. A finding row, a decision row and a commitment row must each have their own anatomy and read differently at a glance — never the same number-plus-sentence row reused for all three. The exec summary, the ledger and the action page are distinct constructs.
- DATA IS THE SPINE; IMAGERY IS RARE AND FUNCTIONAL. This is the least image-led register. Do not build a photo rhythm; reserve imagery for a small functional row anchor or a single sober section image, and let the charts, the numerals and the drawn analytical devices carry the deck. The signature graphics are drawn line-art / diagram / chart-encoding / divider anatomy derived from the analytical world and deployed with discipline — never blobs, icon parades, or decorative shapes. No rounded-corner card parade, no shadow-and-gradient decoration: this register earns its authority from labelled density and a calm, repeated skeleton.
- ELEMENT BUDGET IS BIMODAL. Median 7-10, max 15-18 on a dense exhibit board, minimum 4 on a breather. Sentence case, square or en-dash bullets, no tracked caps, no em-dashes.

`;
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
      const slideTypes = [...grammarMd.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`/gm)].map((m) => m[1]);
      refs.push({
        name,
        description: typeof fm.description === "string" ? fm.description.slice(0, 280) : "",
        colorKit: typeof fm.color_kit === "string" ? fm.color_kit.slice(0, 200) : "",
        typographyKit: typeof fm.typography_kit === "string" ? fm.typography_kit.slice(0, 200) : "",
        slideTypeCount,
        slideTypes,
      });
    } catch (e) {
      console.warn(`buildReferenceLibrary: skipping skill "${name}" (load failed: ${(e as Error).message})`);
    }
  }
  REF_CACHE.set(cacheKey, refs);
  return refs;
}
