import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getHouseEdge, getReferralPct, getMaxStakeCents, getMaxPayoutCents, getGlobalTest, getGlobalTestPct, getWithdrawDailyCount, getWithdrawDailyMaxCents } from "@/lib/settings";
import { accountNo } from "@/lib/format";
import { getAdminCache, setAdminCache } from "@/lib/adminCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  // Serve a very recent cached snapshot instantly; the heavy aggregates below
  // run at most once per TTL per instance. Admin actions bust this cache.
  const cached = getAdminCache();
  if (cached) return NextResponse.json(cached);

  await ensureSchema();
  const sql = db();

  const [pending, users, kpi, daily, topUsers, kycPending, testAccounts, withdrawalsRaw, attentionRaw] = await Promise.all([
    sql`
      SELECT t.*, u.email, u.name AS user_name
      FROM voltrix_transactions t JOIN voltrix_users u ON u.id = t.user_id
      WHERE t.status = 'pending'
      ORDER BY t.created_at ASC
      LIMIT 300
    ` as Promise<any[]>,
    sql`SELECT id, name, email, role, balance, created_at FROM voltrix_users ORDER BY created_at DESC LIMIT 100` as Promise<any[]>,
    sql`
      SELECT
        (SELECT COUNT(*) FROM voltrix_users) AS user_count,
        (SELECT COALESCE(SUM(balance),0) FROM voltrix_users) AS total_balance,
        (SELECT COUNT(*) FROM voltrix_trades WHERE is_demo = false) AS trade_count,
        (SELECT COUNT(*) FROM voltrix_trades WHERE status = 'won' AND is_demo = false) AS won_count,
        (SELECT COUNT(*) FROM voltrix_trades WHERE status = 'lost' AND is_demo = false) AS lost_count,
        (SELECT COALESCE(SUM(amount),0) FROM voltrix_transactions WHERE type='deposit' AND status='completed') AS deposits_total,
        (SELECT COALESCE(SUM(-amount),0) FROM voltrix_transactions WHERE type='withdrawal' AND status='completed') AS withdrawals_total,
        (SELECT COUNT(*) FROM voltrix_transactions WHERE type='deposit' AND status='pending') AS deposits_pending,
        (SELECT COUNT(*) FROM voltrix_transactions WHERE type='withdrawal' AND status='pending') AS withdrawals_pending,
        (SELECT COALESCE(SUM(-amount),0) FROM voltrix_transactions WHERE type='trade_stake' AND is_demo = false) AS staked_total,
        (SELECT COALESCE(SUM(amount),0) FROM voltrix_transactions WHERE type='trade_payout' AND is_demo = false) AS payout_total,
        (SELECT COALESCE(SUM(amount),0) FROM voltrix_transactions WHERE type='bonus' AND amount > 0) AS bonus_issued,
        (SELECT COALESCE(SUM(bonus_locked),0) FROM voltrix_users) AS bonus_locked
    ` as Promise<any[]>,
    sql`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COALESCE(SUM(-amount),0) AS volume
      FROM voltrix_transactions
      WHERE type='trade_stake' AND is_demo = false AND created_at > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1
    ` as Promise<any[]>,
    // Only the newest 100 accounts are aggregated for the default table — the
    // admin finds anyone else via server-side search (/api/admin/search). The
    // CTE limits to those 100 users FIRST, so the heavy per-user aggregation
    // touches 100 rows, not the whole (100k+) user base. This is what stops the
    // admin dashboard from hanging.
    sql`
      WITH recent AS (
        SELECT id, name, email, balance, status, promo, created_at
        FROM voltrix_users ORDER BY created_at DESC LIMIT 100
      )
      SELECT u.id, u.name, u.email, u.balance, u.status, u.promo, u.created_at,
        COALESCE(SUM(CASE WHEN t.status='won' THEN t.payout - t.stake
                          WHEN t.status='lost' THEN -t.stake ELSE 0 END),0) AS pnl,
        COUNT(t.id) FILTER (WHERE t.status != 'open') AS trades,
        COALESCE((SELECT SUM(x.amount) FROM voltrix_transactions x
                   WHERE x.user_id = u.id AND x.type='deposit' AND x.status='completed'),0) AS deposited,
        COALESCE((SELECT SUM(-x.amount) FROM voltrix_transactions x
                   WHERE x.user_id = u.id AND x.type='withdrawal' AND x.status<>'rejected'),0) AS withdrawn,
        (SELECT x.method FROM voltrix_transactions x
                   WHERE x.user_id = u.id AND x.type='deposit' AND x.status='completed' AND x.method IS NOT NULL
                   ORDER BY x.created_at DESC LIMIT 1) AS deposit_method
      FROM recent u
      LEFT JOIN voltrix_trades t ON t.user_id = u.id AND t.is_demo = false
      GROUP BY u.id, u.name, u.email, u.balance, u.status, u.promo, u.created_at
      ORDER BY u.created_at DESC
    ` as Promise<any[]>,
    sql`
      SELECT id, name, email, kyc_name, kyc_id_number, kyc_phone, kyc_submitted_at
      FROM voltrix_users
      WHERE kyc_status = 'pending'
      ORDER BY kyc_submitted_at ASC NULLS LAST
      LIMIT 1000
    ` as Promise<any[]>,
    sql`SELECT id, name, email, test_win_pct FROM voltrix_users WHERE is_test = true ORDER BY email` as Promise<any[]>,
    sql`
      SELECT t.id, t.user_id, t.amount, t.status, t.method, t.reference, t.receipt, t.created_at,
             u.name, u.email,
             COALESCE((SELECT SUM(x.amount) FROM voltrix_transactions x
                        WHERE x.user_id = t.user_id AND x.type='deposit' AND x.status='completed' AND x.is_demo=false),0) AS user_deposited,
             COALESCE((SELECT SUM(-x.amount) FROM voltrix_transactions x
                        WHERE x.user_id = t.user_id AND x.type='withdrawal' AND x.status<>'rejected' AND x.is_demo=false),0) AS user_withdrawn
      FROM voltrix_transactions t JOIN voltrix_users u ON u.id = t.user_id
      WHERE t.type = 'withdrawal' AND t.is_demo = false
      ORDER BY t.created_at DESC
      LIMIT 200
    ` as Promise<any[]>,
    sql`
      SELECT t.id, t.user_id, t.type, t.amount, t.status, t.method, t.reference, t.receipt, t.note, t.provider_ref, t.created_at,
             u.name, u.email
      FROM voltrix_transactions t JOIN voltrix_users u ON u.id = t.user_id
      WHERE t.type IN ('deposit','withdrawal') AND t.status IN ('pending','rejected') AND t.is_demo = false
      ORDER BY t.created_at DESC
      LIMIT 100
    ` as Promise<any[]>,
  ]);

  const [houseEdge, referralPct, maxStakeCents, maxPayoutCents, globalTest, globalTestPct, wdDailyCount, wdDailyMaxCents] =
    await Promise.all([
      getHouseEdge(),
      getReferralPct(),
      getMaxStakeCents(),
      getMaxPayoutCents(),
      getGlobalTest(),
      getGlobalTestPct(),
      getWithdrawDailyCount(),
      getWithdrawDailyMaxCents(),
    ]);
  const k = kpi[0] || {};
  const num = (v: any) => Number(v ?? 0);

  const payload = {
    pending,
    users: users.map((u) => ({ ...u, balance: num(u.balance) })),
    kpi: {
      userCount: num(k.user_count),
      totalBalance: num(k.total_balance),
      tradeCount: num(k.trade_count),
      wonCount: num(k.won_count),
      lostCount: num(k.lost_count),
      depositsTotal: num(k.deposits_total),
      withdrawalsTotal: num(k.withdrawals_total),
      depositsPending: num(k.deposits_pending),
      withdrawalsPending: num(k.withdrawals_pending),
      stakedTotal: num(k.staked_total),
      payoutTotal: num(k.payout_total),
      houseProfit: num(k.staked_total) - num(k.payout_total),
      bonusIssued: num(k.bonus_issued),
      bonusLocked: num(k.bonus_locked),
      // Real money the company actually holds: deposits in minus withdrawals out.
      netCash: num(k.deposits_total) - num(k.withdrawals_total),
    },
    daily: daily.map((d) => ({ day: d.day, volume: num(d.volume) })),
    houseEdge, // fraction, e.g. 0.05
    referralPct, // fraction, e.g. 0.10
    maxStakeCents,
    maxPayoutCents,
    globalTest,
    globalTestPct,
    wdDailyCount,
    wdDailyMaxCents,
    testAccounts,
    kyc: kycPending.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      account_no: accountNo(u.id),
      kyc_name: u.kyc_name,
      kyc_id_number: u.kyc_id_number,
      kyc_phone: u.kyc_phone,
    })),
    attention: attentionRaw.map((t) => ({
      id: t.id,
      name: t.name,
      account_no: accountNo(t.user_id),
      type: t.type,
      amount: Math.abs(Number(t.amount)),
      status: t.status,
      method: t.method,
      reference: t.reference,
      receipt: t.receipt,
      note: t.note,
      provider_ref: t.provider_ref,
      created_at: t.created_at,
    })),
    withdrawals: withdrawalsRaw.map((w) => ({
      id: w.id,
      name: w.name,
      account_no: accountNo(w.user_id),
      amount: Math.abs(Number(w.amount)),
      status: w.status,
      method: w.method,
      reference: w.reference,
      receipt: w.receipt,
      created_at: w.created_at,
      userDeposited: num(w.user_deposited),
      userWithdrawn: num(w.user_withdrawn),
    })),
    topUsers: topUsers.map((u) => ({
      ...u,
      account_no: accountNo(u.id),
      status: u.status || "active",
      promo: !!u.promo,
      balance: num(u.balance),
      pnl: num(u.pnl),
      trades: num(u.trades),
      deposited: num(u.deposited),
      withdrawn: num(u.withdrawn),
      depositMethod: u.deposit_method || null,
    })),
  };

  setAdminCache(payload);
  return NextResponse.json(payload);
}
