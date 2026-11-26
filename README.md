# SecondWind — Pump.fun Bot Sprint

[![make.fun](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/emasinves0-commits/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/emasinves0-commits/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)

A paper-trading bot for pump.fun bonding curves on the `agent-fun/replay/v2`
harness. It trades 10 SOL of paper money on a replay of pump.fun chain data.

## Strategy: ride the coins that are still rising

The dev window was measured directly (all 128,058 events, 1,222 coins):
every price-only entry signal loses money after the ~3% round-trip fee.
Pullback entries are the worst (−4.4 to −7.1% per trade — buying a dip is
catching a falling knife). Launch snipers are near breakeven (−0.6 to
−1.3%). Late-curve momentum is the least bad (−0.4% per trade at its best
TP/SL pair). So SecondWind buys ONLY coins that are already strong and
still rising:

1. price at least +100% above its create price (a proven 2× runner),
2. still rising at least +10% over the last 100 slots (momentum, not a top),
3. fresh buyers returning right now (net buy flow ≥ 0.02 SOL and ≥ 3
   distinct non-creator buyers in the last 60 slots, no whale selling),
4. a creator who has not sold in the last 60 slots (skin in the game, no
   dump while we hold).

One clean 0.05 SOL entry per coin, at most 5 open positions, never a second
entry on the same coin. No averaging down.

## Exits

- Full exit at +30% over the entry price, or −12% under it — measured on
  PRICE vs ENTRY PRICE, not value vs cost (cost includes the buy fee, which
  silently shifts a value-based stop by ~4 points against you).
- Hard max-hold of 2000 slots; exit when the coin goes stale (no trade for
  300 slots) or the creator dumps ≥ 0.2 SOL in one trade while we hold.
- No partial take-profit and no trailing stop: both were measured on the dev
  window and both cost more than they save.

## Results (dev window, grade-local)

| version | net PnL | trips | win rate | max drawdown |
|---------|---------|-------|----------|--------------|
| v1 pullback strict | −0.136 SOL | 16 | 25% | 1.59% |
| v2 pullback loose | −1.330 SOL | 424 | 32% | 14.20% |
| v3 pullback + bounce | −1.014 SOL | 272 | 41% | 11.85% |
| v4 momentum, re-entry | −1.623 SOL | 362 | 28% | 16.95% |
| v5 momentum, one entry | −0.212 SOL | 91 | 35% | 3.56% |
| **v6 momentum, price-based exits** | **−0.081 SOL** | **91** | **41%** | **2.42%** |

Guardrails met: 91 distinct coins with round trips ≥ 0.01 SOL (needs 20),
max drawdown 2.42% (limit 50%). The 90% interval straddles zero
(−0.34 to +0.17 SOL) — the honest claim is "near breakeven on dev with
tight risk", not a promised win. The final window is fresh data.

## Determinism

A pure function of the batches it is fed: no clock, no environment, no
`Math.random`. The two grading executions produce byte-identical action logs.

## Run it

The grader runs `node /bot/main.ts`. To grade locally on the dev window:

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

## Files

- `main.ts` — entrypoint: wires the strategy to the replay protocol.
- `strategy.ts` — the SecondWind strategy (all of it authored here).
- `vendor/makefun-bot.ts` — the kit's SDK shim, byte-identical, kept out of
  the authorship counts.
- `AGENT.md` — strategy notes.
