import { db } from "./db";
import { sendEmail, depositReceiptEmail } from "./email";
import { payReferralOnDeposit } from "./referral";
import { stkStatus } from "./mpesa";
import { sendPushToUser } from "./push";
import { getPaymentStatus, receivedUsdCents, isCryptoConfigured } from "./crypto-pay";
import { isTeronaConfigured, getPayment, getPayout, isPaid, isFailed } from "./teronapay";

// Shared, idempotent crediting for automated deposits. Every provider webhook
// funnels through here: it finds the PENDING deposit by its provider reference,
// atomically flips it to completed, and credits the user exactly once. A
// replayed or duplicate webhook is a no-op.

type PendingTx = {
  id: number;
  user_id: number;
  amount: number | string;
  status: string;
};

export async function creditPendingDeposit(
  providerRef: string,
  opts: { creditCents?: number; receipt?: string | null; note?: string } = {}
): Promise<{ ok: boolean; reason?: string; credited?: number }> {
  if (!providerRef) return { ok: false, reason: "no_ref" };
  const sql = db();

  const rows = (await sql`
    SELECT id, user_id, amount, status FROM voltrix_transactions
    WHERE provider_ref = ${providerRef} AND type = 'deposit' AND status = 'pending'
    LIMIT 1
  `) as PendingTx[];
  if (!rows.length) return { ok: false, reason: "not_found_or_settled" };

  const tx = rows[0];
  const requested = Number(tx.amount);

  // Credit the ACTUAL amount received when the provider tells us it (crypto:
  // network fees mean what arrives is usually less than the invoice; the user
  // must get what they actually sent — no more, no less). Fiat/M-Pesa pay the
  // exact amount, so we fall back to the requested amount.
  let amount =
    opts.creditCents != null && Number.isFinite(opts.creditCents) && opts.creditCents > 0
      ? Math.round(opts.creditCents)
      : requested;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "zero_amount" };

  // Atomic claim: also stamp the row's amount to what was truly credited, so the
  // user's history shows the real figure ($10.50, not the $12 invoice).
  const claimed = (await sql`
    UPDATE voltrix_transactions
    SET status = 'completed', amount = ${amount}, receipt = ${opts.receipt ?? null}, note = ${
      opts.note ?? "Deposit confirmed"
    }
    WHERE id = ${tx.id} AND status = 'pending'
    RETURNING id
  `) as Array<{ id: number }>;

  if (!claimed.length) return { ok: false, reason: "race" };

  await sql`UPDATE voltrix_users SET balance = balance + ${amount} WHERE id = ${tx.user_id}`;

  // Pay the referrer their share if this is the user's first deposit (idempotent).
  await payReferralOnDeposit(tx.user_id, amount).catch(() => {});

  // Push: deposit received (no-op unless push is configured).
  void sendPushToUser(tx.user_id, {
    title: "Deposit received ✅",
    body: `$${(amount / 100).toFixed(2)} has been added to your balance.`,
    url: "/wallet",
  });

  // Email receipt — fire-and-forget so crediting never depends on email.
  void (async () => {
    try {
      const u = (await sql`
        SELECT u.email, u.name, t.method
        FROM voltrix_users u JOIN voltrix_transactions t ON t.id = ${tx.id}
        WHERE u.id = ${tx.user_id} LIMIT 1
      `) as Array<{ email: string; name: string; method: string | null }>;
      if (u.length && u[0].email) {
        const mail = depositReceiptEmail(u[0].name, amount / 100, u[0].method || "your payment method");
        await sendEmail({ to: u[0].email, subject: mail.subject, html: mail.html, text: mail.text });
      }
    } catch {
      /* non-fatal */
    }
  })();

  return { ok: true, credited: amount };
}

/**
 * Safety net for automated M-Pesa deposits: re-queries Safaricom for any recent
 * pending deposit and credits it if it was actually paid (or drops it if it
 * cancelled/failed). This guarantees a paid deposit still reflects even when the
 * async Safaricom callback never reaches us AND the client stopped polling
 * (e.g. the user closed the page). Best-effort and idempotent — safe to call on
 * every wallet load. No-ops when there are no recent pending M-Pesa deposits.
 */
export async function reconcilePendingMpesaDeposits(userId: number): Promise<void> {
  const sql = db();
  const pending = (await sql`
    SELECT provider_ref FROM voltrix_transactions
    WHERE user_id = ${userId}
      AND type = 'deposit' AND status = 'pending' AND method = 'mpesa'
      AND provider_ref IS NOT NULL
      AND created_at > now() - interval '30 minutes'
    ORDER BY created_at DESC
    LIMIT 5
  `) as Array<{ provider_ref: string }>;

  for (const p of pending) {
    try {
      const info = await stkStatus(p.provider_ref);
      if (info.state === "success") {
        await creditPendingDeposit(p.provider_ref, { note: "M-Pesa deposit confirmed" });
      } else if (
        ["cancelled", "timeout", "insufficient", "wrong_pin", "failed"].includes(info.state)
      ) {
        await rejectPendingDeposit(p.provider_ref, info.desc);
      }
      // "pending" -> leave it; a later load (or the callback) will settle it.
    } catch {
      /* best-effort — never block the wallet */
    }
  }
}

/**
 * Safety net for crypto deposits (mirrors the M-Pesa one): re-queries
 * NOWPayments for any recent pending crypto deposit and credits the amount that
 * ACTUALLY arrived on-chain — even if it's below the invoice/minimum — or drops
 * it if it failed. This guarantees a paid crypto deposit still lands when the
 * async IPN webhook is missed AND the user has left the page. Idempotent and
 * best-effort; safe to call on every wallet load.
 */
export async function reconcilePendingCryptoDeposits(userId: number): Promise<void> {
  if (!isCryptoConfigured()) return;
  const sql = db();
  const pending = (await sql`
    SELECT provider_ref, receipt FROM voltrix_transactions
    WHERE user_id = ${userId}
      AND type = 'deposit' AND status = 'pending' AND method = 'crypto'
      AND receipt IS NOT NULL
      AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC
    LIMIT 5
  `) as Array<{ provider_ref: string; receipt: string }>;

  for (const p of pending) {
    try {
      const info = await getPaymentStatus(p.receipt); // receipt holds the NOWPayments payment_id
      if (["finished", "confirmed", "partially_paid"].includes(info.status)) {
        const creditCents =
          receivedUsdCents({
            priceAmount: info.priceAmount,
            payAmount: info.payAmount,
            actuallyPaid: info.actuallyPaid,
          }) ?? undefined;
        // Only credit once there's something actually paid; ignore an empty
        // partially_paid (0 received) so we don't settle a zero deposit.
        if (creditCents != null && creditCents > 0) {
          await creditPendingDeposit(p.provider_ref, {
            creditCents,
            receipt: p.receipt,
            note: "Crypto deposit credited (amount received)",
          });
        }
      } else if (["failed", "expired", "refunded"].includes(info.status)) {
        await rejectPendingDeposit(p.provider_ref, `Crypto payment ${info.status}`);
      }
      // waiting / confirming -> leave pending
    } catch {
      /* best-effort — never block the wallet */
    }
  }
}

/**
 * Safety net for TeronaPay payouts (withdrawals): reconciles pending withdrawals
 * against TeronaPay so a completed payout flips to done (and a failed one is
 * refunded) even if the webhook never lands. Keyed on TeronaPay's payout id
 * (stored as provider_ref). Idempotent and best-effort; safe on every wallet load.
 */
export async function reconcilePendingTeronaPayouts(userId: number): Promise<void> {
  if (!isTeronaConfigured()) return;
  const sql = db();
  const pending = (await sql`
    SELECT id, provider_ref, amount FROM voltrix_transactions
    WHERE user_id = ${userId} AND type = 'withdrawal' AND status = 'pending'
      AND method IN ('mpesa','mtn','airtel','tzmobile') AND provider_ref IS NOT NULL
      AND created_at > now() - interval '3 days'
    ORDER BY created_at DESC
    LIMIT 10
  `) as Array<{ id: number; provider_ref: string; amount: string | number }>;

  for (const w of pending) {
    try {
      const tp = await getPayout(w.provider_ref);
      if (!tp.ok) continue;
      if (isPaid(tp.data.status)) {
        await sql`UPDATE voltrix_transactions SET status = 'completed', note = 'Payout completed' WHERE id = ${w.id} AND status = 'pending'`;
      } else if (isFailed(tp.data.status)) {
        const r = (await sql`
          UPDATE voltrix_transactions SET status = 'rejected', note = 'Payout failed — refunded'
          WHERE id = ${w.id} AND status = 'pending' RETURNING user_id, amount
        `) as Array<{ user_id: number; amount: string | number }>;
        if (r.length) {
          const refund = Math.abs(Number(r[0].amount));
          await sql`UPDATE voltrix_users SET balance = balance + ${refund} WHERE id = ${r[0].user_id}`;
        }
      }
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Safety net for TeronaPay deposits: credits pending mobile-money deposits that
 * TeronaPay reports as succeeded, in case the webhook and the on-page poll were
 * both missed (user closed the page). Keyed on the TeronaPay payment id.
 */
export async function reconcilePendingTeronaDeposits(userId: number): Promise<void> {
  if (!isTeronaConfigured()) return;
  const sql = db();
  const pending = (await sql`
    SELECT provider_ref FROM voltrix_transactions
    WHERE user_id = ${userId} AND type = 'deposit' AND status = 'pending'
      AND method IN ('mpesa','mtn','airtel','tzmobile') AND provider_ref IS NOT NULL
      AND created_at > now() - interval '1 hour'
    ORDER BY created_at DESC
    LIMIT 5
  `) as Array<{ provider_ref: string }>;

  for (const d of pending) {
    try {
      const tp = await getPayment(d.provider_ref);
      if (!tp.ok) continue;
      if (isPaid(tp.data.status)) {
        await creditPendingDeposit(d.provider_ref, {
          receipt: tp.data.channel_receipt || tp.data.id,
          note: "Wallet top-up received",
        });
      } else if (isFailed(tp.data.status)) {
        await rejectPendingDeposit(d.provider_ref, "Payment failed");
      }
    } catch {
      /* best-effort */
    }
  }
}

export async function rejectPendingDeposit(
  providerRef: string,
  _note = "Payment failed"
): Promise<void> {
  if (!providerRef) return;
  const sql = db();
  // A cancelled/failed deposit was never credited — just drop the record so we
  // don't keep abandoned pending deposits around.
  await sql`
    DELETE FROM voltrix_transactions
    WHERE provider_ref = ${providerRef} AND type = 'deposit' AND status = 'pending'
  `;
}
