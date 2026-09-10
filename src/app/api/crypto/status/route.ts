import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getPaymentStatus, receivedUsdCents } from "@/lib/crypto-pay";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client polls this while the user pays. We fetch the AUTHORITATIVE status from
// NOWPayments (server-to-server, not trusting the client), and the moment it's
// confirmed we credit the balance — so the user sees funds instantly without
// waiting on the async IPN webhook. Crediting is idempotent.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const paymentId = new URL(req.url).searchParams.get("paymentId") || "";
  if (!paymentId) return NextResponse.json({ error: "Missing paymentId." }, { status: 400 });

  await ensureSchema();
  const sql = db();

  let info;
  try {
    info = await getPaymentStatus(paymentId);
  } catch (e: any) {
    return NextResponse.json({ status: "unknown", error: e?.message }, { status: 200 });
  }

  const orderId = info.orderId;
  let credited = false;

  if (
    orderId &&
    (info.status === "finished" || info.status === "confirmed" || info.status === "partially_paid")
  ) {
    // Credit what actually arrived on-chain (fees usually shave a bit off).
    const creditCents =
      receivedUsdCents({
        priceAmount: info.priceAmount,
        payAmount: info.payAmount,
        actuallyPaid: info.actuallyPaid,
      }) ?? undefined;
    const r = await creditPendingDeposit(orderId, {
      creditCents,
      receipt: paymentId,
      note: creditCents != null ? "Crypto deposit credited (amount received)" : "Crypto deposit confirmed",
    });
    credited = r.ok;
  } else if (
    orderId &&
    (info.status === "failed" || info.status === "expired" || info.status === "refunded")
  ) {
    await rejectPendingDeposit(orderId, `Crypto payment ${info.status}`);
  }

  // Return the freshest balance so the UI updates immediately on credit.
  const bal = (await sql`SELECT balance FROM voltrix_users WHERE id = ${session.id}`) as Array<{
    balance: string | number;
  }>;

  return NextResponse.json({
    status: info.status,
    credited,
    balance: bal.length ? Number(bal[0].balance) : null,
  });
}
