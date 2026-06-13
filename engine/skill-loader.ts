import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { stripUppercaseTypography } from "./brand-guard.ts";
import { normalizeFamily, normalizeVisualRole } from "./composition-families.ts";
import type { VisualRole } from "./composition-families.ts";
import type {
  Skill,
  SkillFrontmatter,
  Tokens,
  LayoutGrammar,
  ImageStyle,
  SlideTypeSpec,
} from "./types.ts";

export async function loadSkill(skillDir: string): Promise<Skill> {
  const [skillMd, tokensJson, grammarMd, imageMd, componentsHtml] =
    await Promise.all([
      readFile(join(skillDir, "SKILL.md"), "utf8"),
      readFile(join(skillDir, "tokens.json"), "utf8"),
      readFile(join(skillDir, "layout-grammar.md"), "utf8"),
      readFile(join(skillDir, "image-style.md"), "utf8"),
      readFile(join(skillDir, "components.html"), "utf8"),
    ]);

  const parsed = matter(skillMd);
  const frontmatter = parsed.data as SkillFrontmatter;
  const systemPromptBody = parsed.content.trim();

  const tokens = JSON.parse(tokensJson) as Tokens;
  const grammar = parseGrammar(grammarMd);
  const imageStyle = parseImageStyle(imageMd);
  const examples = await loadExamples(join(skillDir, "examples"));
  const cachedGradients = await loadCachedGradients(
    join(skillDir, "cached-gradients"),
  );
  const chromeRaw = await readFile(join(skillDir, "chrome.css"), "utf8").catch(
    () => "",
  );
  // Absolute rule: no uppercased label typography, ever. Strip it from both the
  // look layer and any inline component styles before the deck can render.
  const chrome = stripUppercaseTypography(chromeRaw);

  return {
    frontmatter,
    systemPromptBody,
    tokens,
    grammar,
    imageStyle,
    components: stripUppercaseTypography(componentsHtml),
    chrome,
    examples,
    rootDir: skillDir,
    cachedGradients,
  };
}

async function loadCachedGradients(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const m = entry.match(/^([a-z][a-z0-9-]{0,31})\.(jpe?g|png|webp)$/i);
    if (!m) continue;
    const preset = m[1].toLowerCase();
    const ext = m[2].toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const buf = await readFile(join(dir, entry));
    out[preset] = `data:${mime};base64,${buf.toString("base64")}`;
  }
  return out;
}

function parseGrammar(md: string): LayoutGrammar {
  const slideTypes: SlideTypeSpec[] = [];
  const rules: string[] = [];

  const lines = md.split("\n");
  let inTable = false;
  let inRules = false;
  // Column index map, read from the header row. Lets a `family` column live at
  // any position while old 4-column grammars (no family) still parse correctly.
  let cols:
    | { name: number; when: number; required: number; optional: number; family: number; visualRoles: number }
    | null = null;

  const splitCells = (row: string) =>
    row.split("|").slice(1, -1).map((c) => c.trim());

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.includes("slide-type")) {
      inTable = true;
      const headers = splitCells(trimmed).map((h) => h.toLowerCase().replace(/`/g, ""));
      const find = (...needles: string[]) =>
        headers.findIndex((h) => needles.some((n) => h.includes(n)));
      cols = {
        name: find("slide-type"),
        when: find("when"),
        required: find("required"),
        optional: find("optional"),
        family: find("family"),
        visualRoles: find("visual"),
      };
      continue;
    }
    if (inTable && trimmed.startsWith("|---")) continue;
    if (inTable && cols && trimmed.startsWith("|")) {
      const cells = splitCells(trimmed);
      const at = (i: number) => (i >= 0 && i < cells.length ? cells[i] : "");
      if (at(cols.name)) {
        const family = normalizeFamily(at(cols.family));
        const visualRoles = at(cols.visualRoles)
          .split(",")
          .map((s) => normalizeVisualRole(s))
          .filter((r): r is VisualRole => !!r);
        slideTypes.push({
          name: at(cols.name).replace(/`/g, ""),
          when: at(cols.when),
          requiredSlots: at(cols.required)
            .split(",")
            .map((s) => s.trim().replace(/`/g, ""))
            .filter(Boolean),
          optionalSlots: at(cols.optional)
            .split(",")
            .map((s) => s.trim().replace(/`/g, ""))
            .filter(Boolean),
          ...(family ? { family } : {}),
          ...(visualRoles.length ? { visualRoles } : {}),
        });
      }
      continue;
    }
    if (inTable && !trimmed.startsWith("|")) inTable = false;

    if (/^#{1,6}\s*composition rules/i.test(trimmed)) {
      inRules = true;
      continue;
    }
    if (inRules && /^#{1,6}\s/.test(trimmed)) {
      inRules = false;
      continue;
    }
    if (inRules && trimmed.startsWith("- ")) {
      rules.push(trimmed.slice(2));
    }
  }

  return { slideTypes, rules };
}

function parseImageStyle(md: string): ImageStyle {
  const promptMatch = md.match(/Prompt template:\s*`(.+?)`/);
  const negativeMatch = md.match(/Negative prompt:\s*(.+)/);
  const stockMatch = md.match(/Search-query template:\s*`(.+?)`/);
  const treatmentMatch = md.match(/Treatment:\s*`?([a-z][a-z-]*)`?/i);

  const decisionRules: Record<string, "ai" | "stock" | "ask"> = {};
  const decisionLines = md.match(/-\s*`[^`]+`\s*→\s*(AI default|stock|ask)/gi);
  if (decisionLines) {
    for (const line of decisionLines) {
      const catMatch = line.match(/`([^`]+)`/);
      const verdict = /AI default/i.test(line)
        ? "ai"
        : /stock/i.test(line)
        ? "stock"
        : "ask";
      if (catMatch) {
        for (const cat of catMatch[1].split("|").map((c) => c.trim())) {
          decisionRules[cat] = verdict;
        }
      }
    }
  }

  return {
    aiPromptTemplate: promptMatch?.[1] ?? "",
    aiStyleModifiers: [],
    aiNegativePrompt: negativeMatch
      ? negativeMatch[1].split(",").map((s) => s.trim())
      : [],
    stockQueryTemplate: stockMatch?.[1] ?? "",
    stockStyleModifiers: [],
    decisionRules,
    treatment: treatmentMatch?.[1]?.toLowerCase(),
  };
}

async function loadExamples(
  examplesDir: string,
): Promise<{ name: string; html: string }[]> {
  try {
    const entries = await readdir(examplesDir);
    const examples = await Promise.all(
      entries
        .filter((e) => e.endsWith(".html"))
        .map(async (name) => {
          const html = await readFile(join(examplesDir, name), "utf8");
          return { name: name.replace(/\.html$/, ""), html };
        }),
    );
    return examples;
  } catch {
    return [];
  }
}

export async function listSkills(skillsRoot: string): Promise<string[]> {
  const entries = await readdir(skillsRoot);
  const skills: string[] = [];
  for (const entry of entries) {
    const s = await stat(join(skillsRoot, entry));
    if (s.isDirectory()) skills.push(entry);
  }
  return skills;
}
