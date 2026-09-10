import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { verifyWebhookSignature, verifyTransaction } from "@/lib/paystack";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack posts card/bank payment events here. We verify the HMAC signature,
// then re-verify the transaction with Paystack before crediting — so a forged
// webhook can't create balance.
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const reference: string | undefined = event?.data?.reference;
  if (!reference) return NextResponse.json({ ok: true });

  await ensureSchema();

  if (event.event === "charge.success") {
    try {
      const verified = await verifyTransaction(reference);
      if (verified.status === "success") {
        await creditPendingDeposit(reference, {
          receipt: reference,
          note: "Card/bank deposit confirmed",
        });
      }
    } catch {
      // leave pending for reconciliation if verification is unreachable
    }
  } else if (
    event.event === "charge.failed" ||
    event.event === "transaction.failed"
  ) {
    await rejectPendingDeposit(reference, "Card/bank payment failed");
  }

  return NextResponse.json({ ok: true });
}
