import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/softwave";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SoftWave webhook. Verified by HMAC-SHA256 of the raw body (X-SoftWave-Signature).
// Credits deposits on payment.success, and completes/refunds payouts. Idempotent
// — SoftWave may retry, and duplicate provider callbacks never double-credit.
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-softwave-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let ev: any;
  try {
    ev = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const event = String(ev?.event || "");
  const txId = ev?.transaction_id ? String(ev.transaction_id) : "";
  const merchantRef = ev?.merchant_reference ? String(ev.merchant_reference) : "";
  const status = String(ev?.status || "").toUpperCase();
  if (!txId && !merchantRef) return NextResponse.json({ ok: true });
  // Payouts are keyed on our merchant_reference; collections on the transaction_id.
  const payoutKey = merchantRef || txId;

  await ensureSchema();
  const sql = db();

  // ---- Collections (deposits) ----
  if (event === "payment.success" || (event.startsWith("payment.") && status === "SUCCESS")) {
    await creditPendingDeposit(txId, {
      receipt: ev?.provider_receipt ? String(ev.provider_receipt) : txId,
      note: "M-Pesa deposit confirmed (SoftWave)",
    });
    return NextResponse.json({ ok: true });
  }
  if (event === "payment.failed" || (event.startsWith("payment.") && status === "FAILED")) {
    await rejectPendingDeposit(txId, "M-Pesa payment failed");
    return NextResponse.json({ ok: true });
  }

  // ---- Payouts (withdrawals) ----
  if (event === "payout.success" || (event.startsWith("payout.") && status === "SUCCESS")) {
    // Mark the reserved withdrawal complete (funds were already debited on request).
    await sql`
      UPDATE voltrix_transactions
      SET status = 'completed', note = 'M-Pesa payout completed (SoftWave)'
      WHERE provider_ref = ${payoutKey} AND type = 'withdrawal' AND status = 'pending'
    `;
    return NextResponse.json({ ok: true });
  }
  if (event === "payout.failed" || (event.startsWith("payout.") && status === "FAILED")) {
    // Refund atomically and idempotently: only refund a still-pending payout.
    const rows = (await sql`
      UPDATE voltrix_transactions
      SET status = 'rejected', note = 'M-Pesa payout failed — refunded (SoftWave)'
      WHERE provider_ref = ${payoutKey} AND type = 'withdrawal' AND status = 'pending'
      RETURNING user_id, amount
    `) as Array<{ user_id: number; amount: string | number }>;
    if (rows.length) {
      const refund = Math.abs(Number(rows[0].amount));
      await sql`UPDATE voltrix_users SET balance = balance + ${refund} WHERE id = ${rows[0].user_id}`;
    }
    return NextResponse.json({ ok: true });
  }

  // payment.created / payment.pending / anything else -> acknowledge, no state change.
  return NextResponse.json({ ok: true });
}
