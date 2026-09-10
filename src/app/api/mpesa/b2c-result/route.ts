import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { callbackToken } from "@/lib/mpesa";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safaricom posts the B2C payout result here. On success the withdrawal (funds
// already reserved) is marked complete; on failure the reserved funds are
// refunded to the user.
export async function POST(req: Request) {
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

  const result = payload?.Result;
  const conversationId: string | undefined = result?.ConversationID;
  const originatorId: string | undefined = result?.OriginatorConversationID;
  if (!conversationId && !originatorId) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  await ensureSchema();
  const sql = db();

  const found = (await sql`
    SELECT * FROM voltrix_transactions
    WHERE (provider_ref = ${conversationId ?? ""} OR provider_ref = ${originatorId ?? ""})
      AND type = 'withdrawal' AND status = 'pending'
    LIMIT 1
  `) as any[];

  if (!found.length) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  const tx = found[0];
  const success = Number(result?.ResultCode) === 0;

  // Pull the M-Pesa receipt from the result parameters if present.
  let receipt: string | null = null;
  const params: any[] = result?.ResultParameters?.ResultParameter || [];
  for (const p of params) {
    if (p?.Key === "TransactionReceipt" || p?.Key === "ReceiptNo") {
      receipt = String(p.Value);
    }
  }

  if (success) {
    await sql`
      UPDATE voltrix_transactions
      SET status = 'completed', receipt = ${receipt}, note = ${
        "Paid to M-Pesa" + (receipt ? " · " + receipt : "")
      }
      WHERE id = ${tx.id} AND status = 'pending'
    `;
    void sendPushToUser(tx.user_id, {
      title: "Withdrawal paid 💸",
      body: `$${(Math.abs(Number(tx.amount)) / 100).toFixed(2)} has been sent to your M-Pesa.`,
      url: "/wallet",
    });
  } else {
    // Refund the reservation (amount is negative -> subtract to add back).
    const claimed = (await sql`
      UPDATE voltrix_transactions
      SET status = 'rejected', note = ${result?.ResultDesc || "B2C failed"}
      WHERE id = ${tx.id} AND status = 'pending'
      RETURNING *
    `) as any[];
    if (claimed.length) {
      await sql`UPDATE voltrix_users SET balance = balance - ${Number(tx.amount)} WHERE id = ${tx.user_id}`;
    }
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
