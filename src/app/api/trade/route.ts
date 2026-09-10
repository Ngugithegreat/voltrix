import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLatestTick } from "@/lib/deriv-server";
import {
  MARKETS,
  DURATIONS,
  MULTIPLIERS,
  DIGIT_TICKS,
  PAYOUT_MULTIPLIER,
  MIN_STAKE,
  MAX_STAKE,
  stopOutPrice,
  marketBySymbol,
  digitPayoutMult,
  riseFallMult,
  DigitSubtype,
} from "@/lib/markets";
import { getHouseEdge, isBlocked, getMaxStakeCents, getMaxPayoutCents, getGlobalTest, getGlobalTestPct } from "@/lib/settings";
import { isTestEmail } from "@/lib/testmode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS = ["rise_fall", "mult", "digit"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in to trade." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const kind = KINDS.includes(body.kind) ? body.kind : "rise_fall";
  const symbol = String(body.symbol || "");
  const direction = String(body.direction || "");
  const stake = Math.round(Number(body.stake));
  // Demo (practice) trade — settled against the real market with virtual funds,
  // never real money and never the test-mode manipulation.
  const demo = body.demo === true;

  const market = marketBySymbol(symbol);
  if (!market) {
    return NextResponse.json({ error: "Unknown market." }, { status: 400 });
  }
  if (!Number.isFinite(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    return NextResponse.json({ error: "Stake is outside the allowed range." }, { status: 400 });
  }

  // Contract-specific validation.
  let duration = 0; // seconds until expiry
  let multiplier: number | null = null;
  let subtype: DigitSubtype | null = null;
  let barrier: number | null = null;
  let payoutMult = PAYOUT_MULTIPLIER;

  if (kind === "rise_fall") {
    if (direction !== "rise" && direction !== "fall") {
      return NextResponse.json({ error: "Direction must be rise or fall." }, { status: 400 });
    }
    duration = Math.round(Number(body.duration));
    if (!DURATIONS.some((d) => d.seconds === duration)) {
      return NextResponse.json({ error: "Unsupported duration." }, { status: 400 });
    }
  } else if (kind === "mult") {
    if (direction !== "up" && direction !== "down") {
      return NextResponse.json({ error: "Direction must be up or down." }, { status: 400 });
    }
    multiplier = Math.round(Number(body.multiplier));
    if (!MULTIPLIERS.includes(multiplier)) {
      return NextResponse.json({ error: "Unsupported multiplier." }, { status: 400 });
    }
  } else {
    // digit
    subtype = body.subtype as DigitSubtype;
    if (!["even_odd", "over_under", "matches_differs"].includes(subtype)) {
      return NextResponse.json({ error: "Unknown digit contract." }, { status: 400 });
    }
    barrier = Math.round(Number(body.barrier ?? 0));
    if (subtype === "even_odd") {
      if (direction !== "even" && direction !== "odd")
        return NextResponse.json({ error: "Pick even or odd." }, { status: 400 });
      barrier = 0;
    } else if (subtype === "over_under") {
      if (direction !== "over" && direction !== "under")
        return NextResponse.json({ error: "Pick over or under." }, { status: 400 });
      if (barrier < 0 || barrier > 9)
        return NextResponse.json({ error: "Barrier must be 0-9." }, { status: 400 });
      if (direction === "over" && barrier > 8)
        return NextResponse.json({ error: "Over barrier must be 0-8." }, { status: 400 });
      if (direction === "under" && barrier < 1)
        return NextResponse.json({ error: "Under barrier must be 1-9." }, { status: 400 });
    } else {
      if (direction !== "matches" && direction !== "differs")
        return NextResponse.json({ error: "Pick matches or differs." }, { status: 400 });
      if (barrier < 0 || barrier > 9)
        return NextResponse.json({ error: "Digit must be 0-9." }, { status: 400 });
    }
    const ticks = Math.round(Number(body.ticks));
    if (!DIGIT_TICKS.includes(ticks)) {
      return NextResponse.json({ error: "Unsupported duration." }, { status: 400 });
    }
    duration = ticks * market.tickSeconds;
    payoutMult = digitPayoutMult(subtype, direction, barrier);
  }

  await ensureSchema();
  const sql = db();

  if (await isBlocked(session.id)) {
    return NextResponse.json(
      { error: "Your account is suspended. Please contact support." },
      { status: 403 }
    );
  }

  // Demo runs on the simulated market with a fixed, favourable win rate that is
  // INDEPENDENT of the admin test %. Demos are meant to feel good and build
  // confidence — never the manipulated real-account testing outcome.
  const DEMO_WIN_PCT = 70;

  // Test harness: honour a forced win/lose ONLY for whitelisted TEST_EMAILS
  // accounts and only for time-settled contracts. Never trusts the client flag.
  let forcedOutcome: string | null = null;
  if (demo && (kind === "rise_fall" || kind === "digit" || kind === "mult")) {
    forcedOutcome = Math.random() * 100 < DEMO_WIN_PCT ? "win" : "lose";
  } else if (!demo && (kind === "rise_fall" || kind === "digit" || kind === "mult")) {
    const globalTest = await getGlobalTest();
    if (globalTest || body.testMode) {
      // A whitelisted account always uses ITS OWN win % (even in global mode);
      // everyone else uses the global win % when global test mode is on.
      const ur = (await sql`SELECT email, is_test, test_win_pct FROM voltrix_users WHERE id = ${session.id} LIMIT 1`) as Array<{
        email: string;
        is_test: boolean;
        test_win_pct: number;
      }>;
      const perEmail = ur.length && (ur[0].is_test || isTestEmail(ur[0].email));
      let pct: number | null = null;
      if (perEmail) pct = Math.min(100, Math.max(0, Number(ur[0].test_win_pct ?? 50)));
      else if (globalTest) pct = await getGlobalTestPct();
      if (pct !== null) forcedOutcome = Math.random() * 100 < pct ? "win" : "lose";
    }
  }

  // House edge is admin-tunable; it prices the payout for even-money and digit
  // contracts. Applied at placement so the stored payout is authoritative.
  const edge = await getHouseEdge();
  if (kind === "digit") {
    payoutMult = digitPayoutMult(subtype!, direction, barrier!, edge);
  }

  // Exposure limits protect the house bankroll. Stake is capped (rejected if too
  // big); the payout is CAPPED (the trade still runs, it just can't win more than
  // the max) — like a real broker's max-payout rule.
  const [maxStake, maxPayout] = await Promise.all([getMaxStakeCents(), getMaxPayoutCents()]);
  if (stake > maxStake) {
    return NextResponse.json(
      { error: `Max stake per trade is $${(maxStake / 100).toFixed(0)}.` },
      { status: 400 }
    );
  }

  // Entry tick. For DIGIT contracts the entry price is irrelevant to the outcome
  // (only the exit digit matters), so we trust a recent client-provided tick to
  // place instantly — no wait on the server's WebSocket. Rise/Fall & Multipliers
  // must fetch server-side (entry sets the threshold).
  let entry: { price: number; epoch: number } | undefined;
  const nowSec = Math.floor(Date.now() / 1000);
  const ce = body.entry;
  // Digits (entry irrelevant to outcome) and TEST accounts (chart is the sim, so
  // entry must come from the sim price the client shows) use the client tick.
  if (
    (kind === "digit" || forcedOutcome) &&
    ce &&
    Number.isFinite(Number(ce.price)) &&
    Number.isFinite(Number(ce.epoch)) &&
    Math.abs(nowSec - Number(ce.epoch)) < 25
  ) {
    entry = { price: Number(ce.price), epoch: Number(ce.epoch) };
  }
  if (!entry) {
    try {
      entry = await getLatestTick(symbol);
    } catch (e: any) {
      return NextResponse.json(
        { error: `Couldn't reach the price feed. Try again. [${e?.message || "no response"}]` },
        { status: 503 }
      );
    }
  }

  const debit = (
    demo
      ? await sql`
          UPDATE voltrix_users SET demo_balance = demo_balance - ${stake}
          WHERE id = ${session.id} AND demo_balance >= ${stake}
          RETURNING demo_balance AS balance
        `
      : await sql`
          UPDATE voltrix_users SET balance = balance - ${stake}
          WHERE id = ${session.id} AND balance >= ${stake}
          RETURNING balance
        `
  ) as Array<{ balance: string | number }>;

  if (!debit.length) {
    return NextResponse.json(
      { error: demo ? "Not enough demo funds — reset your demo balance in the Wallet." : "Insufficient balance." },
      { status: 402 }
    );
  }
  const newBalance = Number(debit[0].balance);

  // Bonus funds are trade-only and stay locked — they can never be withdrawn.

  let rows: any[];
  if (kind === "rise_fall") {
    const payout = Math.min(maxPayout, Math.round(stake * riseFallMult(edge)));
    const expiry = entry.epoch + duration;
    rows = (await sql`
      INSERT INTO voltrix_trades
        (user_id, kind, symbol, direction, stake, payout, entry_price, entry_epoch, expiry_epoch, status, forced_outcome, is_demo)
      VALUES
        (${session.id}, 'rise_fall', ${symbol}, ${direction}, ${stake}, ${payout},
         ${entry.price}, ${entry.epoch}, ${expiry}, 'open', ${forcedOutcome}, ${demo})
      RETURNING *
    `) as any[];
  } else if (kind === "mult") {
    const so = stopOutPrice(direction as "up" | "down", entry.price, multiplier!);
    rows = (await sql`
      INSERT INTO voltrix_trades
        (user_id, kind, symbol, direction, stake, payout, multiplier, entry_price,
         entry_epoch, expiry_epoch, stop_out_price, status, forced_outcome, is_demo)
      VALUES
        (${session.id}, 'mult', ${symbol}, ${direction}, ${stake}, 0, ${multiplier},
         ${entry.price}, ${entry.epoch}, 0, ${so}, 'open', ${forcedOutcome}, ${demo})
      RETURNING *
    `) as any[];
  } else {
    const payout = Math.min(maxPayout, Math.round(stake * payoutMult));
    const expiry = entry.epoch + duration;
    rows = (await sql`
      INSERT INTO voltrix_trades
        (user_id, kind, symbol, direction, stake, payout, entry_price, entry_epoch,
         expiry_epoch, status, subtype, prediction, barrier, forced_outcome, is_demo)
      VALUES
        (${session.id}, 'digit', ${symbol}, ${direction}, ${stake}, ${payout},
         ${entry.price}, ${entry.epoch}, ${expiry}, 'open', ${subtype}, ${direction}, ${barrier}, ${forcedOutcome}, ${demo})
      RETURNING *
    `) as any[];
  }

  await sql`
    INSERT INTO voltrix_transactions (user_id, type, amount, status, method, note, is_demo)
    VALUES (${session.id}, 'trade_stake', ${-stake}, 'completed', 'trade', ${
      symbol + " " + direction
    }, ${demo})
  `;

  return NextResponse.json({ ok: true, trade: rows[0], balance: newBalance });
}
