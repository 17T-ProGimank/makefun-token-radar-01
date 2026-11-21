// Launch Radar v2 — the fitted value model.
//
// The model is fitted at run time from the sealed snapshot, never from a
// hand-kept list of names. Two terms, each fitted and tested held-out:
//
//   1. value:  log10(market cap) of a traded token, fitted by least squares
//              on the protocols that record a token and a market cap
//              (the anchors), with two rounds of 2-sigma residual trimming,
//              because market-cap/TVL spans 0.001x to 400x and a few wild
//              ratios would otherwise drag the whole fit.
//   2. odds:   P(a protocol ever lists a token), fitted by logistic
//              regression on all 758 protocols (listed vs not), with
//              standardised features and an L2 penalty.
//
// implied_value = 10^fitted_log_mcap * odds * own_token_share, where the
// share is a structural factor from the snapshot's own watchlist rule:
// a wrapped, staked or bridged product, or a versioned deployment, is not
// a standalone launch, and a centralised exchange is not a protocol a
// reader can farm on-chain. Every term is reported with its holdout test
// in the board metadata and in docs/methodology.md.

import { createHash } from 'node:crypto';

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  status: 'pre-token' | 'traded';
  mcap_usd: number | null;
  fitted_value_usd: number;
  list_odds: number;
  share_factor: number;
  implied_value_usd: number;
  rank: number;
  farm_steps: string[];
  est_cost_usd: number;
}

export interface HoldoutResult {
  split: string;
  n_train: number;
  n_test: number;
  r2: number;
  mae_log10: number;
  /** Same test, excluding anchors whose mcap/TVL lies outside [0.005, 5]. */
  n_trimmed: number;
  r2_trimmed: number;
  mae_trimmed_log10: number;
}

export interface OddsHoldout {
  split: string;
  n_train: number;
  n_test: number;
  auc: number;
}

export interface ModelReport {
  value_coefficients: Record<string, number>;
  value_full_r2: number;
  value_full_mae_log10: number;
  value_anchors: number;
  value_trimmed_out: number;
  value_holdouts: HoldoutResult[];
  value_walk_forward: HoldoutResult;
  odds_coefficients: Record<string, number>;
  odds_holdouts: OddsHoldout[];
  odds_walk_forward: OddsHoldout;
  median_age_days: number;
}

export const TOP_CATEGORIES = [
  'Dexs',
  'Lending',
  'Liquid Staking',
  'Yield',
  'RWA',
  'Derivatives',
  'Bridge',
  'Yield Aggregator',
] as const;

const WRAPPED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function ageDays(asOf: string, p: SnapshotProtocol): number | null {
  if (!p.listed_at) return null;
  const a = Date.parse(asOf + 'T00:00:00Z');
  const b = Date.parse(p.listed_at + 'T00:00:00Z');
  return Math.max(0, Math.round((a - b) / 86400000));
}

/** 7-day growth as a signed log1p fraction, so one +4,448% outlier cannot dominate. */
export function growthFeature(p: SnapshotProtocol): number {
  const c = p.change_7d === null ? 0 : p.change_7d / 100;
  return Math.log1p(Math.max(0, c)) - Math.log1p(Math.max(0, -c));
}

function featuresOf(
  p: SnapshotProtocol,
  asOf: string,
  medianAge: number,
): number[] {
  const a = ageDays(asOf, p);
  const age = a === null ? medianAge : a;
  const out: number[] = [
    1,
    Math.log10(p.tvl_usd),
    Math.log10(age + 1),
    Math.log10(p.chains.length),
    growthFeature(p),
  ];
  for (const c of TOP_CATEGORIES) out.push(p.category === c ? 1 : 0);
  return out;
}

export const VALUE_FEATURE_NAMES = [
  'const',
  'logTVL',
  'logAge',
  'logChains',
  'growth',
  ...TOP_CATEGORIES,
];

/** Least squares by the normal equations with Gaussian elimination. */
export function ols(X: number[][], y: number[]): number[] {
  const n = X.length;
  const k = X[0].length;
  const A: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row: number[] = [];
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += X[t][i] * X[t][j];
      row.push(s);
    }
    let s = 0;
    for (let t = 0; t < n; t++) s += X[t][i] * y[t];
    row.push(s);
    A.push(row);
  }
  for (let i = 0; i < k; i++) A[i][i] += 1e-8;
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    const tmp = A[c];
    A[c] = A[piv];
    A[piv] = tmp;
    const d = A[c][c];
    for (let j = 0; j <= k; j++) A[c][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === c || A[r][c] === 0) continue;
      const f = A[r][c];
      for (let j = 0; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row) => row[k]);
}

export function predict(beta: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i] * x[i];
  return s;
}

export function rSquared(y: number[], yh: number[]): number {
  const m = y.reduce((a, b) => a + b, 0) / y.length;
  let ss = 0;
  let st = 0;
  for (let i = 0; i < y.length; i++) {
    ss += (y[i] - yh[i]) ** 2;
    st += (y[i] - m) ** 2;
  }
  return st === 0 ? 0 : 1 - ss / st;
}

export function mae(y: number[], yh: number[]): number {
  let s = 0;
  for (let i = 0; i < y.length; i++) s += Math.abs(y[i] - yh[i]);
  return s / y.length;
}

function stddev(vals: number[]): number {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  let s = 0;
  for (const v of vals) s += (v - m) ** 2;
  return Math.sqrt(s / vals.length);
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Fit log10(mcap) on the anchors with two rounds of 2-sigma residual
 * trimming. Returns the coefficients and how many anchors trimming dropped.
 */
export function fitValueModel(
  anchors: SnapshotProtocol[],
  asOf: string,
  medianAge: number,
): { beta: number[]; dropped: number } {
  let keep = [...anchors];
  let dropped = 0;
  for (let round = 0; round < 2; round++) {
    const X = keep.map((p) => featuresOf(p, asOf, medianAge));
    const y = keep.map((p) => Math.log10(p.mcap_usd as number));
    const beta = ols(X, y);
    const res = keep.map((p, i) => y[i] - predict(beta, X[i]));
    const sd = stddev(res);
    const next = keep.filter((_, i) => Math.abs(res[i]) <= 2 * sd);
    dropped += keep.length - next.length;
    keep = next;
  }
  const X = keep.map((p) => featuresOf(p, asOf, medianAge));
  const y = keep.map((p) => Math.log10(p.mcap_usd as number));
  return { beta: ols(X, y), dropped };
}

/** Deterministic split key: the sha-256 of the slug, modulo `mod`. */
export function splitKey(slug: string, mod: number): number {
  const hex = createHash('sha256').update(slug, 'utf8').digest('hex');
  let h = 0;
  for (const ch of hex) h = (h * 16 + parseInt(ch, 16)) % mod;
  return h;
}

function sigmoid(z: number): number {
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-c));
}

/**
 * Logistic regression by batch gradient descent: standardised continuous
 * features, L2 penalty on every term but the intercept, fixed steps.
 */
export function fitLogit(
  X: number[][],
  y: number[],
  lambda = 1,
  lr = 0.2,
  iters = 3000,
): number[] {
  const k = X[0].length;
  const w = new Array<number>(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array<number>(k).fill(0);
    for (let t = 0; t < X.length; t++) {
      let z = 0;
      for (let j = 0; j < k; j++) z += w[j] * X[t][j];
      const d = sigmoid(z) - y[t];
      for (let j = 0; j < k; j++) g[j] += d * X[t][j];
    }
    for (let j = 1; j < k; j++) g[j] += lambda * w[j];
    for (let j = 0; j < k; j++) w[j] -= (lr * g[j]) / X.length;
  }
  return w;
}

export function auc(y: number[], s: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  for (let i = 0; i < y.length; i++) (y[i] === 1 ? pos : neg).push(s[i]);
  let c = 0;
  let tot = 0;
  for (const p of pos) {
    for (const n of neg) {
      tot++;
      c += p > n ? 1 : p === n ? 0.5 : 0;
    }
  }
  return tot === 0 ? 0.5 : c / tot;
}

/**
 * The own-token share: a structural factor from the snapshot's own
 * watchlist rule, not a fitted term. A wrapped, staked or bridged product
 * is a product of a token that already trades, a versioned deployment
 * belongs to a parent whose token already trades, and a centralised
 * exchange is not a protocol a reader can farm on-chain.
 */
export function ownTokenShare(p: SnapshotProtocol): number {
  let f = 1;
  if (WRAPPED_CATEGORIES.has(p.category as string) || WRAPPED_WORD.test(p.name)) {
    f = Math.min(f, 0.05);
  }
  if (VERSION_MARKER.test(p.name)) f = Math.min(f, 0.05);
  if (p.category === 'CEX') f = Math.min(f, 0.1);
  return f;
}

export function mainChain(p: SnapshotProtocol): string {
  const pref = ['Ethereum', 'Solana', 'Base', 'Arbitrum', 'Optimism', 'BSC', 'Polygon', 'Avalanche'];
  for (const c of pref) if (p.chains.includes(c)) return c;
  return p.chains.length > 0 ? p.chains[0] : 'Ethereum';
}

export interface FittedBoard {
  rows: BoardRow[];
  report: ModelReport;
  anchors: {
    slug: string;
    name: string;
    tvl_usd: number;
    mcap_usd: number;
    fitted_value_usd: number;
  }[];
}

/**
 * Fit both models, test each held-out twice plus once walk-forward by
 * listed_at, then rank every protocol that records no token.
 */
export function buildBoard(
  snap: Snapshot,
  farmSteps: (p: SnapshotProtocol) => { steps: string[]; cost: number },
): FittedBoard {
  const asOf = snap.as_of;
  const prots = snap.protocols;
  const knownAges = prots
    .map((p) => ageDays(asOf, p))
    .filter((a): a is number => a !== null);
  const medianAge = median(knownAges);

  const anchors = prots.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const { beta, dropped } = fitValueModel(anchors, asOf, medianAge);
  const anchorX = anchors.map((p) => featuresOf(p, asOf, medianAge));
  const anchorY = anchors.map((p) => Math.log10(p.mcap_usd as number));
  const anchorYh = anchorX.map((x) => predict(beta, x));
  const valueFullR2 = rSquared(anchorY, anchorYh);
  const valueFullMae = mae(anchorY, anchorYh);

  // Value holdouts: two deterministic slug-hash splits, fit on train only.
  // Each is scored twice: on every held-out anchor, and on the held-out
  // anchors whose mcap/TVL lies inside [0.005, 5] — the handful outside
  // that band (ratios up to 400x) are data oddities that swamp any R².
  const trimHoldout = (
    te: SnapshotProtocol[],
    b: number[],
  ): { n_trimmed: number; r2_trimmed: number; mae_trimmed_log10: number } => {
    const t2 = te.filter((p) => {
      const ratio = (p.mcap_usd as number) / p.tvl_usd;
      return ratio >= 0.005 && ratio <= 5;
    });
    const yt2 = t2.map((p) => Math.log10(p.mcap_usd as number));
    const yh2 = t2.map((p) => predict(b, featuresOf(p, asOf, medianAge)));
    return {
      n_trimmed: t2.length,
      r2_trimmed: Math.round(rSquared(yt2, yh2) * 1000) / 1000,
      mae_trimmed_log10: Math.round(mae(yt2, yh2) * 1000) / 1000,
    };
  };
  const valueHoldouts: HoldoutResult[] = [];
  for (const [mod, want, label] of [
    [5, 0, 'split A (1 in 5 held out)'],
    [5, 1, 'split B (1 in 5 held out)'],
  ] as const) {
    const te = anchors.filter((p) => splitKey(p.slug, mod) === want);
    const tr = anchors.filter((p) => splitKey(p.slug, mod) !== want);
    const b = fitValueModel(tr, asOf, medianAge).beta;
    const yt = te.map((p) => Math.log10(p.mcap_usd as number));
    const yh = te.map((p) => predict(b, featuresOf(p, asOf, medianAge)));
    valueHoldouts.push({
      split: label,
      n_train: tr.length,
      n_test: te.length,
      r2: Math.round(rSquared(yt, yh) * 1000) / 1000,
      mae_log10: Math.round(mae(yt, yh) * 1000) / 1000,
      ...trimHoldout(te, b),
    });
  }
  // Walk-forward: train on protocols tracked before 2025-06-01, test after.
  const wfTr = anchors.filter((p) => p.listed_at !== null && p.listed_at < '2025-06-01');
  const wfTe = anchors.filter((p) => p.listed_at !== null && p.listed_at >= '2025-06-01');
  const wfBeta = fitValueModel(wfTr, asOf, medianAge).beta;
  const wfYt = wfTe.map((p) => Math.log10(p.mcap_usd as number));
  const wfYh = wfTe.map((p) => predict(wfBeta, featuresOf(p, asOf, medianAge)));
  const valueWalkForward: HoldoutResult = {
    split: 'walk-forward (train listed before 2025-06-01)',
    n_train: wfTr.length,
    n_test: wfTe.length,
    r2: Math.round(rSquared(wfYt, wfYh) * 1000) / 1000,
    mae_log10: Math.round(mae(wfYt, wfYh) * 1000) / 1000,
    ...trimHoldout(wfTe, wfBeta),
  };

  // Odds model: standardise the four continuous features on all 758.
  const logitRaw = prots.map((p) => {
    const a = ageDays(asOf, p);
    const age = a === null ? medianAge : a;
    return [
      Math.log10(p.tvl_usd),
      Math.log10(age + 1),
      Math.log10(p.chains.length),
      growthFeature(p),
      ...TOP_CATEGORIES.map((c) => (p.category === c ? 1 : 0)),
    ];
  });
  const mu: number[] = [];
  const sd: number[] = [];
  for (let j = 0; j < 4; j++) {
    const col = logitRaw.map((r) => r[j]);
    const m = col.reduce((a, b) => a + b, 0) / col.length;
    mu.push(m);
    sd.push(stddev(col) || 1);
  }
  const logitX = logitRaw.map((r) => [
    1,
    ...[0, 1, 2, 3].map((j) => (r[j] - mu[j]) / sd[j]),
    ...r.slice(4),
  ]);
  const listed = prots.map((p) => (isPreToken(p) ? 0 : 1));
  const wLogit = fitLogit(logitX, listed);
  const oddsOf = (i: number): number => {
    let z = 0;
    for (let j = 0; j < wLogit.length; j++) z += wLogit[j] * logitX[i][j];
    return sigmoid(z);
  };

  const oddsHoldouts: OddsHoldout[] = [];
  for (const [mod, want, label] of [
    [5, 0, 'split A (1 in 5 held out)'],
    [5, 1, 'split B (1 in 5 held out)'],
  ] as const) {
    const tri = prots.map((_, i) => i).filter((i) => splitKey(prots[i].slug, mod) !== want);
    const tei = prots.map((_, i) => i).filter((i) => splitKey(prots[i].slug, mod) === want);
    const w = fitLogit(tri.map((i) => logitX[i]), tri.map((i) => listed[i]));
    const s = tei.map((i) => {
      let z = 0;
      for (let j = 0; j < w.length; j++) z += w[j] * logitX[i][j];
      return sigmoid(z);
    });
    oddsHoldouts.push({ split: label, n_train: tri.length, n_test: tei.length, auc: auc(tei.map((i) => listed[i]), s) });
  }
  const odTr = prots.map((_, i) => i).filter((i) => prots[i].listed_at !== null && (prots[i].listed_at as string) < '2025-06-01');
  const odTe = prots.map((_, i) => i).filter((i) => prots[i].listed_at !== null && (prots[i].listed_at as string) >= '2025-06-01');
  const odW = fitLogit(odTr.map((i) => logitX[i]), odTr.map((i) => listed[i]));
  const odS = odTe.map((i) => {
    let z = 0;
    for (let j = 0; j < odW.length; j++) z += odW[j] * logitX[i][j];
    return sigmoid(z);
  });
  const oddsWalkForward: OddsHoldout = {
    split: 'walk-forward (train listed before 2025-06-01)',
    n_train: odTr.length,
    n_test: odTe.length,
    auc: auc(odTe.map((i) => listed[i]), odS),
  };

  const valueCoefficients: Record<string, number> = {};
  VALUE_FEATURE_NAMES.forEach((n, i) => {
    valueCoefficients[n] = Math.round(beta[i] * 10000) / 10000;
  });
  const oddsNames = ['const', 'logTVL*', 'logAge*', 'logChains*', 'growth*', ...TOP_CATEGORIES];
  const oddsCoefficients: Record<string, number> = {};
  oddsNames.forEach((n, i) => {
    oddsCoefficients[n] = Math.round(wLogit[i] * 10000) / 10000;
  });

  const report: ModelReport = {
    value_coefficients: valueCoefficients,
    value_full_r2: Math.round(valueFullR2 * 1000) / 1000,
    value_full_mae_log10: Math.round(valueFullMae * 1000) / 1000,
    value_anchors: anchors.length,
    value_trimmed_out: dropped,
    value_holdouts: valueHoldouts.map((h) => ({ ...h, r2: Math.round(h.r2 * 1000) / 1000, mae_log10: Math.round(h.mae_log10 * 1000) / 1000 })),
    value_walk_forward: { ...valueWalkForward, r2: Math.round(valueWalkForward.r2 * 1000) / 1000, mae_log10: Math.round(valueWalkForward.mae_log10 * 1000) / 1000 },
    odds_coefficients: oddsCoefficients,
    odds_holdouts: oddsHoldouts.map((h) => ({ ...h, auc: Math.round(h.auc * 1000) / 1000 })),
    odds_walk_forward: { ...oddsWalkForward, auc: Math.round(oddsWalkForward.auc * 1000) / 1000 },
    median_age_days: medianAge,
  };

  const rows: BoardRow[] = [];
  prots.forEach((p, i) => {
    if (!isPreToken(p)) return;
    const fitted = 10 ** predict(beta, featuresOf(p, asOf, medianAge));
    const odds = oddsOf(i);
    const share = ownTokenShare(p);
    const implied = Math.max(1, Math.round(fitted * odds * share));
    const plan = farmSteps(p);
    rows.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(asOf, p),
      status: 'pre-token',
      mcap_usd: null,
      fitted_value_usd: Math.round(fitted),
      list_odds: Math.round(odds * 10000) / 10000,
      share_factor: share,
      implied_value_usd: implied,
      rank: 0,
      farm_steps: plan.steps,
      est_cost_usd: plan.cost,
    });
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd >= rows[i - 1].implied_value_usd) {
      rows[i].implied_value_usd = rows[i - 1].implied_value_usd - 1;
    }
    if (rows[i].implied_value_usd < 1) rows[i].implied_value_usd = 1;
  }
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const anchorRows = anchors
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      fitted_value_usd: Math.round(10 ** predict(beta, featuresOf(p, asOf, medianAge))),
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd);

  return { rows, report, anchors: anchorRows };
}
