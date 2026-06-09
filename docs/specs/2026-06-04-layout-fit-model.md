# Layout Fit Model — content-driven slide layout

Status: Decided · 2026-06-04 · Autor: Dominik + Claude + Codex (planner) · alle offenen Punkte entschieden
Kontext: Korrektur des M2-Baus aus `docs/DESIGN-VARIANCE-BRIEF.md`. Ersetzt das bisherige M2-Layout-Modell.
Auslöser: McKinsey-Density.pdf sah trotz "Density = Layout-Wahl" weiter schlecht aus. Symptom-Fixen gestoppt, Metaebene.

---

## 1. Problem — eine Wurzel, zwei Gesichter

Die Slides sehen schlecht aus, weil **das Layout die Inhaltsmenge nicht kennt**. Templates sind starre Gerüste mit fixer vertikaler Struktur. Zwei Fehlermodi, dieselbe Wurzel:

1. **Underflow** — wenig Inhalt wird mechanisch über die volle Höhe gespreizt → Inhalt füllt ~30 %, schwimmt im Weißraum, wirkt "verloren".
2. **Overflow** — viel Inhalt läuft über die Safe-Area und crasht in den Footer.

### Belege (Code, nicht Vermutung)
- `skills/mckinsey/components.html` `executive-summary` (Z. 88) und `recommendation` (Z. 229): `flex:1; … justify-content:space-evenly` → 3–5 Zeilen werden über ~700 px verteilt. Das ist der Underflow auf Slide 4 und 12.
- `comparison-table` (Z. 217) und `heatmap` (Z. 205): `flex:1; … align-items:center` → Inhalt vertikal in einem hohen Feld zentriert, Dead-Space oben/unten. Das ist Slide 10.
- `intro-text` (Z. 53–54): `.mck-cols2 { column-fill:auto; height:100% }` in einem `flex:1`-Grid → bei viel Prosa läuft die Spalte über die Höhe → crasht in den Footer. Das ist Slide 2.

Font-Verkleinern behebt das nicht (verworfen, erzeugt Text-Wände). Starre Templates sind das Problem (jetziger Stand). **Lösung: das Layout muss von der Inhaltsmenge getrieben sein.**

### Begleit-Defekte (eigene Tickets, nicht Teil des Kernmodells)
- **Font-Bug**: Headlines (Lora) laden im Headless-Render evtl. nicht → Times-Fallback ("random Schrift"). Verifizieren und fixen (Font-Embedding / Preload im Render-Harness).
- **Uppercase-Achsenlabels**: `dots-2x2`/`radar` werden im *shared* Renderer per JS `toUpperCase()` gesetzt → verletzt die No-Uppercase-Regel, nur global änderbar.

---

## 2. Prinzipien (nicht verhandelbar)

1. **Type bleibt lesbar.** Feste, lesbare Größen. Niemals Font-Scaling zum Einpassen.
2. **Whitespace wird gestaltet, nicht verteilt.** Weißraum ist ein Rand um einen *inhaltsgroßen* Cluster, nie ein zwischen Zeilen gestreckter Gap zum Höhefüllen.
3. **Content-first.** Erst Inhaltsmenge, dann Rahmen. Der LLM liefert Intent + Inhalt; die *Engine* wählt/migriert die passende Layout-Variante nach Kapazität.
4. **Density = Register innerhalb einer Layout-Familie**, nie ein Font-Knopf. `editorial / balanced / data-dense` steuern Spaltenzahl, Gruppierung, Element-Anzahl — nicht die Schriftgröße.
5. **Additiv im Shared-Layer.** `token-compiler.ts` / `baseSlideCss` werden nicht per-Skill geändert (regrediert alle Skills). Per-Skill-Fixes bleiben per-Skill.
6. **Brand-Konsistenz bleibt.** Wir werfen Templates nicht weg — sie tragen die Design-Sprache. Das Problem ist Fit, nicht das Template-Modell.
7. **Sentence case überall.** Keine Uppercase+Tracking-Labels.

---

## 3. Das Modell — vier Schichten

### Schicht 1 — Layout-Contracts (Kapazität wird deklariert)
Jeder Slide-Typ deklariert maschinenlesbar in der `layout-grammar.md` der Skill:
- **Slot-Schema**: pro Slot ein `kind` (`line` | `prose` | `items` | `stat` | `table` | `chart` | `media`).
- **Kapazität** pro Slot: `{ min, ideal, max }` in der natürlichen Einheit (Zeichen für `line`/`prose`, Anzahl für `items`/`stat`/Tabellen-Rows/Cols).
- **Headline-Disziplin**: `action-title`/`headline` haben ein Zeichen-Max (~ eine Zeile bei gesetzter Größe, z. B. ≤ 90 Zeichen).
- **Density-Register**: welche Tiers der Typ bedient und welche Variante pro Tier.
- **Layout-Familie + Fallback/Continuation-Policy**: zu welcher Familie der Typ gehört und welche höher-kapazitive Variante / Continuation bei Overflow greift.

Beispiel (mckinsey `executive-summary`):
```
family: summary
slots:
  headline:  { kind: line,  max: 90 }
  claim-n:   { kind: line,  max: 120, items: { min: 3, ideal: 5, max: 5 } }
density: { editorial: 3 claims, balanced: 5 claims, data-dense: → split }
overflow: paginate → executive-summary (continued)
```

### Schicht 2 — Inhaltsgroße Templates (CSS-Disziplin)

**Die eine Regel: Bounded Intrinsic Content Island.**
Der Hauptinhalt jedes Templates lebt in einer *Safe-Area-begrenzten Insel*, die intrinsisch bis zu einer deklarierten `max-height` wächst. Kinder dürfen Restraum **nicht** über `flex:1`, `space-evenly`, `space-between` oder `height:100%` schlucken — es sei denn, der Slot selbst hat einen expliziten Overflow/Pagination-Vertrag.
- **Underflow-Fix**: Sparse-Inhalt behält seine natürliche Höhe und bildet einen komponierten Cluster, statt über die volle Slide gestreckt zu werden.
- **Overflow-Fix**: Dense-Inhalt trifft eine bekannte Slot-Grenze *bevor* er den Footer erreicht → Overflow ist auf der richtigen Ebene detektierbar und paginierbar.

**Raus / Rein:**
- **Raus**: `justify-content:space-evenly`/`space-between` auf `flex:1`, `align-items:center` auf `flex:1`, `column-fill:auto; height:100%`, unbounded Table/Chart-Wrapper.
- **Rein**: Main-Area = feste Safe-Area-Höhe (Frame minus Title/Rule/Footer). Content-Insel = `max-width` + `max-height:100%` der Main-Area. Default `height:auto`, Platzierung über `align-self`/`justify-self`. Dense-State: `height:100%` nur für die *Insel*, nicht für beliebige Kinder; Top-Alignment + interne Grid-Constraints.

**Per-Template (mckinsey):**
| Template | Änderung |
|---|---|
| `executive-summary` | `flex:1`+`space-evenly` raus → auto-höhe Takeaway-Cluster, fester Row-Gap, `max-width` |
| `recommendation` | Rows = intrinsische Höhe + feste Gaps; nur die Roadmap-Insel bekommt `max-height` |
| `comparison-table` | Table-Wrapper besitzt `max-height` + Row-Budget; kein full-height-zentriertes Flex-Kind |
| `heatmap` | Grid bekommt explizite Track-Größen + `max-height`; Labels/Legende *innerhalb* der gemessenen Insel |
| `intro-text` | `height:100%`-Prosa-Spalten raus → bounded Spalten-Container mit Wort-Budget + Top-Alignment |

**Density-Register bei *gleichem* Slot-Inhalt (nie Typografie):**
| | editorial | data-dense |
|---|---|---|
| Verhalten | fokussierter Argument-Cluster | gepacktes Exhibit in derselben Insel |
| max-width | schmaler | breiter |
| Spalten | wenige / eine | mehr / dichteres Grid |
| Gaps | größere feste Row-Gaps | engere feste Gaps |
| Platzierung | optisches Zentrum / obere Mitte | top-aligned, volle Main-Area-Höhe genutzt |
| Whitespace | bewusst behalten | strengere Item/Row-Budgets, gleiche Schriftgröße |

**Hard Limit**: Passt data-dense bei fester Schriftgröße immer noch nicht → paginieren oder Validierung fehlschlagen. Niemals Type schrumpfen.

Kernregel in einem Satz: **Weißraum ist Rand um einen gesizten Cluster, nie ein zwischen Zeilen gestreckter Gap.**

### Schicht 3 — Validierung + Arbitration (vor dem Render, deterministisch)
Erweiterung von `engine/validate.ts`:
- Unter Kapazität → ok (Templates sind inhaltsgroß, sparse sieht ruhig aus).
- Über Kapazität → **Arbitration**: (a) höher-kapazitive Variante derselben Familie wählen, oder (b) auf Continuation-Slide paginieren, oder (c) für Regeneration flaggen.
- Fehler sind handlungsfähig: Slide-Index, Slot, Budget, Ist-Wert, vorgeschlagene Variante.

Der LLM bekommt die Budgets im Prompt (`prompt-composer.ts`), schreibt also schon innerhalb der Grenzen und wählt das Density-Register.

### Schicht 4 — Fit-Check (Mess-Netz)
Headless-Render (Brave, 1920×1080) misst pro Slide die Safe-Area-Box gegen den Inhalt: Overflow, Footer-Kollision, Directive-Bounding-Boxes. Bei Verstoß deterministischer Fallback (paginieren / Variante wechseln / flaggen).
- Läuft **mindestens in CI** auf Golden-Fixtures (min/typisch/max pro Slide-Typ).
- Fängt, was statische Budgets nicht wissen können: echter Zeilenumbruch in Proportionalschrift, Tabellen/Charts mit variablen Zellen, Lokalisierung, Font-Fallback.

---

## 4. Datenmodell-Änderungen

| Datei | Änderung | Art |
|---|---|---|
| `layout-grammar.md` (pro Skill) | Maschinenlesbare Contracts (Slot-`kind`, Kapazität, Register, Familie, Overflow) als Frontmatter/Block | additiv |
| `engine/types.ts` | `LayoutContract` / `SlotSpec` Typen; `family`, `capacity` auf Slide-Typ | additiv |
| `engine/validate.ts` | Kapazitäts-Check + Arbitration (Variante/Paginate/Flag) | erweitert |
| `engine/prompt-composer.ts` | Budgets pro Slide-Typ im Prompt | erweitert |
| `skills/*/components.html` | CSS-Disziplin (Schicht 2) pro Template | per-Skill |
| `engine/fit-check.ts` (neu) | Headless-Messung + Fallback | neu |
| `scripts/fixtures/` (neu) | Golden-Fixtures min/typisch/max | neu |
| `engine/token-compiler.ts` / `baseSlideCss` | **keine** per-Skill-Änderung | unverändert |

---

## 5. Entscheidungen (getroffen 2026-06-04, Claude + Codex)

1. **Overflow-Verhalten** = **Regeneration-im-Budget zuerst → Auto-Paginate als Netz → Flag als letzter Ausweg.** Bei Budget-Überschreitung erwartet die Engine zuerst Upstream-Regeneration gegen denselben Budget-Vertrag; ist der Inhalt danach noch über Kapazität oder scheitert der Render-Fit, paginiert die Engine deterministisch gemäß der Continuation-Policy der Layout-Familie; existiert keine Policy → Validierungsfehler. *Voraussetzung: Continuation-Policy pro Layout-Familie in der Grammar.*
2. **Arbitration = später.** Für die erste Implementierung bleibt der LLM-gewählte Slide-Typ bindend, sofern er Schema + Budget besteht. Content-first-Arbitration kommt, nachdem die ersten mckinsey-Templates stabile Budget-Verträge und gemessene Fixtures haben. *Interim-Brücke: Validator-Fehler mit vorgeschlagenem Fallback-Layout.*
3. **Generalisierung = mckinsey first.** Modell zuerst gegen mckinsey-Templates beweisen (Fixtures für sparse/typisch/dense). Nach bestandener Fixture-Validierung wird das Vertrags-Pattern als wiederverwendbare Authoring-Guidance für `polaris` und generierte Skills promotet. *Generische Vertrags-Konzepte sauber von mckinsey-spezifischen Density-Mappings trennen.*

---

## 6. Milestones (Build-Reihenfolge)

| Phase | Inhalt | Liefert |
|---|---|---|
| **P1** | Inhaltsgroße Templates (Schicht 2) auf mckinsey + Font-Bug | sichtbarer Win: kein Dead-Space, kein Footer-Crash. Das, was du als Erstes siehst. |
| **P2** | Layout-Contracts + statischer Validator + Headline-Disziplin (Schicht 1 + 3 statisch) | Overflow deterministisch tot; Budgets im Prompt |
| **P3** | Content-first-Arbitration (Familien + Kapazitäts-Auswahl) | Engine wählt Variante aus dem Inhalt |
| **P4** | Fit-Check + Golden-Fixtures in CI (Schicht 4) | Mess-Netz gegen Budget-Drift und langen Tail |
| **P5** | Generalisierung auf andere Skills + Design-QA-Feedback | typ-agnostisch bestätigt |

Begründung der Reihenfolge (Codex bestätigt): nicht mit Messung als Haupt-Algorithmus starten. Erst Contracts + deterministische Auswahl, Messung als Gate.

---

## 7. Akzeptanzkriterien

- Jeder mckinsey-Slide-Typ hat Golden-Fixtures für min/typisch/max Inhalt.
- Bei *min* Inhalt: ruhige, gesizte Komposition — keine Edge-to-Edge-Spreizung, kein "verloren".
- Bei *max* Inhalt: kein Überlauf in den Footer, keine Kollision; bei Bedarf sauber paginiert.
- Type in jedem Tier lesbar (keine Verkleinerung zum Einpassen).
- Verifiziert: jeder Fixture-Slide einzeln visuell gegengecheckt (der Fehler von zuvor: nicht jeder Slide geprüft).

---

## 8. Non-Goals

- Kein Font-Scaling / Density-Multiplier.
- Templates nicht wegwerfen — sie tragen die Brand.
- Keine Brand-/Token-Neugestaltung der Skills.
- Keine Änderung am Shared-Layer (`baseSlideCss`/`tokensToCss`) für per-Skill-Verhalten.

---

## 9. Größtes Risiko (Codex)

**Budget-Drift**: deklarierte Budgets wirken autoritativ, weichen aber vom echten CSS ab, wenn Templates sich entwickeln → Prompt, Validator und Renderer widersprechen sich. Slides bestehen die Validierung, scheitern aber visuell.

Gegenmittel: Budgets in derselben Grammar wie die Slide-Typen halten; Validator-Regeln und Prompt-Auszüge aus *einer* Quelle ableiten; Golden-Fixtures (min/typisch/max) pro Typ; Fit-Check auf den Fixtures in CI; gemessene Kapazität als Test in die Grammar zurückspielen, nicht als Stammeswissen.
