export const GLOSSARY = {
  tick: "A discrete price level on the orderbook. Veil uses 4 ticks at fixed prices around the mid (3,400 / 3,410 / 3,420 / 3,430 vUSDC per vWETH). Picking a tick is how you express your limit price without revealing it.",
  marginalBps:
    "Marginal fill rate at the clearing tick, in basis points (10,000 = 100%). When demand and supply don't match exactly at the clearing tick, orders at that tick get pro-rata filled by this fraction.",
  clearingPrice:
    "The single uniform price that settles the batch. Computed off-chain by the keeper from public per-tick aggregates after closeBatch, then submitted on-chain. Every filled order at this batch trades at this same price.",
  healthFactor:
    "Whether your borrowed amount is still below the LTV ceiling on your encrypted collateral. The vault recomputes this homomorphically — debt > (collateral × price × LTV / 10,000) means liquidatable. Reveal-position shows it as OK or Liquidatable.",
  ltv: "Loan-to-value, in basis points. Vault is fixed at 7,500 (75%): for every 1 vWETH of collateral at the 3,400 price, you can borrow up to 2,550 vUSDC.",
  utilization:
    "Your borrowed vUSDC as a fraction of your max-borrow ceiling. 0% means no debt; 100% means you're at the LTV limit and one price tick away from liquidation.",
  operator:
    "ERC-7984 operator — an address you authorize to call confidentialTransferFrom on your behalf. Veil and the vault need operator approval before they can pull encrypted token amounts from your wallet.",
};
