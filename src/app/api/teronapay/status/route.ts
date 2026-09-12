import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getPayment, isPaid, isFailed } from "@/lib/teronapay";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client polls this while the mobile-money prompt is in flight. Reads the
// authoritative status from TeronaPay and credits the moment it's succeeded —
// so funds show instantly without waiting on the webhook. Idempotent.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  await ensureSchema();
  const sql = db();

  const tp = await getPayment(id);
  let state = "pending";
  let credited = false;
  let desc = "Waiting for your PIN…";

  if (tp.ok) {
    if (isPaid(tp.data.status)) {
      const r = await creditPendingDeposit(id, {
        receipt: tp.data.channel_receipt || tp.data.id,
        note: "Wallet top-up received",
      });
      credited = r.ok || r.reason === "not_found_or_settled";
      state = "success";
      desc = "Payment received.";
    } else if (isFailed(tp.data.status)) {
      await rejectPendingDeposit(id, "Payment failed");
      state = "failed";
      desc = "Payment failed or was cancelled.";
    }
  }

  const bal = (await sql`SELECT balance FROM voltrix_users WHERE id = ${session.id}`) as Array<{ balance: string | number }>;
  return NextResponse.json({ state, credited, desc, balance: bal.length ? Number(bal[0].balance) : null });
}
