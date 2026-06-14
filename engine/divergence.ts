// Structural-divergence scorer — the sibling-reskin detector.
//
// The rule "two decks/skills in one register must not share a spine + slide-type
// set" was enforced ENTIRELY by prompt prose. Every other gate looks at ONE deck,
// so a re-skin of the same skeleton (identical slide-type set + family sequence,
// new chrome) passed everything (the Kelvin/Vitala V1 failure). This compares
// decks pairwise: a set overlap (which types) and a sequence overlap (which
// order). Pure functions; the harness (scripts/divergence-check.mts) supplies the
// per-deck slide-type sequences extracted from the rendered DOM.

/** Jaccard overlap of two slide-type SETS (which types appear), 0..1. */
export function typeSetOverlap(a: string[], b: string[]): number {
  const A = new Set(a.map((s) => s.toLowerCase()));
  const B = new Set(b.map((s) => s.toLowerCase()));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** Order overlap: longest-common-subsequence length over the longer sequence, 0..1. */
export function sequenceOverlap(a: string[], b: string[]): number {
  const x = a.map((s) => s.toLowerCase());
  const y = b.map((s) => s.toLowerCase());
  const n = x.length, m = y.length;
  if (n === 0 || m === 0) return 0;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m] / Math.max(n, m);
}

export interface DeckShape {
  name: string;
  /** Ordered slide-type names. */
  types: string[];
  /** Optional register/direction; only same-register decks are compared. */
  register?: string;
}

export interface DivergencePair {
  a: string;
  b: string;
  setOverlap: number;
  seqOverlap: number;
  reskin: boolean;
}

/** A pair is a re-skin when BOTH its slide-type set and its order are >= threshold. */
export const RESKIN_THRESHOLD = 0.7;

/**
 * Compare decks pairwise (only within the same register when register is set).
 * Returns every pair with its overlap scores; `reskin` flags the ones that share
 * both the type set and the order above the threshold.
 */
export function compareDecks(decks: DeckShape[], threshold = RESKIN_THRESHOLD): DivergencePair[] {
  const out: DivergencePair[] = [];
  for (let i = 0; i < decks.length; i++) {
    for (let j = i + 1; j < decks.length; j++) {
      const a = decks[i], b = decks[j];
      if (a.register && b.register && a.register !== b.register) continue;
      const setOverlap = typeSetOverlap(a.types, b.types);
      const seqOverlap = sequenceOverlap(a.types, b.types);
      out.push({
        a: a.name,
        b: b.name,
        setOverlap,
        seqOverlap,
        reskin: setOverlap >= threshold && seqOverlap >= threshold,
      });
    }
  }
  return out;
}
