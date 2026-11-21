# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/17T-ProGimank/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/17T-ProGimank/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar v2 — the best token launch radar. It reads the sealed DefiLlama snapshot (758 protocols, 2026-11-14), fits a launch-value model on the 128 traded anchors and a listing-odds model on all 758 protocols, tests both held-out twice plus walk-forward, and ranks all 342 protocols that record no token by implied value (fitted value × listing odds × own-token share). Every row carries a 7-step farm plan with what each step costs and how long it takes. The dashboard is sortable, filterable, has a detail view per protocol and an anchors-and-calibration tab that shows the fit against reality.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=m4psg5rh&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
