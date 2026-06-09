import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDeck,
  loadSkill,
  renderDeckShell,
  type LLMClient,
  type ImageResolver,
} from "../engine/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const skillsRoot = resolve(repoRoot, "skills");

const noImg: ImageResolver = { async resolve() { throw new Error("none"); } };

const FIXTURES: Record<string, { slides: any[] }> = {
  academic: {
    slides: [
      { type: "title", slots: { "paper-title": "Distributional shift in clinical NLP: a four-corpora replication of biomedical entity recognition", authors: "L. Saito, R. Mendel, K. O'Brien", affiliation: "Department of Biomedical Informatics", venue: "ACL 2026", date: "May 2026", doi: "doi.org/10.0000/example.2026.0042" }, images: [] },
      { type: "motivation", slots: { headline: "Clinical NLP benchmarks under-report degradation when models cross institutional boundaries", body: "Biomedical entity recognition systems are typically evaluated within a single corpus. Recent work suggests cross-institutional transfer degrades F1 by 8–14 points on identical schemas — a gap that is invisible to leaderboard-style evaluation. This paper replicates four published models across four institutional corpora and characterises the gap.", "citation-1": "Wang et al., 2024. Clinical NLP fairness review. JAMIA 31(4).", "citation-2": "Park & Lin, 2025. Cross-corpus drift in biomedical NER. ACL Findings.", "citation-3": "Kumar et al., 2023. Institutional shift in medical text. Nature Digital Medicine 6." }, images: [] },
      { type: "data", slots: { headline: "Four corpora, four institutions, identical schemas", "dataset-name": "MERGE-Bio v1 (this work)", "n-value": "184,612", "n-label": "annotated mentions across 4 sites", source: "MERGE-Bio v1 corpus, this work; sites anonymised per IRB.", period: "Notes 2018–2024", notes: "Schemas harmonised to UMLS CUI per mention. Annotator agreement κ = 0.83 within site; κ = 0.71 cross-site (entity-level)." }, images: [] },
      { type: "result-table", slots: { headline: "Cross-site F1 drops by 9.4 points on average", finding: "Within-site F1 = 0.847; cross-site F1 = 0.753 — a gap that exceeds the reported variance for all four models.", "table-headers": "Model · Within · Cross · Δ", "table-rows": "BioBERT-large    0.851    0.762    -0.089\nClinicalBERT-v2  0.844    0.751    -0.093\nGatorTron-base   0.857    0.762    -0.095\nMedRoBERTa-NL    0.836    0.738    -0.098", source: "MERGE-Bio v1 · 5-fold cross-site split · 2026" }, images: [] },
      { type: "discussion", slots: { headline: "Implications and limitations", "implication-1": "Institutional benchmarks systematically over-state real-world deployment performance; cross-site evaluation should be the default for clinical NLP papers.", "implication-2": "The 9-point gap is consistent across architectures, suggesting the bottleneck is corpus-distributional rather than model-architectural.", "limitation-1": "Four-site sample under-represents non-English clinical text and ambulatory settings.", "limitation-2": "Anonymisation may have removed signal in person-mention contexts; gap is plausibly larger in unredacted text.", "future-work": "extend MERGE-Bio to 8 sites including 2 non-English corpora; evaluate domain-adaptation methods (DAPT, prompt-tuning) under the same protocol." }, images: [] },
      { type: "conclusion", slots: { headline: "Three takeaways", "takeaway-1": "Cross-site evaluation reveals a 9.4 F1-point gap invisible to within-site benchmarks.", "takeaway-2": "The gap is architecture-agnostic; the field's headline numbers reflect site-specific overfit.", "takeaway-3": "MERGE-Bio v1 will be released as a community evaluation suite, anonymisation-compliant, under DUA." }, images: [] },
      { type: "qa", slots: { headline: "Questions?", "contact-name": "Laila Saito", "contact-email": "lsaito@example.edu", "paper-url": "arxiv.org/abs/2606.00042", "code-url": "github.com/merge-bio/eval" }, images: [] },
    ],
  },
  pitch: {
    slides: [
      { type: "cover", slots: { "company-name": "Vellum", tagline: "The first cap table built for option-pool math, not lawyers.", date: "May 2026", round: "Seed" }, images: [] },
      { type: "problem", slots: { headline: "Founders spend 4 hours per round arguing about a spreadsheet that nobody trusts.", persona: "Seed-stage founders", subhead: "Existing cap-table tools are document-of-record systems for lawyers. They cannot model dilution, refresh option pools, or run scenarios before a term sheet is signed." }, images: [] },
      { type: "market", slots: { headline: "Cap-table software is a $1.8B category — the AI-native rebuild is open.", "tam-value": "$1.8B", "tam-label": "Global cap-table + equity admin", "sam-value": "$420M", "sam-label": "US/EU seed→C", "som-value": "$84M", "som-label": "5-year wedge", source: "Pitchbook 2025 · CB Insights cap-table category 2024" }, images: [] },
      { type: "traction", slots: { headline: "Six months in: paid pilots with eight venture-backed companies.", "metric-1-value": "8", "metric-1-label": "Paying design partners", "metric-2-value": "$42K", "metric-2-label": "ARR (Mar 2026)", "metric-3-value": "118%", "metric-3-label": "Net retention", "chart-caption": "Monthly active scenarios run · Oct 2025 – Apr 2026", source: "Vellum internal · Stripe data Apr 2026" }, images: [] },
      { type: "ask", slots: { headline: "to take Vellum from 8 design partners to 80 paying teams by Q2 2027.", "ask-amount": "$3.2M", "use-1": "Engineering — 4 hires (founding eng team to 7)", "use-2": "GTM — 2 founder-led-sales hires + content engine", "use-3": "Runway — 22 months to Series A milestones", "contact-name": "Maya Choudhury", "contact-email": "maya@vellum.example", "runway-months": "22" }, images: [] },
    ],
  },
  "product-marketing": {
    slides: [
      { type: "cover", slots: { "product-name": "Threadline", "positioning-line": "Customer conversations, finally connected to the rest of your product.", "launch-date": "May 28, 2026", "company-name": "Threadline Labs" }, images: [] },
      { type: "the-shift", slots: { headline: "Customer feedback should not be archeology — it should be live infrastructure.", body: "For two decades, customer support has been a ticketing system, sales has been a CRM, and product has been a roadmap document. The conversation between the three is reconstructed every quarter, by hand.", evidence: "63% of product teams report that they cannot trace a shipped feature back to the customer conversation that originated it. (Threadline customer research, n=420, Feb 2026)" }, images: [] },
      { type: "feature", slots: { eyebrow: "Feature 01 · Conversations", headline: "Every customer touchpoint, automatically threaded.", body: "Threadline ingests support tickets, sales calls, product analytics, and survey responses, and threads them by customer, account, and topic — without prompting, tagging, or manual triage.", "image-caption": "Threading view · Account focus", metric: "9× faster than manual tagging" }, images: [] },
      { type: "customer-proof", slots: { quote: "We replaced three meetings a week with a Threadline thread. The product team stopped asking 'what is the customer saying' — they could see it.", "attribution-name": "Annika Voss", "attribution-role": "Head of Product, Boundary", "metric-value": "73%", "metric-label": "fewer customer-discovery meetings" }, images: [] },
      { type: "cta", slots: { headline: "Try Threadline with your team this week.", "action-label": "Start the pilot", "action-url": "threadline.example/start", "secondary-action": "Read the launch story" }, images: [] },
    ],
  },
  training: {
    slides: [
      { type: "cover", slots: { "workshop-title": "Designing decision logs that teams actually read", "instructor-name": "Roan Petersen", duration: "Half-day · 4h", "audience-level": "Intermediate", date: "5 June 2026", location: "Berlin + remote" }, images: [] },
      { type: "agenda", slots: { headline: "What we'll cover today", "module-1-title": "Why most decision logs die", "module-1-duration": "30 min", "module-2-title": "Anatomy of a log that gets re-read", "module-2-duration": "60 min", "module-3-title": "Exercise — rewrite a real decision", "module-3-duration": "90 min", "module-4-title": "Debrief and team commitments", "module-4-duration": "60 min" }, images: [] },
      { type: "objectives", slots: { headline: "By the end of the workshop", "objective-1": "Diagnose why your team's existing decision log is or isn't being read.", "objective-2": "Apply the four-part decision-log template to a real decision from your own team.", "objective-3": "Leave with a written commitment for what changes when you're back in the office on Monday." }, images: [] },
      { type: "concept", slots: { headline: "Decision logs fail when they record what was decided, not what was considered.", "concept-body": "A decision-log entry that lists only the final choice gives future readers no way to evaluate whether the decision is still right. Logs that survive include the alternatives weighed, the constraints active at the time, and a single line of testable expectation.", "example-label": "Before / after", "example-body": "Before: 'Decided to use Postgres.' After: 'Chose Postgres over DynamoDB because the read pattern is relational and the team has 4y of operational experience. Revisit if write throughput exceeds 10k/s sustained.'" }, images: [] },
      { type: "exercise", slots: { headline: "Rewrite one of your team's recent decision-log entries.", task: "Pick a decision your team made in the last 30 days. Rewrite the log entry using the four-part template: choice, alternatives, constraints, expectation. Share with a partner; the partner asks the one question that would have made the original entry useful to them.", "time-box": "20 min", "success-criteria": "Your partner can explain, in their own words, what would have to change for your team to revisit this decision — without asking you any follow-up questions.", hint: "If you find yourself writing more than five lines on the alternatives, you're documenting the meeting — not the decision." }, images: [] },
      { type: "closing", slots: { headline: "Take it back to the team.", "next-action": "Pick one in-flight decision this week. Write its log entry before the decision is made, not after.", "support-channel": "#decisions Slack channel · monthly office hours", "instructor-contact": "roan@example.training" }, images: [] },
    ],
  },
};

for (const [skillName, payload] of Object.entries(FIXTURES)) {
  const llm: LLMClient = { async generateSlideTree() { return payload; } };
  const skill = await loadSkill(resolve(skillsRoot, skillName));
  const result = await generateDeck(
    { skillName, userPrompt: "x", slideCount: payload.slides.length, imageBudget: 0 },
    { skillsRoot, llm, images: noImg },
  );
  const shell = renderDeckShell(skill);
  const standalonePrefix = shell.head.replace(
    "body { margin: 0; background: #1a1a1a; padding: 40px; }",
    "body { margin: 0; background: #fff; padding: 0; } .slide { margin: 0 0 24px; box-shadow: none; }",
  );
  const html = standalonePrefix + result.slides.map((s) => s.html).join("\n\n") + "\n" + shell.foot;
  const out = resolve(repoRoot, `scripts/${skillName}-smoke.html`);
  await writeFile(out, html);
  console.log(skillName, "→", out, "(", result.slides.length, "slides,", result.warnings.length, "warnings)");
  for (const w of result.warnings) console.log("  -", w);
}
