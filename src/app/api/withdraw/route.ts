import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSoftwaveConfigured, b2cPayout as swB2cPayout } from "@/lib/softwave";
import { isBlocked, getWithdrawDailyCount, getWithdrawDailyMaxCents } from "@/lib/settings";
import { sendEmail, withdrawalReceiptEmail } from "@/lib/email";
import { cents } from "@/lib/format";
import { BRAND_NAME } from "@/lib/brand";
import { isTestEmail } from "@/lib/testmode";
import {
  isB2cConfigured,
  normalizePhone,
  centsToKesWithdraw,
  b2cPayment,
  callbackBase,
  callbackToken,
} from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Withdrawal. Funds are RESERVED (debited) immediately. If method is 'mpesa' and
// B2C is configured, money is sent to the phone automatically and the M-Pesa
// result callback marks it complete (or refunds on failure). Otherwise it's a
// manual request an admin approves/pays out.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const amount = cents(Number(body.amount));
  const method = String(body.method || "manual");
  const rawRef = String(body.reference || "").trim();

  if (!Number.isFinite(amount) || amount < 500) {
    return NextResponse.json({ error: "Minimum withdrawal is $5.00." }, { status: 400 });
  }
  if (!rawRef) {
    return NextResponse.json(
      { error: "Enter where to send the money (phone / address / account)." },
      { status: 400 }
    );
  }

  const automated = method === "mpesa" && (isSoftwaveConfigured() || isB2cConfigured());

  // Validate the phone BEFORE reserving funds for automated payouts.
  let phone: string | null = null;
  if (automated) {
    phone = normalizePhone(rawRef);
    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid M-Pesa phone number (e.g. 0712345678)." },
        { status: 400 }
      );
    }
  }

  await ensureSchema();
  const sql = db();

  if (await isBlocked(session.id)) {
    return NextResponse.json(
      { error: "Your account is suspended. Please contact support." },
      { status: 403 }
    );
  }

  const flow = (await sql`
    SELECT
      balance, email, is_test,
      COALESCE(bonus_locked, 0) AS bonus_locked,
      COALESCE((SELECT COUNT(*) FROM voltrix_trades
                 WHERE user_id = ${session.id} AND is_demo = false), 0) AS trades
    FROM voltrix_users WHERE id = ${session.id} LIMIT 1
  `) as Array<{ balance: string | number; email: string; is_test: boolean; bonus_locked: string | number; trades: string | number }>;
  const bal = Number(flow[0]?.balance ?? 0);
  const locked = Number(flow[0]?.bonus_locked ?? 0);
  const trades = Number(flow[0]?.trades ?? 0);
  // Whitelisted test accounts (admin Test accounts / TEST_EMAILS) bypass the
  // withdrawal restrictions (must-trade, daily caps, bonus lock) so QA can cash
  // out freely.
  const isTester = !!flow[0]?.is_test || isTestEmail(flow[0]?.email);

  // Must-trade rule: you can't deposit and cash straight back out — you have to
  // place at least ONE trade first. Any single real trade unlocks withdrawals.
  if (!isTester && trades < 1) {
    return NextResponse.json(
      {
        error: `Place at least one trade before withdrawing — ${BRAND_NAME} is a trading platform, so open a trade first, then you can withdraw.`,
      },
      { status: 403 }
    );
  }

  // Withdrawable = balance minus any locked bonus (testers ignore the bonus lock).
  const withdrawable = Math.max(0, bal - (isTester ? 0 : locked));
  if (amount > withdrawable) {
    return NextResponse.json(
      { error: `You can withdraw up to $${(withdrawable / 100).toFixed(2)} right now.` },
      { status: 403 }
    );
  }

  // Instant-withdrawal daily limits (per account, resets at UTC midnight).
  // Skipped for whitelisted testers.
  if (!isTester) {
    const [maxCount, maxDaily] = await Promise.all([getWithdrawDailyCount(), getWithdrawDailyMaxCents()]);
    const today = (await sql`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(-amount), 0) AS total
      FROM voltrix_transactions
      WHERE user_id = ${session.id} AND type = 'withdrawal' AND status != 'rejected'
        AND created_at >= date_trunc('day', now())
    `) as Array<{ n: number; total: string | number }>;
    const usedCount = Number(today[0]?.n ?? 0);
    const usedTotal = Number(today[0]?.total ?? 0);
    if (usedCount >= maxCount) {
      return NextResponse.json(
        { error: `Daily withdrawal limit reached — you can make ${maxCount} withdrawal${maxCount === 1 ? "" : "s"} per day. Try again tomorrow.` },
        { status: 429 }
      );
    }
    if (usedTotal + amount > maxDaily) {
      const left = Math.max(0, maxDaily - usedTotal);
      return NextResponse.json(
        { error: `This exceeds your daily withdrawal limit of $${(maxDaily / 100).toFixed(0)}. You can still withdraw $${(left / 100).toFixed(2)} today.` },
        { status: 429 }
      );
    }
  }

  // Reserve funds atomically. Race-safe: can't overdraw, and (for real users)
  // can't withdraw locked bonus. Testers may withdraw their whole balance.
  const debit = (
    isTester
      ? await sql`
          UPDATE voltrix_users SET balance = balance - ${amount}
          WHERE id = ${session.id} AND balance >= ${amount}
          RETURNING balance
        `
      : await sql`
          UPDATE voltrix_users SET balance = balance - ${amount}
          WHERE id = ${session.id}
            AND balance - GREATEST(COALESCE(bonus_locked, 0), 0) >= ${amount}
          RETURNING balance
        `
  ) as any[];

  if (!debit.length) {
    return NextResponse.json(
      { error: `You can withdraw up to $${(withdrawable / 100).toFixed(2)} right now.` },
      { status: 402 }
    );
  }
  const balanceAfter = Number(debit[0].balance);

  // ---- Automated M-Pesa payout via SoftWave (preferred PSP) ----
  if (automated && phone && isSoftwaveConfigured()) {
    const amountKes = centsToKesWithdraw(amount);
    const merchantRef = `swp_${session.id}_${randomUUID().slice(0, 12)}`;
    const sw = await swB2cPayout({ amountKes, phone, reference: merchantRef });
    if (!sw.ok) {
      // Rejected at submission (e.g. insufficient float) — refund immediately so
      // the client is never left debited for a payout that never went out.
      await sql`UPDATE voltrix_users SET balance = balance + ${amount} WHERE id = ${session.id}`;
      return NextResponse.json(
        { error: sw.error || "Could not send the M-Pesa payout. You were not charged." },
        { status: 502 }
      );
    }
    // Key the withdrawal on OUR merchant_reference — SoftWave echoes it on both
    // the payout object and the webhook, and (unlike a transaction_id field) it's
    // guaranteed present. This is what the webhook and the reconcile match on.
    const rows = (await sql`
      INSERT INTO voltrix_transactions
        (user_id, type, amount, status, method, reference, provider_ref, note)
      VALUES
        (${session.id}, 'withdrawal', ${-amount}, 'pending', 'mpesa', ${phone},
         ${merchantRef}, ${"B2C sent · SoftWave · KES " + amountKes})
      RETURNING *
    `) as any[];
    {
      const mail = withdrawalReceiptEmail(session.name, amount / 100, phone);
      void sendEmail({ to: session.email, subject: mail.subject, html: mail.html, text: mail.text }).catch(() => {});
    }
    return NextResponse.json({
      ok: true,
      mpesa: true,
      amountKes,
      transaction: rows[0],
      balance: balanceAfter,
      message: "Withdrawal is being sent to your M-Pesa. It usually arrives within a minute.",
    });
  }

  // ---- Automated M-Pesa payout via Daraja B2C (fallback) ----
  if (automated && phone) {
    const amountKes = centsToKesWithdraw(amount);
    try {
      const cbBase = callbackBase(req.url);
      const token = callbackToken();
      const q = token ? `?token=${encodeURIComponent(token)}` : "";

      const b2c = await b2cPayment({
        phone,
        amountKes,
        remarks: `${BRAND_NAME} withdrawal`,
        resultUrl: `${cbBase}/api/mpesa/b2c-result${q}`,
        timeoutUrl: `${cbBase}/api/mpesa/b2c-timeout${q}`,
      });

      // Safaricom accepts a payout with ResponseCode "0". Anything else (bad
      // initiator, insufficient B2C float, etc.) means it was REJECTED at
      // submission and no callback will ever come — so refund immediately and
      // never leave a stuck pending withdrawal / a charged client.
      if (b2c.ResponseCode !== "0" || !b2c.ConversationID) {
        await sql`UPDATE voltrix_users SET balance = balance + ${amount} WHERE id = ${session.id}`;
        return NextResponse.json(
          { error: b2c.ResponseDescription || "Could not send the M-Pesa payout. You were not charged." },
          { status: 502 }
        );
      }

      const rows = (await sql`
        INSERT INTO voltrix_transactions
          (user_id, type, amount, status, method, reference, provider_ref, note)
        VALUES
          (${session.id}, 'withdrawal', ${-amount}, 'pending', 'mpesa', ${phone},
           ${b2c.ConversationID}, ${"B2C sent · KES " + amountKes})
        RETURNING *
      `) as any[];

      {
        const mail = withdrawalReceiptEmail(session.name, amount / 100, phone);
        void sendEmail({ to: session.email, subject: mail.subject, html: mail.html, text: mail.text }).catch(() => {});
      }
      return NextResponse.json({
        ok: true,
        mpesa: true,
        amountKes,
        transaction: rows[0],
        balance: balanceAfter,
        message: "Withdrawal is being sent to your M-Pesa. It usually arrives within a minute.",
      });
    } catch (e: any) {
      // Payout couldn't be initiated — refund the reservation.
      await sql`UPDATE voltrix_users SET balance = balance + ${amount} WHERE id = ${session.id}`;
      return NextResponse.json(
        { error: e?.message || "Could not send the M-Pesa payout. You were not charged." },
        { status: 502 }
      );
    }
  }

  // ---- Instant withdrawal (no admin approval) ----
  // Completed immediately within the daily caps; funds are paid out to the given
  // destination by the operator's payout process.
  const rows = (await sql`
    INSERT INTO voltrix_transactions (user_id, type, amount, status, method, reference, note)
    VALUES (${session.id}, 'withdrawal', ${-amount}, 'completed', ${method}, ${rawRef}, 'Instant withdrawal')
    RETURNING *
  `) as any[];

  {
    const mail = withdrawalReceiptEmail(session.name, amount / 100, rawRef);
    void sendEmail({ to: session.email, subject: mail.subject, html: mail.html, text: mail.text }).catch(() => {});
  }
  return NextResponse.json({
    ok: true,
    transaction: rows[0],
    balance: balanceAfter,
    message: `Withdrawal of $${(amount / 100).toFixed(2)} sent to ${rawRef}.`,
  });
}
