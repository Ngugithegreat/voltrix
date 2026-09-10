import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { verifyIpnSignature, receivedUsdCents } from "@/lib/crypto-pay";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";
import { callbackToken } from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NOWPayments IPN. Verified by HMAC signature (and an optional URL token).
// Credits the deposit only when the on-chain payment is confirmed/finished.
export async function POST(req: Request) {
  const token = callbackToken();
  if (token) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== token) {
      return NextResponse.json({ ok: true });
    }
  }

  const raw = await req.text();
  const signature = req.headers.get("x-nowpayments-sig");
  if (!verifyIpnSignature(raw, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let ipn: any;
  try {
    ipn = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const orderId: string | undefined = ipn?.order_id;
  const status: string = String(ipn?.payment_status || "");
  if (!orderId) return NextResponse.json({ ok: true });

  await ensureSchema();

  // Credit the amount ACTUALLY received on-chain (network fees mean it's usually
  // a little under the invoice). `partially_paid` is included on purpose — that's
  // what NOWPayments reports when fees shaved the amount, and the user must still
  // be credited for what they sent.
  if (status === "finished" || status === "confirmed" || status === "partially_paid") {
    const creditCents =
      receivedUsdCents({
        priceAmount: Number(ipn?.price_amount || 0),
        payAmount: Number(ipn?.pay_amount || 0),
        actuallyPaid: Number(ipn?.actually_paid || 0),
      }) ?? undefined;
    await creditPendingDeposit(orderId, {
      creditCents,
      receipt: ipn?.payment_id ? String(ipn.payment_id) : null,
      note: creditCents != null ? "Crypto deposit credited (amount received)" : "Crypto deposit confirmed",
    });
  } else if (status === "failed" || status === "expired" || status === "refunded") {
    await rejectPendingDeposit(orderId, `Crypto payment ${status}`);
  }
  // waiting / confirming -> leave pending

  return NextResponse.json({ ok: true });
}
