/**
 * Sealed-bid uniform-price clearing — picks the tick that maximises matched
 * volume, then derives the pro-rata fill bps for the marginal tick on each
 * side. Pure function, identical to `tasks/Veil.ts#computeClearing`.
 */
export function computeClearing(
  buyVol: bigint[],
  sellVol: bigint[],
): { tick: number; buyBps: number; sellBps: number; matched: bigint } {
  const NUM = buyVol.length;
  if (NUM !== sellVol.length) throw new Error("buyVol/sellVol length mismatch");
  const BPS = 10_000n;
  let best = { tick: 0, buyBps: 10_000, sellBps: 10_000, matched: 0n };
  for (let c = 0; c < NUM; c++) {
    let demandAbove = 0n;
    for (let t = c + 1; t < NUM; t++) demandAbove += buyVol[t];
    let supplyBelow = 0n;
    for (let t = 0; t < c; t++) supplyBelow += sellVol[t];
    const buyMargin = buyVol[c];
    const sellMargin = sellVol[c];
    const demandPossible = demandAbove + buyMargin;
    const supplyPossible = supplyBelow + sellMargin;
    const matched = demandPossible < supplyPossible ? demandPossible : supplyPossible;
    if (matched <= best.matched) continue;
    let buyBps = BPS;
    let sellBps = BPS;
    if (matched < demandPossible) {
      const need = matched - demandAbove;
      buyBps = buyMargin > 0n ? (need * BPS) / buyMargin : 0n;
    }
    if (matched < supplyPossible) {
      const need = matched - supplyBelow;
      sellBps = sellMargin > 0n ? (need * BPS) / sellMargin : 0n;
    }
    best = { tick: c, buyBps: Number(buyBps), sellBps: Number(sellBps), matched };
  }
  return best;
}
