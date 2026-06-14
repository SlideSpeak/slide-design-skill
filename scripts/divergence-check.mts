// Cross-deck divergence gate. Two decks in one direction must NOT share a spine
// (slide-type set + order) — a re-skin of the same skeleton is the failure this
// catches mechanically (the Kelvin/Vitala V1 mistake). Every other gate sees one
// deck; this one compares them.
// Usage: npx tsx scripts/divergence-check.mts <deckA.html> <deckB.html> [<deckC.html> ...]
//   Pass the rendered decks of ONE direction. Exits 1 if any pair is a re-skin.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compareDecks, RESKIN_THRESHOLD, type DeckShape } from "../engine/divergence.ts";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: tsx divergence-check.mts <deckA.html> <deckB.html> [more…]");
  process.exit(2);
}

function slideTypes(html: string): string[] {
  // Prefer the stamped data-slide-type; fall back to the section's first class.
  const stamped = [...html.matchAll(/data-slide-type="([^"]+)"/g)].map((m) => m[1]);
  if (stamped.length) return stamped;
  return [...html.matchAll(/<section[^>]*class="slide ([a-z0-9-]+)/gi)].map((m) => m[1]);
}

const decks: DeckShape[] = [];
for (const a of args) {
  const html = await readFile(resolve(process.cwd(), a), "utf8");
  const name = a.split("/").pop()!.replace(/\.html$/, "");
  decks.push({ name, types: slideTypes(html) });
}

const pairs = compareDecks(decks);
console.log("deck pair                                     set%   seq%   verdict");
let reskins = 0;
for (const p of pairs) {
  if (p.reskin) reskins++;
  console.log(
    `${(p.a + " ↔ " + p.b).padEnd(44)} ${(p.setOverlap * 100).toFixed(0).padStart(4)}  ${(p.seqOverlap * 100).toFixed(0).padStart(5)}   ${p.reskin ? "RE-SKIN" : "ok"}`,
  );
}
console.log(`\nthreshold ${RESKIN_THRESHOLD * 100}% on BOTH set and sequence. ${reskins} re-skin pair(s).`);
if (reskins > 0) {
  console.error("DIVERGENCE FAIL — sibling decks share a spine. Regenerate one with a distinct presentationType skeleton (different slide-type set + order), not a new chrome on the same skeleton.");
  process.exit(1);
}
