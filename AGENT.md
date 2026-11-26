# SecondWind — strategy notes

## What it is

A late-curve momentum rider for pump.fun bonding curves
(`agent-fun/replay/v2`). It buys coins that already doubled and are still
rising, only when fresh buyers are returning and the creator is quiet, and
exits on a plain take-profit / stop measured on price. One entry per coin,
ever.

## How it got here (measured, not guessed)

The whole dev window (128,058 events, 1,222 coins, 35 completers) was
analysed offline before the pivot (`signal-analysis*.py` in the build
folder): pullback+bounce −4.4 to −7.1%/trade, breakout −3.2 to −6.2%,
launch sniper −0.6 to −1.3%, late-curve momentum −0.4% at its best TP/SL
pair. Trailing stops hurt on all four signals; partial take-profits cap the
upside while the full stop takes the whole loss. Grade-local confirmed each
step: v1 pullback −0.136 SOL (16 trips), v2 loose −1.33, v3 +bounce −1.01,
v4 momentum with re-entry −1.62 (362 trips on 98 coins), v5 one entry per
coin −0.21, v6 price-based exits −0.08 SOL (91 trips, 40.7% win rate,
2.42% max drawdown, 90% interval −0.34 to +0.17 SOL).

## Leader pattern used

The field's winners are momentum riders, second-wind/pullback buyers and
launch snipers (dev titles claim +0.06 to +1.07 SOL — self-reported, the
rounds are blind so no dev score is verifiable). The strongest honest
pattern is momentum continuation on a proven runner. SecondWind takes that
as its core.

## New gap

Nobody in the field combines all three: (1) a momentum entry that requires
the coin to be BOTH doubled AND still rising (not a dip, not a top),
(2) a creator filter that demands silence (no creator sells in the last 60
slots) AND an instant exit if the creator dumps ≥ 0.2 SOL while we hold,
and (3) exits measured on price vs entry price — the cost-basis shift that
silently turns a −12% stop into a −8% stop is a bug most entries will carry
without knowing. Plus one entry per coin ever: re-buying a stopped-out coin
is just paying the ~4% round-trip fee again on the same churning tape.

## Combination

Momentum continuation (leader pattern) + creator-silence filter with
dump-exit + price-based exits + one-entry-per-coin (new gap) = a bot that
trades rarely, loses slowly, and lets the final window decide.

## Numbers

- Stake 0.05 SOL per coin; round trip costs ~2.5% curve fees + 2 × 105,000
  lamports tx fees (~3% total at this stake), so TP +30% / SL −12% needs a
  win rate just above one in three.
- Guardrails: ≥ 20 distinct mints with round trips ≥ 0.01 SOL; max drawdown
  ≤ 50%; max 5 open positions; each buy ≤ 1% of the real reserve.
- Dev window: 24h of pump.fun data, 2–3 Nov 2026 (kit dataset). Final: 6h of
  fresh data recorded after entries close — the strategy must generalize, not
  overfit the dev coins. `grade-local --stress` is the check for that.

## Determinism

Pure function of the batches: no clock, no environment, no randomness. Two
grading executions must agree byte for byte.
