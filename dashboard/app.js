// Launch Radar v2 — dashboard logic. Renders the board from zdata.js
// (written by main.ts from the same fitted board as board.json), so the
// page and the board always agree. No network: every byte is local.
//
// The farm-plan builder below is the same one as lib/farm.ts, ported
// line for line: the detail view builds a protocol's 7 steps from its own
// record (name, category, main chain, TVL band), with the same gas table
// and the same deposit sizing, so the steps shown here are the steps in
// board.json for that row.

const D = window.RADAR_DATA;
const ROWS = D.rows.map((r) => ({
  slug: r[0], name: r[1], category: r[2], chains: r[3] ? r[3].split('+') : [],
  tvl: r[4], chg: r[5], age: r[6], fitted: r[7], odds: r[8],
  share: r[9], implied: r[10],
}));
const WATCH = new Set(D.watchlist || []);
const fmt$ = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B'
  : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + n;
const fmtInt = (n) => n.toLocaleString('en-US');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- farm plan (same builder as lib/farm.ts) ----
const GAS = {
  Ethereum: { approve: 1.5, swap: 4, deposit: 5, claim: 3, bridge: 8, stake: 3.5 },
  Solana: { approve: 0.02, swap: 0.03, deposit: 0.03, claim: 0.02, bridge: 0.05, stake: 0.02 },
  Base: { approve: 0.05, swap: 0.15, deposit: 0.2, claim: 0.1, bridge: 0.3, stake: 0.15 },
  Arbitrum: { approve: 0.05, swap: 0.15, deposit: 0.2, claim: 0.1, bridge: 0.3, stake: 0.15 },
  Optimism: { approve: 0.05, swap: 0.15, deposit: 0.2, claim: 0.1, bridge: 0.3, stake: 0.15 },
  BSC: { approve: 0.05, swap: 0.15, deposit: 0.15, claim: 0.1, bridge: 0.25, stake: 0.1 },
  Polygon: { approve: 0.02, swap: 0.05, deposit: 0.08, claim: 0.05, bridge: 0.15, stake: 0.05 },
  Avalanche: { approve: 0.1, swap: 0.3, deposit: 0.35, claim: 0.2, bridge: 0.5, stake: 0.25 },
};
const GAS_DEF = { approve: 0.5, swap: 0.5, deposit: 0.6, claim: 0.4, bridge: 1, stake: 0.5 };
const gas = (chain, kind) => (GAS[chain] || GAS_DEF)[kind] ?? GAS_DEF[kind];
const VERBS = {
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
const verbsFor = (cat) => VERBS[cat] || ['use the protocol', 'repeat the core action with a second deposit', 'withdraw'];
const depositSize = (tvl) => tvl >= 1e9 ? 1000 : tvl >= 1e8 ? 500 : tvl >= 1e7 ? 250 : 100;
const fmtCost = (x) => x < 10 ? '$' + (x.toFixed(2).replace(/\.?0+$/, '') || '0') : '$' + Math.round(x);
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const mainChain = (row) => {
  const pref = ['Ethereum', 'Solana', 'Base', 'Arbitrum', 'Optimism', 'BSC', 'Polygon', 'Avalanche'];
  for (const c of pref) if (row.chains.includes(c)) return c;
  return row.chains[0] || 'Ethereum';
};
function farmSteps(row) {
  const name = row.name, cat = row.category || 'DeFi', chain = mainChain(row);
  const cap = depositSize(row.tvl);
  const [v1, v2, v3] = verbsFor(row.category);
  const gb = gas(chain, 'bridge'), ga = gas(chain, 'approve');
  const gd = gas(chain, 'deposit'), gc = gas(chain, 'claim');
  return [
    `Bridge ${fmtCost(cap)} of USDC to ${chain}, the chain this plan uses for ${name}; skip this step if your USDC is already there, and the ${fmtCost(gb)} fee drops out of the plan's cost. Cost: about ${fmtCost(gb)} in bridge fees. Time: 10-20 minutes.`,
    `Connect a fresh wallet to ${name} on ${chain} and approve USDC for its contracts. Cost: about ${fmtCost(ga)} in gas. Time: 5 minutes.`,
    `${capFirst(v1)} on ${name} (${cat} on ${chain}) with ${fmtCost(cap)} of USDC. Cost: about ${fmtCost(gd)} in gas plus the ${fmtCost(cap)} deposit. Time: 10 minutes.`,
    `${capFirst(v2)} a second time with half the first amount (${fmtCost(cap / 2)}) a week later, so the position shows repeat use rather than one deposit. Cost: about ${fmtCost(gd)} in gas. Time: 10 minutes, one week after step 3.`,
    `Keep the position open for at least 4 weeks and ${v1} once more in week 3, keeping a steady balance instead of depositing and withdrawing the same day. Cost: about ${fmtCost(gd)} in gas. Time: 4 weeks of holding.`,
    `Check ${name} for a points, rewards or eligibility page and confirm the wallet address shows activity; screenshot the page for your records. Cost: free. Time: 10 minutes.`,
    `If ${name} lists a token, claim through its official claim page and ${v3} only after claiming, so the claim is not lost to an early exit. Cost: about ${fmtCost(gc)} in gas. Time: 15 minutes on listing day.`,
  ];
}

function farmCost(row) {
  const chain = mainChain(row);
  const cap = depositSize(row.tvl);
  return Math.round((cap + gas(chain, 'bridge') + gas(chain, 'approve') + gas(chain, 'deposit') * 3 + gas(chain, 'claim')) * 100) / 100;
}

// ---- header / strips ----
const M = D.model;
const medImplied = ROWS.map((r) => r.implied).sort((a, b) => a - b)[Math.floor(ROWS.length / 2)];
document.getElementById('meta').textContent =
  `Snapshot: ${D.as_of} (DefiLlama, sealed)\nFloor: $50,000,000 · ${D.rows.length} pre-token rows`;
document.getElementById('kpis').innerHTML = [
  [fmtInt(D.rows.length), 'pre-token protocols ranked'],
  [fmtInt(WATCH.size), 'watchlist covered'],
  [fmtInt(758), 'protocols in snapshot'],
  [fmt$(medImplied), 'median implied value'],
  [(M.value_full_r2 * 100).toFixed(0) + '%', 'value model R² (128 anchors)'],
  [M.odds_holdouts.map((h) => h.auc.toFixed(2)).join(' / '), 'listing-odds AUC, holdouts A / B'],
].map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('');
document.getElementById('integrity-text').textContent =
  ` Every row is a protocol that records no token. Implied value = fitted launch value × odds a token ever lists × own-token share. ` +
  `The value model is a log-linear fit on the 128 traded anchors (R² ${(M.value_full_r2 * 100).toFixed(0)}%, held-out twice); ` +
  `the odds are a logistic fit on all 758 protocols. Gas figures are typical per-transaction costs, not live quotes. ` +
  `See docs/methodology.md for the full method, the holdout tests and the worked examples.`;

// ---- board ----
const PER = 50;
let page = 0, selected = null;
const cats = [...new Set(ROWS.map((r) => r.category).filter(Boolean))].sort();
document.getElementById('cat').innerHTML =
  '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
function filtered() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const cat = document.getElementById('cat').value;
  const minTvl = +document.getElementById('mintvl').value;
  const watchOnly = document.getElementById('watchonly').checked;
  const sort = document.getElementById('sort').value;
  let list = ROWS.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (!cat || r.category === cat) && r.tvl >= minTvl &&
    (!watchOnly || WATCH.has(r.slug)));
  if (sort === 'tvl') list = [...list].sort((a, b) => b.tvl - a.tvl);
  else if (sort === 'age') list = [...list].sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  else if (sort === 'odds') list = [...list].sort((a, b) => b.odds - a.odds);
  return list;
}
function render() {
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PER));
  if (page >= pages) page = pages - 1;
  const slice = list.slice(page * PER, page * PER + PER);
  document.getElementById('count').textContent =
    `${fmtInt(list.length)} of ${fmtInt(ROWS.length)} pre-token protocols shown · click a row for its farm plan`;
  document.getElementById('page').textContent = `Page ${page + 1} of ${pages}`;
  document.getElementById('rows').innerHTML = slice.map((r, i) => {
    const rank = ROWS.indexOf(r) + 1;
    const chg = r.chg === null ? '—' : (r.chg >= 0 ? '+' : '') + r.chg.toFixed(1) + '%';
    const cls = r.chg === null ? '' : r.chg >= 0 ? 'pos' : 'neg';
    return `<tr data-slug="${esc(r.slug)}" class="${selected === r.slug ? 'sel' : ''}">
      <td>${rank}</td>
      <td><strong>${esc(r.name)}</strong>${WATCH.has(r.slug) ? '<span class="tag">WATCHLIST</span>' : ''}<br><span style="color:var(--muted);font-size:12px">${esc(r.slug)}</span></td>
      <td>${esc(r.category || '—')}</td><td>${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''}</td>
      <td class="num">${fmt$(r.tvl)}</td><td class="num ${cls}">${chg}</td>
      <td class="num">${r.age === null ? '—' : Math.round(r.age / 30.4) + ' mo'}</td>
      <td class="num">${fmt$(r.fitted)}</td><td class="num">${(r.odds * 100).toFixed(0)}%</td>
      <td class="num"><strong>${fmt$(r.implied)}</strong></td><td class="num">${'$' + farmCost(r).toFixed(2)}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#rows tr').forEach((tr) =>
    tr.addEventListener('click', () => showDetail(tr.dataset.slug)));
}
function showDetail(slug) {
  selected = slug;
  const r = ROWS.find((x) => x.slug === slug);
  if (!r) return;
  const rank = ROWS.indexOf(r) + 1;
  const steps = farmSteps(r);
  document.getElementById('detail').hidden = false;
  document.getElementById('detail').innerHTML = `
    <h2>#${rank} — ${esc(r.name)}</h2>
    <p style="color:var(--muted);margin:0">${esc(r.category || 'DeFi')} · ${esc(r.chains.join(', '))} · TVL ${fmt$(r.tvl)} · ` +
    `tracked ${r.age === null ? '—' : Math.round(r.age / 30.4) + ' months'} · ${WATCH.has(r.slug) ? 'on the watchlist' : 'below the watchlist floor'}</p>
    <div class="terms">
      <div><b>${fmt$(r.fitted)}</b><span>fitted launch value</span></div>
      <div><b>${(r.odds * 100).toFixed(0)}%</b><span>odds a token ever lists</span></div>
      <div><b>×${r.share}</b><span>own-token share</span></div>
      <div><b>${fmt$(r.implied)}</b><span>implied value</span></div>
      <div><b>${'$' + farmCost(r).toFixed(2)}</b><span>farm plan cost (deposit + fees)</span></div>
    </div>
    <h3 style="margin:8px 0 4px">Farm plan — 7 steps, ${'$' + farmCost(r).toFixed(2)} in total (deposit + fees)</h3>
    <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  render();
}
['q', 'cat', 'mintvl', 'sort', 'watchonly'].forEach((id) =>
  document.getElementById(id).addEventListener('input', () => { page = 0; render(); }));
document.getElementById('prev').addEventListener('click', () => { if (page > 0) { page--; render(); } });
document.getElementById('next').addEventListener('click', () => { page++; render(); });

// ---- anchors tab ----
function showTab(which) {
  document.getElementById('tab-board').classList.toggle('active', which === 'board');
  document.getElementById('tab-anchors').classList.toggle('active', which === 'anchors');
  document.getElementById('view-board').hidden = which !== 'board';
  document.getElementById('view-anchors').hidden = which !== 'anchors';
}
document.getElementById('tab-board').addEventListener('click', () => showTab('board'));
document.getElementById('tab-anchors').addEventListener('click', () => showTab('anchors'));
document.getElementById('cal-note').textContent =
  `The value model is fitted on the ${M.value_anchors} traded protocols that record a market cap. ` +
  `Below, each anchor's fitted value sits beside its actual market cap: the fit's full R² is ${M.value_full_r2}, ` +
  `its holdout MAE is ×${(10 ** M.value_full_mae_log10).toFixed(1)} in dollars. ` +
  `The robust fit drops outliers in two rounds of 2-sigma trimming (${M.value_trimmed_out} anchors dropped in all).`;
document.getElementById('holdouts').innerHTML = `
  <div><h3>Value model — held-out tests</h3>
    ${M.value_holdouts.map((h) => `<p>${esc(h.split)}: R² ${h.r2}, MAE ×${(10 ** h.mae_log10).toFixed(1)} (n=${h.n_test}); ` +
      `on the ${h.n_trimmed} anchors with mcap/TVL in [0.005, 5]: R² ${h.r2_trimmed}, MAE ×${(10 ** h.mae_trimmed_log10).toFixed(1)}</p>`).join('')}
    <p>${esc(M.value_walk_forward.split)}: R² ${M.value_walk_forward.r2}, MAE ×${(10 ** M.value_walk_forward.mae_log10).toFixed(1)} (n=${M.value_walk_forward.n_test}); ` +
      `trimmed: R² ${M.value_walk_forward.r2_trimmed}, MAE ×${(10 ** M.value_walk_forward.mae_trimmed_log10).toFixed(1)} (n=${M.value_walk_forward.n_trimmed})</p>
  </div>
  <div><h3>Listing odds — held-out tests</h3>
    ${M.odds_holdouts.map((h) => `<p>${esc(h.split)}: AUC ${h.auc} (n=${h.n_test})</p>`).join('')}
    <p>${esc(M.odds_walk_forward.split)}: AUC ${M.odds_walk_forward.auc} (n=${M.odds_walk_forward.n_test})</p>
  </div>`;
document.getElementById('anchor-rows').innerHTML = D.anchors.slice(0, 40).map((a) => {
  const ratio = a[4] / a[3];
  return `<tr><td><strong>${esc(a[1])}</strong><br><span style="color:var(--muted);font-size:12px">${esc(a[0])}</span></td>
    <td class="num">${fmt$(a[2])}</td><td class="num">${fmt$(a[3])}</td>
    <td class="num">${fmt$(a[4])}</td><td class="num">${ratio.toFixed(2)}×</td></tr>`;
}).join('');
render();
