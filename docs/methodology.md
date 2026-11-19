# Token Radar — how the board is built (radar-2)

This note explains the ranking behind `board.json`: what the number on each
row means, why each input is shaped the way it is, and where the board can
mislead. It is written for a reader who wants to check the work, not just
trust the table.

## The question the board answers

A protocol with no token yet has no market price, so there is nothing to
rank it by directly. The board answers a substitute question: if this
protocol launched a token tomorrow, what would the market plausibly value
it at? The answer is an implied value, built from the protocol's locked
value and five adjustments. It is a guess with a method, not a price.

## The formula

Every row starts from the same base: a quarter of the protocol's total
value locked. A quarter is the working assumption for the share of a
protocol's value that a new token would capture. From there, five
multipliers move the number up or down:

    implied = TVL x 0.25 x size x growth x maturity x chains x category

All five multipliers are properties of the snapshot's own fields — the
locked value, its seven-day change, the protocol's age, how many chains
it runs on, and its category string. No multiplier looks at a protocol's
name, its backers, or anything outside the snapshot.

## Size: small is not punished linearly

The size multiplier is (TVL / $1B) raised to the power −0.1, clipped to
the band 0.85 to 1.60. The negative exponent is the whole point: a
protocol ten times smaller does not score ten times lower. It scores a
little higher per dollar locked, because a small protocol that is already
holding value has more room to grow into a token launch than a giant
whose value is already obvious.

Worked numbers, all from the formula above:

- TVL $100M: (0.1)^−0.1 is about 1.26. A hundred-million protocol gets
  a 26% lift on its base.
- TVL $1B: (1)^−0.1 is exactly 1.00. One billion is the pivot.
- TVL $10B: (10)^−0.1 is about 0.79, which the clip leaves alone
  because it sits inside the band. A ten-billion protocol is marked
  down about a fifth per dollar.
- TVL $100B: (100)^−0.1 is about 0.63, which the clip raises to 0.85.
  The clip exists so that giants are not punished without limit.

The practical effect: compare a $50M protocol with a $5B one. The small
one's size multiplier is about 1.35; the giant's is about 0.85. Per
dollar locked, the small protocol is valued about 1.6 times higher. A
ranking that used TVL alone would just be a TVL table, and the board
would tell you nothing a sort could not.

## Growth: falls hurt more than rises help

The growth multiplier starts from the protocol's seven-day TVL change,
clipped to the range −60% to +150% before it is used. A rise adds 0.6
points of multiplier per point of growth; a fall subtracts 0.75 points
per point of decline. The asymmetry is deliberate: a protocol losing
locked value quickly is usually losing it for a reason, and the board
treats a sharp fall as a stronger signal than a sharp rise. A protocol
with no recorded seven-day change is treated as flat, multiplier 1.00.

Worked numbers:

- Growth +40%: 1 + 0.6 × 0.40 = 1.24.
- Growth +120%: 1 + 0.6 × 1.20 = 1.72. The clip at +150% is not hit.
- Growth −30%: 1 − 0.75 × 0.30 = 0.775.
- Growth −50%: 1 − 0.75 × 0.50 = 0.625.

A protocol growing 40% in a week and one shrinking 40% in a week end
up 0.54 apart on this multiplier alone (1.24 against 0.70), which is
roughly the difference between ranking near the top of its weight class
and ranking near the bottom of it.

## Maturity: age helps, then stops helping

A protocol that has run for years without launching a token is read two
ways at once. On one side, survival is evidence: it has users, revenue
or at least persistence, and a launch would land on something real. On
the other side, a very long run with no token starts to look like a
protocol that will never launch one, and the board trims the score for
it. So the maturity multiplier rises with age, reaches 1.00 at three
years, and then decays gently toward 0.90 for the oldest protocols. It
never goes below 0.90: age alone never kills a ranking, it only shades
it. The exact shape is a property of the model, and it is the one place
where the board leans on judgement rather than on a number in the
snapshot.

## Chains: breadth is worth a little

Each additional chain a protocol runs on adds 4% to the multiplier, up
to four chains, for a maximum of 1.16. One chain is 1.00, two chains
1.04, three 1.08, four or more 1.16. The reasoning is modest: a
multi-chain protocol has more surfaces where a token could be useful,
and more chances to be farmed, but chain count is a weak signal next to
locked value and growth, so it is capped hard.

## Category: the kind of protocol matters

Different kinds of protocols capture different shares of their locked
value as token value, so the category multiplier adjusts for that. It
reads only the category string the snapshot carries, never the
protocol's name.

| Category | Multiplier |
| --- | --- |
| Dexs, Lending | 1.10 |
| Yield, Derivatives | 1.08 |
| CDP, RWA, Curators, Prediction | 1.05 |
| Bridged or staked products | 0.85 |
| Everything else | 1.00 |

Dexes and lending sit at the top because their tokens have the clearest
claim on the value flowing through them. Bridged and staked products
sit at the bottom because their value is mostly a claim on someone
else's token, not value of their own.

## Three worked examples

These use the formula exactly as stated above, with a three-year-old
protocol in each case so the maturity multiplier is 1.00 and the
arithmetic can be followed end to end.

**Example A — a mid-size dex on the rise.** TVL $250M, growth +40%,
three chains, Dexs. Base: 250 × 0.25 = 62.5. Size: (0.25)^−0.1 ≈ 1.149.
Growth: 1.24. Chains: 1.08. Category: 1.10. Implied:
62.5 × 1.149 × 1.24 × 1.00 × 1.08 × 1.10 ≈ $105.8M.

**Example B — a small lending protocol growing fast.** TVL $50M,
growth +120%, four chains, Lending. Base: 50 × 0.25 = 12.5. Size:
(0.05)^−0.1 ≈ 1.349. Growth: 1.72. Chains: 1.16. Category: 1.10.
Implied: 12.5 × 1.349 × 1.72 × 1.00 × 1.16 × 1.10 ≈ $37.0M.
Against Example A, the small protocol's implied value is about 74% of
its TVL, while the mid-size one's is about 42%. The size and growth
multipliers did their job: the small protocol is worth far more per
dollar locked.

**Example C — a giant losing value.** TVL $8B, growth −50%, one chain,
Dexs. Base: 8000 × 0.25 = 2000. Size: (8)^−0.1 ≈ 0.812, clipped up to
0.85. Growth: 0.625. Chains: 1.00. Category: 1.10. Implied:
2000 × 0.85 × 0.625 × 1.00 × 1.00 × 1.10 ≈ $1,168.8M. The giant still
tops the board on absolute value, as it should — eight billion locked
is eight billion locked — but its implied value is under 15% of its
TVL, against 74% for the small grower in Example B. The board ranks
the giant first and still tells you the small protocol is the better
bet per dollar.

## Who gets on the board at all

Ranking is the second step. The first step is deciding who is even a
candidate, and the board applies the watchlist's own rule to every row
in the snapshot: a protocol is in only if it records no token, and only
if it is not a wrapped, staked or bridged product of a token that
already trades. The rule is enforced on the snapshot's own fields —
the category (Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
and CEX are out), version markers, the words wrapped, staked and
staking, and exchange names at the start of a protocol's name.

Out of the snapshot's 758 protocols, 198 pass the rule and are ranked:
the watchlist's 40 plus every early protocol below the watchlist's
floor. Another 144 pre-token records fail the rule and are set aside.
The wording matters here: the board says a protocol "records no
token", not that it "has no token". The snapshot's record is not proof
that a token does not exist somewhere, and the board does not claim
otherwise.

## The farm plan on each row

Every ranked row carries a seven-step plan for farming the protocol,
built from the row's own category, chains, TVL and age. The shape is
the same each time: a fresh wallet first, then the category's main
action, then a second action on a second chain, then a weekly cadence,
a hold period, a warning about claiming, and an exit rule. Every step
states what it costs and how long it takes. The plan is a starting
point for research, not a promise: a farm plan cannot know a
protocol's future token, its eligibility rules, or whether farming it
is worth your time at all.

## What the board is not

- It is not a price prediction. Implied value is a ranking device, and
  a token that launches will trade on its own supply, unlocks and
  market conditions, none of which are in the snapshot.
- It is not a safety check. A high rank says nothing about audits,
  admin keys, or whether a protocol will still exist next month.
- It is not complete. The snapshot is one moment in time; a protocol
  that launches a token the day after the snapshot is still ranked as
  if it had none.
- It is not neutral about growth. The growth multiplier rewards a hot
  week and punishes a cold one, so a protocol that had one good week
  can outrank a steadier one. That is a choice, and it can be wrong.

## Reproducing the board

The program reads the sealed snapshot and writes the board, the
dashboard data, the static dashboard, the screenshots and the dossier.
Run it from the repository root with an output directory set and the
snapshot passed in; the exact command is in the README. Two runs on
the same snapshot write byte-identical outputs, so anyone with the
snapshot can reproduce the board exactly and check it line by line
against this note.

## Files

- `main.ts` — the entrypoint: reads the snapshot, runs the model,
  writes the outputs.
- `lib/model.ts` — the scoring model and the eligibility rule.
- `dashboard/` — the static board page, its script and its styles.
- `screenshots/` — board, detail and filtered views of the dashboard.
- `vendor/makefun-board.ts` — the kit's dossier builder, unchanged.
- `docs/methodology.md` — this note.
