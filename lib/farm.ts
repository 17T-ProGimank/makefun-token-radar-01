// Launch Radar v2 — costed farm plans.
//
// Every board row carries a 7-step plan. The steps are built from the
// protocol's own record (name, category, main chain, TVL band), and every
// step names what it costs and how long it takes. Gas figures are typical
// per-transaction costs for each chain as of November 2026, stated as
// assumptions in docs/methodology.md; they are not fetched live, because
// the entry runs with no network. Capital is sized to the protocol's TVL
// band, so a plan for a $2B protocol asks for more than one for a $6M
// protocol. The same builder runs in main.ts (for board.json) and in the
// dashboard's app.js (for the detail view), so the page and the board
// always show the same plan.

import type { SnapshotProtocol } from './model.ts';
import { mainChain } from './model.ts';

export type GasKind = 'approve' | 'swap' | 'deposit' | 'claim' | 'bridge' | 'stake';

const GAS: Record<string, Record<GasKind, number>> = {
  Ethereum: { approve: 1.5, swap: 4, deposit: 5, claim: 3, bridge: 8, stake: 3.5 },
  Solana: { approve: 0.02, swap: 0.03, deposit: 0.03, claim: 0.02, bridge: 0.05, stake: 0.02 },
  Base: { approve: 0.05, swap: 0.15, deposit: 0.2, claim: 0.1, bridge: 0.3, stake: 0.15 },
  Arbitrum: { approve: 0.05, swap: 0.15, deposit: 0.2, claim: 0.1, bridge: 0.3, stake: 0.15 },
  Optimism: { approve: 0.05, swap: 0.15, deposit: 0.2, claim: 0.1, bridge: 0.3, stake: 0.15 },
  BSC: { approve: 0.05, swap: 0.15, deposit: 0.15, claim: 0.1, bridge: 0.25, stake: 0.1 },
  Polygon: { approve: 0.02, swap: 0.05, deposit: 0.08, claim: 0.05, bridge: 0.15, stake: 0.05 },
  Avalanche: { approve: 0.1, swap: 0.3, deposit: 0.35, claim: 0.2, bridge: 0.5, stake: 0.25 },
};

const GAS_DEFAULT: Record<GasKind, number> = {
  approve: 0.5,
  swap: 0.5,
  deposit: 0.6,
  claim: 0.4,
  bridge: 1,
  stake: 0.5,
};

export function gasCost(chain: string, kind: GasKind): number {
  const table = GAS[chain] ?? GAS_DEFAULT;
  return table[kind] ?? GAS_DEFAULT[kind];
}

// The core action per category: what a farmer actually does, twice over,
// and what they do to exit. Each triple is [do it, do it again, exit].
const VERBS: Record<string, [string, string, string]> = {
  Dexs: ['swap', 'add liquidity to a pool', 'remove liquidity'],
  Lending: ['supply collateral', 'borrow against it', 'repay the loan'],
  'Liquid Staking': ['stake', 'use the liquid staking token in DeFi', 'unstake'],
  Yield: ['deposit into a vault', 'harvest the yield', 'withdraw from the vault'],
  RWA: ['buy the tokenized asset', 'hold it through a full accrual cycle', 'redeem it'],
  Derivatives: ['open a small perpetual position', 'add margin', 'close the position'],
  Bridge: ['bridge assets in', 'use the bridged assets on the destination chain', 'bridge back'],
  'Yield Aggregator': ['deposit into a strategy vault', 'claim the strategy rewards', 'withdraw from the strategy'],
  'Risk Curators': ['deposit into a curated vault', 'review the curator allocation', 'withdraw from the vault'],
  CDP: ['lock collateral and mint the stablecoin', 'hold the minted stablecoin', 'repay and unlock the collateral'],
  'Prediction Market': ['place a small prediction trade', 'add to the position as the market moves', 'settle the position'],
  'Onchain Capital Allocator': ['deposit into an allocation vault', 'track the allocator performance', 'withdraw from the vault'],
  'Collateral Markets': ['supply collateral', 'borrow against the position', 'close the position'],
  Restaking: ['restake the position', 'delegate to an operator', 'withdraw the restake'],
  'Staking Pool': ['stake in the pool', 'compound the rewards', 'unstake'],
  Options: ['buy a small call or put', 'manage the position to expiry', 'close the option'],
  Farm: ['deposit into the farm', 'harvest the rewards', 'withdraw from the farm'],
  'Liquid Restaking': ['restake the liquid token', 'use it as collateral', 'unstake'],
  Insurance: ['buy cover for a position', 'hold the cover to expiry', 'claim if an event occurs'],
  Payments: ['route a payment through the protocol', 'use it for a recurring payment', 'settle the balance'],
};

function verbsFor(category: string | null): [string, string, string] {
  return VERBS[category ?? ''] ?? ['use the protocol', 'repeat the core action with a second deposit', 'withdraw'];
}

/** Suggested deposit, sized to the protocol's TVL band. */
export function depositSize(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 1000;
  if (tvlUsd >= 100_000_000) return 500;
  if (tvlUsd >= 10_000_000) return 250;
  return 100;
}

export function fmtCost(x: number): string {
  if (x < 10) {
    const s = x.toFixed(2).replace(/\.?0+$/, '') || '0';
    return '$' + s;
  }
  return '$' + String(Math.round(x));
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface FarmPlan {
  steps: string[];
  cost: number;
}

/** Seven costed steps for one protocol, plus the plan's total cash cost. */
export function farmPlan(p: SnapshotProtocol): FarmPlan {
  const name = p.name;
  const cat = p.category ?? 'DeFi';
  const chain = mainChain(p);
  const cap = depositSize(p.tvl_usd);
  const [v1, v2, v3] = verbsFor(p.category);
  const gb = gasCost(chain, 'bridge');
  const ga = gasCost(chain, 'approve');
  const gd = gasCost(chain, 'deposit');
  const gc = gasCost(chain, 'claim');
  const steps = [
    `Bridge ${fmtCost(cap)} of USDC to ${chain}, the chain this plan uses for ${name}; skip this step if your USDC is already there, and the ${fmtCost(gb)} fee drops out of the plan's cost. Cost: about ${fmtCost(gb)} in bridge fees. Time: 10-20 minutes.`,
    `Connect a fresh wallet to ${name} on ${chain} and approve USDC for its contracts. Cost: about ${fmtCost(ga)} in gas. Time: 5 minutes.`,
    `${capFirst(v1)} on ${name} (${cat} on ${chain}) with ${fmtCost(cap)} of USDC. Cost: about ${fmtCost(gd)} in gas plus the ${fmtCost(cap)} deposit. Time: 10 minutes.`,
    `${capFirst(v2)} a second time with half the first amount (${fmtCost(cap / 2)}) a week later, so the position shows repeat use rather than one deposit. Cost: about ${fmtCost(gd)} in gas. Time: 10 minutes, one week after step 3.`,
    `Keep the position open for at least 4 weeks and ${v1} once more in week 3, keeping a steady balance instead of depositing and withdrawing the same day. Cost: about ${fmtCost(gd)} in gas. Time: 4 weeks of holding.`,
    `Check ${name} for a points, rewards or eligibility page and confirm the wallet address shows activity; screenshot the page for your records. Cost: free. Time: 10 minutes.`,
    `If ${name} lists a token, claim through its official claim page and ${v3} only after claiming, so the claim is not lost to an early exit. Cost: about ${fmtCost(gc)} in gas. Time: 15 minutes on listing day.`,
  ];
  const cost = Math.round((cap + gb + ga + gd * 3 + gc) * 100) / 100;
  return { steps, cost };
}
