# Layout Fit — Phase 1 (content-sized templates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mckinsey-Templates inhaltsgroß machen — wenig Inhalt schwimmt nicht mehr im Weißraum, viel Inhalt crasht nicht mehr in den Footer — abgesichert durch eine Fit-Mess-Harness auf sparse/typisch/dense Fixtures.

**Architecture:** Codex' "Bounded Intrinsic Content Island"-Regel auf die fünf kaputten Templates anwenden (`executive-summary`, `recommendation`, `comparison-table`, `heatmap`, `intro-text`). Der Hauptinhalt lebt in einer `[data-fit="island"]`-Insel (`flex:1; min-height:0; overflow:hidden`); Zeilen liegen in `[data-fit="rows"]` mit *festem* Gap, nie über `space-evenly` gestreckt. Die `data-density`-Attribute (schon vom Renderer injiziert) steuern editorial=zentriert vs. data-dense=top. Eine neue Harness `scripts/measure-fit.mts` rendert Fixtures, misst per Headless-Brave die Boxen und schlägt fehl bei Footer-Kollision, Insel-Overflow oder gestreckten Gaps.

**Tech Stack:** TypeScript (`npx tsx`), bestehende Engine (`generateDeck`, `wrapAsStandaloneHtml`), Brave headless `--dump-dom` für DOM-Messung (dependency-frei, kein FAL — Fixtures nutzen nur solide Hintergründe).

> **Repo-Hinweis:** Dieses Verzeichnis ist lokal **kein** Git-Repo. Die `Commit`-Steps sind als **Checkpoints** zu verstehen (Validate + Measure grün). Wenn Versionskontrolle gewünscht ist, einmalig `git init` und die Commits wörtlich ausführen — sonst die Checkpoint-Variante laufen lassen. Niemals automatisch committen.

---

## File Structure

| Datei | Verantwortung | Art |
|---|---|---|
| `scripts/fixtures/mckinsey-fit.json` | Fixture-Deck: 5 Templates × 3 Density-Stufen (sparse/typisch/dense) mit ehrlichem Sample-Inhalt | Create |
| `scripts/measure-fit.mts` | Rendert ein Fixture-Deck, misst pro Slide Insel/Footer/Rows via Brave dump-dom, asserted Pass/Fail | Create |
| `skills/mckinsey/components.html` | 5 Templates auf die Island-Regel umgebaut + `data-fit`-Tags + Density-Register-CSS | Modify |
| `scripts/mckinsey-deck.json` | Repertoire-Deck — nach dem Umbau neu rendern zur visuellen Endkontrolle | (re-render) |

Keine Änderung an `engine/token-compiler.ts` / `baseSlideCss` (Shared-Layer, additiv-only Regel).

---

## Task 1: Fixture-Deck für die fünf Templates

**Files:**
- Create: `scripts/fixtures/mckinsey-fit.json`

Das Fixture deckt jeden der fünf Problem-Typen in drei Mengen ab. `sparse` = Minimum (muss ruhig/zentriert aussehen, keine Streckung), `typical` = Normalfall, `dense` = oberes Ende, das bei fester Schriftgröße noch passen muss. Inhalt ist ehrliches Sample (als illustrativ markiert), keine erfundenen Real-Daten.

- [ ] **Step 1: Fixture-Datei anlegen**

```json
{
  "slides": [
    { "type": "executive-summary", "density": "editorial",
      "slots": { "headline": "Three moves decide the next two quarters.",
        "claim-1": "Demand is concentrating in the top two segments.",
        "claim-2": "Unit cost falls fastest where volume already leads.",
        "claim-3": "The window to act closes at the next planning cycle.",
        "source": "Illustrative — sample data (Northwind)" } },
    { "type": "executive-summary", "density": "balanced",
      "slots": { "headline": "Five takeaways frame the recommendation.",
        "claim-1": "Numbered takeaways read top to bottom as one ordered story.",
        "claim-2": "Each line is one idea, set at a readable size.",
        "claim-3": "The accent number anchors the eye and keeps the rhythm steady.",
        "claim-4": "Five claims is the working maximum for a summary.",
        "claim-5": "Beyond five, the argument should split across two slides.",
        "source": "Illustrative — sample data (Northwind)" } },
    { "type": "executive-summary", "density": "data-dense",
      "slots": { "headline": "Five dense takeaways, each a full line of reasoning.",
        "claim-1": "Segment A grew 18 percent while the long tail contracted, concentrating margin.",
        "claim-2": "Fulfilment cost per unit dropped 11 percent in the two highest-volume lanes.",
        "claim-3": "Churn in the mid tier traces to onboarding latency, not price sensitivity.",
        "claim-4": "Two of the four pilot regions cleared payback inside three quarters.",
        "claim-5": "The structural change pays off only after the first two moves are underway.",
        "source": "Illustrative — sample data (Northwind)" } },

    { "type": "recommendation", "density": "editorial",
      "slots": { "action-title": "Lead with the highest-leverage move.",
        "rec-1": "Concentrate spend on the top two segments.", "rec-1-impact": "High impact", "rec-1-timing": "Quarters 1-2",
        "rec-2": "Sequence the second move once the first is underway.", "rec-2-impact": "Medium impact", "rec-2-timing": "Quarters 1-3",
        "rec-3": "Hold the structural change for last.", "rec-3-impact": "High impact", "rec-3-timing": "Quarters 2-4",
        "source": "Illustrative — sample data (Northwind)" } },
    { "type": "recommendation", "density": "balanced",
      "slots": { "action-title": "Three sequenced moves, ranked by leverage and timing.",
        "rec-1": "Concentrate commercial spend on the two segments already compounding.", "rec-1-impact": "High impact, low cost", "rec-1-timing": "Quarters 1-2",
        "rec-2": "Fix mid-tier onboarding latency before it compounds into churn.", "rec-2-impact": "Medium impact", "rec-2-timing": "Quarters 1-3",
        "rec-3": "Stage the structural change once the groundwork is set.", "rec-3-impact": "High impact, high effort", "rec-3-timing": "Quarters 2-4",
        "source": "Illustrative — sample data (Northwind)" } },
    { "type": "recommendation", "density": "data-dense",
      "slots": { "action-title": "Three moves with full impact and timing detail per row.",
        "rec-1": "Concentrate spend on segments A and B, which already carry the margin and respond fastest to investment.", "rec-1-impact": "High impact, low cost", "rec-1-timing": "Quarters 1-2",
        "rec-2": "Redesign mid-tier onboarding to cut activation latency, the root cause of avoidable churn.", "rec-2-impact": "Medium impact, medium effort", "rec-2-timing": "Quarters 1-3",
        "rec-3": "Sequence the platform re-architecture last, after the first two moves fund it.", "rec-3-impact": "High impact, high effort", "rec-3-timing": "Quarters 2-4",
        "source": "Illustrative — sample data (Northwind)" } },

    { "type": "comparison-table", "density": "editorial",
      "slots": { "action-title": "Option A wins on cost and effort.",
        "row-headers": "Option A;Option B", "col-headers": "Cost;Effort",
        "cells": "Low,Low;Medium,Medium",
        "insight": "Fewer rows, read at a glance.", "source": "Illustrative — sample data (Northwind)" } },
    { "type": "comparison-table", "density": "balanced",
      "slots": { "action-title": "A table is the honest layout when content is a grid.",
        "row-headers": "Option A;Option B;Option C", "col-headers": "Cost;Speed;Risk;Effort",
        "cells": "Low,Fast,Medium,Low;Medium,Medium,Low,Medium;High,Slow,Low,High",
        "insight": "Rows and columns at a readable size beat prose for the same comparison.",
        "footnote": "Qualitative sample ratings.", "source": "Illustrative — sample data (Northwind)" } },
    { "type": "comparison-table", "density": "data-dense",
      "slots": { "action-title": "Six options across five dimensions, still a clean grid.",
        "row-headers": "Option A;Option B;Option C;Option D;Option E;Option F",
        "col-headers": "Cost;Speed;Risk;Effort;Payback",
        "cells": "Low,Fast,Medium,Low,2 q;Medium,Medium,Low,Medium,3 q;High,Slow,Low,High,5 q;Low,Medium,High,Low,2 q;Medium,Fast,Medium,Medium,3 q;High,Medium,Low,High,4 q",
        "insight": "Even at six rows the grid stays scannable; type does not shrink.",
        "footnote": "Qualitative sample ratings.", "source": "Illustrative — sample data (Northwind)" } },

    { "type": "heatmap", "density": "balanced",
      "slots": { "action-title": "Relevance concentrates in two segments.",
        "row-headers": "Segment A;Segment B;Segment C", "col-headers": "Q1;Q2;Q3;Q4",
        "cells": "8,9,7,6;5,6,8,9;2,3,3,4", "scale-max": "10",
        "low-label": "Low", "high-label": "High",
        "insight": "The accent corner shows where coverage is densest.",
        "source": "Illustrative — sample data (Northwind)" } },
    { "type": "heatmap", "density": "data-dense",
      "slots": { "action-title": "A six-by-six matrix still reads at a fixed cell size.",
        "row-headers": "Seg A;Seg B;Seg C;Seg D;Seg E;Seg F",
        "col-headers": "Jan;Feb;Mar;Apr;May;Jun",
        "cells": "8,9,7,6,5,4;5,6,8,9,7,6;2,3,3,4,5,6;7,7,6,5,4,3;3,4,5,6,7,8;6,5,4,3,2,1",
        "scale-max": "10", "low-label": "Low", "high-label": "High",
        "insight": "The grid grows; the type does not.",
        "source": "Illustrative — sample data (Northwind)" } },

    { "type": "intro-text", "density": "editorial",
      "slots": { "title": "One paragraph sets the frame.",
        "body": "This deck reads as one argument. The opening sets the question and the stakes, then each slide carries a single move toward the recommendation.",
        "byline": "Layout specimen — Northwind", "source": "Illustrative — sample data (Northwind)" } },
    { "type": "intro-text", "density": "data-dense",
      "slots": { "title": "A full page of prose at a readable size, in two columns.",
        "body": "This slide shows that a dense, text-heavy page still works when the layout carries it.¶The body sits in two balanced columns at a readable size, so it flows naturally without shrinking the type.¶The sidebar holds a short reading guide that stays out of the main flow.¶The rule of thumb is simple: the amount of content decides the layout, and the layout keeps the content readable.¶When a single page would overflow, the answer is to split across slides, never to shrink the type until it stops being read.",
        "sidebar-title": "How to read this deck",
        "sidebar-body": "Every slide is one layout from the repertoire.¶Captions or eyebrows label the layout in use.¶All figures are illustrative sample data.",
        "byline": "Layout specimen — Northwind", "source": "Illustrative — sample data (Northwind)" } }
  ]
}
```

- [ ] **Step 2: Fixture lädt sauber durch den Validator**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx -e "import {readFile} from 'node:fs/promises'; const p=JSON.parse(await readFile('scripts/fixtures/mckinsey-fit.json','utf8')); console.log('slides', p.slides.length)"`
Expected: `slides 15`

- [ ] **Step 3: Checkpoint** — `git add scripts/fixtures/mckinsey-fit.json && git commit -m "test: mckinsey fit fixtures (sparse/typical/dense × 5 templates)"` (oder Checkpoint-Notiz, falls kein Git).

---

## Task 2: Fit-Mess-Harness

**Files:**
- Create: `scripts/measure-fit.mts`

Die Harness rendert ein Fixture-Deck über die echte Engine (kein FAL, kein Background-Generator), injiziert ein Mess-Script, holt das DOM via Brave `--dump-dom` und prüft pro Slide drei Dinge: (1) die Insel kollidiert nicht mit dem Footer, (2) der Inhalt läuft nicht über die Insel hinaus (overflow:hidden würde sonst clippen), (3) kein Zeilen-Gap ist gestreckt.

- [ ] **Step 1: Harness schreiben**

```ts
// Measure layout fit of a fixture deck. Usage:
//   npx tsx scripts/measure-fit.mts <skillName> <fixtureRelPath>
// example: npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json
//
// Renders via the real engine (no FAL), injects a measuring script, reads the
// final DOM with Brave --dump-dom, and asserts the Bounded Intrinsic Content
// Island contract. Exit 1 on any violation.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeck,
  loadSkill,
  wrapAsStandaloneHtml,
  type LLMClient,
  type ImageResolver,
} from "../engine/index.ts";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

// Thresholds. A fixed designed gap is ~26-40px; space-evenly stretch was ~150px.
const GAP_MAX = 80;       // px — any inter-row gap above this means stretched distribution
const OVERFLOW_TOL = 2;   // px — sub-pixel rounding allowance

const [skillName, fixtureArg] = process.argv.slice(2);
if (!skillName || !fixtureArg) {
  console.error("Usage: tsx measure-fit.mts <skillName> <fixtureRelPath>");
  process.exit(2);
}

const payload = JSON.parse(await readFile(resolve(repoRoot, fixtureArg), "utf8"));
const llm: LLMClient = { async generateSlideTree() { return payload; } };
const noImg: ImageResolver = { async resolve() { throw new Error("none"); } };

const result = await generateDeck(
  { skillName, userPrompt: `${skillName} fit fixture`, slideCount: payload.slides.length, imageBudget: 0 },
  { skillsRoot: resolve(repoRoot, "skills"), llm, images: noImg },
);

const skill = await loadSkill(resolve(repoRoot, "skills", skillName));
const body = wrapAsStandaloneHtml(skill, result.slides);

// Inject a measuring script that runs after layout and serialises per-slide
// box metrics into <pre id="FITOUT">…</pre> so --dump-dom can carry it out.
const measurer = `
<script>
window.addEventListener('load', function () {
  function rel(el, top){ var r = el.getBoundingClientRect(); return { top: r.top - top, bottom: r.bottom - top }; }
  var out = [];
  document.querySelectorAll('.slide').forEach(function (slide, i) {
    var stop = slide.getBoundingClientRect().top;
    var type = slide.getAttribute('data-slide-type') || '';
    var density = slide.getAttribute('data-density') || '';
    var island = slide.querySelector('[data-fit="island"]');
    var footer = slide.querySelector('[data-fit="footer"]');
    var rows = slide.querySelector('[data-fit="rows"]');
    var rec = { i: i, type: type, density: density };
    if (island) {
      rec.islandBottom = rel(island, stop).bottom;
      rec.islandClip = island.scrollHeight - island.clientHeight; // >0 means content overflowed the island
    }
    rec.footerTop = footer ? rel(footer, stop).top : (1080 - 32);
    if (rows) {
      var kids = Array.prototype.filter.call(rows.children, function (c) { return c.getBoundingClientRect().height > 0; });
      var gaps = [];
      for (var k = 0; k < kids.length - 1; k++) {
        gaps.push(rel(kids[k + 1], stop).top - rel(kids[k], stop).bottom);
      }
      rec.maxGap = gaps.length ? Math.max.apply(null, gaps) : 0;
      rec.rowCount = kids.length;
    }
    out.push(rec);
  });
  var pre = document.createElement('pre');
  pre.id = 'FITOUT';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
});
</script>`;
const html = body.replace("</body>", measurer + "\n</body>");

const tmp = resolve(repoRoot, "scripts", `.fit-${skillName}.html`);
await writeFile(tmp, html);

const { stdout } = await execFileP(BRAVE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--virtual-time-budget=4000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", \`file://\${tmp}\`,
], { maxBuffer: 64 * 1024 * 1024 });
await unlink(tmp).catch(() => {});

const m = stdout.match(/<pre id="FITOUT">([\\s\\S]*?)<\\/pre>/);
if (!m) { console.error("No FITOUT block — render or measure failed."); process.exit(1); }
const metrics = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));

let failures = 0;
console.log("slide                                  density     islandBot  footerTop  clip  maxGap  verdict");
for (const r of metrics) {
  const crash = r.islandBottom != null && r.islandBottom > r.footerTop + OVERFLOW_TOL;
  const clip = (r.islandClip ?? 0) > OVERFLOW_TOL;
  const stretched = (r.maxGap ?? 0) > GAP_MAX;
  const bad = crash || clip || stretched;
  if (bad) failures++;
  const why = [crash && "CRASH", clip && "OVERFLOW", stretched && "STRETCHED"].filter(Boolean).join(",") || "ok";
  console.log(
    \`\${(r.type + " #" + r.i).padEnd(38)} \${(r.density || "-").padEnd(11)} \` +
    \`\${String(Math.round(r.islandBottom ?? 0)).padStart(9)} \${String(Math.round(r.footerTop ?? 0)).padStart(10)} \` +
    \`\${String(Math.round(r.islandClip ?? 0)).padStart(5)} \${String(Math.round(r.maxGap ?? 0)).padStart(7)}  \${why}\`
  );
}
console.log(\`\\n\${metrics.length - failures}/\${metrics.length} slides pass.\`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Renderer taggt den Slide-Typ aufs Root (damit die Harness `data-slide-type` lesen kann)**

Prüfen, ob `renderSlide` den Typ schon als Attribut setzt. Falls nicht, additiv ergänzen in `engine/renderer.ts` analog zu `injectDensityAttr` — eine Funktion `injectTypeAttr(html, type)`, aufgerufen in `renderSlide` direkt nach der Density-Injektion:

```ts
function injectTypeAttr(html: string, type: string): string {
  return html.replace(/<section\b([^>]*)>/, (m, attrs) =>
    /\bdata-slide-type=/.test(attrs) ? m : `<section data-slide-type="${type}"${attrs}>`);
}
```

Und im `renderSlide`-Body nach der `injectDensityAttr`-Zeile:

```ts
html = injectTypeAttr(html, node.type);
```

- [ ] **Step 3: tsc bleibt grün**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Checkpoint** — `git add scripts/measure-fit.mts engine/renderer.ts && git commit -m "test: layout-fit measurement harness (island/footer/gap contract)"`

---

## Task 3: Baseline — Harness gegen die JETZIGEN Templates laufen lassen (Failing-Test)

**Files:** keine Änderung — nur Ausführung.

- [ ] **Step 1: Harness laufen lassen**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json`

Expected: **FAIL** (`process.exit(1)`). Konkret erwartet:
- `executive-summary`/`recommendation` sparse + balanced → `STRETCHED` (maxGap ≫ 80, weil `justify-content:space-evenly` die Gaps streckt).
- `comparison-table`/`heatmap` → entweder `STRETCHED` n/a (keine rows) aber sichtbar zentriert; mindestens kein sauberes Top-Alignment. Diese zwei haben noch kein `data-fit` → erscheinen als `ok` mit islandBottom=0. **Das ist erwartet** und wird in Task 6/7 behoben (Tags + Alignment).
- `intro-text` dense → potenziell `CRASH`/`OVERFLOW`.

Den genauen Baseline-Output notieren (welche Slides fehlschlagen), als Vorher-Beleg.

> Hinweis: Slides ohne `data-fit`-Tags melden island/rows = nicht vorhanden → die Harness kann sie noch nicht bewerten. Die Tags kommen in Task 4–8. Baseline zeigt deshalb v. a. die `space-evenly`-Streckung bei exec-summary/recommendation.

---

## Task 4: `executive-summary` auf die Island-Regel umbauen (Exemplar)

**Files:**
- Modify: `skills/mckinsey/components.html` (Template `slide-executive-summary`, aktuell Z. 83–97)
- Modify: `skills/mckinsey/components.html` (shared `<style>` im cover — neue `.mck-island`/`.mck-rows`-Regeln)

- [ ] **Step 1: Shared-Style um die Island-Regeln ergänzen**

Im `<style>`-Block des `slide-cover` (nach der `.slide .dir-table thead th`-Zeile) ergänzen:

```css
    /* Bounded Intrinsic Content Island — content sizes to itself, never stretches to fill */
    .mck-island { flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-start; }
    .slide[data-density="editorial"] .mck-island { justify-content:center; }
    .mck-rows { display:flex; flex-direction:column; gap:28px; }
    .slide[data-density="data-dense"] .mck-rows { gap:18px; }
```

- [ ] **Step 2: Template `slide-executive-summary` ersetzen**

Komplett ersetzen durch:

```html
<template id="slide-executive-summary">
<section class="slide" style="padding:var(--page-safe); display:flex; flex-direction:column; gap:26px;">
  <div class="mck-eyebrow">Executive summary</div>
  <h2 class="mck-action" style="max-width:1560px;">{{headline}}</h2>
  <hr style="border:0; border-top:2px solid #051C2C; margin:0;">
  <div data-fit="island" class="mck-island">
    <div data-fit="rows" class="mck-rows">
      <div style="display:grid; grid-template-columns:52px 1fr; gap:26px; align-items:baseline; padding-bottom:14px; border-bottom:1px solid var(--color-rule);"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">01</div><div style="font-size:21px; line-height:1.45;">{{claim-1}}</div></div>
      <div style="display:grid; grid-template-columns:52px 1fr; gap:26px; align-items:baseline; padding-bottom:14px; border-bottom:1px solid var(--color-rule);"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">02</div><div style="font-size:21px; line-height:1.45;">{{claim-2}}</div></div>
      <div style="display:grid; grid-template-columns:52px 1fr; gap:26px; align-items:baseline; padding-bottom:14px; border-bottom:1px solid var(--color-rule);"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">03</div><div style="font-size:21px; line-height:1.45;">{{claim-3}}</div></div>
      <div style="display:grid; grid-template-columns:52px 1fr; gap:26px; align-items:baseline; padding-bottom:14px; border-bottom:1px solid var(--color-rule);"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">04</div><div style="font-size:21px; line-height:1.45;">{{claim-4}}</div></div>
      <div style="display:grid; grid-template-columns:52px 1fr; gap:26px; align-items:baseline; padding-bottom:14px;"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">05</div><div style="font-size:21px; line-height:1.45;">{{claim-5}}</div></div>
    </div>
  </div>
  <div class="mck-foot" data-fit="footer"><span>{{source}}</span><span>{{page-no}} / {{page-total}}</span></div>
</section>
</template>
```

Schlüssel-Änderung vs. vorher: die `flex:1; justify-content:space-evenly`-Reihe ist weg. Die Reihen liegen in `.mck-rows` (fester Gap 28px), die Insel `.mck-island` (`flex:1; overflow:hidden`) positioniert die Reihengruppe (oben, bei editorial zentriert). Leere Claims (z. B. fehlendes `claim-5`) rendern als leere, niedrige Zeile — `data-dense` füllt alle fünf, `editorial` lässt 4/5 leer; die Harness zählt nur Reihen mit Höhe > 0.

- [ ] **Step 3: Harness laufen lassen**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json`
Expected: die drei `executive-summary`-Slides zeigen jetzt `ok` (maxGap ≈ 28–18, kein CRASH, kein OVERFLOW). Die noch nicht umgebauten Typen können weiter failen.

- [ ] **Step 4: Validator bleibt grün**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npm run validate`
Expected: mckinsey 15/15 Komponenten, 9/9 Skills grün.

- [ ] **Step 5: Checkpoint** — `git add skills/mckinsey/components.html && git commit -m "fix(mckinsey): executive-summary content-sized (island rule, no space-evenly)"`

---

## Task 5: `recommendation` auf die Island-Regel umbauen

**Files:**
- Modify: `skills/mckinsey/components.html` (Template `slide-recommendation`, aktuell Z. 225–236)

- [ ] **Step 1: Template `slide-recommendation` ersetzen**

```html
<template id="slide-recommendation">
<section class="slide" style="padding:var(--page-safe); display:flex; flex-direction:column; gap:26px;">
  <h2 class="mck-action" style="max-width:1680px;">{{action-title}}</h2>
  <hr style="border:0; border-top:2px solid #051C2C; margin:0;">
  <div data-fit="island" class="mck-island">
    <div data-fit="rows" class="mck-rows">
      <div style="display:grid; grid-template-columns:56px 1fr 260px 220px; gap:24px; align-items:baseline; padding-bottom:16px; border-bottom:1px solid var(--color-rule);"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">01</div><div style="font-size:22px; line-height:1.4;">{{rec-1}}</div><div style="font-family:var(--font-body); font-size:15px; color:var(--color-muted);">{{rec-1-impact}}</div><div style="font-family:var(--font-data); font-size:14px; color:var(--color-signal);">{{rec-1-timing}}</div></div>
      <div style="display:grid; grid-template-columns:56px 1fr 260px 220px; gap:24px; align-items:baseline; padding-bottom:16px; border-bottom:1px solid var(--color-rule);"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">02</div><div style="font-size:22px; line-height:1.4;">{{rec-2}}</div><div style="font-family:var(--font-body); font-size:15px; color:var(--color-muted);">{{rec-2-impact}}</div><div style="font-family:var(--font-data); font-size:14px; color:var(--color-signal);">{{rec-2-timing}}</div></div>
      <div style="display:grid; grid-template-columns:56px 1fr 260px 220px; gap:24px; align-items:baseline; padding-bottom:16px;"><div style="font-family:var(--font-data); color:var(--color-signal); font-weight:700; font-size:18px;">03</div><div style="font-size:22px; line-height:1.4;">{{rec-3}}</div><div style="font-family:var(--font-body); font-size:15px; color:var(--color-muted);">{{rec-3-impact}}</div><div style="font-family:var(--font-data); font-size:14px; color:var(--color-signal);">{{rec-3-timing}}</div></div>
    </div>
  </div>
  <div class="mck-foot" data-fit="footer"><span>{{source}}</span><span>{{page-no}} / {{page-total}}</span></div>
</section>
</template>
```

- [ ] **Step 2: Harness laufen lassen**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json`
Expected: die drei `recommendation`-Slides jetzt `ok` (maxGap ≈ 28/18, kein CRASH).

- [ ] **Step 3: Checkpoint** — `git add skills/mckinsey/components.html && git commit -m "fix(mckinsey): recommendation content-sized (island rule)"`

---

## Task 6: `comparison-table` auf die Island-Regel umbauen

**Files:**
- Modify: `skills/mckinsey/components.html` (Template `slide-comparison-table`, aktuell Z. 213–223)

- [ ] **Step 1: Template `slide-comparison-table` ersetzen**

Der `flex:1; align-items:center`-Wrapper (zentriert die Tabelle in einem hohen Feld → Dead-Space) wird durch die top-anchored Insel ersetzt.

```html
<template id="slide-comparison-table">
<section class="slide" style="padding:var(--page-safe); display:flex; flex-direction:column; gap:22px;">
  <h2 class="mck-action" style="max-width:1680px;">{{action-title}}</h2>
  <div><div class="mck-cap">{{exhibit-caption}}</div></div>
  <div data-fit="island" class="mck-island" style="display:block;">
    {{@table rows=row-headers cols=col-headers cells=cells}}
  </div>
  <div style="display:flex; gap:14px; align-items:baseline;"><div class="mck-eyebrow">So what</div><div class="mck-insight" style="font-size:18px;">{{insight}}</div></div>
  <div class="mck-foot" data-fit="footer"><span>Source: {{source}}&nbsp;&nbsp;{{footnote}}</span><span>{{page-no}} / {{page-total}}</span></div>
</section>
</template>
```

Hinweis: `.mck-island` ist hier `display:block` (statt flex), die Tabelle sitzt oben in der Insel; bei `data-density="editorial"` greift die `justify-content:center`-Regel nicht (kein flex) — gewollt, eine kleine Tabelle soll oben unter dem Caption sitzen, nicht in der Mitte schweben. Insel `overflow:hidden` clippt zu große Tabellen vor dem „So what".

- [ ] **Step 2: Harness laufen lassen**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json`
Expected: `comparison-table`-Slides `ok` (kein CRASH, islandBottom < footerTop, kein OVERFLOW bei den drei Fixture-Größen).

- [ ] **Step 3: Visuelle Kontrolle** — Slide rendern und ansehen (Task 10-Pipeline), Tabelle muss oben unter dem Caption sitzen, „So what" direkt darunter, nicht in der Mitte schwebend.

- [ ] **Step 4: Checkpoint** — `git add skills/mckinsey/components.html && git commit -m "fix(mckinsey): comparison-table top-anchored (island rule, no center float)"`

---

## Task 7: `heatmap` auf die Island-Regel umbauen

**Files:**
- Modify: `skills/mckinsey/components.html` (Template `slide-heatmap`, aktuell Z. 194–211)

- [ ] **Step 1: Den Grid-Wrapper umstellen**

Den `flex:1; align-items:center`-Wrapper (Z. 205–207) ersetzen. Das Template komplett ersetzen durch:

```html
<template id="slide-heatmap">
<section class="slide" style="background:#051C2C; color:#FFFFFF; padding:var(--page-safe); display:flex; flex-direction:column; gap:18px;">
  <h2 class="mck-action mck-action-dark" style="max-width:1680px;">{{action-title}}</h2>
  <div style="display:flex; justify-content:space-between; align-items:baseline;">
    <div><div class="mck-cap" style="color:#6FA8DC;">{{exhibit-caption}}</div><div class="mck-charttitle mck-action-dark" style="margin-top:6px;">{{chart-title}}</div></div>
    <div style="display:flex; align-items:center; gap:12px; font-family:var(--font-body); font-size:13px; color:rgba(244,247,250,0.7);">
      <span>{{low-label}}</span>
      <span style="width:180px; height:12px; background:linear-gradient(to right,#EEF2F5,#2B6CB0); display:inline-block;"></span>
      <span>{{high-label}}</span>
    </div>
  </div>
  <div data-fit="island" class="mck-island" style="display:block;">
    {{@chart type=heatmap rows=row-headers cols=col-headers cells=cells max=scale-max low=#EEF2F5 high=#2B6CB0 ink=#FFFFFF cellHeight=56}}
  </div>
  <div style="font-family:var(--font-body); font-size:16px; line-height:1.45; color:rgba(244,247,250,0.82); max-width:1400px;">{{insight}}</div>
  <div class="mck-foot mck-foot-dark" data-fit="footer"><span>Source: {{source}}&nbsp;&nbsp;{{footnote}}</span><span>{{page-no}} / {{page-total}}</span></div>
</section>
</template>
```

- [ ] **Step 2: Harness laufen lassen**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json`
Expected: `heatmap`-Slides `ok`. Falls die 6×6-`data-dense`-Matrix bei `cellHeight=56` OVERFLOW meldet → das ist ein echter Budget-Befund (gehört nach Phase 2: cellHeight als Funktion der Zeilenzahl). Für Phase 1 dann die `data-dense`-Heatmap-Fixture auf eine Größe reduzieren, die bei 56px passt, und den Befund im Plan-Status notieren (kein Type-Shrinking).

- [ ] **Step 3: Checkpoint** — `git add skills/mckinsey/components.html && git commit -m "fix(mckinsey): heatmap top-anchored (island rule)"`

---

## Task 8: `intro-text` auf bounded columns umstellen

**Files:**
- Modify: `skills/mckinsey/components.html` (Template `slide-intro-text`, aktuell Z. 46–64, und `.mck-cols2`-Regel Z. 20)

- [ ] **Step 1: `.mck-cols2`-Regel im Shared-Style anpassen**

Die `height:100%`-Spalten sind die Overflow-Ursache. Im cover-`<style>` die Regel ersetzen:

```css
    .mck-cols2 { column-count:2; column-gap:48px; column-fill:balance; height:100%; overflow:hidden; }
```

(`column-fill:balance` statt `auto` verteilt gleichmäßig auf beide Spalten; `overflow:hidden` auf dem bounded Container clippt einen echten Überlauf vor dem Footer, statt durchzulaufen.)

- [ ] **Step 2: Template `slide-intro-text` ersetzen** — die Inhalts-Grid-Zeile in eine Insel wrappen

```html
<template id="slide-intro-text">
<section class="slide" style="background:#051C2C; color:rgba(244,247,250,0.86); padding:var(--page-safe); display:flex; flex-direction:column; gap:26px;">
  <div>
    <h2 class="mck-action mck-action-dark" style="font-size:42px; max-width:1500px;">{{title}}</h2>
    <div style="font-family:var(--font-body); font-size:15px; color:#6FA8DC; margin-top:10px;">{{byline}}</div>
  </div>
  <hr style="border:0; border-top:1px solid rgba(255,255,255,0.24); margin:0;">
  <div data-fit="island" class="mck-island" style="display:grid; grid-template-columns:2.05fr 0.95fr; gap:56px; align-items:stretch;">
    <div class="mck-cols2" style="font-family:var(--font-body); font-size:18px; line-height:1.62; color:rgba(244,247,250,0.84);">
      {{@list slot=body sep=¶}}
    </div>
    <div class="mck-sidebar" style="background:rgba(255,255,255,0.06); padding:30px 32px; align-self:stretch;">
      <div style="font-family:var(--font-body); font-weight:600; font-size:19px; color:#FFFFFF; margin-bottom:16px;">{{sidebar-title}}</div>
      <div style="font-family:var(--font-body); font-size:15.5px; line-height:1.6; color:rgba(244,247,250,0.76);">{{@list slot=sidebar-body sep=¶}}</div>
    </div>
  </div>
  <div class="mck-foot mck-foot-dark" data-fit="footer"><span>{{source}}</span><span>{{page-no}} / {{page-total}}</span></div>
</section>
</template>
```

Die Insel ist hier das Grid selbst (`display:grid` überschreibt die Flex-Defaults der `.mck-island`-Klasse via Inline-Style), bekommt aber `flex:1; min-height:0; overflow:hidden` aus der Klasse → bounded. Editorial (`editorial`-Fixture: ein kurzer Absatz) sieht ruhig aus; `data-dense` füllt beide Spalten.

- [ ] **Step 3: Harness laufen lassen**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json`
Expected: **0 Failures, 15/15 pass.** Falls `intro-text` data-dense OVERFLOW → Wortmenge der Fixture ist über dem Phase-1-Budget; auf eine passende Menge kürzen und den Wortbudget-Befund für Phase 2 notieren.

- [ ] **Step 4: Checkpoint** — `git add skills/mckinsey/components.html && git commit -m "fix(mckinsey): intro-text bounded columns (no height:100% overflow)"`

---

## Task 9: Font-Bug — Serif-Headlines im Headless-Render verifizieren und fixen

**Files:**
- Untersuchen: `skills/mckinsey/tokens.json` (webFonts), `engine/token-compiler.ts` (Font-Face/Link-Ausgabe), `engine/renderer.ts` (renderDeckShell head)

- [ ] **Step 1: Reproduzieren** — eine `executive-summary`-Slide rendern und prüfen, ob die Headline Lora oder Times ist.

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && npx tsx scripts/measure-fit.mts mckinsey scripts/fixtures/mckinsey-fit.json` zuerst grün; dann eine Single-Slide-PNG via Task-10-Pipeline rendern und die Headline-Glyphen ansehen (Lora hat markante Serifen-Übergänge; Times ist der Browser-Default-Fallback).

- [ ] **Step 2: Ursache bestimmen** — im `renderDeckShell`-Head prüfen, ob die Google-Fonts-`<link>`/`@import` für Lora vorhanden ist UND ob Brave headless externe Fonts lädt (Netzwerk im Headless-Modus kann blockiert sein). Wenn der Font per Netzwerk kommt und Headless ihn nicht zieht → Times-Fallback.

- [ ] **Step 3: Fix** — Fonts deterministisch verfügbar machen. Bevorzugt: im Render-Harness `--virtual-time-budget` hoch genug (schon 4000) UND sicherstellen, dass der Webfont-Link im `<head>` steht (nicht erst per JS). Falls Netzwerk im Headless unzuverlässig: Lora + Inter Tight als base64-`@font-face` in den Shell-Head einbetten (nur im Render-Pfad, additiv — kein `baseSlideCss`-Edit; Einbettung gehört in `renderDeckShell` oder den Skill-Head). Konkret: `woff2` der benötigten Schnitte (Lora 600/700, Inter Tight 500/600/700) laden, als data-URI in einem `<style>@font-face{…}</style>` im Shell-Head.

- [ ] **Step 4: Verifizieren** — Slide neu rendern, Headline ist jetzt Lora (nicht Times). Mit `~/Downloads/mckinsey-style.md` / Referenz-PDF gegenprüfen, dass der Serif-Charakter zur Referenz passt.

- [ ] **Step 5: Checkpoint** — `git add -A && git commit -m "fix(mckinsey): embed serif/sans webfonts so headless render uses Lora not Times"`

---

## Task 10: Repertoire-Deck neu rendern + visuelle Endkontrolle

**Files:**
- Re-render: `scripts/mckinsey-deck.json` → PDF via `scripts/mckinsey-to-pdf.py`

- [ ] **Step 1: Voll-Deck rendern**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && FAL_KEY=$FAL_KEY npx tsx scripts/render-fal-runtime.mts mckinsey mckinsey-deck.json`
Expected: `mckinsey-fal-deck.html` geschrieben, Cover-Hero via FAL (1 Bild).

- [ ] **Step 2: PDF bauen**

Run: `cd /Users/dominikmartin/Documents/claude/slidespeak/slidespeak-hue && python3 scripts/mckinsey-to-pdf.py`
Expected: `~/Desktop/SlideSpeak-Design-Directions/McKinsey-Density.pdf` (13pp) + Einzel-PNGs.

- [ ] **Step 3: Jede der 13 Slides einzeln ansehen** (der Fehler von zuvor: nicht jeden Slide geprüft). Prüfen gegen die Akzeptanzkriterien der Spec:
  - sparse: ruhige, gesizte Komposition, keine gestreckten Gaps, nichts „verloren".
  - dense: kein Überlauf in den Footer, keine Kollision.
  - Headlines max. eine Zeile (zu lange Headlines = Phase-2-Budget, hier nur notieren).
  - Type überall lesbar.

- [ ] **Step 4: Status in der Spec/Brief nachführen** — `docs/DESIGN-VARIANCE-BRIEF.md` M2-Abschnitt auf „Layout-Fit Phase 1 done" aktualisieren, mit Verweis auf `docs/specs/2026-06-04-layout-fit-model.md` und `docs/plans/2026-06-04-layout-fit-phase1.md`. Offene Phase-2-Befunde (Headline-Budget, heatmap cellHeight, intro-text Wortbudget) als Liste festhalten.

- [ ] **Step 5: Checkpoint** — `git add -A && git commit -m "chore: re-render mckinsey repertoire after layout-fit phase 1"`

---

## Self-Review (gegen die Spec)

- **Schicht 2 (inhaltsgroße Templates)** → Tasks 4–8 (alle fünf Templates + Island-CSS). ✓
- **Bounded Intrinsic Content Island Regel** → Task 4 Step 1 (CSS) + jede Template-Task. ✓
- **Density-Register (editorial vs data-dense bei gleichem Inhalt)** → Task 4 Step 1 (`[data-density]`-Regeln für `.mck-island`/`.mck-rows`). ✓
- **Akzeptanzkriterium „sparse nicht gestreckt"** → Harness `STRETCHED`-Check (Task 2) + Fixtures sparse (Task 1). ✓
- **Akzeptanzkriterium „dense crasht nicht"** → Harness `CRASH`/`OVERFLOW`-Check + Fixtures dense. ✓
- **Akzeptanzkriterium „jeder Slide einzeln geprüft"** → Task 10 Step 3. ✓
- **Begleit-Defekt Font-Bug** → Task 9. ✓
- **Begleit-Defekt Uppercase-Achsenlabels** → NICHT in Phase 1 (shared-Renderer, global; eigener Task in einem späteren Plan). Bewusst ausgelassen.
- **Non-Goal „kein Font-Scaling"** → keine Task verkleinert Type; Overflow → notieren/Phase 2, nie shrink. ✓
- **Shared-Layer additiv-only** → keine Task ändert `baseSlideCss`/`tokensToCss`; `renderer.ts`-Änderung (Task 2 Step 2) ist additiv (`injectTypeAttr`). ✓

Out of scope für Phase 1 (eigene Pläne): Layout-Contracts/Budgets im Validator (Phase 2), content-first Arbitration (Phase 3), Headless-Fit-Check in CI als Gate + Golden-Fixtures formalisiert (Phase 4 — diese Harness ist der Prototyp dafür), Generalisierung auf polaris (Phase 5).
```