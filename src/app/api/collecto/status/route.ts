import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requestToPayStatus, isSuccess, isFailure } from "@/lib/collecto";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Collecto has no reliable webhook, so the client polls this endpoint after
// starting an MTN/Airtel deposit. It checks the gateway status and credits the
// wallet the moment the payment succeeds (idempotent).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ref = new URL(req.url).searchParams.get("ref") || "";
  if (!ref) return NextResponse.json({ error: "Missing ref." }, { status: 400 });

  await ensureSchema();
  const sql = db();

  const rows = (await sql`
    SELECT id, status FROM voltrix_transactions
    WHERE provider_ref = ${ref} AND user_id = ${session.id} AND type = 'deposit'
    LIMIT 1
  `) as Array<{ id: number; status: string }>;
  if (!rows.length) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Already settled?
  if (rows[0].status === "completed")
    return NextResponse.json({ status: "completed", ...(await balance(sql, session.id)) });
  if (rows[0].status === "rejected")
    return NextResponse.json({ status: "failed" });

  let gateway = "PENDING";
  try {
    gateway = await requestToPayStatus(ref);
  } catch {
    return NextResponse.json({ status: "pending" });
  }

  if (isSuccess(gateway)) {
    await creditPendingDeposit(ref, { note: "Mobile-money deposit confirmed" });
    return NextResponse.json({ status: "completed", ...(await balance(sql, session.id)) });
  }
  if (isFailure(gateway)) {
    await rejectPendingDeposit(ref, `Mobile money ${gateway}`);
    return NextResponse.json({ status: "failed" });
  }
  return NextResponse.json({ status: "pending" });
}

async function balance(sql: any, userId: number) {
  const b = (await sql`SELECT balance FROM voltrix_users WHERE id = ${userId}`) as any[];
  return { balance: Number(b[0]?.balance ?? 0) };
}
