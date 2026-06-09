import { loadSkill, composeSystemPrompt } from "../engine/index.ts";
import { findBleedSlideTypes } from "../engine/prompt-composer.ts";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(__dirname, "..", "skills");

const lw = await loadSkill(resolve(skillsRoot, "launch-warm"));
const lwBleed = findBleedSlideTypes(lw.components);
console.log("launch-warm bleed types:", lwBleed);

const lwPrompt = composeSystemPrompt(lw, { userPrompt: "x", slideCount: 8, language: "en" });
console.log("\n--- launch-warm prompt contains BACKGROUND ART DIRECTION:", lwPrompt.includes("BACKGROUND ART DIRECTION"));
console.log("--- includes asymmetric:", lwPrompt.includes("Asymmetric"));
console.log("--- includes bleed list:", lwPrompt.includes("[" + lwBleed.join(", ") + "]"));
console.log("--- shape has bgPrompt:", /["']bgPrompt["']/.test(lwPrompt));
console.log("--- emits bgPrompt marker on cover line:", /cover.*emits bgPrompt/.test(lwPrompt));

const mck = await loadSkill(resolve(skillsRoot, "mckinsey"));
const mckBleed = findBleedSlideTypes(mck.components);
console.log("\nmckinsey bleed types:", mckBleed);

const mckPrompt = composeSystemPrompt(mck, { userPrompt: "x", slideCount: 10, language: "en" });
console.log("--- mckinsey prompt contains BACKGROUND ART DIRECTION:", mckPrompt.includes("BACKGROUND ART DIRECTION"));
console.log("--- mckinsey shape has bgPrompt:", /["']bgPrompt["']/.test(mckPrompt));

console.log("\n--- preview launch-warm BACKGROUND section ---");
const idx = lwPrompt.indexOf("BACKGROUND ART DIRECTION");
const end = lwPrompt.indexOf("USER REQUEST");
console.log(lwPrompt.slice(idx, end).trim());
