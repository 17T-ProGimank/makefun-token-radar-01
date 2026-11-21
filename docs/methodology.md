# Launch Radar v2 — Methodology

## What the board is

The board ranks **all 342 protocols in the sealed snapshot that record no
token** (both `gecko_id` and `symbol` null), by implied launch value. It
covers the whole 40-protocol watchlist, plus the 302 other pre-token
protocols — the watchlist is the floor, never the ceiling. The 416
protocols that record a token are not ranked rows: their launch already
happened, so their value is realised, not implied. They appear as
**anchors** — the 128 of them that record a market cap are what the value
model is fitted on, and the dashboard's Anchors tab shows each one's fitted
value beside its actual market cap, so the fit can be checked against
reality.

Data: DefiLlama snapshot sealed for this competition, `as_of` 2026-11-14,
758 protocols at or above $5,000,000 TVL, floor $50,000,000. The snapshot
never moves; every run of the program reads the same bytes, and the program
re-fits both models from it at run time. Nothing in the board comes from a
hand-kept list of names.

**Language that matters.** The snapshot says a protocol *records no
token*, never that it *has* none: a protocol may hold a token its
DefiLlama record does not carry. The board's implied values are this
entry's own claim, fitted from the snapshot, never make.fun's. No part of
the board predicts whether or when a token is issued.

## The model

```
implied_value_usd = fitted_launch_value × P(token ever lists) × own_token_share
```

Three terms, each with its own job:

### 1. Fitted launch value — log-linear, fitted on the anchors

```
log10(market cap) = 1.7916
  + 0.5842 · log10(TVL)
  + 0.3054 · log10(age in days + 1)
  − 0.0803 · log10(number of chains)
  − 0.3062 · growth_7d (signed log1p of the 7-day change)
  + category terms: Dexs +0.1143, Lending −0.6730, Liquid Staking −0.6118,
    Yield −0.1546, RWA +0.0175, Derivatives +0.4419, Bridge +0.1983,
    Yield Aggregator −0.5108 (other categories 0)
```

Fitted by least squares on the 128 anchors (traded protocols with a
market cap), with **two rounds of 2-sigma residual trimming** (16 anchors
dropped in all). Trimming is needed because market-cap/TVL in the anchors
spans 0.001× to 400×: a handful of wild ratios (one anchor at 400×) would
otherwise drag the whole fit. Age is days since DefiLlama began tracking
the protocol; protocols with no `listed_at` take the median age (677
days). Growth is winsorised through a signed log1p, so the single +4,448%
7-day change in the snapshot cannot dominate. Coefficients are printed to
four decimals here; the program uses full precision.

Full fit on the 128 anchors: **R² 0.212, MAE 0.663 in log10 (×4.6 in
dollars)**. That is a weak fit in absolute terms, and it is reported as
one: the relationship between TVL and market cap is genuinely noisy. What
the fit does capture is the median relationship — a protocol ten times
larger is worth about 10^0.58 ≈ 3.8× more — and that is what the ranking
is built on. The dollar figures are order-of-magnitude claims; the
ranking is the product, not the precision.

### 2. Listing odds — logistic, fitted on all 758 protocols

P(a protocol ever lists a token), fitted by logistic regression on all 758
protocols (listed = 1, not listed = 0), with the four continuous features
standardised and an L2 penalty (λ = 1, 3,000 gradient steps):

```
const −0.200, logTVL* +0.111, logAge* +0.579, logChains* +0.110,
growth* −0.471, Dexs +1.410, Lending +1.370, Liquid Staking +0.018,
Yield +0.756, RWA +0.340, Derivatives +0.427, Bridge −0.105,
Yield Aggregator +0.517
```

Age dominates: the longer a protocol has run, the more likely it is to
have listed. The median odds on the board is 0.48.

### 3. Own-token share — structural, from the snapshot's own rule

Not a fitted term. It follows the watchlist's own definition of what
counts as a standalone launch candidate:

| Protocol | Share | Board rows |
| --- | --- | --- |
| Standalone protocol | 1.00 | 198 |
| Centralised exchange (CEX) | 0.10 | 42 |
| Wrapped, staked or bridged product, or a versioned deployment (`V2`, `2.0`, …) | 0.05 | 102 |

A wrapped product (WBTC is Bitcoin on Ethereum) or a versioned deployment
(LayerZero v2 belongs to a parent whose token already trades) is not a
protocol waiting on a launch of its own. A centralised exchange is not a
protocol a reader can farm on-chain. The smallest applicable share wins.

## Held-out tests

Both fitted terms are tested held-out twice (two deterministic sha-256
splits, 1 in 5 held out, fit on the train split only), plus once
walk-forward (train on protocols tracked before 2025-06-01, test after).
Each value test is scored twice: on every held-out anchor, and on the
held-out anchors whose mcap/TVL lies inside [0.005, 5] — the handful
outside that band are data oddities that swamp any R².

| Test | Value R² (all) | Value R² (trimmed) | Value MAE | Odds AUC |
| --- | --- | --- | --- | --- |
| Split A (n=28 / 163) | −0.15 | 0.403 | ×6.2 / ×3.8 | 0.749 |
| Split B (n=29 / 157) | 0.305 | 0.382 | ×5.7 / ×4.6 | 0.656 |
| Walk-forward (n=20 / 244) | −1.281 | −0.67 | ×11.6 / ×5.1 | 0.579 |

Read honestly: on the trimmed anchors the value model explains about
40% of the variance in log market cap, with a typical error of ×4–5 in
dollars. On all anchors the R² is dragged below zero by the extreme-ratio
outliers — the model does not predict those, and no TVL model could. The
walk-forward test is the warning: a model fitted on pre-June-2025
protocols does not predict post-June-2025 listings (R² −1.28). The board
is a ranking built on the median relationship, not a pricing engine.

The growth term deserves a note: its fitted coefficient is negative in
both models (−0.31 in the value model, −0.47 standardised in the odds
model). In this snapshot the market fell (median 7-day change −8.2%) and
the fastest growers are small, young protocols whose tokens have not
listed; once TVL and age are controlled, growth adds almost nothing
(dropping it moves holdout R² by ~0.02–0.04). It is kept because the brief
names it, winsorised so the +4,448% outlier cannot dominate.

## Worked examples (verified)

**#1 — Steakhouse Financial** (Risk Curators, TVL $2,753,981,495,
11 chains, 543 days tracked, 7-day change −2.19%):

```
log10(mcap) = 1.7916 + 0.5842·9.4400 + 0.3054·2.7356 − 0.0803·1.0414
              − 0.3062·(−0.0217) + 0 (Risk Curators is not a dummy category)
            = 8.0649  →  fitted value ≈ $116.1M
odds: z = 0.1022  →  P(list) = 0.5255;  share = 1.00
implied = $116,151,399 × 0.5255 × 1.00 = $61,035,126
```

**#6 — Polymarket International** (Prediction Market, TVL $320,193,439,
1 chain, 1,845 days, 7-day change −1.08%):

```
log10(mcap) = 1.7916 + 0.5842·8.5054 + 0.3054·3.2662 − 0.0803·0
              − 0.3062·(−0.0108) + 0 = 7.7613  →  fitted ≈ $57.7M
odds: z = 0.4450  →  P(list) = 0.6097;  share = 1.00
implied = $57,719,571 × 0.6097 × 1.00 = $35,191,361
```

Both recompute from the four-decimal coefficients printed above to within
0.03% of the board's figures; the board uses the program's full-precision
coefficients. The farm plan for Steakhouse Financial needs $1,027.50 in
total ($1,000 deposit + $27.50 in fees, Ethereum gas); Polymarket
International needs $500.46 ($500 deposit + $0.46 in fees, Polygon gas).

## Farm plans — costed, per row

Every row carries 7 steps, each 20–600 characters, built from the
protocol's own record (name, category, main chain, TVL band) by the same
builder in `lib/farm.ts` (board.json) and in the dashboard's `app.js`
(detail view), so the page and the board always show the same plan:

1. Bridge the deposit to the protocol's main chain (bridge fee).
2. Connect a fresh wallet and approve USDC (approval gas).
3. Do the core action once, with the full deposit (deposit gas).
4. Do a second action a week later, with half the amount (repeat use).
5. Hold at least 4 weeks, acting once more in week 3 (no same-day in/out).
6. Check the protocol's points/rewards page and confirm the wallet shows
   activity (free).
7. On listing day, claim through the official claim page before exiting
   (claim gas).

Capital is sized to the TVL band: $1,000 at TVL ≥ $1B, $500 at ≥ $100M,
$250 at ≥ $10M, $100 below. Gas is a typical per-transaction cost per
chain (November 2026): Ethereum approve $1.50 / deposit $5.00 / bridge
$8.00; Solana ~$0.02–0.05; Base/Arbitrum/Optimism $0.05–0.30; BSC
$0.05–0.25; Polygon $0.02–0.15; Avalanche $0.10–0.50; other chains
$0.40–1.00. These are stated assumptions, not live quotes — the entry
runs with no network. Total cash to start a plan (deposit + fees) runs
$100.18–$1,027.50 across the board; the fees alone are $0.18–$27.50.

## The dashboard

A single page, no network: KPI strip (342 pre-token rows, 40/40 watchlist,
758 protocols, median implied $1,585,504, value R², odds AUC), an
integrity strip stating the method and the "records no token" caveat, a
sortable/filterable board (search, category, minimum TVL, watchlist-only),
a detail view per protocol (model terms + the 7 costed steps), and an
Anchors & calibration tab (holdout tables + the 40 largest anchors, fitted
vs actual). The dashboard source is kept small enough that the dossier's
text holds the page's logic whole; the board data follows it, one row per
line, up to the 65,536-byte text cap.

## Self-test

`main.ts` refuses to write output unless: the board holds at least 100
rows, every watchlist slug is covered, every row's farm plan holds 7 steps
of 20–600 characters, and every implied value is a positive whole number.
The program runs twice and both runs must write the same bytes (fixed
splits, fixed iteration counts, no clock, no randomness). Run it with:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## Limitations

- The value model is weak in absolute terms (R² 0.21 in-sample); the
  ranking is the product, the dollar figures are order-of-magnitude.
- The walk-forward test fails: the model does not transport across time.
- Growth's fitted effect is negative in this snapshot; it is reported,
  not hidden.
- Gas figures are typical costs, not live quotes; a listing's real cost
  depends on the day.
- "Records no token" is DefiLlama's record, not proof — a protocol on the
  board may already have a token its record does not carry.
