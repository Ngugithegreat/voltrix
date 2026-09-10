import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { paymentStatus, isPaidStatus, isFailedStatus } from "@/lib/softwave";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client polls this while the M-Pesa STK is in flight. We read the authoritative
// status from SoftWave (server-to-server) and credit the moment it's SUCCESS —
// so funds show instantly without waiting on the async webhook. Idempotent.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  await ensureSchema();
  const sql = db();

  const sw = await paymentStatus(id);
  let state = "pending";
  let credited = false;
  let desc = "Waiting for your M-Pesa PIN…";

  if (sw.ok) {
    if (isPaidStatus(sw.data.status)) {
      const r = await creditPendingDeposit(id, {
        receipt: (sw.data as any).provider_receipt || sw.data.transaction_id || null,
        note: "M-Pesa deposit confirmed (SoftWave)",
      });
      credited = r.ok || r.reason === "not_found_or_settled";
      state = "success";
      desc = "Payment received.";
    } else if (isFailedStatus(sw.data.status)) {
      await rejectPendingDeposit(id, "M-Pesa payment failed");
      state = "failed";
      desc = (sw.data as any).failure_message || "Payment failed or was cancelled.";
    }
  }

  const bal = (await sql`SELECT balance FROM voltrix_users WHERE id = ${session.id}`) as Array<{ balance: string | number }>;
  return NextResponse.json({ state, credited, desc, balance: bal.length ? Number(bal[0].balance) : null });
}
