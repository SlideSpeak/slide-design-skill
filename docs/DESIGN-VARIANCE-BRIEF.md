# Design Variance Brief — von "AI-designed" zu "designed"

Status: Draft v1 · 2026-06-04 · Autor: Dominik (+ Claude)
Auslöser: Client-Feedback Germán / Kevin / Niels (Slack, 03.06.)

---

## 1. Das Feedback (verdichtet)

- **Kevin**: "Mehr Design-Varianz erwartet. Designs sehen alle etwas AI-designed und gleich aus. Hängt mit den Layouts und den Text-Elementen zusammen. Templates, die alle anders aussehen und einen anderen Stil haben — und wie viel Text verwendet wird." Sein McKinsey-Versuch mit Grafiken/Icons sah deutlich besser aus.
- **Germán**: Die Polaris-Slide ("The makers who chose to stay small") ist der Durchbruch — Bild und Font teilen sich kohärent dieselbe Fläche. Generic-Content (McKinsey-Deck) kann das System schon. Nächste Iteration soll auf Decks zielen, die **stark auf curated assets setzen (SVGs, distinctive shapes, image overlays)**. Diese Slide ist der Startpunkt.
- **Dominik**: Content-Density ist eine eigene, bisher ignorierte Dimension. Manche Präsis sind text-/grafiklastig, manche minimalistisch/begleitend. Wir müssen herausfinden, wie viel/wenig Text, wie viele Bilder, welche Art Grafiken (Hintergrund, Personenfotos) — evtl. via Intake/Co-Generation mit dem User statt eines 10k-Zeichen-Prompts.

**Ein Root Cause, drei Blickwinkel.**

---

## 2. Diagnose (Ground Truth aus der Engine)

Eine Skill variiert heute nur **eine** Achse — Tokens. Zwei varianz-erzeugende Achsen sind global eingefroren, eine fehlt ganz.

| Achse | Datei | Status | Konsequenz |
|---|---|---|---|
| Design-Language | `tokens.json` / `token-compiler.ts` | variiert ✓ | "gleiches Deck in anderen Farben" |
| Layout-Grammar | `components.html` + `renderer.ts` | **eingefroren** | identische 8 Slide-Typen in fixer Reihenfolge; `feature` immer 2-Spalten; nur binär *bleed* vs *content-box* |
| Content-Density | — | **existiert nicht** | 30–50 Wörter Body hardcoded in jeder `SKILL.md`; 1 Chart / 1 Mockup pro Typ, unabhängig vom Präsi-Typ |

### Belege

- **Shared Skeleton** (`token-compiler.ts:46–151`): Jede Slide erbt identisch `width/height` 1920×1080, `padding: var(--page-safe)` = **96px überall**, Spacing-Scale `[4,8,12,16,24,32,48,64,96]` hardcoded, `<div class="slide-flow"><div class="flow-grow">` auf jeder Content-Slide.
- **Fixe Slide-Sequenz**: Alle Skills definieren exakt `cover → status-quo → the-shift → product-intro → feature → customer-proof → pricing → cta`. Keine Variation in Anzahl oder Reihenfolge.
- **Fixe Feature-Komposition**: `feature` ist immer ein 2-Spalten-Grid (Mockup links, Body rechts). Kein 1-/3-Spalten, kein asymmetrisches edge-to-edge, kein Overlap.
- **Text und Bild teilen sich keine Fläche** (`renderer.ts:67–98`): Bild ist immer ein separater `<img object-fit:cover>`-Slot *neben* dem Text. **Editorial-Komposition (Type *im* Bild) ist aktuell nicht baubar.**
- **Density hardcoded**: z.B. `apple-headspace/SKILL.md:63–68` und `atelier/SKILL.md:61–66` schreiben "30–50 words body" als Prinzip fest. Kein Knopf, keine Variation pro Slide.
- **Intake nur Visual Style** (`style-intake.ts`): `resolveStyleInput` erfasst ausschließlich visuelle Richtung / Referenz / Audience. Kein Density-, Präsi-Typ- oder Asset-Appetit-Input.

### Warum Polaris raussticht
Sie ist eine **Bleed-Slide**: Vollbild-Bild + Headline darüber + Ecken-Metadata — die einzige Layout-Variante, die aus dem Box-Skelett ausbricht. Aber **nur die Cover-Slide** bekommt diese Behandlung; ab Slide 2 fällt alles in die 2-Spalten-Box → Varianz stirbt nach Slide 1.

---

## 3. Ziel & Erfolgskriterien

Decks, die ein Mensch nicht sofort als "AI-generiert" erkennt. Konkret:

1. **Zwei Decks derselben Skill** unterscheiden sich in Layout-Rhythmus, nicht nur Inhalt.
2. **Zwei Decks verschiedener Skills** fühlen sich wie unterschiedliche Design-Sprachen an (nicht nur andere Farben).
3. **Innerhalb eines Decks** variiert die Density: dichte Daten-Slides neben atmenden Editorial-Slides.
4. **Editorial/asset-heavy ist reproduzierbar** (Polaris-Stil über das ganze Deck, nicht nur Cover) — Germáns expliziter Wunsch.

---

## 4. Drei Workstreams

### WS-1 — Content-Density als echte Achse
**Problem**: Density ist Prosa-Prinzip in der SKILL.md, kein Parameter.
**Änderung**: `density`-Dimension einführen, **pro Slide** gesetzt (nicht pro Deck — Dominiks Kernpunkt: Density variiert *innerhalb* eines Decks).
- Taxonomie-Vorschlag: `editorial` (1 Headline, ≤1 Zeile, Bild trägt 80%) · `balanced` (Headline + 30–50 W + 1 Element) · `data-dense` (mehrere Textblöcke, Chart/Tabelle, kleine Type).
- Steuert: Wörter/Slide, Chart-Komplexität, Whitespace-Budget, Anzahl Elemente.
- **Files**: neues `density`-Konzept in `prompt-composer.ts` (LLM-Instruktion pro Slide), `renderer.ts` (Whitespace/Slot-Caps), Density-Rule aus den SKILL.md herausziehen → Parameter.
- **Output**: derselbe Inhalt in 3 Density-Stufen rendern als Beleg.

### WS-2 — Layout-Grammar entriegeln + Editorial-Primitive
**Problem**: Fixe 8 Typen, fixe 2-Spalten-Feature, kein Text-auf-Bild.
**Änderung**:
- Slide-Typen-Sequenz aufbrechen: variable Anzahl/Reihenfolge je nach Inhalt.
- `feature` von der 2-Spalten-Zwangsjacke befreien (1-/3-Spalten, asymmetrisch erlauben).
- **Text-auf-Bild als Kompositions-Primitive** in den Renderer — direkte Antwort auf Germán. Bild als Layer *unter* Type, mit Overlay-Scrim/Gradient für Lesbarkeit, getrackte Ecken-Metadata als Editorial-Signatur.
- **Files**: `renderer.ts` (Overlay-/Layer-Komposition statt strikt separater img-Slot), `components.html`-Templates pro Skill (neue Layout-Archetypen).
- **Output**: Polaris-Stil reproduzierbar über *alle* Slide-Typen, nicht nur Cover.

### WS-3 — Intake → Co-Generation (statt Fragebogen)
**Problem**: `resolveStyleInput` fragt nur Visual Style; nicht jeder User bringt einen 10k-Prompt.
**Änderung**: Kurzes Intake → System generiert **annotierten Outline** (pro Slide: Density-Level + Asset-Typ Foto/SVG/Chart/keins) → User justiert *am Outline* → dann Render.
- Die "wie viel Text / welche Bilder"-Entscheidung gehört in die **Outline-Stage**, nicht ins Template.
- Intake erweitern um: Präsi-Typ (Pitch / Report / Editorial / Teaching / Keynote), Asset-Appetit (Personenfotos? abstraktes SVG? Daten-Viz? Vollbild?), Tonalität.
- **Files**: `style-intake.ts` (neue Felder), neuer Outline-Generierungs-Step, Outline→Render-Bridge.
- **Output**: ein End-to-End-Lauf "kurzer Prompt → Outline mit Density/Asset-Annotation → Deck".

---

## 5. Sequenzierung

Germán hat den nächsten sichtbaren Deliverable benannt: asset-heavy/editorial Decks mit Polaris als North Star. Das überschneidet sich mit WS-2.

| Milestone | Inhalt | Liefert |
|---|---|---|
| **M1** | Editorial-Primitive (WS-2 Kern: Text-auf-Bild + Overlay) + 1 Editorial-Deck | Beleg für Germán, dass die Richtung trägt |
| **M2** | Density-Achse (WS-1) | dichtes vs. minimales Deck aus demselben Inhalt |
| **M3** | Layout-Sequenz entriegeln (WS-2 Rest) + 2–3 stilistisch klar verschiedene Decks | Antwort auf Kevin |
| **M4** | Intake → Co-Generation (WS-3) | das Produkt, nicht nur die Demos |

Begründung: ein konkretes Editorial-Deck (M1) zwingt uns, die Layout-Primitive ohnehin zu bauen, und liefert sofort Vorzeigbares.

### M1 — DONE (2026-06-04)
- **Editorial-Primitive**: `{{@scrim}}` Directive im Renderer (`engine/renderer.ts`) — additiv, reusable Legibility-Overlay (variants bottom/top/left/right/bottom-left/radial/full, color+opacity). Kein Shared-CSS-Edit. Auch im Validator-Regex ergänzt.
- **Skill**: `skills/polaris/` — Editorial-Essay, Newsreader Serif (italic auf cover/statement), photographische Dark-Atmosphere, 7 Slide-Typen, **jede Slide ein Full-Bleed-Spread** (cover/chapter/passage/statement/figure/portrait/colophon), kein Box-Fallback. Validator 9/9 grün.
- **Deck**: `scripts/polaris-deck.json` — "The makers who chose to stay small" (Polaris Issue 04), 8 Slides, Hybrid-Bilder via FAL (`render-fal-runtime.mts`, ~$0.20). Text teilt sich durchgängig die Bildfläche.
- **Export**: `~/Desktop/SlideSpeak-Design-Directions/Polaris-Editorial.pdf` (8pp) + Einzel-PNGs in `polaris-slides/`. Pipeline `scripts/polaris-to-pdf.py` (Brave 2x Screenshot → crop → img2pdf, behält Scrims/Gradients).
- **Verifiziert**: visuell gegen Polaris-Referenz — Cover trifft sie genau; jede Slide ein eigenes Layout (Kevins "verschiedene Layouts"); Type+Bild kohärent (Germáns "image and font sharing the same space").
- **Bekannter Noise** (out of scope M1): `flagModelGeneratedClaims` scannt auch die base64-bg-image-Slots → falsche "figure not in request"-Warnings. Harmlos, später: bg-image-Slots vom Fidelity-Scan ausnehmen.

**Nächster Schritt**: ~~M1-PDF als Zwischenstand~~ — verworfen (2026-06-04, Dom: kein Zwischenstand an den Client). Direkt weiter mit M2.

### M2 — DONE (2026-06-04)

**Korrigiertes Kernmodell (Dom 2026-06-04):** Die McKinsey-Referenz ist NICHT die universelle Definition von "gut", sondern die client-endorste Definition für **einen Präsentations-Typ** (Consulting / data-dense). Zwei orthogonale Achsen:
- **Präsentations-Typ** → je ein Skill mit eigener Design-Sprache (mckinsey, polaris, …).
- **Density** → typ-agnostischer Modifier, pro Slide gesetzt, variiert innerhalb des Decks.

**Zweite Korrektur (Dom 2026-06-04, nach erstem M2-Versuch):** Der erste M2-Wurf war scheiße — Density als **Font-Scaling** (`--d-scale` schrumpft Schrift, um mehr reinzuquetschen) erzeugte winzige Text-Wände (Slide 2/3). Außerdem war der Proof ein **gefaktes** Consulting-Deck mit erfundenen Zahlen. Beides verworfen.

**Korrigiertes Density-Modell:**
- Density ist eine **Layout-Wahl, nie ein Scale-Knopf.** Schrift bleibt IMMER lesbar (~16-21px). Mehr Inhalt → reicheres Layout (Spalten, Stat-Grid, Matrix, Small-Multiples) oder mehr Slides, NIE kleinere Type.
- "Viel Inhalt, gut" = ein **Repertoire gut designter Layouts**, jedes für sich lesbar und schön.
- Proof faked keinen Input → ein **Layout-Repertoire** mit ehrlichem Sample-Inhalt (Northwind, alles als illustrativ markiert), jedes Slide ein benanntes Layout.

- **Engine (additiv):**
  - `engine/density.ts` — 3 Tiers `editorial/balanced/data-dense` als **Layout-Semantik** (intent + welches Layout passt + exhibits), KEIN Font-Scaling mehr. `normalizeDensity()`, `densityPromptBlock()` (= "wähle das Layout, schrumpf nie die Type").
  - `types.ts` — `density?: DensityTier` (additiv). `renderer.ts` — `data-density` aufs Slide-Root (Template gewinnt), `page-no`/`page-total` Slots, `heatmap` Chart-Typ, `navy`/`azure` Presets. `index.ts` — Slide-Index/Total → Footer. `prompt-composer.ts` — DENSITY-Block. `validate-skill.ts` — page-no/page-total exempt. **Kein `densityCss()` mehr** (Font-Scaling raus).
- **`mckinsey` v0.2.0:** navy + EIN Consulting-Blau (#2B6CB0), kein Orange, Lora + Inter Tight. **15 Slide-Types, alle fixe lesbare Größen.** Neue/gefixte Dense-Layouts: `intro-text` (lesbares 2-Spalten + Sidebar, füllt via column-fill:auto), `stat-grid` (6 Headline-Zahlen 3×2), `small-multiples` (3 Mini-Charts), plus `split-exhibit`, `heatmap`, `comparison-table` (Header sentence-case via Skill-Override), `chart-*`, `recommendation`, weißes Serif-`cover`, Dark-`divider`/`closing`. Eyebrows/Captions/Table-Header **sentence-case** (Dom's Hard-Rule).
- **Proof:** `scripts/mckinsey-deck.json` — Layout-Repertoire, 13 Slides, jedes ein benanntes Layout, Sample-Inhalt (Northwind, "Illustrative"). Cover-Hero via FAL (1 Bild).
- **Export:** `~/Desktop/SlideSpeak-Design-Directions/McKinsey-Density.pdf` (13pp). Pipeline `scripts/mckinsey-to-pdf.py` (Brave scale-1, N aus Deck, 1080-Pitch via margin/shadow-Override; scale-2 blankt jenseits ~18k device-px).
- **Verifiziert:** jedes Slide einzeln gegen-gecheckt — keine winzige Type, lesbar, gefüllt.
- **Offen:** Chart-Achsenlabels (`dots-2x2`/`radar`) sind im SHARED Renderer per JS uppercase → nur global änderbar (betrifft alle Skills), an Dom geflaggt.
- **Referenz-Quellen:** `~/Downloads/mckinsey-style.md` + `~/Downloads/mckinsey-tech-trends-outlook-2022-full-report.pdf`.

### M2 REDO — Layout-Fit (2026-06-04)

Der erste M2-Wurf sah trotz "Density = Layout-Wahl" weiter schlecht aus (Slides 2/4/10/12: floatend/leer/Footer-Crash). Statt weiter Symptome zu fixen: Metaebene + Codex-Abstimmung → **Spec** `docs/specs/2026-06-04-layout-fit-model.md` (Status Decided) + **Plan** `docs/plans/2026-06-04-layout-fit-phase1.md`.

**Wurzel:** Das Layout kannte die Inhaltsmenge nicht — `justify-content:space-evenly`/`align-items:center` auf `flex:1` (Underflow → floatend) und `column-fill:auto;height:100%` (Overflow → Footer-Crash). **Fix-Regel (Codex):** *Bounded Intrinsic Content Island* — Inhalt in `[data-fit="island"]` (`flex:1;min-height:0;overflow:hidden`), Zeilen mit festem Gap, nie gestreckt; Inhalt vertikal als ausbalanciertes Band zentriert.

**Phase 1 DONE (mckinsey, visuell verifiziert je Slide):**
- Engine additiv: `injectTypeAttr` (`data-slide-type` aufs Root, für QA).
- 5 Templates umgebaut: `executive-summary` (jetzt `@list slot=claims` → variable Zeilen, keine leeren Slots; **editorial = volle-Breite-Pillars**, balanced/dense = zentrierte Nummern-Liste), `recommendation`, `comparison-table`, `heatmap` (Matrix zentriert, korrekte Separatoren `|`/`||`/`/`), `intro-text` (editorial = einspaltiger Lead ohne Sidebar; dense = 2-Spalten + content-höhe Sidebar, zentriert).
- **Density = Layout-Register** (editorial/dense erzeugen *andere* Layouts), nie Font-Scaling. Größer-bei-weniger erlaubt, Schrumpfen-zum-Quetschen verboten.
- **QA-Harness** `scripts/measure-fit.mts` (Brave dump-dom misst Insel/Footer/Gap → CRASH/OVERFLOW/STRETCHED) + Fixtures `scripts/fixtures/mckinsey-fit.json` (5 Typen × 3 Density). 16/16 grün. **Lesson:** Harness notwendig aber nicht hinreichend — visuelles Review fand echte Bugs (falsche Fixture-Separatoren, sparse-Floating), die die Harness nicht sah.
- Grammar: `executive-summary` required slots → `headline`, `claims`. `mckinsey-deck.json` exec-summary auf `claims` migriert. Export `McKinsey-Density.pdf` (13pp) neu.
- Font: Lora lädt im PDF-Pfad korrekt (kein Times-Fallback mehr beobachtet); falls Race wiederkehrt → Webfont-Embedding.

**Phase 2–5 offen** (eigene Pläne): Layout-Contracts + statischer Budget-Validator, content-first Arbitration, Fit-Check als CI-Gate + Golden-Fixtures, Generalisierung auf polaris/generierte Skills. Plus offen: uppercase Chart-Achsenlabels (shared).

### Szenario-Tests (2026-06-04) — „ich bin der LLM"

Statt echtem LLM-Client: Claude autorisiert als LLM realistische Briefs → rendern → visuell prüfen. Dateien: `scripts/scenarios/scenario-{1,2,3}.{json,html}` + `_scenario-*-contact.png`. Render via `render-fixture.mts`, Screenshot via `scripts/scenarios/_shoot.py <name>`.

- **Szenario 1 (realistischer Consulting-Brief, mckinsey):** ✅ kohärenter Board-Deck, variierende Density, on-brand.
- **Szenario 2 (Overflow-Stress, mckinsey: 7 Claims, 6×5 Tabelle, 8×4 Heatmap, volle Prosa):** ✅ hält. **Bug gefunden+gefixt:** 8-Zeilen-Heatmap clippte die letzte Zeile lautlos → `renderHeatmap` nutzt jetzt `grid-template-rows: auto repeat(N, minmax(0,1fr))` + `height:100%`, Zellen `min-height` statt fix; Template cellHeight 92→44 (Floor). Passt bei jeder Zeilenzahl.
- **Szenario 3 (Product-Pitch, `pitch`-Skill):** ❌ zeigt die Generalisierungs-Lücke — leere Image-Boxen (teils weil Render ohne Image-Resolver), floatende sparse-Slides, UPPERCASE-Labels, runde Ecken. Die 8 Nicht-mckinsey-Skills haben das alte Problem noch.

**Empfehlung (offen, Dom entscheidet):** Layout-Fit + Quality-Pass auf die anderen Skills ausrollen + Island/Register-Prinzip als geteilte Guidance codieren (gegen per-Skill-Drift). Kleinfunde: Chart-Zahlen droppen Null (€6,1 statt €6,10); pitch uppercase Labels.

### Rollout auf alle Skills (2026-06-04) — abgeschlossen

Triage aller 9 Skills via repräsentativem Render + Contact-Sheet (`scripts/scenarios/tri-<skill>.{json,html}`, `_tri-<skill>-contact.png`). Ergebnis: **polaris + quarto bereits gut** (full-bleed Bakes/Viz, füllen die Fläche → unangetastet). Sechs Skills mit dem **gemeinsamen Root-Cause „vertikales Floating"** (Content top-aligned, Void unten) gefixt — alle visuell je Slide verifiziert, nicht nur per Subagent-Report:

| Skill | Fix |
|---|---|
| **pitch** (selbst) | 7 Templates: leere Placeholder-Cards (solution „Product hero", traction „Chart", why-now „Trend line") raus → contentful Bänder; business-model/gtm/team/traction Bänder vertikal zentriert; team ohne leere Avatar-Kreise (text-forward); **Competition-Quadrant** komplett neu als sauberes 2×2-Positioning (us in top-right, Achsen-Labels) |
| **training** | 5 Templates band-zentriert (agenda/objectives/demonstration/debrief/resources) |
| **academic** | method (leere „Diagram"-Card raus, 5-Step-Band zentriert) + conclusion zentriert; dense/cover-Slides unangetastet |
| **consulting** | executive-summary (Bullets über volles Band verteilt) + comparison-table zentriert; **content-2col-image** leere Image-Card raus → text-forward |
| **product-marketing** | product-intro + feature: leere Image-Cards raus → Text/Stat-Block; the-shift „("-Artefakt war Fixture-Daten-Problem (leerer `evidence`-Slot → kollabierte Card mit runder Ecke); Fixture korrigiert |
| **launch-warm** | the-shift Chart-Card füllt jetzt das Band (align-items:stretch) |

**Pattern (geteilt, additiv pro Skill):** floatendes Template → `<div flex column height:100%>` mit Header (flex:0), Content in `<div flex:1; min-height:0; display:flex; align-items:center>` mit innerem `width:100%`, optional Footer. Kein Font-Shrinking. Leere graue Placeholder-Cards sind ein Defekt → contentful Layout oder weg.

**Uppercase-Sweep (Dom-Entscheid „Sweep ALLE 9"):** Regel `no-uppercase-anywhere` konsequent über alle 9 Skills durchgezogen — `text-transform:uppercase` + positives letter-spacing (Tracking) raus aus allen `components.html` UND aus shared `baseSlideCss` (`.eyebrow` + `.dir-table thead th`, der eine bewusste shared-Edit = Style entfernt). Negatives letter-spacing (Headline-Tightening, 65×) bleibt. Akronym-Literale (TAM/SAM/SOM, CEO) bleiben. Auch die vorher gelobten polaris/quarto geswept (keine editorial Ausnahme). Visuell verifiziert mckinsey/polaris/quarto/pitch — kein Layout-Bruch.

**Chart-Trailing-Zero (Finding b) — gefixt:** `formatNum` nimmt jetzt optionalen `decimals`-Param; neuer Helper `maxDecimals(rawString)` liest die Quell-Präzision *bevor* `parseNums` sie verliert (JS: `6.10 === 6.1`). Verdrahtet in bar/hbar/waterfall/line. Verifiziert: scenario-1 rendert €1.90/€8.40 (vorher €1.9/€8.4), 4.2% (1-Dezimal-Quelle) bleibt 1-Dezimal. **NIE** `baseSlideCss`/`tokensToCss` angefasst.

**Validierung:** tsc clean · `npm run validate` 9/9 · `npm test` (security 25/25) · mckinsey-fit 16/16.

---

## 6. Entscheidungen (getroffen 2026-06-04)

1. **Density-Taxonomie**: **3 Stufen** — `editorial` / `balanced` / `data-dense`. Pro Slide setzbar.
2. **Bild-Pipeline**: **Hybrid** — FAL-generiert für Hero/Editorial-Momente (Polaris-Look), Stock (Unsplash/Pexels) für unterstützende Slides.
3. **Scope**: **M1 → M4** (voller Wurf inkl. Intake→Co-Generation als Produkt).
4. **Intake-Flow**: **Co-Generation, 3–5 Fragen** → annotierter Outline (Density + Asset-Typ pro Slide) → User justiert → Render.
5. **Review-Kadenz**: ~~M1 als Zwischenstand~~ — **revidiert 2026-06-04**: kein Zwischenstand an den Client. Intern weiter durch M2–M4, Review erst wenn vorzeigbar genug.
6. **Density-Modell (2026-06-04)**: Density ist eine **abstrakte, typ-agnostische** Achse, nicht aus einem Referenz-Deck abgeleitet. Präsentations-Typ und Density sind orthogonal. Eine Referenz definiert "gut" nur für ihren Typ.
