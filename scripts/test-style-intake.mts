import { resolveStyleInput } from "../engine/style-intake.ts";

const skillsRoot = new URL("../skills", import.meta.url).pathname;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// 1 — style cue naming a built-in skill → preset, no question
{
  const r = await resolveStyleInput(
    { prompt: "a deck about our Q3 results, in McKinsey style" },
    { skillsRoot },
  );
  check("named preset → resolved preset(mckinsey)",
    r.status === "resolved" && r.brief.kind === "preset" && r.brief.name === "mckinsey",
    JSON.stringify(r));
}

// 2 — a website reference → brand-url, no question
{
  const r = await resolveStyleInput(
    { prompt: "investor deck about our seed round", references: [{ kind: "url", url: "https://stripe.com" }] },
    { skillsRoot },
  );
  check("single url → resolved brand-url",
    r.status === "resolved" && r.brief.kind === "brand-url",
    JSON.stringify(r));
}

// 3 — two references (image + pdf) → mix
{
  const r = await resolveStyleInput(
    { prompt: "pitch deck", references: [
      { kind: "image", ref: "shot1.png", descriptor: "warm editorial photography" },
      { kind: "pdf", ref: "brand.pdf", descriptor: "navy + serif corporate guide" },
    ] },
    { skillsRoot },
  );
  check("two references → resolved mix(2)",
    r.status === "resolved" && r.brief.kind === "mix" && (r.brief as any).values.length === 2,
    JSON.stringify(r));
}

// 4 — one image reference → inspiration
{
  const r = await resolveStyleInput(
    { prompt: "team offsite deck", references: [{ kind: "image", ref: "moodboard.png", descriptor: "muted pastel, rounded" }] },
    { skillsRoot },
  );
  check("single non-url reference → resolved inspiration",
    r.status === "resolved" && r.brief.kind === "inspiration",
    JSON.stringify(r));
}

// 5 — free-form style cue (not a preset) → inspiration
{
  const r = await resolveStyleInput(
    { prompt: "a deck about climate, make it look like a 1970s science magazine" },
    { skillsRoot },
  );
  check("style cue → resolved inspiration",
    r.status === "resolved" && r.brief.kind === "inspiration",
    JSON.stringify(r));
}

// 6 — explicit blend cue → mix
{
  const r = await resolveStyleInput(
    { prompt: "product deck in a Stripe × Linear style" },
    { skillsRoot },
  );
  check("blend cue → resolved mix",
    r.status === "resolved" && r.brief.kind === "mix",
    JSON.stringify(r));
}

// 7 — no signal at all → needs-input with questions
{
  const r = await resolveStyleInput(
    { prompt: "make me a presentation about our new pricing" },
    { skillsRoot },
  );
  check("no style signal → needs-input",
    r.status === "needs-input" && (r as any).questions.length >= 2,
    JSON.stringify(r));
}

console.log(`\nstyle-intake: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
