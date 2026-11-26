// SecondWind — a late-curve momentum rider for agent-fun/replay/v2 (pump.fun bonding curves).
//
// v4 PIVOT (evidence, not a hunch). v1-v3 were pullback riders: v1 strict
// (+80%/-25%/+15%) lost only -0.136 SOL on 16 trips; v2 loose (+50%/-15%/+5%)
// lost -1.33 SOL on 424 trips; v3 (+bounce confirmation) lost -1.01 SOL on
// 272 trips. Then I measured the dev window directly (128,058 events,
// signal-analysis*.py): EVERY price-only entry signal is negative after the
// ~3% round-trip fee. Pullback+bounce: -4.4 to -7.1%/trade. Breakout: -3.2 to
// -6.2%. Launch sniper: -0.6 to -1.3%. Late-curve momentum: -0.4 to -4.4% —
// the LEAST bad, and the only family whose best TP/SL pair (TP +30% / SL -12%)
// reaches -0.42%/trade. Trailing stops HURT (worse than fixed TP/SL on all
// four signals); partial take-profits cap the upside while the full stop
// still takes the whole loss. So v4 buys ONLY rising coins (price >= 2x
// create AND +10% over the last 100 slots), exits on a plain TP +30% / SL -12%
// with no partial and no trail, and holds up to 2000 slots so the slow
// grinders can reach their target. The flow filters (distinct buyers, net
// flow, creator silence, no whale exit) stay — they are the one part the
// price-only analysis could not measure, and they are what can push a
// -0.42% signal over the line. The final window is fresh data, so the honest
// claim is "least-bad dev expectancy + full guardrails", not a promised win.
//
// v5 (one entry per coin, ever): v4 did 362 trips on 98 coins and lost
// -1.62 SOL; v5 did 91 trips on 91 coins and lost -0.21 SOL. Re-buying a
// coin that already stopped you out just pays the fee again on the same
// churning tape. v6 (this version): PnL is measured on price vs entry
// price, not value vs cost — cost includes the buy fee, so a value-based
// SL -12% was really a price -8% stop, which is why v5's win rate (35.2%)
// matched the analysis while its realized expectancy did not.
//
// DETERMINISM: a pure function of the batches fed in. No clock, no environment,
// no Math.random, no seed use at all — the same replay always gives the same
// orders, so the two grading executions agree byte for byte.
//
// FEES (why the numbers are what they are): a round trip costs ~2.5% in curve
// fees plus 2 x 105,000 lamports of tx fees. At a 0.05 SOL stake the tx leg is
// ~0.42%, so a trade must clear ~3% gross to break even. TP +30% / SL -12%
// gives roughly +27% net on a win against -15% net on a loss, so a win rate
// just above one in three pays. The 0.05 SOL stake is small enough to stay
// under the 1%-of-real-reserve cap on any curve with 5+ SOL in it, and big
// enough that the fixed tx fee does not eat the trade.

import {
  type Batch,
  type BotState,
  type OrderInput,
  type Pubkey,
} from './vendor/makefun-bot.ts';

export interface Params {
  /** Stake per first buy, lamports (0.05 SOL). */
  stakeLamports: number;
  /** Smallest buy worth paying the tx fee for, lamports. */
  minBuyLamports: number;
  /** Youngest age (slots since create) at which a coin may be bought. */
  minAge: number;
  /** Oldest age at which a first buy may still be decided. */
  maxAge: number;
  /** Last price must be at least this far above the create price (bps). */
  minRunupBps: number;
  /** Window for the momentum check, slots. */
  momentumWindow: number;
  /** Last price must be at least this far above the price momentumWindow slots ago (bps). */
  minMomentumBps: number;
  /** Trades seen on the coin before entry. */
  minTrades: number;
  /** Real SOL reserve window at decision time (lamports). */
  minRealSol: number;
  maxRealSol: number;
  /** Creator must have bought at least this much, lamports (skin in the game). */
  minDevBuy: number;
  /** Creator must have sold less than this much in total, lamports. */
  maxDevSold: number;
  /** No creator sells in the last this many slots. */
  devQuietSlots: number;
  /** Recent-flow window, slots. */
  flowWindow: number;
  /** Net buy flow in the window, lamports, at least. */
  minFlowLamports: number;
  /** Distinct non-creator buyers in the window, at least. */
  minRecentBuyers: number;
  /** Largest single non-creator sell in the window, as bps of real SOL, at most. */
  maxBigSellBps: number;
  /** Slippage allowed on buys / sells (bps). */
  buySlippageBps: number;
  sellSlippageBps: number;
  /** Full exit once worth this much over cost (bps). */
  tpBps: number;
  /** Full exit once worth this much under cost (bps). */
  slBps: number;
  /** Exit after holding this many slots. */
  maxHold: number;
  /** Exit when no trade has hit the coin for this many slots. */
  staleSlots: number;
  /** Exit when the creator sells more than this in one trade while held, lamports. */
  devDumpLamports: number;
}

export const DEFAULT_PARAMS: Params = {
  stakeLamports: 50_000_000,
  minBuyLamports: 15_000_000,
  minAge: 8,
  maxAge: 3000,
  minRunupBps: 10000,
  momentumWindow: 100,
  minMomentumBps: 1000,
  minTrades: 5,
  minRealSol: 1_000_000_000,
  maxRealSol: 85_000_000_000,
  minDevBuy: 0,
  maxDevSold: 50_000_000,
  devQuietSlots: 60,
  flowWindow: 60,
  minFlowLamports: 20_000_000,
  minRecentBuyers: 3,
  maxBigSellBps: 2000,
  buySlippageBps: 500,
  sellSlippageBps: 800,
  tpBps: 3000,
  slBps: 1200,
  maxHold: 2000,
  staleSlots: 300,
  devDumpLamports: 200_000_000,
};

const LAMPORTS_PER_SOL = 1_000_000_000;
/** Basis points per unit, as a plain number (the shim's BPS is a bigint). */
const BPS = 10_000;

interface TradeNote {
  slot: number;
  user: string;
  isBuy: boolean;
  solLamports: number;
}

interface CoinTrack {
  mint: Pubkey;
  createdSlot: number;
  creator: string | null;
  createPrice: number;
  peakPrice: number;
  lastPrice: number;
  lastTradeSlot: number;
  trades: number;
  complete: boolean;
  notes: TradeNote[];
  /** (slot, price) tape, capped — for the momentum check. */
  prices: Array<{ slot: number; price: number }>;
}

interface HeldTrack {
  mint: Pubkey;
  entrySlot: number;
  /** Price when the position was first seen (approx. the fill price). PnL is
      measured on PRICE vs ENTRY PRICE, never on value vs cost: cost includes
      the buy's curve fee, so a value-based SL -12% is really a price -8%
      stop — v5's win rate (35.2%) matched the analysis but the realized
      expectancy did not, and the shifted thresholds are why. */
  entryPrice: number;
}

/** Price of one base token unit, in lamports (virtual quote / virtual token). */
function priceOf(virtualQuote: bigint, virtualToken: bigint): number {
  if (virtualToken === 0n) return 0;
  return Number(virtualQuote) / Number(virtualToken);
}

export function createStrategy(params: Params = DEFAULT_PARAMS) {
  const coins = new Map<Pubkey, CoinTrack>();
  const held = new Map<Pubkey, HeldTrack>();
  /** Coins we already bought once — never re-enter. The v4 grade-local did
      362 trips on 98 coins (3.7 per coin): re-buying a coin that already
      stopped us out just pays the ~4% round-trip fee again on the same
      churning tape. The offline analysis measured ONE trigger per coin; the
      bot must match that. */
  const traded = new Set<Pubkey>();

  function trackFor(
    mint: Pubkey,
    slot: number,
    creator: string | null,
    price: number,
  ): CoinTrack {
    let t = coins.get(mint);
    if (t === undefined) {
      t = {
        mint,
        createdSlot: slot,
        creator,
        createPrice: price,
        peakPrice: price,
        lastPrice: price,
        lastTradeSlot: slot,
        trades: 0,
        complete: false,
        notes: [],
        prices: [],
      };
      coins.set(mint, t);
    }
    return t;
  }

  function foldEvents(batch: Batch): void {
    for (const e of batch.events) {
      if (e.event === 'CreateEvent') {
        const price = priceOf(BigInt(e.virtual_quote_reserves), BigInt(e.virtual_token_reserves));
        const t = trackFor(e.mint, e.slot, e.creator, price);
        t.createdSlot = e.slot;
        t.creator = e.creator;
        t.createPrice = price;
        t.peakPrice = price;
        t.lastPrice = price;
      } else if (e.event === 'TradeEvent') {
        const price = priceOf(BigInt(e.virtual_quote_reserves), BigInt(e.virtual_token_reserves));
        const t = trackFor(e.mint, e.slot, null, price);
        if (t.creator === null) t.creator = e.creator;
        t.lastPrice = price;
        if (price > t.peakPrice) t.peakPrice = price;
        t.lastTradeSlot = e.slot;
        t.trades += 1;
        t.prices.push({ slot: e.slot, price });
        if (t.prices.length > 300) t.prices.splice(0, t.prices.length - 300);
        t.notes.push({
          slot: e.slot,
          user: e.user,
          isBuy: e.is_buy,
          solLamports: Number(BigInt(e.sol_amount)),
        });
        if (t.notes.length > 400) t.notes.splice(0, t.notes.length - 400);
      } else {
        const t = coins.get(e.mint);
        if (t !== undefined) t.complete = true;
      }
    }
    // Prune stale trade notes so the window scans stay cheap and the coin
    // maps do not grow without bound over a 24h window.
    if (batch.seq % 200 === 0) {
      const horizon = batch.slot - 400;
      for (const t of coins.values()) {
        while (t.notes.length > 0 && t.notes[0].slot < horizon) t.notes.shift();
      }
    }
  }

  function windowStats(t: CoinTrack, now: number, window: number) {
    const from = now - window;
    let netFlow = 0;
    let buys = 0;
    let maxSell = 0;
    let devSoldRecent = 0;
    let devSoldTotal = 0;
    let devBoughtTotal = 0;
    const buyers = new Set<string>();
    for (const n of t.notes) {
      if (n.user === t.creator) {
        if (n.isBuy) devBoughtTotal += n.solLamports;
        else devSoldTotal += n.solLamports;
      }
      if (n.slot < from) continue;
      if (n.isBuy) {
        netFlow += n.solLamports;
        buys += 1;
        if (n.user !== t.creator) buyers.add(n.user);
      } else {
        netFlow -= n.solLamports;
        if (n.solLamports > maxSell) maxSell = n.solLamports;
        if (n.user === t.creator) devSoldRecent += n.solLamports;
      }
    }
    return { netFlow, buys, buyers: buyers.size, maxSell, devSoldRecent, devSoldTotal, devBoughtTotal };
  }

  function maybeBuy(state: BotState, batch: Batch, orders: OrderInput[]): void {
    if (state.committedPositionCount() >= state.hello.caps.max_open_positions) return;
    const now = batch.slot;
    const p = params;
    for (const t of coins.values()) {
      if (orders.length >= state.hello.caps.max_orders_per_batch) return;
      if (t.complete) continue;
      if (state.positions.has(t.mint)) continue;
      if (state.pending.has(t.mint)) continue;
      if (traded.has(t.mint)) continue;
      const age = now - t.createdSlot;
      if (age < p.minAge || age > p.maxAge) continue;
      if (t.trades < p.minTrades) continue;
      if (t.createPrice <= 0 || t.lastPrice <= 0) continue;
      // Late-curve momentum: the coin must have doubled from create AND still
      // be rising (+10% over the last 100 slots). Buying a falling coin is
      // catching a knife — v2/v3 proved it; the analysis says rising coins
      // are the least-bad entry family on this window.
      if (t.lastPrice * BPS < t.createPrice * (BPS + p.minRunupBps)) continue;
      let oldPrice = 0;
      for (let i = t.prices.length - 1; i >= 0; i--) {
        if (t.prices[i].slot <= now - p.momentumWindow) {
          oldPrice = t.prices[i].price;
          break;
        }
      }
      if (oldPrice <= 0) continue;
      if (t.lastPrice * BPS < oldPrice * (BPS + p.minMomentumBps)) continue;
      const curve = state.curves.get(t.mint);
      if (curve === undefined || curve.complete) continue;
      const realSol = curve.real_quote_reserves;
      if (realSol < BigInt(p.minRealSol) || realSol > BigInt(p.maxRealSol)) continue;
      // The creator must have skin in the game and must not be dumping.
      const w = windowStats(t, now, Math.max(p.flowWindow, p.devQuietSlots));
      if (w.devBoughtTotal < p.minDevBuy) continue;
      if (w.devSoldTotal > p.maxDevSold) continue;
      if (w.devSoldRecent > 0) continue;
      // Fresh buyers must be returning on the dip, and no whale may be leaving.
      const fw = windowStats(t, now, p.flowWindow);
      if (fw.netFlow < p.minFlowLamports) continue;
      if (fw.buyers < p.minRecentBuyers) continue;
      if (fw.maxSell * BPS > Number(realSol) * p.maxBigSellBps) continue;
      // Size: the stake, capped at 1% of the real reserve (the harness cap).
      const cap = state.maxBuyLamports(t.mint);
      let size = BigInt(p.stakeLamports);
      if (size > cap) size = cap;
      if (size < BigInt(p.minBuyLamports)) continue;
      if (state.freeCashLamports() < size + state.txFeeLamports()) continue;
      orders.push({
        side: 'buy',
        mint: t.mint,
        quote_lamports: size,
        max_slippage_bps: p.buySlippageBps,
      });
      traded.add(t.mint);
    }
  }

  function maybeSell(state: BotState, batch: Batch, orders: OrderInput[]): void {
    const now = batch.slot;
    const p = params;
    for (const [mint, pos] of state.positions) {
      if (orders.length >= state.hello.caps.max_orders_per_batch) return;
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      const price = priceOf(curve.virtual_quote_reserves, curve.virtual_token_reserves);
      if (price <= 0) continue;
      const tokens = pos.token_amount;
      // priceOf is lamports per base token unit, so tokens x price is lamports.
      const value = Number(tokens) * price;
      const cost = Number(pos.cost_lamports);
      if (cost <= 0 || value <= 0) continue;
      let h = held.get(mint);
      if (h === undefined) {
        h = { mint, entrySlot: now, entryPrice: price };
        held.set(mint, h);
      }
      const pnlBps = Math.round(((price - h.entryPrice) * BPS) / h.entryPrice);
      const t = coins.get(mint);
      // The creator dumping while we hold ends the trade at once.
      let devDump = false;
      if (t !== undefined) {
        for (let i = t.notes.length - 1; i >= 0; i--) {
          const n = t.notes[i];
          if (n.slot < now - 5) break;
          if (!n.isBuy && n.user === t.creator && n.solLamports >= p.devDumpLamports) {
            devDump = true;
            break;
          }
        }
      }
      const heldSlots = now - h.entrySlot;
      const stale = t === undefined || now - t.lastTradeSlot >= p.staleSlots;
      // Plain exits only: TP +30% / SL -12% in full, a long max-hold, stale,
      // or a creator dump. No partial TP and no trailing stop — the analysis
      // proved both cost more than they save on this window.
      let sellAll = false;
      if (pnlBps >= p.tpBps) sellAll = true;
      else if (pnlBps <= -p.slBps) sellAll = true;
      else if (heldSlots >= p.maxHold) sellAll = true;
      else if (stale) sellAll = true;
      else if (devDump) sellAll = true;
      if (sellAll) {
        orders.push({ side: 'sell', mint, token_amount: tokens, max_slippage_bps: p.sellSlippageBps });
        held.delete(mint);
      }
    }
    // Drop held tracks for positions that are gone (sold, flattened, completed).
    for (const mint of [...held.keys()]) {
      if (!state.positions.has(mint)) held.delete(mint);
    }
  }

  function onBatch(state: BotState, batch: Batch): OrderInput[] {
    foldEvents(batch);
    const orders: OrderInput[] = [];
    maybeSell(state, batch, orders);
    maybeBuy(state, batch, orders);
    return orders;
  }

  return { onBatch, params };
}
