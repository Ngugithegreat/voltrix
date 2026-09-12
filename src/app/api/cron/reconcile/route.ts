import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import {
  reconcileAllPendingTeronaPayouts,
  reconcileAllPendingTeronaDeposits,
} from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Background reconcile (Vercel Cron). Settles every recent pending TeronaPay
// payout and deposit across all users — refunding failed withdrawals and
// completing paid ones — so nothing depends on a user reloading their wallet.
// Vercel Cron calls this on a schedule; if CRON_SECRET is set it must match the
// Authorization header (Vercel sends `Bearer <CRON_SECRET>` automatically).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }
  await ensureSchema();
  const [payouts, deposits] = await Promise.all([
    reconcileAllPendingTeronaPayouts(),
    reconcileAllPendingTeronaDeposits(),
  ]);
  return NextResponse.json({ ok: true, payouts, deposits, at: new Date().toISOString() });
}
