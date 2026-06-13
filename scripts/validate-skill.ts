import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkill, listSkills } from "../engine/skill-loader.ts";
import { defaultChromeCss } from "../engine/token-compiler.ts";
import { COMPOSITION_FAMILIES, BOXED_FAMILIES, UNBOXED_FAMILIES, DATA_BEARING_FAMILIES } from "../engine/composition-families.ts";
import type { Skill } from "../engine/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(__dirname, "../skills");

/**
 * Composition-family contract for GENERATED skills. Opt-in by design: legacy
 * seed skills carry no family annotations and are skipped (they predate the
 * contract). Any skill that declares families must satisfy the diversity gate —
 * the generator (skill-generator.ts) now emits families, so new output is held
 * to it. Returns hard failures.
 */
function checkFamilyContract(skill: Skill): string[] {
  const fails: string[] = [];
  const types = skill.grammar.slideTypes;
  const withFamily = types.filter((t) => t.family);
  if (withFamily.length === 0) return fails; // legacy skill, opt-in gate skipped

  // Every type must declare a KNOWN family once any are declared.
  const missing = types.filter((t) => !t.family).map((t) => t.name);
  if (missing.length > 0) {
    fails.push(`slide types missing a composition family: ${missing.join(", ")}`);
  }
  const unknown = withFamily
    .filter((t) => !COMPOSITION_FAMILIES.includes(t.family as any))
    .map((t) => `${t.name}=${t.family}`);
  if (unknown.length > 0) {
    fails.push(`unknown composition families: ${unknown.join(", ")}`);
  }

  const counts = new Map<string, number>();
  for (const t of withFamily) counts.set(t.family!, (counts.get(t.family!) ?? 0) + 1);
  const distinct = counts.size;
  if (distinct < 6) {
    fails.push(`composition variety too low: ${distinct} distinct families (need ≥ 6)`);
  }
  // No single family may dominate (~35% of types). cover/closing are bookends.
  const cap = Math.max(2, Math.ceil(types.length * 0.35));
  for (const [fam, n] of counts) {
    if (fam === "cover" || fam === "closing") continue;
    if (n > cap) {
      fails.push(`family "${fam}" worn by ${n}/${types.length} types (cap ${cap}, ~35%)`);
    }
  }

  // Texture registers: boxed families all render as one surface; without an
  // unboxed typographic register the deck is a wall of boxes regardless of how
  // diversely the families are named.
  const boxedCount = withFamily.filter((t) => (BOXED_FAMILIES as readonly string[]).includes(t.family!)).length;
  if (boxedCount > Math.ceil(types.length / 2)) {
    fails.push(
      `texture monotony: ${boxedCount}/${types.length} types are boxed (cards-grid/table/matrix; cap ~half)`,
    );
  }
  const unboxedCount = withFamily.filter((t) => (UNBOXED_FAMILIES as readonly string[]).includes(t.family!)).length;
  if (unboxedCount < 2) {
    fails.push(
      `texture monotony: only ${unboxedCount} unboxed typographic types (statement/metric-hero/quote; need ≥ 2)`,
    );
  }
  return fails;
}

/**
 * Structural backstop: even if families are labelled diversely, a skill whose
 * templates are mostly the SAME morphology (a grid of N equal columns of bullet
 * cards) reproduces the monotony the families were meant to prevent. Groups
 * non-bleed content templates by a coarse grid signature and flags when one
 * signature dominates. Non-fatal (blocking warning), tuned not to trip the
 * legitimate ~30% grid reuse in hand-built decks.
 */
function checkTemplateMorphology(rawComponents: string): string | null {
  const tmplRe = /<template[^>]*id=["']slide-([a-z][a-z0-9-]*)["'][^>]*>([\s\S]*?)<\/template>/gi;
  const signatures: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tmplRe.exec(rawComponents)) !== null) {
    const body = m[2];
    if (/slide-bleed/.test(body)) continue; // bleed/atmospheric slides are not the trap
    signatures.push(gridSignature(body));
  }
  const content = signatures.filter((s) => s !== "flow"); // sentence/statement slides aren't grids
  if (content.length < 6) return null;
  const counts = new Map<string, number>();
  for (const s of content) counts.set(s, (counts.get(s) ?? 0) + 1);
  let topSig = "";
  let top = 0;
  for (const [s, n] of counts) if (n > top) (top = n), (topSig = s);
  const share = top / content.length;
  if (share > 0.5) {
    return `template monotony: ${top}/${content.length} grid templates share one morphology (${topSig}) — diversify compositions, don't re-skin the same column grid`;
  }
  return null;
}

/**
 * Visual-realization check (opt-in, non-fatal warning): a data-bearing family
 * (comparison/timeline/matrix/cards-grid/table/flow) whose TEMPLATE contains no
 * visual element at all renders as a title over text columns — the boredom tell.
 * Static backstop to the dynamic richness gate (engine/richness.ts), which is the
 * hard enforcement on rendered decks. A warning (not a failure) so it does not
 * retro-break legacy seeds; the rendered-deck gate is where it bites.
 */
const VISUAL_TOKEN_RE =
  /\{\{\s*@(?:chart|table|icon|placeholder|logo-wall)\b|\{\{\s*image:|data-visual-event\s*=|<svg[\s>]/i;
function checkVisualRealization(skill: Skill): string[] {
  const warns: string[] = [];
  if (!skill.grammar.slideTypes.some((t) => t.family)) return warns; // opt-in
  const dataBearing = new Set<string>(DATA_BEARING_FAMILIES);
  for (const t of skill.grammar.slideTypes) {
    if (!t.family || !dataBearing.has(t.family)) continue;
    const tmplRe = new RegExp(
      `<template[^>]*id=["']slide-${t.name}["'][^>]*>([\\s\\S]*?)</template>`,
      "i",
    );
    const tmpl = skill.components.match(tmplRe)?.[1] ?? "";
    if (tmpl && !VISUAL_TOKEN_RE.test(tmpl)) {
      warns.push(
        `${t.name} [${t.family}] renders no visual element — a ${t.family} slide should realize a chart, table, icon, meter, plate or marked figure (a directive or a data-visual-event element), not pure text`,
      );
    }
  }
  return warns;
}

/**
 * Graphic-layer gate: a skill whose templates and chrome carry no drawn
 * constructs at all renders as styled text boxes — the "bland" tell. Counts
 * bespoke graphic constructs statically:
 *  - inline <svg> in components.html (icons/charts come from engine directives,
 *    so a raw <svg> in a template is hand-authored ornament)
 *  - ::before/::after rules in chrome.css that actually paint something
 *    (background / border / box-shadow / visible content)
 *  - svg data-URI surfaces (grain, lattice, pattern textures)
 *  - gradient surfaces (linear/radial/conic/repeating)
 * Hard gate: ≥ 3 constructs. The generator prompt demands a full signature
 * graphic system (mark + surface + structural devices + one depth moment);
 * this is the structural backstop, deliberately blunt.
 */
function checkGraphicLayer(rawComponents: string, rawChrome: string): string | null {
  const components = stripComments(rawComponents);
  const chrome = stripComments(rawChrome);
  const svgMarks = (components.match(/<svg[\s>]/gi) ?? []).length;
  let pseudoDevices = 0;
  const pseudoRe = /::(?:before|after)[^{}]*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = pseudoRe.exec(chrome)) !== null) {
    const body = m[1];
    const paints =
      /\b(?:background|border|box-shadow|outline)\b/i.test(body) ||
      /content\s*:\s*["'][^"']/.test(body);
    if (paints) pseudoDevices++;
  }
  const both = components + chrome;
  const dataUris = (both.match(/data:image\/svg/gi) ?? []).length;
  const gradients = (both.match(/(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\(/gi) ?? []).length;
  const total = svgMarks + pseudoDevices + dataUris + gradients;
  if (total < 3) {
    return `no graphic layer: ${total} graphic construct(s) found (svg=${svgMarks}, pseudo=${pseudoDevices}, texture=${dataUris}, gradient=${gradients}; need ≥ 3) — a skill of styled text boxes reads as bland; author a signature mark, a surface treatment and structural devices`;
  }
  return null;
}

/**
 * Type floor — CSS font sizes below 14px on a 1920×1080 slide are too small to
 * consume ("some font sizes feel too small", client feedback 2026-06). Applies
 * to CSS `font-size: Npx` declarations only; SVG font-size ATTRIBUTES scale with
 * their viewBox and are exempt.
 */
const TYPE_FLOOR_PX = 14;
function checkTypeFloor(rawComponents: string, rawChrome: string): string | null {
  const both = stripComments(rawComponents) + stripComments(rawChrome);
  const tooSmall = new Set<string>();
  const re = /font-size\s*:\s*([0-9.]+)px/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(both)) !== null) {
    if (parseFloat(m[1]) < TYPE_FLOOR_PX) tooSmall.add(`${m[1]}px`);
  }
  if (tooSmall.size > 0) {
    return `type below floor: ${[...tooSmall].join(", ")} (floor ${TYPE_FLOOR_PX}px) — labels stay >= ${TYPE_FLOOR_PX}px, body text 16-21px; if it does not fit, change the layout, never the type`;
  }
  return null;
}

/** Coarse grid signature: collapse a template's column layout to "Nx1fr" / "cols" / "flow". */
function gridSignature(body: string): string {
  const grids = [...body.matchAll(/grid-template-columns\s*:\s*([^;"']+)/gi)].map((x) =>
    x[1].trim().toLowerCase(),
  );
  if (grids.length === 0) return "flow";
  // Use the most-columns grid in the template as its signature.
  let best = "cols";
  let bestN = 0;
  for (const g of grids) {
    const rep = g.match(/repeat\(\s*(\d+)/);
    const n = rep ? parseInt(rep[1], 10) : g.split(/\s+/).filter((t) => /fr|px|%|minmax|auto/.test(t)).length;
    if (n > bestN) (bestN = n), (best = `${n}col`);
  }
  return best;
}

async function main() {
  const skills = await listSkills(skillsRoot);
  console.log(`Found ${skills.length} skills: ${skills.join(", ")}\n`);

  let failed = 0;

  for (const name of skills) {
    const failures: string[] = [];
    const warnings: string[] = [];
    try {
      const skill = await loadSkill(resolve(skillsRoot, name));
      const fm = skill.frontmatter;

      // Basic frontmatter shape
      if (fm.name !== name) failures.push(`frontmatter.name (${fm.name}) != folder (${name})`);
      if (!fm.version) failures.push("frontmatter.version missing");
      if (!fm.description?.length) failures.push("frontmatter.description missing");
      if (!fm.forbidden?.length) failures.push("frontmatter.forbidden missing");

      // Tokens
      if (!skill.tokens.color.signal.primary) failures.push("tokens.color.signal.primary missing");
      if (skill.tokens.page.width !== 1920 || skill.tokens.page.height !== 1080) {
        failures.push(`tokens.page must be 1920×1080, got ${skill.tokens.page.width}×${skill.tokens.page.height}`);
      }

      // Grammar shape
      if (skill.grammar.slideTypes.length < 5) {
        failures.push(`grammar.slideTypes (${skill.grammar.slideTypes.length}) < 5`);
      }
      if (skill.grammar.rules.length < 3) {
        failures.push(`grammar.rules (${skill.grammar.rules.length}) < 3`);
      }

      // No all-caps label typography in source (loadSkill strips it at runtime,
      // so check the raw files to keep the seed sources themselves clean).
      const [rawChrome, rawComponents] = await Promise.all([
        readFile(resolve(skillsRoot, name, "chrome.css"), "utf8").catch(() => ""),
        readFile(resolve(skillsRoot, name, "components.html"), "utf8").catch(() => ""),
      ]);
      if (/text-transform\s*:\s*uppercase/i.test(rawChrome + rawComponents)) {
        failures.push(
          "uppercased label typography (text-transform:uppercase) is banned — use sentence case",
        );
      }
      // Card-edge accent line — a colored rule on a card's lip is a loud AI tell.
      // Flag border-(top|left|right|bottom) with a non-zero width that references
      // an accent/signal/primary color or a non-neutral hex.
      const cardEdge = rawChrome.match(
        /border-(?:top|left|right|bottom)\s*:\s*(?:[1-9]\d*px|0?\.\d+rem|[1-9]\d*px\s+solid)[^;]*(?:var\(--color-signal\)|var\(--color-primary\)|var\(--color-accent\))/gi,
      );
      if (cardEdge) {
        failures.push(
          `card-edge accent line(s) detected (${cardEdge.length}) — never pin an accent border to a card edge; carry accent via number/icon/chip/fill`,
        );
      }
      // Em-dashes in RENDERED copy read as machine-made. Strip comments first —
      // an em-dash inside a /* */ or <!-- --> note never reaches the slide.
      const visibleComponents = stripComments(rawComponents);
      const visibleChrome = stripComments(rawChrome);
      const emFiles: string[] = [];
      if (visibleComponents.includes("—")) emFiles.push("components.html");
      if (visibleChrome.includes("—")) emFiles.push("chrome.css");
      if (emFiles.length > 0) {
        failures.push(`em-dash (—) in ${emFiles.join(", ")} — use commas/periods, not em-dashes`);
      }

      // Cliché-font check — a few faces became the signature of AI design
      // because every model defaults to them (taste-skill v2 lesson). Warn when
      // the skill's IDENTITY hangs on one of them. Non-fatal: legacy seeds and
      // deliberate briefs may still choose them knowingly.
      const headerFam = (skill.tokens.type?.header?.family ?? "").toLowerCase();
      const bodyFam = (skill.tokens.type?.body?.family ?? "").toLowerCase();
      const primary = headerFam.split(",")[0].replace(/['"]/g, "").trim();
      const CLICHE_DISPLAY = ["fraunces", "instrument serif", "playfair display", "dm serif display", "dm serif text", "space grotesk"];
      if (CLICHE_DISPLAY.some((f) => primary === f)) {
        warnings.push(
          `cliché display font: "${primary}" is an AI-design tell as a header face — pick a less-default typeface for this style's identity`,
        );
      }
      if (primary.startsWith("inter") && bodyFam.split(",")[0].includes("inter")) {
        warnings.push(
          "Inter as header AND body: the all-Inter identity is the AI default — give the header a distinctive face",
        );
      }

      // Chrome distinctiveness — a skill whose chrome.css is the stock default
      // look has no visual identity of its own; that shared look was the root
      // of "all decks look the same". Non-fatal, but loud.
      const normalize = (s: string) =>
        s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
      if (rawChrome && normalize(rawChrome) === normalize(defaultChromeCss())) {
        warnings.push(
          "chrome.css is byte-equivalent to the stock default look — author a bespoke chrome for this skill",
        );
      }

      // Graphic-layer gate — hard. Styled text boxes alone are the bland tell.
      const graphicGap = checkGraphicLayer(rawComponents, rawChrome);
      if (graphicGap) failures.push(graphicGap);

      // Type-floor gate — hard. Tiny labels are the "hard to consume" tell.
      const typeGap = checkTypeFloor(rawComponents, rawChrome);
      if (typeGap) failures.push(typeGap);

      // Composition-family contract (generated skills) — hard gate, opt-in.
      failures.push(...checkFamilyContract(skill));
      // Morphology backstop — non-fatal warning. Grid-column-count is blunt
      // (it conflates a phone-split, a comparison and two persona cards as "2col"),
      // so it informs the Phase-6 review rather than blocking; families are the gate.
      const morphology = checkTemplateMorphology(rawComponents);
      if (morphology) warnings.push(morphology);
      // Visual-realization backstop (warning) — data-bearing templates that are
      // pure text. The hard enforcement is the rendered-deck richness gate.
      warnings.push(...checkVisualRealization(skill));

      // Image style
      if (!skill.imageStyle.aiPromptTemplate) failures.push("imageStyle.aiPromptTemplate missing");
      if (!skill.imageStyle.stockQueryTemplate) failures.push("imageStyle.stockQueryTemplate missing");
      if (Object.keys(skill.imageStyle.decisionRules).length === 0) {
        failures.push("imageStyle.decisionRules empty");
      }

      // Grammar/template parity: every grammar slide-type MUST have a component
      const componentIds = new Set<string>();
      const idRe = /id=["']slide-([a-z][a-z0-9-]*)["']/g;
      let m: RegExpExecArray | null;
      while ((m = idRe.exec(skill.components)) !== null) {
        componentIds.add(m[1]);
      }
      const missing: string[] = [];
      const unused: string[] = [];
      for (const t of skill.grammar.slideTypes) {
        if (!componentIds.has(t.name)) missing.push(t.name);
      }
      for (const id of componentIds) {
        if (!skill.grammar.slideTypes.some((t) => t.name === id)) unused.push(id);
      }
      if (missing.length > 0) {
        failures.push(`grammar types without component: ${missing.join(", ")}`);
      }
      if (unused.length > 0) {
        failures.push(`components without grammar entry: ${unused.join(", ")}`);
      }

      // Slot usage in components — every required slot should appear as {{slot}}
      // or be consumed by a directive (e.g. {{@table rows=row-headers cols=col-headers cells=cells}}).
      const slotMissing: string[] = [];
      for (const t of skill.grammar.slideTypes) {
        if (!componentIds.has(t.name)) continue;
        const tmplRe = new RegExp(
          `<template[^>]*id=["']slide-${t.name}["'][^>]*>([\\s\\S]*?)</template>`,
          "i",
        );
        const tmpl = skill.components.match(tmplRe)?.[1] ?? "";
        const slotsConsumedByDirectives = collectDirectiveSlots(tmpl);
        for (const slot of t.requiredSlots) {
          const slotRe = new RegExp(`\\{\\{\\s*${escapeRegex(slot)}\\s*\\}\\}`);
          if (!slotRe.test(tmpl) && !slotsConsumedByDirectives.has(slot)) {
            slotMissing.push(`${t.name}.${slot}`);
          }
        }
      }
      if (slotMissing.length > 0) {
        failures.push(`required slots not used in template: ${slotMissing.join(", ")}`);
      }

      // Unknown placeholders — every {{x}} in a template should be a declared slot
      // (or an image:N placeholder). Surfaces typos.
      const unknownPlaceholders: string[] = [];
      for (const t of skill.grammar.slideTypes) {
        if (!componentIds.has(t.name)) continue;
        const tmplRe = new RegExp(
          `<template[^>]*id=["']slide-${t.name}["'][^>]*>([\\s\\S]*?)</template>`,
          "i",
        );
        const tmpl = skill.components.match(tmplRe)?.[1] ?? "";
        const allSlots = new Set([...t.requiredSlots, ...t.optionalSlots]);
        const phRe = /\{\{\s*([\w:-]+)\s*\}\}/g;
        let ph: RegExpExecArray | null;
        while ((ph = phRe.exec(tmpl)) !== null) {
          const key = ph[1];
          if (key.startsWith("image:")) continue;
          // Engine-injected synthetic slots (footer page numbering).
          if (key === "page-no" || key === "page-total") continue;
          if (!allSlots.has(key)) {
            unknownPlaceholders.push(`${t.name}:${key}`);
          }
        }
      }
      if (unknownPlaceholders.length > 0) {
        failures.push(`undeclared placeholders in templates: ${unknownPlaceholders.join(", ")}`);
      }

      if (failures.length === 0) {
        console.log(
          `✓ ${name.padEnd(20)} v${fm.version}  ${skill.grammar.slideTypes.length} types · ${skill.grammar.rules.length} rules · ${componentIds.size} components`,
        );
      } else {
        failed++;
        console.log(`✗ ${name}`);
        for (const f of failures) console.log(`    - ${f}`);
      }
      for (const w of warnings) console.log(`    ⚠ ${w}`);
    } catch (e: any) {
      failed++;
      console.log(`✗ ${name}  load error: ${e.message}`);
    }
  }

  console.log(`\n${skills.length - failed}/${skills.length} skills validated`);
  if (failed > 0) process.exit(1);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip CSS /* *​/ and HTML <!-- --> comments so checks see only rendered content. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

function collectDirectiveSlots(tmpl: string): Set<string> {
  const slots = new Set<string>();
  const re = /\{\{\s*@(?:table|list|chart|gradient-bg|scrim|placeholder|logo-wall|icon)\s+([^{}]+?)\s*\}\}/g;
  const argRe = /([a-zA-Z][\w-]*)=([^\s]+)/g;
  // arg names whose value is a slot reference (not a literal).
  const slotRefArgs = new Set([
    "rows", "cols", "cells", "slot", "data", "labels",
    "highlight", "preset", "xLabel", "yLabel",
    "compareData", "compareLabel", "primaryLabel",
    "title", "unit", "variant", "pins", "name", "note", "names",
    "callouts", "segLabels", "stripData", "stripLabel", "max", "bgSlot",
    "refLine", "refLabel", "divider", "dividerLabels", "primaryNote", "compareNote",
    "outlineFrom", "outlineTo", "growthCallout", "growthLabel", "quadLabels",
  ]);
  let m: RegExpExecArray | null;
  while ((m = re.exec(tmpl)) !== null) {
    let a: RegExpExecArray | null;
    while ((a = argRe.exec(m[1])) !== null) {
      if (slotRefArgs.has(a[1])) slots.add(a[2]);
    }
  }
  return slots;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
