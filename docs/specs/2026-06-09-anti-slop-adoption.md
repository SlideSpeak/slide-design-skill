# Anti-Slop Adoption — taste-skill → slide-design-skill

Status: Decided (Phase 1) · 2026-06-09 · Autor: Dominik + Claude + Codex (audit) · Phase 2+ als Roadmap
Kontext: Audit des bekanntesten Claude-Design-Skills "taste-skill" (Anti-Slop Frontend Skill) gegen unsere Engine.
Auslöser: Kevin/Germán — "Decks sehen alle AI-designed und gleich aus" (siehe `DESIGN-VARIANCE-BRIEF.md`).

---

## 1. Audit-Ergebnis — was übertragbar ist

taste-skill ist ein flaches Prompt-SKILL für Web (Next.js/Tailwind/GSAP). Wir sind eine Engine
mit Grammar-Validator und HTML→PDF-Render. Der Wert liegt **nicht im Code**, sondern in der
**Disziplin**: Brief lesen → explizite Dials → bekannte AI-Defaults verbieten → mechanisch prüfen.

Architektonischer Kernbefund (Claude + Codex unabhängig): wir haben einen Validator, taste-skill
nicht. Also gehört der **deterministische** Teil ihrer "Pre-Flight Checks" bei uns in **Code**
(`validate.ts`), nicht in Prosa. Der **semantische** Teil (Brief-Inference, Varianz-Planung)
gehört in eine neue Planungsschicht vor der Generierung.

### Schon vorhanden (kein Re-Build)
Density als Layout-Semantik (`density.ts`), Composition-Variety-Guard (`validate.ts`),
em-dash-Verbot + No-Uppercase-Sweep, Layout-Fit-Harness (Bounded Content Island).

### Übernehmen (nach Impact)
| # | Konzept | Landet in |
|---|---|---|
| 1 | Brief-Inference / "Design Read" (Audience, Präsi-Typ, Varianz, Asset-Appetit, Density-Rhythmus vor Generierung) | NEU `deck-plan.ts` → `prompt-composer.ts` |
| 2 | Varianz als echter, aus dem Brief **abgeleiteter** Dial (nicht als nackte Zahl) | `deck-plan.ts` |
| 3 | AI-Tells-Katalog → **Quality-Linter in Code** | NEU `quality-lint.ts` ← `validate.ts` |
| 4 | Mechanische Zähl-Checks (eyebrow-overuse, fake-Zahlen, Density-Monotonie) | `validate.ts` / `quality-lint.ts` |
| 5 | Anti-Default + Palette/Composition-Rotation über aufeinanderfolgende Decks | `deck-plan.ts` + Generierungs-History |

### NICHT übernehmen (Cargo-Cult)
GSAP/RSC/`use client`/Tailwind/Package-Map · Motion-Intensity (statisches PDF) · Core Web Vitals ·
Dark-Mode-Protokoll · CTA/Nav/Form-Regeln · "immer echte Fotos" (killt academic) ·
"genau 1 Accent-Farbe" als Gesetz · literaler "Inter verbieten"-Font-Bann.

---

## 2. Slide-spezifische AI-Tells (das zu prüfende Ziel)

Übersetzung von taste-skills Web-Tells auf Slides:

- Floskeln: "elevate", "seamless", "unlock", "leverage", "next-gen", "revolutionize", "game-changing",
  "cutting-edge", "world-class", "synergy".
- Generische Platzhalter-Namen: "John Doe", "Jane Doe", "Acme", "Lorem ipsum".
- Generische Step-Labels: "Stage 1", "Phase 01", "Step 1".
- Fake-präzise Zahlen ohne Quelle: `73%`, `4.2x`, `$12.4M`, `10,000+` — erlaubt nur wenn die Zahl
  im User-Prompt stand ODER als illustrativ markiert ist.
- Eyebrow/Micro-Label-Overuse: derselbe `eyebrow`/`kicker`/`label`-Slot auf (fast) jeder Slide,
  oder Section-Nummern-Eyebrows (`01 / STRATEGY`, `PHASE 02`).
- Density-Monotonie: alle Slides dieselbe Density-Stufe.
- em-/en-dash im sichtbaren Text (bereits Regel, jetzt als harter Code-Gate).

---

## 3. Phase 1 — `quality-lint.ts` (DIESE Lieferung)

Reine, deterministische Funktion `lintSlideTree(slides, opts)` → `{ findings: Finding[] }`.
Aufgerufen aus `validateSlideTree`; Findings fließen als Warnungen in `ValidationResult.warnings`
(Errors nur in `strict`). Scannt ausschließlich sichtbare Slot-Strings (keine `bgPrompt`/Bild-Slots).

Checks (Phase 1):
1. `em-dash` — `—` oder `–` als Separator in sichtbarem Text.
2. `ai-phrase` — kuratierte Floskel-Liste (Wortgrenzen, case-insensitiv).
3. `placeholder-name` — John/Jane Doe, Acme, Lorem ipsum.
4. `generic-step-label` — `Stage N` / `Phase NN` / `Step N` als Slot-Wert-Präfix.
5. `fake-precise-number` — Zahl-mit-Präzision (`%`, `x`, Währung, `k/M/B`) die NICHT im
   `userPrompt` vorkommt und NICHT als illustrativ markiert ist (`opts.userPrompt`, `opts.illustrative`).
6. `eyebrow-overuse` — eyebrow-artige Slots auf > ceil(slides/3) Slides.
7. `density-monotony` — Deck > 6 Slides, alle dieselbe Density (sofern gesetzt).

Jedes Finding: `{ rule, severity: "warn"|"error", slideIndex, slot?, message }`.
Default-Severity = `warn` (nicht blockierend); `em-dash` = `error` (Dom's Hard-Rule).

Verifikation: eigenes tsx-Smoke (`scripts/quality-lint-smoke.ts`), in `npm test` eingehängt.
`tsc` clean. Bestehende `npm run validate` 9/9 unverändert.

---

## 4. Phase 2 — `deck-plan.ts` (DONE 2026-06-09)

Reine, deterministische Planungsschicht VOR der Generierung. `planDeck({userPrompt, slideCount, skill})`
liest den Brief (Keyword-Inferenz aus User-Prompt + Skill-Frontmatter, ehrlich heuristisch, `general`-
Fallback) und leitet einen **expliziten, pro-Deck Design Read** ab, der via `deckPlanPromptBlock`
in `composeSystemPrompt` VOR den Slide-Types injiziert wird. Damit unterscheiden sich zwei Decks in
ihren Marschbefehlen, nicht nur in der Token-Palette — die Wurzel von "alle Decks sehen gleich aus".

`DesignRead`:
- `presentationType` — pitch / report / teaching / editorial / keynote / general.
- `audience` — executive / academic / customer / team / general.
- `register` (abgeleitet) — punchy / formal / technical / warm / plain. Typ schlägt Audience
  (Investor-Pitch = punchy, obwohl Investoren executive sind).
- `assetAppetite` (abgeleitet) — image-led (editorial/keynote) / data-led (report/teaching) / balanced.

`densityRhythm`: ein Density-Tier pro Slide-Position (Länge === slideCount). Endpunkte immer
`editorial` (Cover/Closing atmen), Interior zyklisch nach Appetit, erste Interior-Slide NIE editorial
→ garantiert nicht-monoton (besteht den `density-monotony`-Lint aus Phase 1). Als *Vorschlag* geframt:
"folge dem Rhythmus, außer der Inhalt verlangt eine andere Stufe".

NICHT in Phase 2 (bewusst): kein zweiter LLM-Call, kein Co-Generation-Outline (WS-3),
keine Generierungs-History.

Verifikation: `scripts/deck-plan-smoke.ts` (25 Checks, in `npm test` als `test:deck-plan`),
`tsc` clean, `npm test` exit 0. Echt-Output gegen 3 geladene Skills (pitch/consulting/academic)
geprüft → drei klar verschiedene Pläne.

## 5. Phase 3+ — Roadmap (nicht geliefert)

- Generierungs-History für Palette/Composition-Rotation über aufeinanderfolgende Decks.
- Asset-Appetit-Contract: full-bleed/cover/statement ohne echtes Bild → Warnung (verbindet
  `assetAppetite` mit dem Validator).
- `compositionPlan`: konkrete, aus der Grammar-Family abgeleitete Sequenz statt nur Varietäts-Regel.
- WS-3 Co-Generation: Intake → annotierter Outline (Density + Asset-Typ pro Slide) → User justiert.

## 6. Über-Adoption-Risiken (bewusst vermieden)
Web-Checkliste in dutzende brüchige Regeln gießen · "keine 3 Cards" universell (Consulting braucht
Peer-Grids) · Palette-Rotation überindexieren während Layout-Grammar die Sameness-Quelle ist ·
Fotos in academic/data-Decks erzwingen · Varianz durch Deko statt durch andere Slide-Jobs.
