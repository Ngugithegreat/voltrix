import { db } from "./db";
import { getMaxPayoutCents } from "./settings";
import { sendPushToUser } from "./push";
import { getLatestTick, getTickAtOrAfter, Tick } from "./deriv-server";
import {
  multiplierPnl,
  lastDigit,
  decimalsFor,
  digitWins,
  pickForcedDigit,
  DigitSubtype,
} from "./markets";

export type TradeRow = {
  id: number;
  user_id: number;
  kind: "rise_fall" | "mult" | "digit";
  symbol: string;
  direction: string; // rise|fall, up|down, or even/odd/over/under/matches/differs
  stake: string | number;
  payout: string | number;
  multiplier: number | null;
  entry_price: number;
  exit_price: number | null;
  entry_epoch: string | number;
  expiry_epoch: string | number;
  stop_out_price: number | null;
  subtype: DigitSubtype | null;
  prediction: string | null;
  barrier: number | null;
  exit_digit: number | null;
  forced_outcome: string | null;
  is_demo: boolean;
  status: "open" | "won" | "lost";
  created_at: string;
  settled_at: string | null;
};

/**
 * Settles a single open Rise/Fall trade against the real Deriv tick at/after
 * expiry. Credits the payout on a win. Idempotent. Returns the row unchanged if
 * the expiry tick isn't available yet.
 */
export async function settleTrade(trade: TradeRow): Promise<TradeRow> {
  if (trade.status !== "open") return trade;
  if (trade.kind !== "rise_fall" && trade.kind !== "digit") return trade;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = Number(trade.expiry_epoch);
  if (nowSec < expiry) return trade;

  const forced = trade.forced_outcome === "win" || trade.forced_outcome === "lose";
  const entry = Number(trade.entry_price);
  const dec = decimalsFor(trade.symbol);

  let won: boolean;
  let exitDigit: number | null = null;
  let exitPrice: number;

  if (forced) {
    // Test harness (whitelisted accounts only): settle against the controlled
    // sim outcome — no real feed needed, so it matches what the chart showed.
    won = trade.forced_outcome === "win";
    if (trade.kind === "digit") {
      // Varied-but-deterministic digit (seeded by trade id) so it isn't stuck
      // on the same value, while matching the client-steered chart.
      const d = pickForcedDigit(
        trade.subtype as DigitSubtype,
        trade.prediction || trade.direction,
        Number(trade.barrier ?? 0),
        won,
        Number(trade.id)
      );
      exitDigit = d;
      const sc = Math.pow(10, dec);
      let scaled = Math.round(entry * sc);
      scaled = scaled - (((scaled % 10) + 10) % 10) + d;
      exitPrice = scaled / sc;
    } else {
      const higher = trade.direction === "rise" ? won : !won;
      const bump = Math.max(0.02, Math.abs(entry) * 0.004);
      exitPrice = higher ? entry + bump : entry - bump;
    }
  } else {
    const tick = await getTickAtOrAfter(trade.symbol, expiry);
    if (!tick) return trade;
    exitPrice = tick.price;
    if (trade.kind === "digit") {
      exitDigit = lastDigit(tick.price, dec);
      won = digitWins(
        trade.subtype as DigitSubtype,
        trade.prediction || trade.direction,
        Number(trade.barrier ?? 0),
        exitDigit
      );
    } else {
      won = trade.direction === "rise" ? tick.price > entry : tick.price < entry;
    }
  }

  const status: "won" | "lost" = won ? "won" : "lost";
  const sql = db();

  const updated = (await sql`
    UPDATE voltrix_trades
    SET status = ${status}, exit_price = ${exitPrice}, exit_digit = ${exitDigit}, settled_at = now()
    WHERE id = ${trade.id} AND status = 'open'
    RETURNING *
  `) as TradeRow[];

  if (!updated.length) {
    const latest = (await sql`SELECT * FROM voltrix_trades WHERE id = ${trade.id}`) as TradeRow[];
    return latest[0] ?? trade;
  }

  if (won) {
    const payout = Number(trade.payout);
    if (trade.is_demo) {
      await sql`UPDATE voltrix_users SET demo_balance = demo_balance + ${payout} WHERE id = ${trade.user_id}`;
    } else {
      await sql`UPDATE voltrix_users SET balance = balance + ${payout} WHERE id = ${trade.user_id}`;
    }
    await sql`
      INSERT INTO voltrix_transactions (user_id, type, amount, status, method, note, is_demo)
      VALUES (${trade.user_id}, 'trade_payout', ${payout}, 'completed', 'trade', ${
        "Won " + trade.symbol + " " + trade.direction
      }, ${trade.is_demo})
    `;
    if (!trade.is_demo) {
      void sendPushToUser(trade.user_id, {
        title: "Trade won 🎉",
        body: `You won $${(payout / 100).toFixed(2)} on ${trade.symbol}.`,
        url: "/trade",
      });
    }
  }

  return updated[0];
}

/** Settles every expired open time-based trade (Rise/Fall + Digits) for a user. */
export async function settleExpiredTrades(userId: number): Promise<void> {
  const sql = db();
  const nowSec = Math.floor(Date.now() / 1000);
  const open = (await sql`
    SELECT * FROM voltrix_trades
    WHERE user_id = ${userId} AND status = 'open' AND kind IN ('rise_fall', 'digit')
      AND expiry_epoch <= ${nowSec}
    ORDER BY id ASC
    LIMIT 25
  `) as TradeRow[];

  for (const t of open) {
    try {
      await settleTrade(t);
    } catch {
      /* leave open, retry next call */
    }
  }
}

/**
 * Closes an open multiplier position at `tick` (fetched if omitted), realising
 * P&L. The payout = stake + P&L, floored at 0 (can't lose more than the stake).
 * Idempotent via an atomic status flip. Returns the settled row.
 */
export async function closeMultiplier(
  trade: TradeRow,
  tick?: Tick
): Promise<TradeRow> {
  if (trade.status !== "open" || trade.kind !== "mult") return trade;

  const stake = Number(trade.stake);
  const entry = Number(trade.entry_price);
  const maxPayout = await getMaxPayoutCents();
  const forced = trade.forced_outcome === "win" || trade.forced_outcome === "lose";

  let pxPrice: number;
  let payout: number;
  if (forced) {
    // Test harness: controlled outcome, no real feed needed.
    const won = trade.forced_outcome === "win";
    payout = won ? Math.min(maxPayout, Math.round(stake * 2)) : 0;
    const bump = Math.max(0.02, Math.abs(entry) * 0.004);
    const higher = trade.direction === "up" ? won : !won;
    pxPrice = higher ? entry + bump : entry - bump;
  } else {
    const px = tick ?? (await getLatestTick(trade.symbol));
    pxPrice = px.price;
    const pnl = multiplierPnl({
      direction: trade.direction as "up" | "down",
      entry,
      current: px.price,
      stakeCents: stake,
      multiplier: Number(trade.multiplier),
    });
    payout = Math.min(maxPayout, Math.max(0, stake + pnl));
  }
  const status: "won" | "lost" = payout >= stake ? "won" : "lost";

  const sql = db();
  const updated = (await sql`
    UPDATE voltrix_trades
    SET status = ${status}, exit_price = ${pxPrice}, payout = ${payout}, settled_at = now()
    WHERE id = ${trade.id} AND status = 'open'
    RETURNING *
  `) as TradeRow[];

  if (!updated.length) {
    const latest = (await sql`SELECT * FROM voltrix_trades WHERE id = ${trade.id}`) as TradeRow[];
    return latest[0] ?? trade;
  }

  if (payout > 0) {
    if (trade.is_demo) {
      await sql`UPDATE voltrix_users SET demo_balance = demo_balance + ${payout} WHERE id = ${trade.user_id}`;
    } else {
      await sql`UPDATE voltrix_users SET balance = balance + ${payout} WHERE id = ${trade.user_id}`;
    }
    await sql`
      INSERT INTO voltrix_transactions (user_id, type, amount, status, method, note, is_demo)
      VALUES (${trade.user_id}, 'trade_payout', ${payout}, 'completed', 'trade', ${
        "Closed " + trade.symbol + " " + trade.direction + " x" + trade.multiplier
      }, ${trade.is_demo})
    `;
  }

  return updated[0];
}

/**
 * Auto-closes any open multiplier position that has hit its stop-out level, so
 * the platform isn't exposed beyond the staked amount even if the user never
 * closes manually. Best-effort.
 */
export async function settleStopOuts(userId: number): Promise<void> {
  const sql = db();
  const open = (await sql`
    SELECT * FROM voltrix_trades
    WHERE user_id = ${userId} AND status = 'open' AND kind = 'mult'
    ORDER BY id ASC
    LIMIT 25
  `) as TradeRow[];

  for (const t of open) {
    // Test (forced) multipliers are closed manually against the sim, not the feed.
    if (t.forced_outcome === "win" || t.forced_outcome === "lose") continue;
    try {
      const px = await getLatestTick(t.symbol);
      const so = Number(t.stop_out_price);
      const stopped =
        t.direction === "up" ? px.price <= so : px.price >= so;
      if (stopped) await closeMultiplier(t, px);
    } catch {
      /* retry next call */
    }
  }
}
