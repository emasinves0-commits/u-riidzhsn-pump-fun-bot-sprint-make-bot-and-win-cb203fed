// SecondWind — a pullback rider for agent-fun/replay/v2 (pump.fun bonding curves).
// Run by the grader as `node /bot/main.ts`; the strategy lives in strategy.ts, the
// protocol in the vendored SDK shim (vendor/makefun-bot.ts, a byte-identical copy
// of the kit's sdk/ts/makefun-bot.ts, kept out of the authorship counts).
//
// The bot speaks the replay protocol on stdin/stdout: one hello, then one batch
// per slot, each answered with exactly one reply carrying that slot's orders.
// It writes nothing to disk and reads nothing from the environment — the action
// log on stdout IS its output. Deterministic: no clock, no randomness.

import { runBot } from './vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from './strategy.ts';

const strategy = createStrategy(DEFAULT_PARAMS);

await runBot({
  onHello(state) {
    // hello arrives once, before the first batch: note the run's seed and the
    // capital on stderr only (stdout carries replies and nothing else).
    console.error(
      `SecondWind starting: seed=${state.hello.seed} capital=${state.hello.capital.lamports} stake=${strategy.params.stakeLamports}`,
    );
  },
  onBatch: (state, batch) => strategy.onBatch(state, batch),
});
