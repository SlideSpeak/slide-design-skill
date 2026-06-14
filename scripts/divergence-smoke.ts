// Smoke-test the structural-divergence scorer (engine/divergence.ts).
import { typeSetOverlap, sequenceOverlap, compareDecks } from "../engine/divergence.ts";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`OK  ${label}`); pass++; }
  else { console.log(`FAIL ${label}${detail ? " — " + detail : ""}`); fail++; }
}

// Kelvin/Vitala: identical pitch spine, slide-for-slide → re-skin
const pitchSpine = ["cover", "problem", "market", "product", "how-it-works", "testimonial", "revenue", "model", "unit-econ", "moat", "quadrant", "backers", "team", "act-break", "ask"];
const vitala = [...pitchSpine]; // same set + order, new chrome only

check("identical spine → set overlap 1", typeSetOverlap(pitchSpine, vitala) === 1, String(typeSetOverlap(pitchSpine, vitala)));
check("identical spine → seq overlap 1", sequenceOverlap(pitchSpine, vitala) === 1, String(sequenceOverlap(pitchSpine, vitala)));

// A genuinely divergent pitch: different spine + types
const southpaw = ["open-statement", "wound", "turn", "evidence-grid", "voice", "ledger", "scoreboard", "promise", "close"];
{
  const pairs = compareDecks([
    { name: "kelvin", types: pitchSpine },
    { name: "vitala", types: vitala },
    { name: "southpaw", types: southpaw },
  ]);
  const kv = pairs.find((p) => p.a === "kelvin" && p.b === "vitala")!;
  const ks = pairs.find((p) => p.a === "kelvin" && p.b === "southpaw")!;
  check("kelvin↔vitala flagged re-skin", kv.reskin === true, JSON.stringify(kv));
  check("kelvin↔southpaw not a re-skin", ks.reskin === false, JSON.stringify(ks));
}

// Same set, shuffled order → not a re-skin (order diverges)
{
  const shuffled = [...pitchSpine].reverse();
  const pairs = compareDecks([{ name: "a", types: pitchSpine }, { name: "b", types: shuffled }]);
  check("same set, reversed order → not re-skin", pairs[0].reskin === false, JSON.stringify(pairs[0]));
}

// Register isolation: decks of different registers are not compared
{
  const pairs = compareDecks([
    { name: "kelvin", types: pitchSpine, register: "pitch" },
    { name: "ledgerline", types: pitchSpine, register: "report" },
  ]);
  check("cross-register pair skipped", pairs.length === 0, JSON.stringify(pairs));
}

console.log(`\ndivergence: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
