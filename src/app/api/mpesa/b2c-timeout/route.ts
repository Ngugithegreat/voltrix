import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { callbackToken } from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safaricom calls this if the B2C request times out in its queue — meaning the
// payout did NOT process. We release the reservation back to the user's balance
// so a failed withdrawal never leaves the client charged.
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

  const result = payload?.Result || {};
  const conversationId: string | undefined = result?.ConversationID;
  const originatorId: string | undefined = result?.OriginatorConversationID;

  if (conversationId || originatorId) {
    await ensureSchema();
    const sql = db();
    // Atomically claim the pending row, then refund the reserved amount once.
    const claimed = (await sql`
      UPDATE voltrix_transactions
      SET status = 'rejected', note = 'B2C queue timeout — payout not processed, refunded'
      WHERE (provider_ref = ${conversationId ?? ""} OR provider_ref = ${originatorId ?? ""})
        AND type = 'withdrawal' AND status = 'pending'
      RETURNING user_id, amount
    `) as Array<{ user_id: number; amount: number | string }>;
    if (claimed.length) {
      // amount is stored negative -> subtract to add it back to the balance.
      await sql`UPDATE voltrix_users SET balance = balance - ${Number(claimed[0].amount)} WHERE id = ${claimed[0].user_id}`;
    }
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
