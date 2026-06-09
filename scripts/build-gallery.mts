import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

interface Entry {
  slug: string;
  source: "production" | "generated";
  brief: string;
  description: string;
  colorKit: string;
  typographyKit: string;
  deckHtml: string;
  thumb: string;
}

const productionDecks = [
  { slug: "mckinsey", brief: "strict consulting grid", deckHtml: "mckinsey-deck.html", thumb: "mckinsey-deck-thumb.png" },
  { slug: "launch-warm", brief: "warm editorial product launch", deckHtml: "launch-warm-deck.html", thumb: "launch-warm-deck-thumb.png" },
  { slug: "academic", brief: "conference paper deck", deckHtml: "academic-smoke.html", thumb: "academic-smoke-thumb.png" },
  { slug: "pitch", brief: "VC pitch deck", deckHtml: "pitch-smoke.html", thumb: "pitch-smoke-thumb.png" },
  { slug: "product-marketing", brief: "benefit-driven SaaS marketing", deckHtml: "product-marketing-smoke.html", thumb: "product-marketing-smoke-thumb.png" },
  { slug: "training", brief: "L&D / training material", deckHtml: "training-smoke.html", thumb: "training-smoke-thumb.png" },
] as const;

const generatedExamples = [
  { slug: "lovable", brief: '"like Lovable" — pink chat-bubble cover, CSS gradient', deckHtml: "lovable-deck.html", thumb: "lovable-deck-thumb.png" },
  { slug: "stripe-feel", brief: '"Stripe brand-feel" — $2.4B metric-led, iridescent orb', deckHtml: "stripe-feel-deck.html", thumb: "stripe-feel-deck-thumb.png" },
  { slug: "apple-headspace", brief: '"Apple × Headspace mix" — centered breath-circle', deckHtml: "apple-headspace-deck.html", thumb: "apple-headspace-deck-thumb.png" },
  { slug: "linear-feel", brief: '"like Linear" — dark command-palette cover', deckHtml: "linear-feel-deck.html", thumb: "linear-feel-deck-thumb.png" },
  { slug: "telescope", brief: '"editorial publication" — FAL photographic, serif italic', deckHtml: "telescope-fal-deck.html", thumb: "telescope-deck-thumb.png" },
  { slug: "atelier", brief: '"art-gallery catalog" — FAL painterly textures, sans quiet', deckHtml: "atelier-fal-deck.html", thumb: "atelier-deck-thumb.png" },
] as const;

async function readFrontmatter(skillDir: string) {
  try {
    const raw = await readFile(resolve(skillDir, "SKILL.md"), "utf8");
    const fm = matter(raw).data as Record<string, unknown>;
    return {
      description: typeof fm.description === "string" ? fm.description : "",
      colorKit: typeof fm.color_kit === "string" ? fm.color_kit : "",
      typographyKit: typeof fm.typography_kit === "string" ? fm.typography_kit : "",
    };
  } catch {
    return { description: "", colorKit: "", typographyKit: "" };
  }
}

async function buildEntries(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const d of productionDecks) {
    const meta = await readFrontmatter(resolve(repoRoot, "skills", d.slug));
    out.push({
      slug: d.slug,
      source: "production",
      brief: d.brief,
      description: meta.description,
      colorKit: meta.colorKit,
      typographyKit: meta.typographyKit,
      deckHtml: d.deckHtml,
      thumb: d.thumb,
    });
  }
  for (const d of generatedExamples) {
    const meta = await readFrontmatter(resolve(repoRoot, "examples", "generated", d.slug));
    out.push({
      slug: d.slug,
      source: "generated",
      brief: d.brief,
      description: meta.description,
      colorKit: meta.colorKit,
      typographyKit: meta.typographyKit,
      deckHtml: d.deckHtml,
      thumb: d.thumb,
    });
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]!);
}

function renderCard(e: Entry): string {
  return `<a class="card" href="${e.deckHtml}" target="_blank">
  <div class="thumb"><img src="${e.thumb}" alt="${escapeHtml(e.slug)} cover"></div>
  <div class="meta">
    <div class="row">
      <div class="slug">${escapeHtml(e.slug)}</div>
      <div class="tag tag-${e.source}">${e.source}</div>
    </div>
    <div class="brief">${escapeHtml(e.brief)}</div>
    <div class="kit">${escapeHtml(e.colorKit.slice(0, 140))}${e.colorKit.length > 140 ? "…" : ""}</div>
    <div class="kit muted">${escapeHtml(e.typographyKit.slice(0, 140))}${e.typographyKit.length > 140 ? "…" : ""}</div>
  </div>
</a>`;
}

const entries = await buildEntries();
const production = entries.filter((e) => e.source === "production");
const generated = entries.filter((e) => e.source === "generated");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SlideSpeak — Skill Gallery</title>
<style>
  :root {
    --bg: #0E0F12;
    --card-bg: #16171B;
    --ink: #E6E7EB;
    --muted: #6E727A;
    --rule: #23252B;
    --accent: #5E6AD2;
    --accent-soft: rgba(94,106,210,0.15);
    --header: 'Inter Display', 'Inter Tight', 'Inter', system-ui, sans-serif;
    --body: 'Inter Tight', 'Inter', system-ui, sans-serif;
    --mono: 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--body); background: var(--bg); color: var(--ink); line-height: 1.55; }
  .page { max-width: 1480px; margin: 0 auto; padding: 64px 48px 96px; }
  header { margin-bottom: 64px; border-bottom: 1px solid var(--rule); padding-bottom: 40px; }
  h1 { font-family: var(--header); font-weight: 700; font-size: 56px; line-height: 1.05; letter-spacing: -0.022em; margin-bottom: 16px; }
  .sub { font-size: 20px; color: rgba(230,231,235,0.72); max-width: 880px; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; color: var(--accent); text-transform: uppercase; margin-bottom: 24px; }
  section { margin-bottom: 80px; }
  h2 { font-family: var(--header); font-weight: 700; font-size: 32px; letter-spacing: -0.012em; margin-bottom: 8px; }
  .section-sub { font-size: 17px; color: rgba(230,231,235,0.65); max-width: 880px; margin-bottom: 32px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 24px; }
  .card { display: flex; flex-direction: column; background: var(--card-bg); border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; text-decoration: none; color: inherit; transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease; }
  .card:hover { transform: translateY(-2px); border-color: rgba(94,106,210,0.4); box-shadow: 0 16px 40px rgba(94,106,210,0.12); }
  .thumb { width: 100%; aspect-ratio: 16/9; background: #000; overflow: hidden; border-bottom: 1px solid var(--rule); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .meta { padding: 22px 24px; display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 4px; }
  .slug { font-family: var(--mono); font-weight: 600; font-size: 16px; color: var(--ink); letter-spacing: -0.01em; }
  .tag { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; padding: 3px 8px; border-radius: 5px; }
  .tag-production { background: rgba(110,114,122,0.18); color: rgba(230,231,235,0.72); border: 1px solid rgba(110,114,122,0.3); }
  .tag-generated { background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(94,106,210,0.3); }
  .brief { font-family: var(--mono); font-size: 13px; color: var(--ink); margin-bottom: 4px; }
  .kit { font-size: 13px; color: rgba(230,231,235,0.7); line-height: 1.5; }
  .kit.muted { color: rgba(230,231,235,0.5); }
  .arch { background: var(--card-bg); border: 1px solid var(--rule); border-radius: 14px; padding: 28px 32px; font-family: var(--mono); font-size: 13px; color: rgba(230,231,235,0.78); line-height: 1.7; white-space: pre; overflow-x: auto; }
  footer { margin-top: 96px; padding-top: 40px; border-top: 1px solid var(--rule); font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="eyebrow">SlideSpeak · Skill Gallery</div>
    <h1>The decks the engine builds.</h1>
    <p class="sub">Every card below is a real deck rendered by the same engine. Production presets are pre-built style folders. Generator outputs were emitted from free-form briefs by the meta-skill (engine/skill-generator.ts) and would normally live only in memory — these four are persisted as validation artifacts.</p>
  </header>

  <section>
    <h2>Production presets</h2>
    <p class="section-sub">The 7 pre-built style skills shipped in <code>skills/</code>. Picked by name. Stable.</p>
    <div class="grid">
${production.map(renderCard).join("\n")}
    </div>
  </section>

  <section>
    <h2>Generator-output examples</h2>
    <p class="section-sub">4 ad-hoc skills emitted from free-form briefs. Validation that the meta-skill can produce a working 5-file skill package for any style input — preset name, inspiration, mix, or brand URL.</p>
    <div class="grid">
${generated.map(renderCard).join("\n")}
    </div>
  </section>

  <section>
    <h2>The architecture</h2>
    <p class="section-sub">The meta-skill is <code>engine/skill-generator.ts</code>. It takes a StyleBrief and produces a 5-file skill the engine consumes unchanged.</p>
    <div class="arch">brief: StyleBrief
  ├─ { kind: "preset", name: "mckinsey" }
  ├─ { kind: "inspiration", value: "like Lovable" }
  ├─ { kind: "mix", values: ["Apple", "Headspace"] }
  └─ { kind: "brand-url", url: "https://stripe.com" }

         │
         ▼
  composeGeneratorPrompt(brief, refs, slug)  →  LLM prompt (10k chars)
         │
         ▼
  LLM emits JSON { "SKILL.md", "tokens.json", "layout-grammar.md",
                   "components.html", "image-style.md" }
         │
         ▼
  parseGeneratedSkill  →  materializeSkill (tmpdir or skills/&lt;slug&gt;/)
         │
         ▼
  Skill object  →  composeSystemPrompt  →  LLM  →  renderer  →  deck</div>
  </section>

  <footer>
    <span>${production.length} production presets · ${generated.length} generated examples</span>
    <span>Generated ${new Date().toISOString().slice(0, 10)}</span>
  </footer>
</div>
</body>
</html>`;

await writeFile(resolve(repoRoot, "scripts/gallery.html"), html);
console.log(`gallery → scripts/gallery.html (${production.length} production + ${generated.length} generated)`);
