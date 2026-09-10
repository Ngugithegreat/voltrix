import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { centsToKes, stkQuery, callbackToken } from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safaricom posts the STK Push result here. We do NOT trust the body's success
// claim on its own: we re-query Daraja for the authoritative result and check
// the amount before crediting, so a forged callback can't mint balance.
export async function POST(req: Request) {
  // Only honour callbacks carrying our secret token (if configured).
  const token = callbackToken();
  if (token) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== token) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Ignored" });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const cb = payload?.Body?.stkCallback;
  const checkoutId: string | undefined = cb?.CheckoutRequestID;
  if (!checkoutId) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  await ensureSchema();
  const sql = db();

  const found = (await sql`
    SELECT * FROM voltrix_transactions
    WHERE provider_ref = ${checkoutId} AND type = 'deposit' AND status = 'pending'
    LIMIT 1
  `) as any[];

  // Unknown or already-settled — acknowledge and stop.
  if (!found.length) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  const tx = found[0];

  const callbackSuccess = Number(cb?.ResultCode) === 0;

  // Amount actually paid, per the callback metadata.
  let paidKes = 0;
  let receipt: string | null = null;
  const items: any[] = cb?.CallbackMetadata?.Item || [];
  for (const it of items) {
    if (it?.Name === "Amount") paidKes = Number(it.Value);
    if (it?.Name === "MpesaReceiptNumber") receipt = String(it.Value);
  }
  const expectedKes = centsToKes(Number(tx.amount));

  // Authoritative re-check with Safaricom. If the query is reachable we trust
  // it; if it errors we fall back to the callback but still require the amount
  // to match what we asked for.
  let verified = false;
  try {
    const q = await stkQuery(checkoutId);
    verified = Number(q.ResultCode) === 0;
  } catch {
    verified = callbackSuccess && paidKes >= expectedKes;
  }

  if (!verified || !callbackSuccess) {
    // Failed / cancelled / unverifiable — mark rejected (no credit).
    await sql`
      UPDATE voltrix_transactions SET status = 'rejected', note = ${
        cb?.ResultDesc || "STK failed"
      }
      WHERE id = ${tx.id} AND status = 'pending'
    `;
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (paidKes && paidKes < expectedKes) {
    await sql`
      UPDATE voltrix_transactions SET status = 'rejected', note = ${
        `Underpaid: KES ${paidKes} of ${expectedKes}`
      }
      WHERE id = ${tx.id} AND status = 'pending'
    `;
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  // Atomically claim the row, then credit exactly once.
  const claimed = (await sql`
    UPDATE voltrix_transactions
    SET status = 'completed', receipt = ${receipt}, note = ${
      "M-Pesa confirmed" + (receipt ? " · " + receipt : "")
    }
    WHERE id = ${tx.id} AND status = 'pending'
    RETURNING *
  `) as any[];

  if (claimed.length) {
    await sql`UPDATE voltrix_users SET balance = balance + ${Number(tx.amount)} WHERE id = ${tx.user_id}`;
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
