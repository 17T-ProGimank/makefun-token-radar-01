# Token Radar — radar-2

The best token launch radar: a program that reads a sealed DefiLlama snapshot and
writes a dashboard ranking every genuine pre-token protocol by implied value, each
with the steps to farm it.

## What it does

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, scores the
protocols with the model in `lib/model.ts`, and writes:

- `/output/board.json` — the ranked board (198 rows here)
- `/output/data.js` — the dashboard's data, beside the page
- `/output/dashboard/` — the static page (no network, no framework)
- `/output/screenshots/` — board, detail and filtered views
- `/output/dossier.json` — built with `buildDossier` from `vendor/makefun-board.ts`

## The model (radar-2)

```
implied = round( tvl_usd x 0.25 x size x growth x maturity x chains x category )
```

- **size** — sublinear in TVL, `(tvl / $1B)^-0.1` clamped to x0.85–x1.60, so a
  fast-growing smaller protocol can overtake a giant. A linear model is a TVL table.
- **growth** — seven-day TVL change clamped to -60%…+150%. Falls are punished
  harder (x0.75 per point) than rises are rewarded (x0.6). Null growth is neutral.
- **maturity** — age with no token on record: rises to x1.00 at 3 years, then decays
  gently to x0.90. A very long run with no token trims the score.
- **chains** — x1.00–x1.16, 4% per extra chain up to four.
- **category** — Dexs / Lending x1.10, Yield / Derivatives x1.08, CDP / RWA /
  Curators / Prediction x1.05, bridged or staked products x0.85, the rest x1.00.
  A property of the category string, never of a protocol name.

Eligibility applies the watchlist's own rule to every row: the protocol must record
no token, and must not be a wrapped, staked or bridged product of a token that
already trades (Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / CEX
category, a version marker, a whole word wrapped / staked / staking, or an exchange
name at the start). The board ranks all 198 protocols that pass it — the watchlist
(40) plus every early protocol below the floor — and sets aside 144 pre-token
records that fail the rule. "Records no token" is the wording throughout:
DefiLlama's record is not proof a token does not exist.

Each row carries a seven-step farm plan derived from its category, chains, TVL and
age: a fresh wallet, the category's main action, a second action on a second chain,
a weekly cadence, a hold period, a claim warning, and an exit rule. Every step
states its cost and its time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## Check it

```sh
node <kit>/cli/makefun.mjs check --kit <kit> --repo . --worktree
```

## License

MIT — see `LICENSE`.
