import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { stkStatus } from "@/lib/mpesa";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live STK status for the deposit UI. Queries Safaricom (authoritative), and the
// moment the payment succeeds it credits the balance — so the user sees "PIN
// entered → paid" live, without waiting on the async callback. Idempotent.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("checkoutRequestId") || "";
  if (!id) return NextResponse.json({ error: "Missing checkoutRequestId." }, { status: 400 });

  await ensureSchema();
  const sql = db();

  const rows = (await sql`
    SELECT id, status FROM voltrix_transactions
    WHERE provider_ref = ${id} AND user_id = ${session.id} AND type = 'deposit'
    LIMIT 1
  `) as Array<{ id: number; status: string }>;
  if (!rows.length) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const balanceOf = async () => {
    const b = (await sql`SELECT balance FROM voltrix_users WHERE id = ${session.id}`) as any[];
    return Number(b[0]?.balance ?? 0);
  };

  // Already settled — short-circuit.
  if (rows[0].status === "completed") {
    return NextResponse.json({ state: "success", credited: true, balance: await balanceOf() });
  }
  if (rows[0].status === "rejected") {
    return NextResponse.json({ state: "failed", desc: "This request was not completed.", balance: await balanceOf() });
  }

  let info;
  try {
    info = await stkStatus(id);
  } catch {
    return NextResponse.json({ state: "pending", desc: "Checking status…" });
  }

  let credited = false;
  if (info.state === "success") {
    const r = await creditPendingDeposit(id, { note: "M-Pesa deposit confirmed" });
    credited = r.ok || r.reason === "not_found_or_settled";
  } else if (["cancelled", "timeout", "insufficient", "wrong_pin", "failed"].includes(info.state)) {
    await rejectPendingDeposit(id, info.desc || `M-Pesa ${info.state}`);
  }

  return NextResponse.json({
    state: info.state,
    desc: info.desc,
    credited,
    balance: await balanceOf(),
  });
}
