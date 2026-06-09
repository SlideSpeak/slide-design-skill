// Smoke-test security/validation hardening.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeck,
  resolveSkillDir,
  type LLMClient,
  type ImageResolver,
} from "../engine/index.ts";
import { safeImageUrl } from "../engine/renderer.ts";
import { guardImagePrompt, guardAssembledImagePrompt } from "../engine/brand-guard.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const skillsRoot = resolve(repoRoot, "skills");

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`OK  ${label}`);
    pass++;
  } else {
    console.log(`FAIL ${label}${detail ? " — " + detail : ""}`);
    fail++;
  }
}

async function expectThrows(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "should have thrown");
  } catch (e: any) {
    check(label, true);
  }
}

async function main() {
  // --- URL sanitizer ---
  check("safeImageUrl rejects javascript:", safeImageUrl("javascript:alert(1)") === null);
  check("safeImageUrl rejects html-inject", safeImageUrl('https://x.com/a" onerror="alert(1)') === null);
  check("safeImageUrl rejects control chars", safeImageUrl("https://x.com/a\x00b") === null);
  check("safeImageUrl rejects whitespace", safeImageUrl("https://x.com/a b") === null);
  check("safeImageUrl rejects http://", safeImageUrl("http://x.com/a.png") === null);
  check("safeImageUrl accepts https", safeImageUrl("https://x.com/a.png") === "https://x.com/a.png");
  check("safeImageUrl accepts data:image", !!safeImageUrl("data:image/png;base64,iVBORw"));
  check("safeImageUrl rejects data:text", safeImageUrl("data:text/html,xxx") === null);
  check("safeImageUrl rejects oversized", safeImageUrl("https://x.com/" + "a".repeat(5000)) === null);
  check("safeImageUrl rejects non-string", safeImageUrl(123 as any) === null);

  // --- Path traversal ---
  await expectThrows("resolveSkillDir rejects ../", () =>
    resolveSkillDir(skillsRoot, "../etc"),
  );
  await expectThrows("resolveSkillDir rejects absolute", () =>
    resolveSkillDir(skillsRoot, "/etc/passwd"),
  );
  await expectThrows("resolveSkillDir rejects unknown skill", () =>
    resolveSkillDir(skillsRoot, "does-not-exist"),
  );
  await expectThrows("resolveSkillDir rejects bad chars", () =>
    resolveSkillDir(skillsRoot, "consulting/../academic"),
  );
  await expectThrows("resolveSkillDir rejects empty", () =>
    resolveSkillDir(skillsRoot, ""),
  );

  const consultingDir = await resolveSkillDir(skillsRoot, "consulting");
  check("resolveSkillDir accepts known skill", consultingDir.endsWith("/consulting"));

  // --- LLM output validation ---
  const mockBadLLM: LLMClient = {
    async generateSlideTree() {
      return "not an object";
    },
  };
  const mockImages: ImageResolver = {
    async resolve() {
      throw new Error("unused");
    },
  };

  await expectThrows("generateDeck rejects non-object LLM output", () =>
    generateDeck(
      { skillName: "consulting", userPrompt: "x", slideCount: 3 },
      { skillsRoot, llm: mockBadLLM, images: mockImages },
    ),
  );

  const mockMalformedSlides: LLMClient = {
    async generateSlideTree() {
      return { slides: "not an array" };
    },
  };
  await expectThrows("generateDeck rejects non-array slides", () =>
    generateDeck(
      { skillName: "consulting", userPrompt: "x", slideCount: 3 },
      { skillsRoot, llm: mockMalformedSlides, images: mockImages },
    ),
  );

  // Mix: 1 valid + 2 malformed slides; should validate the 1 and warn about rest
  const mockPartial: LLMClient = {
    async generateSlideTree() {
      return {
        slides: [
          { type: "cover", slots: { title: "OK", subtitle: "ok", "client-name": "X", date: "2026" } },
          "not-an-object",
          { type: "../escape-attempt", slots: {} },
          { type: "evil<script>", slots: {} },
          { type: "cover", slots: { title: 123, subtitle: "ok", "client-name": "X", date: "2026" } },
        ],
      };
    },
  };
  const partialResult = await generateDeck(
    { skillName: "consulting", userPrompt: "x", slideCount: 5 },
    { skillsRoot, llm: mockPartial, images: mockImages },
  );
  check(
    "generateDeck drops malformed slides, keeps valid ones",
    partialResult.slides.length === 2 && partialResult.warnings.length >= 3,
    `kept=${partialResult.slides.length} warnings=${partialResult.warnings.length}`,
  );

  // --- HTML render injection attempt ---
  const xssLLM: LLMClient = {
    async generateSlideTree() {
      return {
        slides: [
          {
            type: "cover",
            slots: {
              title: '<script>alert(1)</script>',
              subtitle: '"><img src=x onerror=alert(1)>',
              "client-name": "ACME",
              date: "2026",
            },
          },
        ],
      };
    },
  };
  const xssResult = await generateDeck(
    { skillName: "consulting", userPrompt: "x", slideCount: 1 },
    { skillsRoot, llm: xssLLM, images: mockImages },
  );
  const html = xssResult.slides[0].html;
  check(
    "html escapes <script> in slot value",
    !html.includes("<script>") && html.includes("&lt;script&gt;"),
  );
  check(
    "html escapes attribute-breaking injection",
    !/<img\s+src=x\s+onerror/i.test(html) && !/"\s*>\s*<img/.test(html),
  );

  // --- Assembled brand-guard (final prompt after template substitution) ---
  check(
    "assembled-guard allows legitimate 'no logos' template",
    guardAssembledImagePrompt(
      "warm gradient, editorial composition, no logos, no recognizable products",
    ).allowed,
  );
  check(
    "assembled-guard catches injected positive 'Apple' in template",
    !guardAssembledImagePrompt(
      "warm gradient, Apple-style interior, no logos",
    ).allowed,
  );
  check(
    "assembled-guard catches McKinsey in subject after template",
    !guardAssembledImagePrompt(
      "McKinsey office, editorial, no logos",
    ).allowed,
  );
  check(
    "raw-guard still works on simple subject",
    !guardImagePrompt("Tesla building").allowed,
  );

  console.log(`\n${pass}/${pass + fail} security checks passed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
