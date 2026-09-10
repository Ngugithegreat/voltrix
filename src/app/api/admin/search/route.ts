import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { accountNo, idFromAccountNo } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Server-side user search. The dashboard only preloads the newest 5000 accounts,
// so once the platform passes 5000 users an older account can't be found by the
// client-side filter. This queries the FULL users table by name / email /
// account number so any account is findable regardless of how many exist.
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ users: [] });

  await ensureSchema();
  const sql = db();

  const like = `%${q}%`;
  // "ST-100283" / "100283" / "283" → a concrete user id to match exactly.
  const byAccount = idFromAccountNo(q) ?? (/^\d+$/.test(q) ? Number(q) : null);
  const idMatch = byAccount ?? -1;

  const rows = (await sql`
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
    FROM voltrix_users u
    LEFT JOIN voltrix_trades t ON t.user_id = u.id AND t.is_demo = false
    WHERE u.email ILIKE ${like} OR u.name ILIKE ${like} OR u.id = ${idMatch}
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT 60
  `) as any[];

  const num = (v: any) => Number(v ?? 0);
  const users = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    account_no: accountNo(u.id),
    status: u.status || "active",
    promo: !!u.promo,
    balance: num(u.balance),
    pnl: num(u.pnl),
    trades: num(u.trades),
    deposited: num(u.deposited),
    withdrawn: num(u.withdrawn),
    depositMethod: u.deposit_method || null,
  }));

  return NextResponse.json({ users });
}
