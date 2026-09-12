import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accountNo } from "@/lib/format";
import { isTestEmail } from "@/lib/testmode";
import { getGlobalTest } from "@/lib/settings";
import { referralStats } from "@/lib/referral";
import { settleExpiredTrades, settleStopOuts } from "@/lib/trades";
import { reconcilePendingMpesaDeposits, reconcilePendingCryptoDeposits, reconcilePendingTeronaPayouts, reconcilePendingTeronaDeposits } from "@/lib/deposits";
import { isMpesaConfigured, isB2cConfigured, usdKesRate, usdKesWithdrawRate } from "@/lib/mpesa";
import { isPaystackConfigured } from "@/lib/paystack";
import { isCryptoConfigured } from "@/lib/crypto-pay";
import { isCollectoConfigured, usdUgxRate } from "@/lib/collecto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  // Opportunistically settle expired trades and reconcile any paid-but-not-yet-
  // credited M-Pesa deposits — so a deposit always reflects even if Safaricom's
  // callback never arrived. Runs before we read the balance below.
  try {
    await Promise.all([
      settleExpiredTrades(session.id),
      settleStopOuts(session.id),
      reconcilePendingMpesaDeposits(session.id),
      reconcilePendingCryptoDeposits(session.id),
      reconcilePendingTeronaDeposits(session.id),
      reconcilePendingTeronaPayouts(session.id),
    ]);
  } catch {
    /* non-fatal */
  }

  const sql = db();
  const [userRows, txns, openTrades, closedTrades, refStats] = await Promise.all([
    sql`SELECT id, name, email, role, balance, demo_balance, country, phone, status, kyc_status, kyc_reason, bonus_locked, is_test, test_win_pct, email_verified FROM voltrix_users WHERE id = ${session.id}` as Promise<any[]>,
    sql`SELECT * FROM voltrix_transactions WHERE user_id = ${session.id} ORDER BY created_at DESC LIMIT 40` as Promise<any[]>,
    sql`SELECT * FROM voltrix_trades WHERE user_id = ${session.id} AND status = 'open' ORDER BY created_at DESC` as Promise<any[]>,
    sql`SELECT * FROM voltrix_trades WHERE user_id = ${session.id} AND status != 'open' ORDER BY created_at DESC LIMIT 40` as Promise<any[]>,
    referralStats(session.id),
  ]);
  const globalTest = await getGlobalTest();

  const u = userRows[0];
  return NextResponse.json({
    user: u
      ? {
          ...u,
          balance: Number(u.balance),
          demo_balance: Number(u.demo_balance ?? 1000000),
          bonus_locked: Number(u.bonus_locked || 0),
          account_no: accountNo(u.id),
          isTest: !!u.is_test || isTestEmail(u.email),
          testWinPct: Number(u.test_win_pct ?? 50),
        }
      : null,
    transactions: txns,
    openTrades,
    closedTrades,
    referral: u
      ? { code: accountNo(u.id), referredCount: refStats.referredCount, earnedCents: refStats.earnedCents }
      : null,
    config: {
      mpesaDeposit: isMpesaConfigured(),
      mpesaWithdraw: isB2cConfigured(),
      cardDeposit: isPaystackConfigured(),
      cryptoDeposit: isCryptoConfigured(),
      ugMobileDeposit: isCollectoConfigured(),
      usdKesRate: usdKesRate(),
      usdKesWithdrawRate: usdKesWithdrawRate(),
      usdUgxRate: usdUgxRate(),
      globalTest,
    },
  });
}
