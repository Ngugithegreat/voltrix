import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/teronapay";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TeronaPay webhook. Verified by HMAC-SHA256 (X-Nowpesa-Signature). Credits
// deposits on payment.succeeded and completes/refunds payouts. Idempotent — the
// crediting and the atomic status flips make replays safe. We always return 200
// so the one-time activation probe passes; events are only acted on when the
// signature verifies (unsigned/forged bodies are ignored, never processed).
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-nowpesa-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ ok: true }); // ack probe / ignore unsigned
  }

  let ev: any;
  try {
    ev = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const type = String(ev?.type || "");
  const data = ev?.data || {};
  await ensureSchema();
  const sql = db();

  if (type === "payment.succeeded") {
    await creditPendingDeposit(String(data.payment_id || ""), {
      receipt: data.channel_receipt ? String(data.channel_receipt) : null,
      note: "Wallet top-up received",
    });
  } else if (type === "payment.failed") {
    await rejectPendingDeposit(String(data.payment_id || ""), "Payment failed");
  } else if (type === "payout.succeeded") {
    await sql`
      UPDATE voltrix_transactions
      SET status = 'completed', note = 'Payout completed'
      WHERE provider_ref = ${String(data.payout_id || "")} AND type = 'withdrawal' AND status = 'pending'
    `;
  } else if (type === "payout.failed") {
    const rows = (await sql`
      UPDATE voltrix_transactions
      SET status = 'rejected', note = 'Payout failed — refunded'
      WHERE provider_ref = ${String(data.payout_id || "")} AND type = 'withdrawal' AND status = 'pending'
      RETURNING user_id, amount
    `) as Array<{ user_id: number; amount: string | number }>;
    if (rows.length) {
      const refund = Math.abs(Number(rows[0].amount));
      await sql`UPDATE voltrix_users SET balance = balance + ${refund} WHERE id = ${rows[0].user_id}`;
    }
  }

  return NextResponse.json({ ok: true });
}
