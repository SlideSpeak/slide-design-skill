// Rough FAL spend estimate, for visibility only. Assumes the default flux/schnell
// rate; reference-model (nano-banana) calls cost more, so this is a floor estimate,
// not an invoice. Kept pure so it is unit-testable without network or env.
export const FAL_USD_PER_CALL = 0.025;

export function estimateFalCostUSD(calls: number, perCall = FAL_USD_PER_CALL): number {
  if (!Number.isFinite(calls) || calls <= 0) return 0;
  return Math.round(calls * perCall * 100) / 100;
}
